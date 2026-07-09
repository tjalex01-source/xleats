'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Special } from '@/lib/types';

type TodaySpecial = Special & { item_name: string; tap_count: number };

export default function SpecialTapCounter({ truckId }: { truckId: string }) {
  const supabase = createClient();
  const [todaySpecials, setTodaySpecials] = useState<TodaySpecial[]>([]);

  async function load() {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const dow = today.getDay();

    const { data: all } = await supabase.from('specials').select('*').eq('truck_id', truckId).eq('active', true);
    const active = (all ?? []).filter((s) =>
      s.recurring ? (s.days_of_week ?? []).includes(dow) : s.special_date === iso
    );
    if (active.length === 0) { setTodaySpecials([]); return; }

    const itemIds = active.map((s) => s.menu_item_id);
    const { data: menuItems } = await supabase.from('menu_items').select('id, name').in('id', itemIds);
    const nameById = new Map((menuItems ?? []).map((m) => [m.id, m.name]));

    const { data: taps } = await supabase.from('special_taps')
      .select('special_id, count').eq('tap_date', iso).in('special_id', active.map((s) => s.id));
    const tapById = new Map((taps ?? []).map((t) => [t.special_id, t.count]));

    setTodaySpecials(
      active.map((s) => ({ ...s, item_name: nameById.get(s.menu_item_id) ?? 'Special', tap_count: tapById.get(s.id) ?? 0 }))
    );
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  async function tap(specialId: string) {
    const { data } = await supabase.rpc('bump_special_tap_count', { p_special: specialId });
    if (typeof data === 'number') {
      setTodaySpecials((prev) => prev.map((s) => (s.id === specialId ? { ...s, tap_count: data } : s)));
    }
  }

  if (todaySpecials.length === 0) return null;

  return (
    <div className="mt-4 rounded-ticket border border-edge bg-white p-3">
      <div className="eyebrow mb-2">Today&rsquo;s specials</div>
      <div className="space-y-2">
        {todaySpecials.map((s) => (
          <button key={s.id} onClick={() => tap(s.id)}
            className="flex w-full items-center justify-between rounded-lg border border-edge px-3 py-2 text-left transition active:scale-[0.99]">
            <span className="font-semibold">{s.item_name}</span>
            <span className="flex items-center gap-2">
              <span className="font-display text-lg font-extrabold text-brand">{s.tap_count}</span>
              <span className="text-xs text-muted">sold — tap to count one</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
