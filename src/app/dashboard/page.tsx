import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { LiveStatus } from '@/lib/types';

const DOT: Record<LiveStatus, string> = {
  live: 'bg-state-live', scheduled: 'bg-state-scheduled',
  catering: 'bg-state-catering', off: 'bg-state-off',
};
const LABEL: Record<LiveStatus, string> = {
  live: 'Live now', scheduled: 'Out today', catering: 'Catering', off: 'Not out',
};

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: account } = await supabase
    .from('accounts').select('*').eq('owner_id', user!.id).maybeSingle();

  if (!account) {
    return (
      <div className="rounded-ticket border border-edge bg-white p-8 text-center shadow-ticket">
        <div className="eyebrow mb-2">First things first</div>
        <h1 className="font-display text-2xl font-extrabold">Set up your truck</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">
          Create your public page — menu, schedule, and a live status your followers can see.
        </p>
        <Link href="/dashboard/new-truck"
          className="mt-5 inline-block rounded-lg bg-brand px-6 py-3 font-display font-bold text-white">
          Create your truck
        </Link>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: trucks } = await supabase
    .from('trucks').select('*').eq('account_id', account.id).order('created_at');
  const { data: sessions } = await supabase
    .from('live_sessions').select('truck_id,status').eq('date', today);
  const statusFor = (id: string): LiveStatus =>
    (sessions?.find((s) => s.truck_id === id)?.status as LiveStatus) ?? 'off';

  const isPro = account.plan === 'pro';
  // Free and Pro both include 1 truck — multiple trucks is a Fleet-plan feature.
  const atTruckLimit = (trucks?.length ?? 0) >= 1;

  return (
    <div>
      <div className="mb-5 flex items-end justify-between">
        <div>
          <div className="eyebrow">{account.name}</div>
          <h1 className="font-display text-3xl font-extrabold">Your trucks</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${isPro ? 'bg-brand text-white' : 'border border-edge text-muted'}`}>
          {isPro ? 'PRO' : 'FREE'}
        </span>
      </div>

      <div className="space-y-3">
        {trucks?.map((t) => {
          const st = statusFor(t.id);
          return (
            <Link key={t.id} href={`/dashboard/trucks/${t.id}`}
              className="flex items-center justify-between rounded-ticket border border-edge bg-white p-4 shadow-ticket transition hover:border-brand">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${DOT[st]} ${st === 'live' ? 'animate-pulse' : ''}`} />
                <div>
                  <div className="font-display text-lg font-bold leading-none">{t.name}</div>
                  <div className="text-sm text-muted">{LABEL[st]} · xleats.com/{t.slug}</div>
                </div>
              </div>
              <span className="font-display text-muted">→</span>
            </Link>
          );
        })}
      </div>

      {atTruckLimit ? (
        <div className="mt-4 rounded-ticket border border-dashed border-brand p-4 text-center text-sm">
          Running more than one truck?{' '}
          <Link href="/pricing" className="font-bold text-brand underline">
            See pricing plans
          </Link>{' '}
          — Fleet lets you manage them all from one account.
        </div>
      ) : (
        <Link href="/dashboard/new-truck"
          className="mt-4 block rounded-ticket border border-dashed border-edge p-4 text-center font-semibold text-muted hover:border-brand hover:text-ink">
          + Add a truck
        </Link>
      )}

      {!atTruckLimit && (
        <div className="mt-6 flex justify-center">
          <Link href="/pricing" className="text-sm text-muted underline hover:text-ink">
            View pricing & plans
          </Link>
        </div>
      )}
    </div>
  );
}
