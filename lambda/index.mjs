// SecureKey Lambda — the whole back end.
// API Gateway (REST, Lambda proxy integration) sends every request here.
// We look at the HTTP method + path and run the matching handler:
//
//   POST   /keys          -> create a new key (optional label)
//   GET    /keys          -> list the signed-in user's keys
//   DELETE /keys/{keyID}  -> retire one of the user's keys
//
// The Cognito authorizer on API Gateway checks the user's token BEFORE this
// code runs, so if we get here the user is already logged in.

import { randomBytes } from 'crypto';
import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const TABLE_NAME = 'securekey_keys';
// Global secondary index that lets us look up keys by owner (see setup steps).
const USER_INDEX = 'userId-Index';
const MAX_LABEL_LENGTH = 50;

// CORS headers so the browser lets our Amplify site read the responses.
// Authorization must be allowed because the front end sends the Cognito token.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
};

// Small helper so every response has the same shape and CORS headers.
const respond = (statusCode, body) => ({
  statusCode,
  headers: CORS_HEADERS,
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  // Who is calling? The Cognito authorizer puts the verified token's claims here.
  // "sub" is the user's permanent unique ID in the Cognito user pool.
  const userId = event.requestContext?.authorizer?.claims?.sub;
  if (!userId) {
    return respond(401, { error: 'Not authenticated' });
  }

  try {
    const method = event.httpMethod;
    const keyID = event.pathParameters?.keyID;

    if (method === 'POST' && !keyID) return await createKey(userId, event.body);
    if (method === 'GET' && !keyID) return await listKeys(userId);
    if (method === 'DELETE' && keyID) return await retireKey(userId, keyID);

    return respond(404, { error: 'Route not found' });
  } catch (err) {
    // Log the details for CloudWatch, but don't leak them to the caller.
    console.error(err);
    return respond(500, { error: 'Something went wrong' });
  }
};

// ---------- Create ----------
// Same as the original code, plus: the owner's userId, an optional label,
// and a status of "active".
async function createKey(userId, rawBody) {
  // The body is optional. If it's there, it may contain { "label": "..." }.
  let label = '';
  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      if (typeof parsed.label === 'string') label = parsed.label.trim();
    } catch {
      return respond(400, { error: 'Body must be valid JSON' });
    }
  }
  if (label.length > MAX_LABEL_LENGTH) {
    return respond(400, { error: `Label must be ${MAX_LABEL_LENGTH} characters or fewer` });
  }

  const apiKey = 'sk_' + randomBytes(32).toString('hex'); // the secret itself
  const keyID = randomBytes(16).toString('hex');          // public ID for the key
  const createdAt = new Date().toISOString();

  await client.send(new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      keyID: { S: keyID },
      userId: { S: userId },
      apiKey: { S: apiKey },
      label: { S: label },
      status: { S: 'active' },
      createdAt: { S: createdAt },
    },
  }));

  // This is the only time the full key is ever sent back to the browser.
  return respond(201, { keyID, key: apiKey, label, status: 'active', createdAt });
}

// ---------- List ----------
// Returns only the caller's keys, newest first, WITHOUT the secret value.
async function listKeys(userId) {
  const result = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: USER_INDEX,
    KeyConditionExpression: 'userId = :uid',
    ExpressionAttributeValues: { ':uid': { S: userId } },
    // Only fetch the fields the UI needs. apiKey is deliberately left out.
    // "status" is a DynamoDB reserved word, so it needs the #status alias.
    ProjectionExpression: 'keyID, label, createdAt, #status',
    ExpressionAttributeNames: { '#status': 'status' },
    ScanIndexForward: false, // index is sorted by createdAt; false = newest first
  }));

  // Convert DynamoDB's { S: "..." } format into plain JSON.
  const keys = (result.Items ?? []).map((item) => ({
    keyID: item.keyID.S,
    label: item.label?.S ?? '',
    createdAt: item.createdAt.S,
    status: item.status?.S ?? 'active',
  }));

  return respond(200, { keys });
}

// ---------- Retire ----------
// Marks a key as "retired" instead of deleting the row, so there's an audit
// trail. The condition makes sure users can only retire THEIR OWN keys.
async function retireKey(userId, keyID) {
  try {
    await client.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { keyID: { S: keyID } },
      UpdateExpression: 'SET #status = :retired, retiredAt = :now',
      ConditionExpression: 'userId = :uid',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':retired': { S: 'retired' },
        ':now': { S: new Date().toISOString() },
        ':uid': { S: userId },
      },
    }));
  } catch (err) {
    // Condition failed = key doesn't exist or belongs to someone else.
    // Same 404 either way, so we don't reveal whether another user's key exists.
    if (err.name === 'ConditionalCheckFailedException') {
      return respond(404, { error: 'Key not found' });
    }
    throw err;
  }

  return respond(200, { keyID, status: 'retired' });
}
