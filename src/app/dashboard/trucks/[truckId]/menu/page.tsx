'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { MenuItem, MenuPhoto, AccountPlan, Special } from '@/lib/types';

const CATEGORIES = ['Appetizers', 'Entrees', 'Breakfast', 'Sides', 'Add-ons', 'Drinks', 'Desserts', 'Other'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type TruckOption = { id: string; name: string };
type Assignment = { menu_item_id: string; truck_id: string };

function PhotoBox({ url, alt }: { url: string | null; alt: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className="h-14 w-14 shrink-0 rounded-lg border border-edge object-cover" />;
  }
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-edge bg-cream text-xl text-muted">
      🍽️
    </div>
  );
}

export default function Menu() {
  const { truckId } = useParams<{ truckId: string }>();
  const supabase = createClient();

  const [accountId, setAccountId] = useState<string | null>(null);
  const [plan, setPlan] = useState<AccountPlan | null>(null);
  const [trucks, setTrucks] = useState<TruckOption[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [photos, setPhotos] = useState<MenuPhoto[]>([]);
  const [loading, setLoading] = useState(true);

  // Specials
  const [specials, setSpecials] = useState<Special[]>([]);
  const [specialItemId, setSpecialItemId] = useState('');
  const [specialPrice, setSpecialPrice] = useState('');
  const [specialAdvertise, setSpecialAdvertise] = useState(true);
  const [specialMode, setSpecialMode] = useState<'recurring' | 'once'>('recurring');
  const [specialDays, setSpecialDays] = useState<number[]>([]);
  const [specialDate, setSpecialDate] = useState('');
  const [editingSpecialId, setEditingSpecialId] = useState<string | null>(null);

  // add/edit form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [isCatering, setIsCatering] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [truckScope, setTruckScope] = useState<'all' | 'select'>('all');
  const [selectedTruckIds, setSelectedTruckIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [photoUploading, setPhotoUploading] = useState(false);

  async function load() {
    const { data: truck } = await supabase.from('trucks').select('account_id').eq('id', truckId).single();
    if (!truck) { setLoading(false); return; }

    const [{ data: acc }, { data: allTrucks }, { data: allItems }, { data: menuPhotos }, { data: specialRows }] = await Promise.all([
      supabase.from('accounts').select('id, plan').eq('id', truck.account_id).single(),
      supabase.from('trucks').select('id, name').eq('account_id', truck.account_id).order('created_at'),
      supabase.from('menu_items').select('*').eq('account_id', truck.account_id).order('sort_order').order('created_at'),
      supabase.from('menu_photos').select('*').eq('truck_id', truckId).order('sort_order'),
      supabase.from('specials').select('*').eq('truck_id', truckId).order('created_at', { ascending: false }),
    ]);

    setAccountId(truck.account_id);
    setPlan(acc?.plan ?? null);
    setTrucks(allTrucks ?? []);
    setPhotos(menuPhotos ?? []);
    setSpecials((specialRows as Special[]) ?? []);

    const scopedIds = (allItems ?? []).filter((i) => !i.applies_to_all_trucks).map((i) => i.id);
    let scopedAssignments: Assignment[] = [];
    if (scopedIds.length > 0) {
      const { data } = await supabase.from('menu_item_trucks').select('menu_item_id, truck_id').in('menu_item_id', scopedIds);
      scopedAssignments = data ?? [];
    }
    setAssignments(scopedAssignments);

    const visible = (allItems ?? []).filter(
      (i) => i.applies_to_all_trucks || scopedAssignments.some((a) => a.menu_item_id === i.id && a.truck_id === truckId)
    );
    setItems(visible);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [truckId]);

  function resetForm() {
    setEditingId(null);
    setName(''); setPrice(''); setCategory(''); setCustomCategory('');
    setDescription(''); setIsNew(false); setIsCatering(false);
    setPhotoFile(null); setTruckScope('all'); setSelectedTruckIds([]);
  }

  function startEdit(it: MenuItem) {
    setEditingId(it.id);
    setName(it.name);
    setPrice(it.price != null ? String(it.price) : '');
    const known = CATEGORIES.slice(0, -1).includes(it.category ?? '');
    setCategory(known ? (it.category ?? '') : it.category ? 'Other' : '');
    setCustomCategory(known ? '' : it.category ?? '');
    setDescription(it.description ?? '');
    setIsNew(it.is_new);
    setIsCatering(it.is_catering);
    setPhotoFile(null);
  }

  async function uploadItemPhoto(): Promise<string | null> {
    if (!photoFile || !accountId) return null;
    const path = `${accountId}/${crypto.randomUUID()}-${photoFile.name}`;
    const { error } = await supabase.storage.from('menu').upload(path, photoFile);
    if (error) return null;
    return supabase.storage.from('menu').getPublicUrl(path).data.publicUrl;
  }

  async function save() {
    if (!name || !accountId) return;
    setSaving(true);
    const finalCategory = (category === 'Other' ? customCategory : category) || null;
    const photoUrl = photoFile ? await uploadItemPhoto() : undefined;

    if (editingId) {
      const patch: Partial<MenuItem> = {
        name, description: description || null,
        price: price ? Number(price) : null,
        category: finalCategory, is_new: isNew, is_catering: isCatering,
      };
      if (photoUrl) patch.photo_url = photoUrl;
      await supabase.from('menu_items').update(patch).eq('id', editingId);
    } else {
      const appliesToAll = trucks.length <= 1 || truckScope === 'all';
      const { data: inserted, error } = await supabase
        .from('menu_items')
        .insert({
          account_id: accountId, name, description: description || null,
          price: price ? Number(price) : null, category: finalCategory,
          photo_url: photoUrl ?? null, is_new: isNew, is_catering: isCatering,
          applies_to_all_trucks: appliesToAll,
        })
        .select().single();
      if (!error && inserted && !appliesToAll) {
        const ids = selectedTruckIds.length > 0 ? selectedTruckIds : [truckId];
        await supabase.from('menu_item_trucks').insert(ids.map((tid) => ({ menu_item_id: inserted.id, truck_id: tid })));
      }
    }
    setSaving(false);
    resetForm();
    load();
  }

  async function toggleAvailable(it: MenuItem) {
    await supabase.from('menu_items').update({ is_available: !it.is_available }).eq('id', it.id);
    load();
  }

  async function removeItem(it: MenuItem) {
    if (it.applies_to_all_trucks) {
      await supabase.from('menu_items').delete().eq('id', it.id);
    } else {
      const assignedCount = assignments.filter((a) => a.menu_item_id === it.id).length;
      if (assignedCount <= 1) {
        await supabase.from('menu_items').delete().eq('id', it.id);
      } else {
        await supabase.from('menu_item_trucks').delete().eq('menu_item_id', it.id).eq('truck_id', truckId);
      }
    }
    if (editingId === it.id) resetForm();
    load();
  }

  function removeLabel(it: MenuItem) {
    if (it.applies_to_all_trucks) return 'Delete (all trucks)';
    const assignedCount = assignments.filter((a) => a.menu_item_id === it.id).length;
    return assignedCount > 1 ? 'Remove from this truck' : 'Delete';
  }

  async function uploadMenuPhoto(file: File) {
    setPhotoUploading(true);
    const path = `${truckId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage.from('menu-photos').upload(path, file);
    if (!error) {
      const url = supabase.storage.from('menu-photos').getPublicUrl(path).data.publicUrl;
      await supabase.from('menu_photos').insert({ truck_id: truckId, image_url: url, sort_order: photos.length });
      load();
    }
    setPhotoUploading(false);
  }
  async function removePhoto(id: string) {
    await supabase.from('menu_photos').delete().eq('id', id);
    load();
  }

  // --- Specials -------------------------------------------------------------
  function resetSpecialForm() {
    setEditingSpecialId(null);
    setSpecialItemId(''); setSpecialPrice(''); setSpecialAdvertise(true);
    setSpecialMode('recurring'); setSpecialDays([]); setSpecialDate('');
  }
  function startEditSpecial(s: Special) {
    setEditingSpecialId(s.id);
    setSpecialItemId(s.menu_item_id);
    setSpecialPrice(String(s.special_price));
    setSpecialAdvertise(s.advertise_discount);
    setSpecialMode(s.recurring ? 'recurring' : 'once');
    setSpecialDays(s.days_of_week ?? []);
    setSpecialDate(s.special_date ?? '');
  }
  function toggleSpecialDay(day: number) {
    setSpecialDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }
  async function saveSpecial() {
    if (!specialItemId || !specialPrice) return;
    const patch = {
      menu_item_id: specialItemId,
      special_price: Number(specialPrice),
      advertise_discount: specialAdvertise,
      recurring: specialMode === 'recurring',
      days_of_week: specialMode === 'recurring' ? specialDays : [],
      special_date: specialMode === 'once' && specialDate ? specialDate : null,
    };
    if (editingSpecialId) {
      await supabase.from('specials').update(patch).eq('id', editingSpecialId);
    } else {
      await supabase.from('specials').insert({ truck_id: truckId, ...patch });
    }
    resetSpecialForm();
    load();
  }
  async function toggleSpecialActive(s: Special) {
    await supabase.from('specials').update({ active: !s.active }).eq('id', s.id);
    load();
  }
  async function deleteSpecial(id: string) {
    await supabase.from('specials').delete().eq('id', id);
    if (editingSpecialId === id) resetSpecialForm();
    load();
  }

  const inputCls = 'w-full rounded-lg border border-edge px-3 py-2 outline-none focus:border-brand';
  const itemsByCategory = items
    .filter((i) => !i.is_catering)
    .reduce<Record<string, MenuItem[]>>((acc, it) => {
      const cat = it.category ?? 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(it);
      return acc;
    }, {});
  const cateringItems = items.filter((i) => i.is_catering);

  if (loading) return <p className="text-muted">Loading…</p>;

  return (
    <div>
      <Link href={`/dashboard/trucks/${truckId}`} className="eyebrow">← Truck</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Menu</h1>
      <p className="text-sm text-muted">
        A clean, itemized menu leads to more customers than a photo of your menu board —
        it looks more professional, and it is much easier to change if your menu changes.
      </p>

      {/* Add / edit item form */}
      <div className="mt-5 rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="grid grid-cols-12 gap-2">
          <input className={`${inputCls} col-span-6`} placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={`${inputCls} col-span-3`} placeholder="Price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          <select className={`${inputCls} col-span-3`} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Category…</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {category === 'Other' && (
            <input className={`${inputCls} col-span-12`} placeholder="Custom category name"
              value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} />
          )}
          <textarea className={`${inputCls} col-span-12`} placeholder="Description — what's on it, how it's made, etc."
            rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="col-span-12">
            <label className="mb-1 block text-xs font-semibold text-muted">Photo (optional)</label>
            <input type="file" accept="image/*" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} className="accent-brand" />
            New item
          </label>
          {plan && plan !== 'free' && (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={isCatering} onChange={(e) => setIsCatering(e.target.checked)} className="accent-brand" />
              Catering menu only
            </label>
          )}
        </div>

        {!editingId && trucks.length > 1 && (
          <div className="mt-3 rounded-lg border border-edge p-3">
            <div className="mb-2 text-xs font-semibold text-muted">Apply this item to</div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={truckScope === 'all'} onChange={() => setTruckScope('all')} className="accent-brand" />
                All trucks
              </label>
              <label className="flex items-center gap-1.5">
                <input type="radio" checked={truckScope === 'select'} onChange={() => setTruckScope('select')} className="accent-brand" />
                Select trucks
              </label>
            </div>
            {truckScope === 'select' && (
              <div className="mt-2 space-y-1">
                {trucks.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedTruckIds.includes(t.id) || (selectedTruckIds.length === 0 && t.id === truckId)}
                      onChange={(e) => {
                        const base = selectedTruckIds.length === 0 ? [truckId] : selectedTruckIds;
                        setSelectedTruckIds(e.target.checked ? Array.from(new Set([...base, t.id])) : base.filter((id) => id !== t.id));
                      }}
                      className="accent-brand"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-3">
          <button onClick={save} disabled={!name || saving}
            className="rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60">
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add item'}
          </button>
          {editingId && <button onClick={resetForm} className="text-sm text-muted">Cancel</button>}
        </div>
      </div>

      {/* Item list by category */}
      <div className="mt-4 space-y-4">
        {Object.keys(itemsByCategory).length === 0 && (
          <p className="rounded-ticket border border-dashed border-edge p-6 text-center text-muted">
            No items yet. Add your first above.
          </p>
        )}
        {Object.entries(itemsByCategory).map(([cat, catItems]) => (
          <div key={cat}>
            <div className="eyebrow mb-2">{cat}</div>
            <div className="space-y-2">
              {catItems.map((it) => (
                <div key={it.id} className="flex items-center gap-3 rounded-ticket border border-edge bg-white p-3">
                  <PhotoBox url={it.photo_url} alt={it.name} />
                  <div className={`flex-1 ${it.is_available ? '' : 'opacity-40'}`}>
                    <div className="font-semibold">
                      {it.name}
                      {it.is_new && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">NEW</span>}
                      {!it.applies_to_all_trucks && (
                        <span className="ml-2 text-xs text-muted">
                          ({assignments.filter((a) => a.menu_item_id === it.id).length} truck
                          {assignments.filter((a) => a.menu_item_id === it.id).length === 1 ? '' : 's'})
                        </span>
                      )}
                    </div>
                    {it.description && <div className="text-sm text-muted">{it.description}</div>}
                    {it.price != null && <div className="text-sm text-muted">${Number(it.price).toFixed(2)}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <button onClick={() => startEdit(it)} className="font-semibold text-brand">Edit</button>
                    <button onClick={() => toggleAvailable(it)} className="font-semibold text-muted hover:text-ink">
                      {it.is_available ? 'Mark 86’d' : 'Restore'}
                    </button>
                    <button onClick={() => removeItem(it)} className="font-semibold text-red-600">{removeLabel(it)}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Specials */}
      <div className="mt-8 rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <div className="eyebrow mb-2">Specials</div>
        <p className="mb-3 text-sm text-muted">
          Feature an existing menu item at a special price today, on a future date, or every week
          on the same day(s) — like a Taco Tuesday. It shows up in a Specials box on your public page.
        </p>

        {items.length === 0 ? (
          <p className="text-sm text-muted">Add a menu item above first, then you can turn it into a special.</p>
        ) : (
          <div className="space-y-2">
            <select className={inputCls} value={specialItemId} onChange={(e) => setSpecialItemId(e.target.value)}>
              <option value="">Choose a menu item…</option>
              {items.filter((i) => !i.is_catering).map((i) => (
                <option key={i.id} value={i.id}>{i.name}{i.price != null ? ` — $${Number(i.price).toFixed(2)} reg.` : ''}</option>
              ))}
            </select>
            <input className={inputCls} placeholder="Special price" inputMode="decimal"
              value={specialPrice} onChange={(e) => setSpecialPrice(e.target.value)} />
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" checked={specialAdvertise} onChange={(e) => setSpecialAdvertise(e.target.checked)} className="accent-brand" />
              Advertise the savings (e.g. &ldquo;20% off&rdquo;) next to the price
            </label>

            <div className="rounded-lg border border-edge p-3">
              <div className="mb-2 flex gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={specialMode === 'recurring'} onChange={() => setSpecialMode('recurring')} /> Every week
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={specialMode === 'once'} onChange={() => setSpecialMode('once')} /> One day only
                </label>
              </div>
              {specialMode === 'recurring' ? (
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, i) => (
                    <button key={i} type="button" onClick={() => toggleSpecialDay(i)}
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${specialDays.includes(i) ? 'border-brand bg-brand text-white' : 'border-edge text-muted'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <input type="date" className={inputCls} value={specialDate} onChange={(e) => setSpecialDate(e.target.value)} />
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={saveSpecial} disabled={!specialItemId || !specialPrice}
                className="rounded-lg bg-brand px-4 py-2 font-display font-bold text-white disabled:opacity-60">
                {editingSpecialId ? 'Save changes' : 'Add special'}
              </button>
              {editingSpecialId && <button onClick={resetSpecialForm} className="text-sm text-muted">Cancel</button>}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          {specials.map((s) => {
            const item = items.find((i) => i.id === s.menu_item_id);
            return (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-edge p-3 text-sm">
                <div>
                  <span className="font-semibold">{item?.name ?? 'Deleted item'}</span>
                  <span className="ml-2 text-muted">${Number(s.special_price).toFixed(2)}</span>
                  {!s.active && <span className="ml-2 text-xs text-muted">· paused</span>}
                  <div className="text-xs text-muted">
                    {s.recurring
                      ? (s.days_of_week.length > 0 ? s.days_of_week.map((d) => DAY_LABELS[d]).join(', ') : 'No days selected')
                      : (s.special_date ? new Date(s.special_date + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date set')}
                  </div>
                </div>
                <div className="flex gap-3 font-semibold">
                  <button onClick={() => startEditSpecial(s)} className="text-brand">Edit</button>
                  <button onClick={() => toggleSpecialActive(s)} className="text-brand">{s.active ? 'Pause' : 'Resume'}</button>
                  <button onClick={() => deleteSpecial(s.id)} className="text-muted">Delete</button>
                </div>
              </div>
            );
          })}
          {specials.length === 0 && <p className="text-sm text-muted">No specials yet.</p>}
        </div>
      </div>

      {/* Catering menu (Pro/Fleet only) */}
      {plan && plan !== 'free' && (
        <div className="mt-8">
          <div className="eyebrow mb-2">Catering menu</div>
          <p className="mb-2 text-sm text-muted">Only shown to customers requesting catering, not your walk-up menu.</p>
          <div className="space-y-2">
            {cateringItems.length === 0 && (
              <p className="rounded-ticket border border-dashed border-edge p-4 text-center text-sm text-muted">
                No catering items yet — check &ldquo;Catering menu only&rdquo; above when adding one.
              </p>
            )}
            {cateringItems.map((it) => (
              <div key={it.id} className="flex items-center justify-between rounded-ticket border border-edge bg-white p-3">
                <div className={it.is_available ? '' : 'opacity-40'}>
                  <div className="font-semibold">{it.name}</div>
                  {it.description && <div className="text-sm text-muted">{it.description}</div>}
                  {it.price != null && <div className="text-sm text-muted">${Number(it.price).toFixed(2)}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-sm">
                  <button onClick={() => startEdit(it)} className="font-semibold text-brand">Edit</button>
                  <button onClick={() => removeItem(it)} className="font-semibold text-red-600">{removeLabel(it)}</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Whole-menu photos */}
      <div className="mt-8">
        <div className="eyebrow mb-2">Or upload photos of your menu</div>
        <p className="mb-2 text-sm text-muted">
          If you'd rather not list items one by one, upload a photo of your menu board instead.
          Worth noting, vendors who type out their items individually will likely draw more
          customers and come across as more professional, especially if your menu photos are
          hard to read.
        </p>
        <input type="file" accept="image/*" disabled={photoUploading}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMenuPhoto(f); }} className="text-sm" />
        {photos.length > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {photos.map((p) => (
              <div key={p.id} className="relative overflow-hidden rounded-ticket border border-edge">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image_url} alt="Menu" className="h-32 w-full object-cover" />
                <button onClick={() => removePhoto(p.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
