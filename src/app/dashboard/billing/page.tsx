'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { AccountPlan } from '@/lib/types';

export default function Billing() {
  const supabase = createClient();
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [truckCount, setTruckCount] = useState(0);
  const [interval, setInterval] = useState<'monthly' | 'annual'>('monthly');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function loadPlan() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: account } = await supabase.from('accounts').select('id, plan').eq('owner_id', user.id).maybeSingle();
    setPlan((account?.plan as AccountPlan) ?? 'free');
    if (account) {
      const { count } = await supabase.from('trucks').select('*', { count: 'exact', head: true }).eq('account_id', account.id);
      setTruckCount(count ?? 0);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    (async () => {
      if (params.get('checkout') === 'success') {
        setNote('Payment received — syncing your plan…');
        await fetch('/api/stripe/sync', { method: 'POST' });
        window.history.replaceState({}, '', '/dashboard/billing');
        setNote('You’re all set — welcome aboard! 🎉');
      } else if (params.get('checkout') === 'cancelled') {
        window.history.replaceState({}, '', '/dashboard/billing');
      }
      await loadPlan();
    })();
    /* eslint-disable-next-line */
  }, []);

  async function checkout(targetPlan: 'pro' | 'fleet') {
    setBusy(true);
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: targetPlan, interval }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else { setNote(data.error ?? 'Something went wrong.'); setBusy(false); }
  }

  async function manageBilling() {
    setBusy(true);
    const res = await fetch('/api/stripe/portal', { method: 'POST' });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
    else { setNote(data.error ?? 'Something went wrong.'); setBusy(false); }
  }

  if (plan === null) return <p className="text-muted">Loading…</p>;

  const fleetPrice = Math.max(truckCount, 2) * 15;

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/dashboard" className="eyebrow">← Dashboard</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Billing &amp; plan</h1>
      <p className="text-sm text-muted">
        You&rsquo;re on the <span className="font-semibold capitalize">{plan}</span> plan.
        XLeats never takes a cut of your sales — this is a flat subscription for the tools.
      </p>
      {note && <p className="mt-3 rounded-lg bg-cream p-2 text-sm">{note}</p>}

      {(plan === 'pro' || plan === 'fleet') && (
        <button onClick={manageBilling} disabled={busy}
          className="mt-4 rounded-lg border border-edge px-4 py-2 text-sm font-semibold disabled:opacity-60">
          Manage billing, update card, or cancel
        </button>
      )}

      {plan === 'free' && (
        <div className="mt-3 flex gap-3 text-sm">
          <button onClick={() => setInterval('monthly')}
            className={`rounded-full border px-3 py-1 font-semibold ${interval === 'monthly' ? 'border-brand bg-brand text-white' : 'border-edge text-muted'}`}>
            Monthly
          </button>
          <button onClick={() => setInterval('annual')}
            className={`rounded-full border px-3 py-1 font-semibold ${interval === 'annual' ? 'border-brand bg-brand text-white' : 'border-edge text-muted'}`}>
            Annual · 2 months free
          </button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Pro */}
        <div className={`rounded-ticket border bg-white p-4 shadow-ticket ${plan === 'pro' ? 'border-brand' : 'border-edge'}`}>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-lg font-bold">Pro</span>
            <span className="font-display font-extrabold">{interval === 'annual' ? '$200/yr' : '$20/mo'}</span>
          </div>
          <p className="mt-1 text-sm text-muted">One truck. All the money features — discount codes, offers, contests, blasts, birthday engine, and Stats.</p>
          {plan === 'pro' ? (
            <div className="mt-3 rounded-lg bg-cream px-3 py-2 text-center text-sm font-semibold">Your current plan</div>
          ) : plan === 'free' ? (
            <button onClick={() => checkout('pro')} disabled={busy}
              className="mt-3 w-full rounded-lg bg-brand py-2 font-display font-bold text-white disabled:opacity-60">
              Upgrade to Pro
            </button>
          ) : null}
        </div>

        {/* Fleet */}
        <div className={`rounded-ticket border bg-white p-4 shadow-ticket ${plan === 'fleet' ? 'border-brand' : 'border-edge'}`}>
          <div className="flex items-baseline justify-between">
            <span className="font-display text-lg font-bold">Fleet</span>
            <span className="font-display font-extrabold">$15<span className="text-sm text-muted">/truck/mo</span></span>
          </div>
          <p className="mt-1 text-sm text-muted">Everything in Pro, for multiple trucks — plus cross-truck Stats and bulk tools. Starts at 2 trucks ($30/mo).</p>
          {plan === 'fleet' ? (
            <div className="mt-3 rounded-lg bg-cream px-3 py-2 text-center text-sm font-semibold">
              Your current plan · {truckCount} truck{truckCount === 1 ? '' : 's'}
            </div>
          ) : (
            <button onClick={() => checkout('fleet')} disabled={busy}
              className="mt-3 w-full rounded-lg bg-brand py-2 font-display font-bold text-white disabled:opacity-60">
              {plan === 'pro' ? 'Switch to Fleet' : 'Upgrade to Fleet'} · ${fleetPrice}/mo
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-ticket border border-dashed border-edge p-4 text-sm text-muted">
        <span className="font-semibold text-ink">Running a large fleet?</span> For regional or national
        operators with many trucks, we&rsquo;ll build a custom plan.{' '}
        <a href="mailto:hello@xleats.com?subject=Enterprise%20plan" className="font-semibold text-brand underline">Contact us</a>.
      </div>
    </div>
  );
}
