'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { AccountPlan, TruckStats, WeekActivity } from '@/lib/types';

type TruckOption = { id: string; name: string };

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
      <div className="font-display text-3xl font-extrabold">{value}</div>
      <div className="eyebrow mt-0.5">{label}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function MiniBars({ title, series }: { title: string; series: { label: string; value: number }[] }) {
  const max = Math.max(1, ...series.map((s) => s.value));
  return (
    <div className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
      <div className="eyebrow mb-3">{title}</div>
      <div className="flex items-end gap-1.5" style={{ height: 96 }}>
        {series.map((s, i) => (
          <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs font-semibold text-ink">{s.value > 0 ? s.value : ''}</span>
            <div className="w-full rounded-t bg-brand" style={{ height: `${(s.value / max) * 72}px`, minHeight: s.value > 0 ? 4 : 1, opacity: s.value > 0 ? 1 : 0.15 }} />
            <span className="text-[10px] text-muted">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Stats() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [stats, setStats] = useState<TruckStats | null>(null);
  const [weeks, setWeeks] = useState<WeekActivity[]>([]);
  const [fleetRows, setFleetRows] = useState<{ truck: TruckOption; stats: TruckStats }[]>([]);

  async function load() {
    const { data: truck } = await supabase.from('trucks')
      .select('account_id, accounts(plan)').eq('id', truckId).single();
    const accId: string | null = truck?.account_id ?? null;
    // @ts-expect-error nested select typing
    const planVal: AccountPlan = truck?.accounts?.plan ?? 'free';
    setPlan(planVal);
    if (planVal === 'free') return;

    const [{ data: s }, { data: w }] = await Promise.all([
      supabase.rpc('truck_stats', { p_truck: truckId }),
      supabase.rpc('truck_activity_by_week', { p_truck: truckId, p_weeks: 8 }),
    ]);
    setStats((s as TruckStats[])?.[0] ?? null);
    setWeeks((w as WeekActivity[]) ?? []);

    if (planVal === 'fleet' && accId) {
      const { data: sibs } = await supabase.from('trucks').select('id, name').eq('account_id', accId).order('created_at');
      const trucks = (sibs ?? []) as TruckOption[];
      if (trucks.length > 1) {
        const results = await Promise.all(trucks.map((t) => supabase.rpc('truck_stats', { p_truck: t.id })));
        setFleetRows(trucks.map((t, i) => ({ truck: t, stats: (results[i].data as TruckStats[])?.[0] })).filter((r) => r.stats));
      }
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  if (plan === null) return <p className="text-muted">Loading…</p>;

  if (plan === 'free') {
    return (
      <div>
        <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
        <div className="mt-5 rounded-ticket border border-edge bg-white p-8 text-center shadow-ticket">
          <div className="eyebrow mb-2">Pro feature</div>
          <h1 className="font-display text-2xl font-extrabold">See what&rsquo;s working</h1>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            Track your follower growth, how often you go live, and how many discount codes and
            offers are getting redeemed — so you can double down on what brings customers in.
          </p>
          <button className="mt-5 rounded-lg bg-brand px-6 py-3 font-display font-bold text-white">
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  const weekLabel = (iso: string) => {
    const d = new Date(iso + 'T00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
        <h1 className="mt-3 font-display text-3xl font-extrabold">Stats</h1>
        <p className="text-sm text-muted">Your numbers at a glance. &ldquo;30d&rdquo; means the last 30 days.</p>
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Followers" value={stats.followers} hint={`+${stats.new_followers_30d} in 30d`} />
            <StatCard label="Go-lives · 30d" value={stats.go_lives_30d} />
            <StatCard label="Posts · 30d" value={stats.posts_30d} />
            <StatCard label="Code redemptions" value={stats.discount_redemptions} hint="all-time" />
            <StatCard label="Offers redeemed" value={stats.offers_redeemed} hint={`${stats.offers_delivered} delivered`} />
            <StatCard label="Special taps · 30d" value={stats.special_taps_30d} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MiniBars title="New followers / week" series={weeks.map((w) => ({ label: weekLabel(w.week_start), value: w.new_followers }))} />
            <MiniBars title="Go-lives / week" series={weeks.map((w) => ({ label: weekLabel(w.week_start), value: w.go_lives }))} />
            <MiniBars title="Posts / week" series={weeks.map((w) => ({ label: weekLabel(w.week_start), value: w.posts }))} />
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-muted">
            <span>{stats.active_discount_codes} active code{stats.active_discount_codes === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{stats.active_offers} active offer{stats.active_offers === 1 ? '' : 's'}</span>
            <span>·</span>
            <span>{stats.open_contests} open contest{stats.open_contests === 1 ? '' : 's'}</span>
          </div>
        </>
      )}

      {/* Fleet cross-truck comparison */}
      {plan === 'fleet' && fleetRows.length > 1 && (
        <div>
          <div className="eyebrow mb-2">All your trucks</div>
          <div className="overflow-x-auto rounded-ticket border border-edge bg-white shadow-ticket">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs text-muted">
                  <th className="p-3">Truck</th>
                  <th className="p-3 text-right">Followers</th>
                  <th className="p-3 text-right">Go-lives 30d</th>
                  <th className="p-3 text-right">Posts 30d</th>
                  <th className="p-3 text-right">Redemptions</th>
                </tr>
              </thead>
              <tbody>
                {fleetRows.map(({ truck, stats: st }) => (
                  <tr key={truck.id} className="border-b border-edge last:border-0">
                    <td className="p-3 font-semibold">{truck.name}</td>
                    <td className="p-3 text-right">{st.followers}</td>
                    <td className="p-3 text-right">{st.go_lives_30d}</td>
                    <td className="p-3 text-right">{st.posts_30d}</td>
                    <td className="p-3 text-right">{st.discount_redemptions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
