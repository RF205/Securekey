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

  // A <form> lets the user press Enter to log in; preventDefault stops a page reload.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await signIn({ username: email, password });
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <main className="center">
      <form className="card login" onSubmit={handleLogin}>
        <h1>SecureKey</h1>
        <p className="muted">Sign in to manage your API keys</p>
        <input className="input" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input className="input" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit">Log in</button>
      </form>
    </main>
  );
}
