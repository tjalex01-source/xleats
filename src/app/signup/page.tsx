'use client';
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setError(null);
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (!agreed) { setError('Please agree to the Terms and Privacy Policy to continue.'); return; }
    setBusy(true);
    const { error } = await createClient().auth.signUp({
      email, password,
      options: {
        data: { display_name: name, role: 'owner' },
        emailRedirectTo: `${location.origin}/dashboard`,
      },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setSent(true);
  }

  const inputCls = 'w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand';

  if (sent) return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 text-center">
      <div className="text-5xl mb-4">📬</div>
      <h1 className="font-display text-2xl font-extrabold">Check your email</h1>
      <p className="mt-3 text-muted">
        We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account and get started.
      </p>
      <p className="mt-4 text-sm text-muted">
        Didn't get it? Check your spam folder, or{' '}
        <button className="font-semibold text-ink underline" onClick={() => { setSent(false); setBusy(false); }}>
          try again
        </button>.
      </p>
    </main>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <Link href="/" className="eyebrow mb-6">← XLeats</Link>
      <h1 className="font-display text-3xl font-extrabold">Start your truck</h1>
      <p className="mt-1 text-sm text-muted">Free to set up. Add a paid plan later for more features.</p>

      <div className="mt-6 space-y-3">
        <input className={inputCls} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputCls} type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={inputCls} type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
        <input className={inputCls} type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-sm text-muted leading-snug">
            I have read and agree to the{' '}
            <Link href="/terms" target="_blank" className="font-semibold text-ink underline">Terms of Service</Link>
            {' '}and{' '}
            <Link href="/privacy" target="_blank" className="font-semibold text-ink underline">Privacy Policy</Link>.
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={busy || !name || !email || !password || !confirm}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-display font-bold text-white disabled:opacity-60"
        >
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </div>

      <p className="mt-4 text-sm text-muted">
        Already set up?{' '}
        <Link href="/login" className="font-semibold text-ink underline">Log in</Link>
      </p>
    </main>
  );
}
