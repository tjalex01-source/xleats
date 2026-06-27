'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function Signup() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setError(null);
    const { error } = await createClient().auth.signUp({
      email, password,
      options: { data: { display_name: name, role: 'owner' } },
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <Link href="/" className="eyebrow mb-6">← XLeats</Link>
      <h1 className="font-display text-3xl font-extrabold">Start your truck</h1>
      <p className="mt-1 text-sm text-muted">Free to set up. Add a paid plan later for multiple trucks and promos.</p>
      <div className="mt-6 space-y-3">
        <input className="w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand"
          placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand"
          type="email" placeholder="you@truck.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand"
          type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-brand">{error}</p>}
        <button onClick={submit} disabled={busy}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-display font-bold text-white disabled:opacity-60">
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </div>
      <p className="mt-4 text-sm text-muted">
        Already set up? <Link href="/login" className="font-semibold text-ink underline">Log in</Link>
      </p>
    </main>
  );
}
