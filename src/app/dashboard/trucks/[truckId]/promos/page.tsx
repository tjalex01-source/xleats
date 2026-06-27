'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

type Disc = { id: string; code: string; type: string; value: number | null; description: string | null };
type Bday = { id: string; title: string; description: string | null; active: boolean };

export default function Promos() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [plan, setPlan] = useState<'free' | 'pro' | null>(null);
  const [discs, setDiscs] = useState<Disc[]>([]);
  const [bdays, setBdays] = useState<Bday[]>([]);
  const [stats, setStats] = useState<{ delivered: number; redeemed: number } | null>(null);

  const [code, setCode] = useState('');
  const [value, setValue] = useState('');
  const [bTitle, setBTitle] = useState('');

  async function load() {
    const { data: truck } = await supabase.from('trucks')
      .select('account_id, accounts(plan)').eq('id', truckId).single();
    // @ts-expect-error nested select typing
    setPlan(truck?.accounts?.plan ?? 'free');

    const { data: d } = await supabase.from('discount_codes').select('*').eq('truck_id', truckId);
    setDiscs(d ?? []);
    const { data: b } = await supabase.from('birthday_offers').select('*').eq('truck_id', truckId);
    setBdays(b ?? []);
    const { data: s } = await supabase.rpc('birthday_offer_stats', { p_truck: truckId });
    if (s && s[0]) setStats(s[0]);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  async function addDiscount() {
    if (!code) return;
    await supabase.from('discount_codes').insert({
      truck_id: truckId, code: code.toUpperCase(), type: 'percent',
      value: value ? Number(value) : null,
    });
    setCode(''); setValue(''); load();
  }
  async function addBirthday() {
    if (!bTitle) return;
    await supabase.from('birthday_offers').insert({ truck_id: truckId, title: bTitle });
    setBTitle(''); load();
  }

  if (plan === null) return <p className="text-muted">Loading…</p>;

  if (plan === 'free') {
    return (
      <div>
        <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
        <div className="mt-5 rounded-ticket border border-edge bg-white p-8 text-center shadow-ticket">
          <div className="eyebrow mb-2">Pro feature</div>
          <h1 className="font-display text-2xl font-extrabold">Promos drive regulars back</h1>
          <p className="mx-auto mt-2 max-w-sm text-muted">
            Discount codes, prediction contests, and automatic birthday offers — delivered to your
            followers and nearby customers without ever handing you their personal details.
          </p>
          <button className="mt-5 rounded-lg bg-brand px-6 py-3 font-display font-bold text-white">
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
        <h1 className="mt-3 font-display text-3xl font-extrabold">Promos</h1>
      </div>

      {/* Discount codes */}
      <section className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="eyebrow mb-2">Discount codes</div>
        <div className="grid grid-cols-12 gap-2">
          <input className="col-span-6 rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand uppercase"
            placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value)} />
          <input className="col-span-3 rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand"
            placeholder="% off" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
          <button onClick={addDiscount} className="col-span-3 rounded-lg bg-brand font-display font-bold text-white">Add</button>
        </div>
        <div className="mt-3 space-y-1">
          {discs.map((d) => (
            <div key={d.id} className="flex justify-between text-sm">
              <span className="font-mono font-bold">{d.code}</span>
              <span className="text-muted">{d.value}% off</span>
            </div>
          ))}
        </div>
      </section>

      {/* Birthday offer — privacy-safe */}
      <section className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="eyebrow mb-2">Birthday offer</div>
        <p className="mb-3 text-sm text-muted">
          We deliver this to followers and nearby customers on their birthday. You see counts only —
          never names, birthdays, or addresses. Redeem at the window with their code.
        </p>
        {bdays.length === 0 ? (
          <div className="flex gap-2">
            <input className="flex-1 rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand"
              placeholder="e.g. Free dessert on your birthday" value={bTitle} onChange={(e) => setBTitle(e.target.value)} />
            <button onClick={addBirthday} className="rounded-lg bg-brand px-4 font-display font-bold text-white">Set</button>
          </div>
        ) : (
          <div>
            <div className="font-semibold">{bdays[0].title}</div>
            {stats && (
              <div className="mt-3 flex gap-6">
                <div><div className="font-display text-2xl font-extrabold">{stats.delivered}</div><div className="eyebrow">delivered</div></div>
                <div><div className="font-display text-2xl font-extrabold">{stats.redeemed}</div><div className="eyebrow">redeemed</div></div>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-ticket border border-dashed border-edge p-4 text-sm text-muted">
        <span className="font-semibold text-ink">Contests</span> (100th customer, score predictions) wire in next —
        the contests + entries tables are ready.
      </section>
    </div>
  );
}
