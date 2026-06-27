'use client';

import { useState, useTransition } from 'react';
import type { LiveSession, LiveStatus } from '@/lib/types';

const STATES: Record<LiveStatus, { label: string; dot: string; bg: string; line: string }> = {
  live:      { label: 'Live now',      dot: 'bg-state-live',      bg: 'bg-state-live/10',      line: 'border-state-live' },
  scheduled: { label: 'Out today',     dot: 'bg-state-scheduled', bg: 'bg-state-scheduled/10', line: 'border-state-scheduled' },
  catering:  { label: 'Catering',      dot: 'bg-state-catering',  bg: 'bg-state-catering/10',  line: 'border-state-catering' },
  off:       { label: 'Not out',       dot: 'bg-state-off',       bg: 'bg-black/[0.03]',       line: 'border-edge' },
};

function ago(iso: string | null) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} hr ago`;
}

export default function StatusControl({
  truckId,
  initial,
}: {
  truckId: string;
  initial: LiveSession | null;
}) {
  const [session, setSession] = useState<LiveSession | null>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const status: LiveStatus = session?.status ?? 'off';
  const ui = STATES[status];

  async function setStatus(next: LiveStatus, coords?: { lat: number; lng: number }) {
    setError(null);
    const res = await fetch('/api/live', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        truck_id: truckId,
        status: next,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        catering_note: next === 'catering' ? note || null : null,
      }),
    });
    if (!res.ok) {
      setError('Could not update status. Try again.');
      return;
    }
    setSession(await res.json());
  }

  function goLive() {
    setError(null);
    if (!('geolocation' in navigator)) {
      // No GPS — still go live, just without a confirmed pin.
      start(() => { setStatus('live'); });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        start(() => setStatus('live', { lat: pos.coords.latitude, lng: pos.coords.longitude })),
      () => setError('Location blocked. Allow location to confirm where you parked, or set Out Today.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const freshness = ago(session?.started_at ?? null);

  return (
    <div className={`rounded-ticket border ${ui.line} ${ui.bg} p-5`}>
      <div className="flex items-center gap-3">
        <span className={`h-3.5 w-3.5 rounded-full ${ui.dot} ${status === 'live' ? 'animate-pulse' : ''}`} />
        <div>
          <div className="font-display text-xl font-extrabold leading-none">{ui.label}</div>
          {status === 'live' && session?.confirmed_address && (
            <div className="text-sm text-muted">at {session.confirmed_address}</div>
          )}
          {status === 'live' && freshness && (
            <div className="text-xs text-muted">confirmed {freshness}</div>
          )}
          {status === 'catering' && session?.catering_note && (
            <div className="text-sm text-muted">{session.catering_note}</div>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-brand">{error}</p>}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={goLive}
          disabled={pending}
          className="col-span-2 rounded-lg bg-state-live px-4 py-3 font-display font-bold text-white disabled:opacity-60"
        >
          {pending ? 'Confirming…' : 'Go live — confirm my spot'}
        </button>
        <button
          onClick={() => start(() => setStatus('scheduled'))}
          disabled={pending}
          className="rounded-lg border border-edge bg-white px-3 py-2 text-sm font-semibold"
        >
          Out today
        </button>
        <button
          onClick={() => start(() => setStatus('off'))}
          disabled={pending}
          className="rounded-lg border border-edge bg-white px-3 py-2 text-sm font-semibold"
        >
          Go offline
        </button>
      </div>

      <div className="mt-3 rounded-lg border border-edge bg-white p-3">
        <label className="eyebrow">Catering today (private — no public pin)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Booked through Saturday"
          className="mt-1 w-full rounded border border-edge px-2 py-1.5 text-sm outline-none focus:border-state-catering"
        />
        <button
          onClick={() => start(() => setStatus('catering'))}
          disabled={pending}
          className="mt-2 w-full rounded-lg bg-state-catering px-3 py-2 text-sm font-semibold text-white"
        >
          Set catering
        </button>
      </div>
    </div>
  );
}
