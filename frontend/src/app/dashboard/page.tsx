'use client';
import { useEffect, useState } from 'react';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import awsExports from '../aws-exports';

// This page is loaded directly after login, so it needs its own Amplify setup.
Amplify.configure(awsExports);

const API_URL = 'https://xqklbpcxq8.execute-api.us-east-2.amazonaws.com/dev';

// Shape of a key as returned by GET /keys (the secret value is never included).
type KeyItem = {
  keyID: string;
  label: string;
  createdAt: string;
  status: 'active' | 'retired';
};

// Gets the logged-in user's Cognito ID token, or null if not logged in.
// API Gateway's Cognito authorizer checks this token on every request.
async function getToken(): Promise<string | null> {
  const session = await fetchAuthSession();
  return session.tokens?.idToken?.toString() ?? null;
}

// Wrapper around fetch that adds the token and turns API errors into exceptions.
async function api(path: string, options: RequestInit = {}) {
  const token = await getToken();
  if (!token) throw new Error('Your session expired. Please log in again.');

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: token },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

export default function Dashboard() {
  const [keys, setKeys] = useState<KeyItem[]>([]);
  const [label, setLabel] = useState('');
  const [newKey, setNewKey] = useState(''); // full secret, shown once after creation
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Load the user's keys from the API.
  const loadKeys = async () => {
    try {
      const data = await api('/keys');
      setKeys(data.keys);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // On first load: send the user to the login page if they aren't signed in,
  // otherwise fetch their keys.
  useEffect(() => {
    (async () => {
      if (!(await getToken())) {
        window.location.href = '/';
        return;
      }
      await loadKeys();
      setLoading(false);
    })();
  }, []);

  const generateKey = async () => {
    setGenerating(true);
    setError('');
    setCopied(false);
    try {
      const data = await api('/keys', { method: 'POST', body: JSON.stringify({ label }) });
      setNewKey(data.key);
      setLabel('');
      await loadKeys(); // refresh the table so the new key appears
    } catch (err: any) {
      setError(err.message);
    }
    setGenerating(false);
  };

  const retireKey = async (key: KeyItem) => {
    if (!window.confirm(`Retire "${key.label || key.keyID}"? This can't be undone.`)) return;
    setError('');
    try {
      await api(`/keys/${key.keyID}`, { method: 'DELETE' });
      await loadKeys();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyKey = async () => {
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
  };

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/';
  };

  return (
    <main className="container">
      <header className="header">
        <h1>SecureKey</h1>
        <button className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
      </header>

      {/* Create a key */}
      <section className="card">
        <h2>Generate a new key</h2>
        <div className="row">
          <input
            className="input"
            placeholder="Label (optional), e.g. Billing service"
            value={label}
            maxLength={50}
            onChange={e => setLabel(e.target.value)}
          />
          <button className="btn" onClick={generateKey} disabled={generating}>
            {generating ? 'Generating...' : 'Generate key'}
          </button>
        </div>

        {/* The full key is only shown here, right after creation. */}
        {newKey && (
          <div className="secret">
            <p><strong>Copy your key now.</strong> You won&apos;t be able to see it again.</p>
            <code>{newKey}</code>
            <div className="row">
              <button className="btn btn-secondary" onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</button>
              <button className="btn btn-secondary" onClick={() => setNewKey('')}>Done</button>
            </div>
          </div>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      {/* List of the user's keys */}
      <section className="card">
        <h2>Your keys</h2>
        {loading ? (
          <p className="muted">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="muted">No keys yet. Generate one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {keys.map(key => (
                  <tr key={key.keyID}>
                    <td>{key.label || <span className="muted">(no label)</span>}</td>
                    <td>{new Date(key.createdAt).toLocaleString()}</td>
                    <td><span className={`badge badge-${key.status}`}>{key.status}</span></td>
                    <td className="actions">
                      {key.status === 'active' && (
                        <button className="btn btn-danger" onClick={() => retireKey(key)}>Retire</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
