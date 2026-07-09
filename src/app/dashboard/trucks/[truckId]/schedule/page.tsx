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
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
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

function composeAddress(street: string, city: string, state: string, zip: string) {
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [street, cityStateZip].filter(Boolean).join(', ');
}

async function geocode(address: string): Promise<{ lat: number | null; lng: number | null }> {
  if (!address.trim()) return { lat: null, lng: null };
  try {
    const res = await fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    const data = await res.json();
    return { lat: data.lat ?? null, lng: data.lng ?? null };
  } catch {
    return { lat: null, lng: null };
  }
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
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zip, setZip] = useState('');
  const [start, setStart] = useState('11:00');
  const [end, setEnd] = useState('14:00');
  const [saveFavorite, setSaveFavorite] = useState(false);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // exceptions form
  const [exDate, setExDate] = useState('');
  const [exLoc, setExLoc] = useState('');
  const [exStreet, setExStreet] = useState('');
  const [exCity, setExCity] = useState('');
  const [exState, setExState] = useState('');
  const [exZip, setExZip] = useState('');
  const [exStart, setExStart] = useState('11:00');
  const [exEnd, setExEnd] = useState('14:00');
  const [exClosed, setExClosed] = useState(false);
  const [exCatering, setExCatering] = useState(false);
  const [exGeoNote, setExGeoNote] = useState<string | null>(null);
  const [exSaving, setExSaving] = useState(false);

  async function load() {
    const [{ data: rows }, { data: locs }] = await Promise.all([
      supabase.from('schedules').select('*').eq('truck_id', truckId),
      supabase.from('saved_locations').select('*').eq('truck_id', truckId).order('name'),
    ]);
    const all = (rows ?? []) as ScheduleRow[];
    setRecurring(all.filter((r) => r.recurring).sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99')));
    setOneOffs(all.filter((r) => !r.recurring).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')));
    setSavedLocations((locs as SavedLocation[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  const entriesForDay = (d: number) => recurring.filter((r) => r.day_of_week === d);

  function resetSpotForm() {
    setOpenDay(null); setEditingId(null); setUseSavedId('');
    setLocName(''); setStreet(''); setCity(''); setStateVal(''); setZip('');
    setStart('11:00'); setEnd('14:00'); setSaveFavorite(false); setGeoNote(null);
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
    setStreet(e.street ?? ''); setCity(e.city ?? ''); setStateVal(e.state ?? ''); setZip(e.zip ?? '');
    setStart(e.start_time?.slice(0, 5) ?? '11:00');
    setEnd(e.end_time?.slice(0, 5) ?? '14:00');
    setSaveFavorite(false);
    setGeoNote(null);
  }

  function pickSaved(id: string) {
    setUseSavedId(id);
    const loc = savedLocations.find((l) => l.id === id);
    if (loc) {
      setLocName(loc.name);
      setStreet(loc.street ?? ''); setCity(loc.city ?? ''); setStateVal(loc.state ?? ''); setZip(loc.zip ?? '');
    }
  }

  async function saveSpot(day: number) {
    if (!locName) return;
    setSaving(true); setGeoNote(null);
    const saved = savedLocations.find((l) => l.id === useSavedId);
    const composed = saved?.address || composeAddress(street, city, stateVal, zip);
    let lat = saved?.lat ?? null;
    let lng = saved?.lng ?? null;
    if (!saved && composed) {
      const geo = await geocode(composed);
      lat = geo.lat; lng = geo.lng;
      setGeoNote(lat != null ? '📍 Location pinpointed' : '⚠️ Couldn’t pinpoint that address — saved anyway, directions may be less exact');
    }
    const payload = {
      location_name: locName,
      address: composed || null,
      street: saved ? (saved.street ?? null) : (street || null),
      city: saved ? (saved.city ?? null) : (city || null),
      state: saved ? (saved.state ?? null) : (stateVal || null),
      zip: saved ? (saved.zip ?? null) : (zip || null),
      lat, lng,
      start_time: start, end_time: end,
      is_closed: false, is_catering: false,
    };
    if (editingId) {
      await supabase.from('schedules').update(payload).eq('id', editingId);
    } else {
      await supabase.from('schedules').insert({ truck_id: truckId, recurring: true, day_of_week: day, ...payload });
    }
    if (saveFavorite && locName) {
      await supabase.from('saved_locations').insert({
        truck_id: truckId, name: locName, address: composed || null,
        street: street || null, city: city || null, state: stateVal || null, zip: zip || null,
        lat, lng,
      });
    }
    setSaving(false);
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

  function resetExceptionForm() {
    setExDate(''); setExLoc(''); setExStreet(''); setExCity(''); setExState(''); setExZip('');
    setExStart('11:00'); setExEnd('14:00'); setExClosed(false); setExCatering(false); setExGeoNote(null);
  }

  async function addException() {
    if (!exDate || (!exClosed && !exCatering && !exLoc)) return;
    setExSaving(true); setExGeoNote(null);
    const composed = composeAddress(exStreet, exCity, exState, exZip);
    let lat: number | null = null;
    let lng: number | null = null;
    if (!exClosed && !exCatering && composed) {
      const geo = await geocode(composed);
      lat = geo.lat; lng = geo.lng;
      setExGeoNote(lat != null ? '📍 Location pinpointed' : '⚠️ Couldn’t pinpoint that address — saved anyway, directions may be less exact');
    }
    await supabase.from('schedules').insert({
      truck_id: truckId, recurring: false, date: exDate,
      location_name: exClosed || exCatering ? null : exLoc,
      address: exClosed || exCatering ? null : (composed || null),
      street: exClosed || exCatering ? null : (exStreet || null),
      city: exClosed || exCatering ? null : (exCity || null),
      state: exClosed || exCatering ? null : (exState || null),
      zip: exClosed || exCatering ? null : (exZip || null),
      lat, lng,
      start_time: exClosed || exCatering ? null : exStart,
      end_time: exClosed || exCatering ? null : exEnd,
      is_closed: exClosed, is_catering: exCatering,
    });
    setExSaving(false);
    resetExceptionForm();
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
                  <input className={inputCls} placeholder="Street address" value={street} onChange={(e) => setStreet(e.target.value)} />
                  <div className="flex gap-2">
                    <input className={`${inputCls} flex-1`} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
                    <input className={`${inputCls} w-16`} placeholder="State" value={stateVal} onChange={(e) => setStateVal(e.target.value)} />
                    <input className={`${inputCls} w-24`} placeholder="Zip" value={zip} onChange={(e) => setZip(e.target.value)} />
                  </div>
                  <div className="flex gap-2">
                    <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
                    <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
                  </div>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={saveFavorite} onChange={(e) => setSaveFavorite(e.target.checked)} className="accent-brand" />
                    Save this as a favorite location for next time
                  </label>
                  {geoNote && <p className="text-xs text-muted">{geoNote}</p>}
                  <div className="flex gap-3">
                    <button onClick={() => saveSpot(d)} disabled={!locName || saving}
                      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60">
                      {saving ? 'Saving…' : 'Save'}
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
            <input className={inputCls} placeholder="Street address" value={exStreet} onChange={(e) => setExStreet(e.target.value)}
              disabled={exClosed || exCatering} />
            <div className="flex gap-2">
              <input className={`${inputCls} flex-1`} placeholder="City" value={exCity} onChange={(e) => setExCity(e.target.value)}
                disabled={exClosed || exCatering} />
              <input className={`${inputCls} w-16`} placeholder="State" value={exState} onChange={(e) => setExState(e.target.value)}
                disabled={exClosed || exCatering} />
              <input className={`${inputCls} w-24`} placeholder="Zip" value={exZip} onChange={(e) => setExZip(e.target.value)}
                disabled={exClosed || exCatering} />
            </div>
            <div className="flex gap-2">
              <input type="time" value={exStart} onChange={(e) => setExStart(e.target.value)} className={inputCls}
                disabled={exClosed || exCatering} />
              <input type="time" value={exEnd} onChange={(e) => setExEnd(e.target.value)} className={inputCls}
                disabled={exClosed || exCatering} />
            </div>
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
            {exGeoNote && <p className="text-xs text-muted">{exGeoNote}</p>}
          </div>
          <button
            onClick={addException}
            disabled={!exDate || (!exClosed && !exCatering && !exLoc) || exSaving}
            className="mt-3 rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60"
          >
            {exSaving ? 'Saving…' : 'Add exception'}
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
                    <>
                      <span className="ml-2">{o.location_name}{o.address ? ` — ${o.address}` : ''}</span>
                      {(o.start_time || o.end_time) && (
                        <div className="text-xs text-muted">{formatTime12(o.start_time)}–{formatTime12(o.end_time)}</div>
                      )}
                    </>
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
