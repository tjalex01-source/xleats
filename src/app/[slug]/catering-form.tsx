'use client';

import { useState } from 'react';

export default function CateringForm({
  truckId,
  truckName,
}: {
  truckId: string;
  truckName: string;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [form, setForm] = useState({
    name: '', email: '', phone: '', event_date: '', headcount: '', location: '', note: '',
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    try {
      const res = await fetch('/api/catering', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truck_id: truckId, ...form }),
      });
      setState(res.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') return (
    <div className="rounded-lg bg-purple-100 p-4 text-center text-purple-800">
      <p className="font-display font-bold">Request sent!</p>
      <p className="text-sm mt-1">{truckName} will be in touch soon.</p>
    </div>
  );

  const inputCls = 'w-full rounded-lg border border-edge bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none';

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input required className={inputCls} placeholder="Your name" value={form.name} onChange={set('name')} />
        <input required type="email" className={inputCls} placeholder="Email" value={form.email} onChange={set('email')} />
        <input className={inputCls} placeholder="Phone (optional)" value={form.phone} onChange={set('phone')} />
        <input required type="date" className={inputCls} value={form.event_date} onChange={set('event_date')} />
        <input className={inputCls} placeholder="Est. headcount" value={form.headcount} onChange={set('headcount')} />
        <input className={inputCls} placeholder="Event location" value={form.location} onChange={set('location')} />
      </div>
      <textarea
        className={`${inputCls} resize-none`}
        rows={3}
        placeholder="Tell them about your event..."
        value={form.note}
        onChange={set('note')}
      />
      {state === 'error' && (
        <p className="text-sm text-red-600">Something went wrong — please try again.</p>
      )}
      <button
        type="submit"
        disabled={state === 'loading'}
        className="w-full rounded-lg bg-brand py-2.5 font-display font-bold text-white disabled:opacity-60"
      >
        {state === 'loading' ? 'Sending…' : 'Request catering'}
      </button>
    </form>
  );
}
