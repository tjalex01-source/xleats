'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

type Stop = {
  id: string; recurring: boolean; day_of_week: number | null; date: string | null;
  start_time: string | null; end_time: string | null; location_name: string | null;
};

export default function Schedule() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [stops, setStops] = useState<Stop[]>([]);
  const [day, setDay] = useState(1);
  const [loc, setLoc] = useState('');
  const [start, setStart] = useState('11:00');
  const [end, setEnd] = useState('14:00');

  async function load() {
    const { data } = await supabase.from('schedules')
      .select('id,recurring,day_of_week,date,start_time,end_time,location_name')
      .eq('truck_id', truckId).order('day_of_week');
    setStops((data as Stop[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  async function add() {
    if (!loc) return;
    await supabase.from('schedules').insert({
      truck_id: truckId, recurring: true, day_of_week: day,
      start_time: start, end_time: end, location_name: loc,
    });
    setLoc(''); load();
  }
  async function remove(id: string) {
    await supabase.from('schedules').delete().eq('id', id); load();
  }

  return (
    <div>
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Weekly schedule</h1>
      <p className="text-sm text-muted">Your recurring stops. These show as “Out today” and set your live window.</p>

      <div className="mt-5 rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="grid grid-cols-12 gap-2">
          <select value={day} onChange={(e) => setDay(Number(e.target.value))}
            className="col-span-3 rounded-lg border border-edge px-2 py-2 outline-none focus:border-brand">
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
          <input className="col-span-5 rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand"
            placeholder="Location name" value={loc} onChange={(e) => setLoc(e.target.value)} />
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
            className="col-span-2 rounded-lg border border-edge px-2 py-2 outline-none focus:border-brand" />
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
            className="col-span-2 rounded-lg border border-edge px-2 py-2 outline-none focus:border-brand" />
        </div>
        <button onClick={add} disabled={!loc}
          className="mt-3 rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60">
          Add stop
        </button>
        <p className="mt-2 text-xs text-muted">Map pin picker (lat/lng) wires in with the customer map — columns are ready.</p>
      </div>

      <div className="mt-4 space-y-2">
        {stops.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-ticket border border-edge bg-white p-3">
            <div>
              <span className="font-display font-bold">{s.day_of_week != null ? DAYS[s.day_of_week] : s.date}</span>
              <span className="ml-2">{s.location_name}</span>
              <span className="ml-2 text-sm text-muted">{s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</span>
            </div>
            <button onClick={() => remove(s.id)} className="text-sm font-semibold text-brand">Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
