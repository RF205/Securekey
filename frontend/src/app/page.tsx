'use client';
import { useState } from 'react';
import { signIn } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import awsExports from './aws-exports';

Amplify.configure(awsExports);

export default function Home() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      await signIn({ username: email, password });
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <h1>SecureKey</h1>
      <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ margin: 8, padding: 8, width: 280 }} />
      <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ margin: 8, padding: 8, width: 280 }} />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button onClick={handleLogin} style={{ margin: 8, padding: '8px 24px' }}>Login</button>
    </div>
  );
}