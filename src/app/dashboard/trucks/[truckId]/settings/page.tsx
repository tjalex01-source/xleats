import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TruckSettingsForm from '@/components/TruckSettingsForm';

export default async function TruckSettings({ params }: { params: Promise<{ truckId: string }> }) {
  const { truckId } = await params;
  const supabase = await createClient();

  const { data: truck } = await supabase.from('trucks').select('*').eq('id', truckId).maybeSingle();
  if (!truck) notFound();

  return (
    <div className="mx-auto max-w-md">
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← {truck.name}</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Truck settings</h1>
      <div className="mt-6">
        <TruckSettingsForm truck={truck} />
      </div>
    </div>
  );
}
