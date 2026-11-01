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

type Filter = 'all' | 'active' | 'retired';

// Turns an ISO date into friendly text like "2 hours ago", using the browser's
// built-in Intl.RelativeTimeFormat (no library needed).
const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
];

function timeAgo(iso: string): string {
  const secondsAgo = (Date.now() - new Date(iso).getTime()) / 1000;
  // Pick the biggest unit that fits, e.g. 7200 seconds -> "2 hours ago".
  for (const [unit, seconds] of UNITS) {
    if (secondsAgo >= seconds) {
      return relativeFormatter.format(-Math.floor(secondsAgo / seconds), unit);
    }
  }
  return 'just now';
}

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
  const [filter, setFilter] = useState<Filter>('all');

  // Counts for the summary line and tabs, worked out from the loaded list.
  const activeCount = keys.filter(k => k.status === 'active').length;
  const retiredCount = keys.length - activeCount;
  const visibleKeys = filter === 'all' ? keys : keys.filter(k => k.status === filter);
  const tabs: { id: Filter; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: keys.length },
    { id: 'active', label: 'Active', count: activeCount },
    { id: 'retired', label: 'Retired', count: retiredCount },
  ];

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
        <div>
          <h1>SecureKey</h1>
          {/* Summary line, e.g. "3 active · 1 retired" */}
          {!loading && (
            <p className="muted summary">{activeCount} active · {retiredCount} retired</p>
          )}
        </div>
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
        <div className="section-head">
          <h2>Your keys</h2>
          {/* Filter tabs: only change what's shown, no extra API calls */}
          <div className="tabs" role="tablist">
            {tabs.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={filter === tab.id}
                className={`tab ${filter === tab.id ? 'tab-active' : ''}`}
                onClick={() => setFilter(tab.id)}
              >
                {tab.label} <span className="tab-count">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="muted">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="muted">No keys yet. Generate one above.</p>
        ) : visibleKeys.length === 0 ? (
          <p className="muted">No {filter} keys.</p>
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
                {visibleKeys.map(key => (
                  <tr key={key.keyID}>
                    <td className="label-cell">{key.label || <span className="muted">(no label)</span>}</td>
                    {/* Friendly date; hovering shows the exact time via the title attribute */}
                    <td>
                      <time dateTime={key.createdAt} title={new Date(key.createdAt).toLocaleString()}>
                        {timeAgo(key.createdAt)}
                      </time>
                    </td>
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
