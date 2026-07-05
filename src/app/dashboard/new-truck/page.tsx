'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function NewTruck() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true); setError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    // Ensure an account exists.
    let { data: account } = await supabase
      .from('accounts').select('*').eq('owner_id', user.id).maybeSingle();
    if (!account) {
      const { data, error } = await supabase
        .from('accounts')
        .insert({ owner_id: user.id, name: `${name || 'My'} account` })
        .select().single();
      if (error) { setError(error.message); setBusy(false); return; }
      account = data;
    }

    // Free and Pro both include 1 truck — multiple trucks is a Fleet-plan feature.
    if (account.plan !== 'fleet') {
      const { count } = await supabase
        .from('trucks').select('*', { count: 'exact', head: true }).eq('account_id', account.id);
      if ((count ?? 0) >= 1) {
        setError('Your plan includes one truck. Upgrade to Fleet to add more.');
        setBusy(false); return;
      }
    }

    const { data: truck, error: tErr } = await supabase
      .from('trucks')
      .insert({ account_id: account.id, name, cuisine, slug: slugify(name) || `truck-${Date.now()}` })
      .select().single();
    if (tErr) { setError(tErr.message); setBusy(false); return; }

    router.push(`/dashboard/trucks/${truck.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md">
      <Link href="/dashboard" className="eyebrow">← Back</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">New truck</h1>
      <div className="mt-6 space-y-3">
        <input className="w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand"
          placeholder="Truck name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand"
          placeholder="Cuisine (e.g. Tacos, BBQ)" value={cuisine} onChange={(e) => setCuisine(e.target.value)} />
        {name && <p className="text-sm text-muted">Public page: xleats.com/{slugify(name)}</p>}
        {error && <p className="text-sm text-brand">{error}</p>}
        <button onClick={submit} disabled={busy || !name}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-display font-bold text-white disabled:opacity-60">
          {busy ? 'Creating…' : 'Create truck'}
        </button>
      </div>
    </div>
  );
}
