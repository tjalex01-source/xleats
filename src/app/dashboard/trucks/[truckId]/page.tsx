import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import StatusControl from '@/components/StatusControl';
import MilestoneContest from '@/components/MilestoneContest';

export default async function TruckHub({ params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params;
  const supabase = await createClient();

  const { data: truck } = await supabase.from('trucks').select('*').eq('id', truckId).maybeSingle();
  if (!truck) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const { data: session } = await supabase
    .from('live_sessions').select('*').eq('truck_id', truckId).eq('date', today).maybeSingle();

  // Aggregate-only: follower count via SECURITY DEFINER fn (no row access).
  const { data: followers } = await supabase.rpc('truck_follower_count', { p_truck: truckId });

  const tiles = [
    { href: 'menu',     label: 'Menu',     hint: 'Items, prices, photos' },
    { href: 'schedule', label: 'Schedule', hint: 'Where you’ll be' },
    { href: 'posts',    label: 'Posts',    hint: 'Updates for followers' },
    { href: 'promos',   label: 'Promos',   hint: 'Discounts, contests, birthdays' },
    { href: 'settings', label: 'Settings', hint: 'Profile, logo, public URL' },
  ];

  return (
    <div>
      <Link href="/dashboard" className="eyebrow">← All trucks</Link>
      <div className="mt-3 flex items-end justify-between">
        <h1 className="font-display text-3xl font-extrabold">{truck.name}</h1>
        <span className="text-sm text-muted">{followers ?? 0} followers</span>
      </div>
      <a href={`/${truck.slug}`} className="text-sm text-brand underline">xleats.com/{truck.slug}</a>

      <div className="mt-5">
        <div className="eyebrow mb-2">Today’s status</div>
        <StatusControl truckId={truck.id} initial={session ?? null} />
        <MilestoneContest truckId={truck.id} truckName={truck.name} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {tiles.map((t) => (
          <Link key={t.href} href={`/dashboard/trucks/${truck.id}/${t.href}`}
            className="rounded-ticket border border-edge bg-white p-4 shadow-ticket transition hover:border-brand">
            <div className="font-display text-lg font-bold">{t.label}</div>
            <div className="text-sm text-muted">{t.hint}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
