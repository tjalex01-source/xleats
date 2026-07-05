'use client';
import { useEffect, useState } from 'react';

type Announcement = { id: string; title: string; body: string; created_at: string };

const STORAGE_KEY = 'xleats_dismissed_announcements';

export default function AnnouncementsList({ announcements }: { announcements: Announcement[] }) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      setDismissed(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
    } catch {
      setDismissed([]);
    }
    setLoaded(true);
  }, []);

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  if (!loaded) return null;
  const visible = announcements.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      {visible.map((a) => (
        <div key={a.id} className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-display font-bold">{a.title}</div>
              <p className="mt-1 text-sm text-muted">{a.body}</p>
            </div>
            <button onClick={() => dismiss(a.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
