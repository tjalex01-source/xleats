'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { MenuItem } from '@/lib/types';

export default function Menu() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase.from('menu_items')
      .select('*').eq('truck_id', truckId).order('sort_order').order('created_at');
    setItems(data ?? []); setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  async function add() {
    if (!name) return;
    await supabase.from('menu_items').insert({
      truck_id: truckId, name,
      price: price ? Number(price) : null,
      category: category || null,
    });
    setName(''); setPrice(''); setCategory(''); load();
  }
  async function toggle(it: MenuItem) {
    await supabase.from('menu_items').update({ is_available: !it.is_available }).eq('id', it.id);
    load();
  }
  async function remove(id: string) {
    await supabase.from('menu_items').delete().eq('id', id); load();
  }

  return (
    <div>
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Menu</h1>

      <div className="mt-5 rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="grid grid-cols-12 gap-2">
          <input className="col-span-6 rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand"
            placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="col-span-3 rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand"
            placeholder="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          <input className="col-span-3 rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand"
            placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <button onClick={add} disabled={!name}
          className="mt-3 rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60">
          Add item
        </button>
        <p className="mt-2 text-xs text-muted">Photo upload to Supabase Storage wires in next — bucket “menu” is ready.</p>
      </div>

      <div className="mt-4 space-y-2">
        {loading && <p className="text-muted">Loading…</p>}
        {!loading && items.length === 0 && (
          <p className="rounded-ticket border border-dashed border-edge p-6 text-center text-muted">
            No items yet. Add your first above.
          </p>
        )}
        {items.map((it) => (
          <div key={it.id} className="flex items-center justify-between rounded-ticket border border-edge bg-white p-3">
            <div className={it.is_available ? '' : 'opacity-40'}>
              <div className="font-semibold">{it.name}{it.category && <span className="ml-2 text-xs text-muted">{it.category}</span>}</div>
              {it.price != null && <div className="text-sm text-muted">${Number(it.price).toFixed(2)}</div>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <button onClick={() => toggle(it)} className="font-semibold text-muted hover:text-ink">
                {it.is_available ? 'Mark 86’d' : 'Restore'}
              </button>
              <button onClick={() => remove(it.id)} className="font-semibold text-brand">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
