'use client';
import { useState } from 'react';

const API_URL = 'https://xqklbpcxq8.execute-api.us-east-2.amazonaws.com/dev';

export default function Dashboard() {
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);

  const generateKey = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL, { method: 'POST' });
      const data = await res.json();
      setKey(data.key);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>SecureKey Dashboard</h1>
      <button onClick={generateKey} style={{ padding: '10px 28px', fontSize: 16 }}>
        {loading ? 'Generating...' : 'Generate Key'}
      </button>
      {key && (
        <div style={{ marginTop: 24, padding: 16, background: '#f1f1f1', borderRadius: 8, wordBreak: 'break-all', maxWidth: 500 }}>
          <p style={{ fontWeight: 'bold' }}>Your API Key:</p>
          <p style={{ fontFamily: 'monospace' }}>{key}</p>
        </div>
      )}
    </div>
  );
}