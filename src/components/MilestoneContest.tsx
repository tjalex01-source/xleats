'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Contest } from '@/lib/types';

const COLORS = ['#e0523f', '#f4b942', '#3fa796', '#5b6ee1', '#e35d99'];

function Confetti() {
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.4,
    duration: 2 + Math.random() * 1.2,
    color: COLORS[i % COLORS.length],
    rotate: Math.random() * 360,
  }));
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
      <style jsx>{`
        .confetti-piece {
          position: absolute;
          top: -10px;
          width: 8px;
          height: 14px;
          opacity: 0.9;
          animation-name: confetti-fall;
          animation-timing-function: ease-in;
          animation-fill-mode: forwards;
        }
        @keyframes confetti-fall {
          to {
            top: 105%;
            opacity: 0.3;
          }
        }
      `}</style>
    </div>
  );
}

function formatElapsed(startedAt: string, nowMs: number) {
  const secs = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function MilestoneContest({ truckId, truckName }: { truckId: string; truckName: string }) {
  const supabase = createClient();
  const [contest, setContest] = useState<Contest | null>(null);
  const [now, setNow] = useState(Date.now());
  const [celebrating, setCelebrating] = useState(false);
  const [winnerName, setWinnerName] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [posting, setPosting] = useState(false);

  async function load() {
    const { data } = await supabase.from('contests')
      .select('*').eq('truck_id', truckId).eq('type', 'milestone').eq('status', 'open')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    setContest((data as Contest) ?? null);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function tap() {
    if (!contest) return;
    const { data, error } = await supabase.rpc('bump_contest_tap_count', { p_contest: contest.id });
    if (error || !data || !data[0]) return;
    const row = data[0] as { tap_count: number; target_count: number; reached: boolean };
    setContest((prev) => (prev ? { ...prev, tap_count: row.tap_count } : prev));
    if (row.reached) setCelebrating(true);
  }

  async function postWinner() {
    if (!contest) return;
    setPosting(true);
    let imageUrl: string | null = null;
    if (photoFile) {
      const path = `${truckId}/${crypto.randomUUID()}-${photoFile.name}`;
      const { error } = await supabase.storage.from('truck-photos').upload(path, photoFile);
      if (!error) {
        imageUrl = supabase.storage.from('truck-photos').getPublicUrl(path).data.publicUrl;
        const { count } = await supabase.from('truck_photos')
          .select('id', { count: 'exact', head: true }).eq('truck_id', truckId);
        await supabase.from('truck_photos').insert({ truck_id: truckId, image_url: imageUrl, sort_order: count ?? 0 });
      }
    }
    const name = winnerName.trim();
    const body = name
      ? `🎉 ${name} was our ${contest.target_count}${ordinalSuffix(contest.target_count ?? 0)} customer today at ${truckName}!`
      : `🎉 We just hit our ${contest.target_count}${ordinalSuffix(contest.target_count ?? 0)} customer of the day at ${truckName}!`;
    await supabase.from('posts').insert({ truck_id: truckId, body, image_url: imageUrl });
    if (name) await supabase.from('contests').update({ winner_note: name }).eq('id', contest.id);

    setPosting(false);
    setCelebrating(false);
    setContest(null);
    setWinnerName('');
    setPhotoFile(null);
  }

  function skip() {
    setCelebrating(false);
    setContest(null);
  }

  if (!contest) return null;

  return (
    <div className="mt-4">
      {celebrating && <Confetti />}
      <button
        onClick={tap}
        disabled={celebrating}
        className="w-full rounded-ticket border-2 border-brand bg-white p-4 text-left shadow-ticket transition active:scale-[0.99] disabled:opacity-60"
      >
        <div className="eyebrow">🎯 {contest.title}</div>
        <div className="mt-1 flex items-end justify-between">
          <span className="font-display text-3xl font-extrabold text-brand">
            {contest.tap_count}<span className="text-lg text-muted"> / {contest.target_count}</span>
          </span>
          <span className="font-mono text-sm text-muted">{formatElapsed(contest.created_at, now)}</span>
        </div>
        <div className="mt-1 text-xs text-muted">Tap after every sale</div>
      </button>

      {celebrating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-ticket bg-white p-5 shadow-ticket">
            <h2 className="font-display text-2xl font-extrabold text-brand">
              🎉 You hit customer #{contest.target_count}!
            </h2>
            <p className="mt-1 text-sm text-muted">
              Announce it to your followers and add a photo to your page&rsquo;s carousel.
            </p>
            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand"
                placeholder="Winner's first name (optional)"
                value={winnerName}
                onChange={(e) => setWinnerName(e.target.value)}
              />
              <input type="file" accept="image/*" className="text-sm"
                onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={skip} className="flex-1 rounded-lg border border-edge py-2 text-sm font-semibold text-muted">
                Skip
              </button>
              <button onClick={postWinner} disabled={posting}
                className="flex-1 rounded-lg bg-brand py-2 font-display font-bold text-white disabled:opacity-60">
                {posting ? 'Posting…' : 'Post it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ordinalSuffix(n: number) {
  const j = n % 10, k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}
