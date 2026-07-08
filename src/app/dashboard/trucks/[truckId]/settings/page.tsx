import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TruckSettingsForm from '@/components/TruckSettingsForm';

export default async function TruckSettings({ params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params;
  const supabase = await createClient();

  const { data: truck } = await supabase.from('trucks').select('*').eq('id', truckId).maybeSingle();
  if (!truck) notFound();

  const [{ data: account }, { data: siblingTrucks }, { data: photos }] = await Promise.all([
    supabase.from('accounts').select('plan').eq('id', truck.account_id).maybeSingle(),
    supabase.from('trucks').select('id').eq('account_id', truck.account_id).neq('id', truckId),
    supabase.from('truck_photos').select('*').eq('truck_id', truckId).order('sort_order'),
  ]);

  const isFleet = account?.plan === 'fleet';
  const siblingTruckIds = (siblingTrucks ?? []).map((t) => t.id);

  return (
    <div className="mx-auto max-w-md">
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← {truck.name}</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Truck settings</h1>
      <div className="mt-6">
        <TruckSettingsForm
          truck={truck}
          isFleet={isFleet}
          siblingTruckIds={siblingTruckIds}
          initialPhotos={photos ?? []}
        />
      </div>
    </div>
  );
}
