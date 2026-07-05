'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Truck } from '@/lib/types';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function TruckSettingsForm({ truck }: { truck: Truck }) {
  const router = useRouter();
  const [name, setName] = useState(truck.name);
  const [slug, setSlug] = useState(truck.slug);
  const [cuisine, setCuisine] = useState(truck.cuisine ?? '');
  const [bio, setBio] = useState(truck.bio ?? '');
  const [logoUrl, setLogoUrl] = useState(truck.logo_url ?? '');
  const [bannerUrl, setBannerUrl] = useState(truck.banner_url ?? '');
  const [instagram, setInstagram] = useState(truck.instagram ?? '');
  const [orderUrl, setOrderUrl] = useState(truck.order_url ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputCls = 'w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand';

  async function submit() {
    setBusy(true); setError(null); setSaved(false);
    const cleanSlug = slugify(slug);
    if (!cleanSlug) { setError('Public URL cannot be empty.'); setBusy(false); return; }

    const cleanOrderUrl = orderUrl.trim()
      ? (orderUrl.trim().startsWith('http') ? orderUrl.trim() : `https://${orderUrl.trim()}`)
      : null;

    const { error } = await createClient()
      .from('trucks')
      .update({
        name,
        slug: cleanSlug,
        cuisine: cuisine || null,
        bio: bio || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        instagram: instagram || null,
        order_url: cleanOrderUrl,
      })
      .eq('id', truck.id);

    setBusy(false);
    if (error) {
      setError(error.message.includes('duplicate') ? 'That public URL is already taken.' : error.message);
      return;
    }
    setSlug(cleanSlug);
    setOrderUrl(cleanOrderUrl ?? '');
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Truck name</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Public URL</label>
        <div className="flex items-center gap-1 text-sm text-muted">
          <span>xleats.com/</span>
          <input className={inputCls} value={slug} onChange={(e) => setSlug(e.target.value)} />
        </div>
        <p className="mt-1 text-xs text-muted">
          Changing this breaks any QR flyers or links you&rsquo;ve already shared.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Cuisine</label>
        <input className={inputCls} placeholder="e.g. Tacos, BBQ" value={cuisine} onChange={(e) => setCuisine(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Bio</label>
        <textarea className={inputCls} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Logo image URL</label>
        <input className={inputCls} placeholder="https://…" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Banner / cover image URL</label>
        <input className={inputCls} placeholder="https://…" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} />
        <p className="mt-1 text-xs text-muted">
          Used as the preview image when your page is shared on social media.
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Instagram handle</label>
        <input className={inputCls} placeholder="@yourtruck" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Order Online link</label>
        <input className={inputCls} placeholder="https://your-square-site.square.site"
          value={orderUrl} onChange={(e) => setOrderUrl(e.target.value)} />
        <p className="mt-1 text-xs text-muted">
          Paste a link to wherever customers can already order from you (Square Online, DoorDash,
          your own site — whatever you use). We&rsquo;ll show an &ldquo;Order Online&rdquo; button
          on your public page only once this is filled in, and customers are always told they&rsquo;re
          leaving XLeats before it opens. XLeats never touches payments — this is just a link to
          your own ordering system.
        </p>
        <details className="mt-2 rounded-lg border border-edge p-3 text-xs text-muted">
          <summary className="cursor-pointer font-semibold text-ink">
            Don&rsquo;t have an ordering link yet? Here&rsquo;s the free way to get one.
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Sign in (or sign up free) at <span className="font-semibold">squareup.com</span>.</li>
            <li>From the Square dashboard, go to <span className="font-semibold">Square Online</span> and create a free site — you don&rsquo;t need a paid plan for this.</li>
            <li>Add your menu items in Square (or import the ones you already added here).</li>
            <li>Once your site is live, Square gives you a URL like <span className="font-semibold">yourtruckname.square.site</span> — copy that.</li>
            <li>Paste it into the field above and save. That&rsquo;s it — Square handles the ordering and payment, XLeats just links to it.</li>
          </ol>
        </details>
      </div>

      {error && <p className="text-sm text-brand">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">Saved.</p>}

      <button onClick={submit} disabled={busy || !name}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-display font-bold text-white disabled:opacity-60">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
