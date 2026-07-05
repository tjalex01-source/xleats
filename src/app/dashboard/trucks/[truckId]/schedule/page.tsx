'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type Recurring = {
  id: string;
  day_of_week: number;
  is_closed: boolean;
  location_name: string | null;
  start_time: string | null;
  end_time: string | null;
};
type OneOff = {
  id: string;
  date: string;
  is_closed: boolean;
  location_name: string | null;
};

export default function Schedule() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [oneOffs, setOneOffs] = useState<OneOff[]>([]);
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [loc, setLoc] = useState('');
  const [start, setStart] = useState('11:00');
  const [end, setEnd] = useState('14:00');

  const [exDate, setExDate] = useState('');
  const [exLoc, setExLoc] = useState('');
  const [exClosed, setExClosed] = useState(false);

  async function load() {
    const { data } = await supabase
      .from('schedules')
      .select('id,recurring,day_of_week,date,start_time,end_time,location_name,is_closed')
      .eq('truck_id', truckId);
    const rows = data ?? [];
    setRecurring(rows.filter((r) => r.recurring) as Recurring[]);
    setOneOffs(
      (rows.filter((r) => !r.recurring) as OneOff[]).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    );
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  const byDay = (d: number) => recurring.find((r) => r.day_of_week === d);

  function startEdit(d: number) {
    const existing = byDay(d);
    setLoc(existing?.location_name ?? '');
    setStart(existing?.start_time?.slice(0, 5) ?? '11:00');
    setEnd(existing?.end_time?.slice(0, 5) ?? '14:00');
    setEditingDay(d);
  }

  async function saveSpot(d: number) {
    if (!loc) return;
    const existing = byDay(d);
    if (existing) {
      await supabase
        .from('schedules')
        .update({ location_name: loc, start_time: start, end_time: end, is_closed: false })
        .eq('id', existing.id);
    } else {
      await supabase.from('schedules').insert({
        truck_id: truckId, recurring: true, day_of_week: d,
        location_name: loc, start_time: start, end_time: end, is_closed: false,
      });
    }
    setEditingDay(null);
    load();
  }

  async function markClosed(d: number) {
    const existing = byDay(d);
    if (existing) {
      await supabase.from('schedules').update({ is_closed: true, location_name: null }).eq('id', existing.id);
    } else {
      await supabase.from('schedules').insert({ truck_id: truckId, recurring: true, day_of_week: d, is_closed: true });
    }
    load();
  }

  async function clearDay(d: number) {
    const existing = byDay(d);
    if (existing) await supabase.from('schedules').delete().eq('id', existing.id);
    load();
  }

  async function addException() {
    if (!exDate || (!exClosed && !exLoc)) return;
    await supabase.from('schedules').insert({
      truck_id: truckId, recurring: false, date: exDate,
      location_name: exClosed ? null : exLoc,
      is_closed: exClosed,
    });
    setExDate(''); setExLoc(''); setExClosed(false);
    load();
  }
  async function removeException(id: string) {
    await supabase.from('schedules').delete().eq('id', id);
    load();
  }

  return (
    <div>
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Weekly schedule</h1>
      <p className="text-sm text-muted">
        This drives your daily status automatically, and customers see your full week —
        fill in every day you can so followers always know where to find you.
      </p>

      <div className="mt-5 space-y-2">
        {DAYS.map((name, d) => {
          const entry = byDay(d);
          return (
            <div key={d} className="rounded-ticket border border-edge bg-white p-3">
              {editingDay === d ? (
                <div className="space-y-2">
                  <div className="font-display font-bold">{name}</div>
                  <input
                    className="w-full rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand"
                    placeholder="Location name" value={loc} onChange={(e) => setLoc(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                      className="flex-1 rounded-lg border border-edge px-2 py-2 outline-none focus:border-brand" />
                    <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                      className="flex-1 rounded-lg border border-edge px-2 py-2 outline-none focus:border-brand" />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => saveSpot(d)} disabled={!loc}
                      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                      Save
                    </button>
                    <button onClick={() => setEditingDay(null)} className="text-sm text-muted">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-display font-bold">{name}</div>
                    {entry?.is_closed ? (
                      <span className="text-sm font-semibold text-red-600">Closed</span>
                    ) : entry ? (
                      <span className="text-sm text-muted">
                        {entry.location_name} · {entry.start_time?.slice(0, 5)}–{entry.end_time?.slice(0, 5)}
                      </span>
                    ) : (
                      <span className="text-sm italic text-muted">Unplanned as of now</span>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-3 text-sm font-semibold">
                    {!entry?.is_closed && (
                      <button onClick={() => startEdit(d)} className="text-brand">
                        {entry ? 'Edit' : 'Set a spot'}
                      </button>
                    )}
                    {!entry?.is_closed && (
                      <button onClick={() => markClosed(d)} className="text-red-600">Mark closed</button>
                    )}
                    {entry && (
                      <button onClick={() => clearDay(d)} className="text-muted">Clear</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8">
        <div className="eyebrow mb-2">Exceptions (specific dates)</div>
        <div className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
          <div className="flex flex-wrap gap-2">
            <input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)}
              className="rounded-lg border border-edge px-2 py-2 outline-none focus:border-brand" />
            <input
              className="min-w-[160px] flex-1 rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand disabled:bg-black/5"
              placeholder="Location name" value={exLoc} onChange={(e) => setExLoc(e.target.value)} disabled={exClosed}
            />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={exClosed} onChange={(e) => setExClosed(e.target.checked)} className="accent-brand" />
              Closed that day
            </label>
          </div>
          <button
            onClick={addException}
            disabled={!exDate || (!exClosed && !exLoc)}
            className="mt-3 rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60"
          >
            Add exception
          </button>
          <p className="mt-2 text-xs text-muted">
            Use this for one-off days that break your normal pattern — a holiday, a private
            booking, a day you're skipping your usual spot.
          </p>
        </div>
        <div className="mt-3 space-y-2">
          {oneOffs.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-ticket border border-edge bg-white p-3">
              <div>
                <span className="font-display font-bold">{o.date}</span>
                <span className={`ml-2 ${o.is_closed ? 'font-semibold text-red-600' : ''}`}>
                  {o.is_closed ? 'Closed' : o.location_name}
                </span>
              </div>
              <button onClick={() => removeException(o.id)} className="text-sm font-semibold text-brand">Delete</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
