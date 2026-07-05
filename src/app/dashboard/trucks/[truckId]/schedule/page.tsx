'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { SavedLocation } from '@/lib/types';
import { formatTime12 } from '@/lib/format';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type ScheduleRow = {
  id: string;
  recurring: boolean;
  day_of_week: number | null;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  location_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_closed: boolean;
  is_catering: boolean;
};

function entryLabel(e: ScheduleRow) {
  if (e.is_closed) return { text: 'Closed', className: 'font-semibold text-red-600' };
  if (e.is_catering) return { text: 'Catering', className: 'font-semibold text-purple-600' };
  return null;
}

export default function Schedule() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [recurring, setRecurring] = useState<ScheduleRow[]>([]);
  const [oneOffs, setOneOffs] = useState<ScheduleRow[]>([]);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);

  // per-day "add/edit a spot" form
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [useSavedId, setUseSavedId] = useState('');
  const [locName, setLocName] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [start, setStart] = useState('11:00');
  const [end, setEnd] = useState('14:00');
  const [saveFavorite, setSaveFavorite] = useState(false);

  // exceptions form
  const [exDate, setExDate] = useState('');
  const [exLoc, setExLoc] = useState('');
  const [exAddress, setExAddress] = useState('');
  const [exClosed, setExClosed] = useState(false);
  const [exCatering, setExCatering] = useState(false);

  async function load() {
    const [{ data: rows }, { data: locs }] = await Promise.all([
      supabase.from('schedules').select('*').eq('truck_id', truckId),
      supabase.from('saved_locations').select('*').eq('truck_id', truckId).order('name'),
    ]);
    const all = (rows ?? []) as ScheduleRow[];
    setRecurring(all.filter((r) => r.recurring).sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99')));
    setOneOffs(all.filter((r) => !r.recurring).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')));
    setSavedLocations(locs ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  const entriesForDay = (d: number) => recurring.filter((r) => r.day_of_week === d);

  function resetSpotForm() {
    setOpenDay(null); setEditingId(null); setUseSavedId('');
    setLocName(''); setLocAddress(''); setStart('11:00'); setEnd('14:00'); setSaveFavorite(false);
  }

  function openAddSpot(day: number) {
    resetSpotForm();
    setOpenDay(day);
  }

  function openEditSpot(day: number, e: ScheduleRow) {
    setOpenDay(day);
    setEditingId(e.id);
    setUseSavedId('');
    setLocName(e.location_name ?? '');
    setLocAddress(e.address ?? '');
    setStart(e.start_time?.slice(0, 5) ?? '11:00');
    setEnd(e.end_time?.slice(0, 5) ?? '14:00');
    setSaveFavorite(false);
  }

  function pickSaved(id: string) {
    setUseSavedId(id);
    const loc = savedLocations.find((l) => l.id === id);
    if (loc) { setLocName(loc.name); setLocAddress(loc.address ?? ''); }
  }

  async function saveSpot(day: number) {
    if (!locName) return;
    const saved = savedLocations.find((l) => l.id === useSavedId);
    const payload = {
      location_name: locName,
      address: locAddress || null,
      lat: saved?.lat ?? null,
      lng: saved?.lng ?? null,
      start_time: start, end_time: end,
      is_closed: false, is_catering: false,
    };
    if (editingId) {
      await supabase.from('schedules').update(payload).eq('id', editingId);
    } else {
      await supabase.from('schedules').insert({ truck_id: truckId, recurring: true, day_of_week: day, ...payload });
    }
    if (saveFavorite && locName) {
      await supabase.from('saved_locations').insert({ truck_id: truckId, name: locName, address: locAddress || null });
    }
    resetSpotForm();
    load();
  }

  async function markClosed(day: number) {
    await supabase.from('schedules').insert({ truck_id: truckId, recurring: true, day_of_week: day, is_closed: true });
    load();
  }
  async function markCatering(day: number) {
    await supabase.from('schedules').insert({ truck_id: truckId, recurring: true, day_of_week: day, is_catering: true });
    load();
  }
  async function removeEntry(id: string) {
    await supabase.from('schedules').delete().eq('id', id);
    if (editingId === id) resetSpotForm();
    load();
  }

  async function addException() {
    if (!exDate || (!exClosed && !exCatering && !exLoc)) return;
    await supabase.from('schedules').insert({
      truck_id: truckId, recurring: false, date: exDate,
      location_name: exClosed || exCatering ? null : exLoc,
      address: exClosed || exCatering ? null : exAddress || null,
      is_closed: exClosed, is_catering: exCatering,
    });
    setExDate(''); setExLoc(''); setExAddress(''); setExClosed(false); setExCatering(false);
    load();
  }
  async function removeException(id: string) {
    await supabase.from('schedules').delete().eq('id', id);
    load();
  }

  async function deleteSavedLocation(id: string) {
    await supabase.from('saved_locations').delete().eq('id', id);
    load();
  }

  const inputCls = 'w-full rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand';

  return (
    <div>
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Weekly schedule</h1>
      <p className="text-sm text-muted">
        This drives your daily status automatically, and customers see your full week —
        fill in every day you can so followers always know where to find you. A day can
        have more than one spot — a morning stop, a different afternoon stop, or a
        catering block later on.
      </p>

      <div className="mt-5 space-y-2">
        {DAYS.map((name, d) => {
          const entries = entriesForDay(d);
          return (
            <div key={d} className="rounded-ticket border border-edge bg-white p-3">
              <div className="font-display font-bold">{name}</div>

              {entries.length === 0 && openDay !== d && (
                <span className="text-sm italic text-muted">Unplanned as of now</span>
              )}

              <div className="mt-1 space-y-2">
                {entries.map((e) => {
                  const label = entryLabel(e);
                  if (editingId === e.id) return null; // shown via the open form below instead
                  return (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border border-edge p-2">
                      <div>
                        {label ? (
                          <span className={label.className}>{label.text}</span>
                        ) : (
                          <>
                            <div className="font-semibold">{e.location_name}</div>
                            {e.address && <div className="text-xs text-muted">{e.address}</div>}
                            {(e.start_time || e.end_time) && (
                              <div className="text-xs text-muted">{formatTime12(e.start_time)}–{formatTime12(e.end_time)}</div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex shrink-0 gap-3 text-sm font-semibold">
                        {!label && <button onClick={() => openEditSpot(d, e)} className="text-brand">Edit</button>}
                        <button onClick={() => removeEntry(e.id)} className="text-muted">Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {openDay === d ? (
                <div className="mt-2 space-y-2 rounded-lg border border-edge p-3">
                  {savedLocations.length > 0 && (
                    <select className={inputCls} value={useSavedId} onChange={(e) => pickSaved(e.target.value)}>
                      <option value="">Use a saved location…</option>
                      {savedLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                  <input className={inputCls} placeholder="Location name" value={locName} onChange={(e) => setLocName(e.target.value)} />
                  <input className={inputCls} placeholder="Address (so Google Maps can pinpoint it)"
                    value={locAddress} onChange={(e) => setLocAddress(e.target.value)} />
                  <div className="flex gap-2">
                    <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                    <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={saveFavorite} onChange={(e) => setSaveFavorite(e.target.checked)} className="accent-brand" />
                    Save this as a favorite location for next time
                  </label>
                  <div className="flex gap-3">
                    <button onClick={() => saveSpot(d)} disabled={!locName}
                      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                      Save
                    </button>
                    <button onClick={resetSpotForm} className="text-sm text-muted">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-3 text-sm font-semibold">
                  <button onClick={() => openAddSpot(d)} className="text-brand">+ Add a spot</button>
                  <button onClick={() => markClosed(d)} className="text-red-600">Mark closed</button>
                  <button onClick={() => markCatering(d)} className="text-purple-600">Private catering</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Saved locations management */}
      {savedLocations.length > 0 && (
        <div className="mt-6">
          <div className="eyebrow mb-2">Saved locations</div>
          <div className="space-y-2">
            {savedLocations.map((l) => (
              <div key={l.id} className="flex items-center justify-between rounded-ticket border border-edge bg-white p-3">
                <div>
                  <div className="font-semibold">{l.name}</div>
                  {l.address && <div className="text-xs text-muted">{l.address}</div>}
                </div>
                <button onClick={() => deleteSavedLocation(l.id)} className="text-sm font-semibold text-muted">Delete</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exceptions */}
      <div className="mt-8">
        <div className="eyebrow mb-2">One-time exceptions</div>
        <p className="mb-2 text-sm text-muted">
          For a single specific date that breaks your normal weekly pattern — a holiday
          closure, a one-time pop-up — without changing your regular schedule for that
          weekday going forward.
        </p>
        <div className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
          <div className="space-y-2">
            <input type="date" value={exDate} onChange={(e) => setExDate(e.target.value)} className={inputCls} />
            <input className={inputCls} placeholder="Location name" value={exLoc} onChange={(e) => setExLoc(e.target.value)}
              disabled={exClosed || exCatering} />
            <input className={inputCls} placeholder="Address" value={exAddress} onChange={(e) => setExAddress(e.target.value)}
              disabled={exClosed || exCatering} />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={exClosed} onChange={(e) => { setExClosed(e.target.checked); if (e.target.checked) setExCatering(false); }} className="accent-brand" />
                Closed that day
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={exCatering} onChange={(e) => { setExCatering(e.target.checked); if (e.target.checked) setExClosed(false); }} className="accent-brand" />
                Private catering that day
              </label>
            </div>
          </div>
          <button
            onClick={addException}
            disabled={!exDate || (!exClosed && !exCatering && !exLoc)}
            className="mt-3 rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60"
          >
            Add exception
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {oneOffs.map((o) => {
            const label = entryLabel(o);
            return (
              <div key={o.id} className="flex items-center justify-between rounded-ticket border border-edge bg-white p-3">
                <div>
                  <span className="font-display font-bold">{o.date}</span>
                  {label ? (
                    <span className={`ml-2 ${label.className}`}>{label.text}</span>
                  ) : (
                    <span className="ml-2">{o.location_name}{o.address ? ` — ${o.address}` : ''}</span>
                  )}
                </div>
                <button onClick={() => removeException(o.id)} className="text-sm font-semibold text-brand">Delete</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
