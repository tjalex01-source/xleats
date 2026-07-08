'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Truck, TruckPhoto } from '@/lib/types';

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const withHttps = (v: string) => {
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
};

type ApplyAllField =
  | 'cuisine' | 'bio' | 'logo_url' | 'banner_url' | 'instagram' | 'facebook'
  | 'website_url' | 'phone' | 'email' | 'order_url';

export default function TruckSettingsForm({
  truck, isFleet, siblingTruckIds, initialPhotos,
}: {
  truck: Truck;
  isFleet: boolean;
  siblingTruckIds: string[];
  initialPhotos: TruckPhoto[];
}) {
  const router = useRouter();
  const [name, setName] = useState(truck.name);
  const [slug, setSlug] = useState(truck.slug);
  const [cuisine, setCuisine] = useState(truck.cuisine ?? '');
  const [bio, setBio] = useState(truck.bio ?? '');
  const [logoUrl, setLogoUrl] = useState(truck.logo_url ?? '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState(truck.banner_url ?? '');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [instagram, setInstagram] = useState(truck.instagram ?? '');
  const [facebook, setFacebook] = useState(truck.facebook ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(truck.website_url ?? '');
  const [phone, setPhone] = useState(truck.phone ?? '');
  const [showPhone, setShowPhone] = useState(truck.show_phone);
  const [email, setEmail] = useState(truck.email ?? '');
  const [showEmail, setShowEmail] = useState(truck.show_email);
  const [orderUrl, setOrderUrl] = useState(truck.order_url ?? '');
  const [applyAll, setApplyAll] = useState<Record<ApplyAllField, boolean>>({
    cuisine: false, bio: false, logo_url: false, banner_url: false, instagram: false,
    facebook: false, website_url: false, phone: false, email: false, order_url: false,
  });
  const [photos, setPhotos] = useState<TruckPhoto[]>(initialPhotos);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputCls = 'w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand';
  const canApplyAll = isFleet && siblingTruckIds.length > 0;

  function toggleApplyAll(field: ApplyAllField) {
    setApplyAll((prev) => ({ ...prev, [field]: !prev[field] }));
  }

  function ApplyAllCheckbox({ field }: { field: ApplyAllField }) {
    if (!canApplyAll) return null;
    return (
      <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={applyAll[field]} onChange={() => toggleApplyAll(field)} />
        Apply to all my trucks
      </label>
    );
  }

  async function uploadBranding(file: File): Promise<string> {
    const supabase = createClient();
    const path = `${truck.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('truck-branding').upload(path, file);
    if (uploadError) throw uploadError;
    return supabase.storage.from('truck-branding').getPublicUrl(path).data.publicUrl;
  }

  async function submit() {
    setBusy(true); setError(null); setSaved(false);
    const supabase = createClient();
    const cleanSlug = slugify(slug);
    if (!cleanSlug) { setError('Public URL cannot be empty.'); setBusy(false); return; }

    try {
      let finalLogoUrl = logoUrl || null;
      if (logoFile) finalLogoUrl = await uploadBranding(logoFile);
      let finalBannerUrl = bannerUrl || null;
      if (bannerFile) finalBannerUrl = await uploadBranding(bannerFile);

      const cleanOrderUrl = withHttps(orderUrl);
      const cleanWebsiteUrl = withHttps(websiteUrl);

      const patch = {
        name,
        slug: cleanSlug,
        cuisine: cuisine || null,
        bio: bio || null,
        logo_url: finalLogoUrl,
        banner_url: finalBannerUrl,
        instagram: instagram || null,
        facebook: facebook || null,
        website_url: cleanWebsiteUrl,
        phone: phone || null,
        show_phone: showPhone,
        email: email || null,
        show_email: showEmail,
        order_url: cleanOrderUrl,
      };

      const { error: updateError } = await supabase.from('trucks').update(patch).eq('id', truck.id);
      if (updateError) throw updateError;

      if (canApplyAll) {
        const fieldToPatchKey: Record<ApplyAllField, keyof typeof patch> = {
          cuisine: 'cuisine', bio: 'bio', logo_url: 'logo_url', banner_url: 'banner_url',
          instagram: 'instagram', facebook: 'facebook', website_url: 'website_url',
          phone: 'phone', email: 'email', order_url: 'order_url',
        };
        const siblingPatch: Record<string, unknown> = {};
        for (const [field, checked] of Object.entries(applyAll) as [ApplyAllField, boolean][]) {
          if (checked) siblingPatch[fieldToPatchKey[field]] = patch[fieldToPatchKey[field]];
        }
        if (Object.keys(siblingPatch).length > 0) {
          const { error: siblingError } = await supabase
            .from('trucks').update(siblingPatch).in('id', siblingTruckIds);
          if (siblingError) throw siblingError;
        }
      }

      setSlug(cleanSlug);
      setLogoUrl(finalLogoUrl ?? ''); setLogoFile(null);
      setBannerUrl(finalBannerUrl ?? ''); setBannerFile(null);
      setOrderUrl(cleanOrderUrl ?? '');
      setWebsiteUrl(cleanWebsiteUrl ?? '');
      setSaved(true);
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong.';
      setError(message.includes('duplicate') ? 'That public URL is already taken.' : message);
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(file: File) {
    setPhotoBusy(true);
    const supabase = createClient();
    const path = `${truck.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from('truck-photos').upload(path, file);
    if (!uploadError) {
      const imageUrl = supabase.storage.from('truck-photos').getPublicUrl(path).data.publicUrl;
      const { data: inserted } = await supabase
        .from('truck_photos')
        .insert({ truck_id: truck.id, image_url: imageUrl, sort_order: photos.length })
        .select()
        .single();
      if (inserted) setPhotos((prev) => [...prev, inserted as TruckPhoto]);
    }
    setPhotoBusy(false);
  }

  async function removePhoto(id: string) {
    await createClient().from('truck_photos').delete().eq('id', id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
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
        <ApplyAllCheckbox field="cuisine" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Bio</label>
        <textarea className={inputCls} rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
        <ApplyAllCheckbox field="bio" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Logo image</label>
        <input className={inputCls} placeholder="https://…" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} />
        <div className="mt-1.5">
          <label className="mb-1 block text-xs text-muted">Or upload from your device</label>
          <input type="file" accept="image/*" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </div>
        <ApplyAllCheckbox field="logo_url" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Banner / cover image</label>
        <input className={inputCls} placeholder="https://…" value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} />
        <div className="mt-1.5">
          <label className="mb-1 block text-xs text-muted">Or upload from your device</label>
          <input type="file" accept="image/*" onChange={(e) => setBannerFile(e.target.files?.[0] ?? null)} className="text-sm" />
        </div>
        <p className="mt-1 text-xs text-muted">
          Used as the preview image when your page is shared on social media.
        </p>
        <ApplyAllCheckbox field="banner_url" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Instagram handle</label>
        <input className={inputCls} placeholder="@yourtruck" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
        <ApplyAllCheckbox field="instagram" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Facebook handle</label>
        <input className={inputCls} placeholder="@yourtruck" value={facebook} onChange={(e) => setFacebook(e.target.value)} />
        <ApplyAllCheckbox field="facebook" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Website (optional)</label>
        <input className={inputCls} placeholder="yourtruck.com" value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} />
        <ApplyAllCheckbox field="website_url" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Phone number (optional)</label>
        <input className={inputCls} placeholder="(555) 555-5555" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={showPhone} onChange={(e) => setShowPhone(e.target.checked)} />
          Show this to customers on my public page
        </label>
        <ApplyAllCheckbox field="phone" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-muted">Email address (optional)</label>
        <input className={inputCls} placeholder="hello@yourtruck.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <input type="checkbox" checked={showEmail} onChange={(e) => setShowEmail(e.target.checked)} />
          Show this to customers on my public page
        </label>
        <ApplyAllCheckbox field="email" />
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
        <ApplyAllCheckbox field="order_url" />
      </div>

      {error && <p className="text-sm text-brand">{error}</p>}
      {saved && !error && <p className="text-sm text-green-700">Saved.</p>}

      <button onClick={submit} disabled={busy || !name}
        className="w-full rounded-lg bg-brand px-4 py-2.5 font-display font-bold text-white disabled:opacity-60">
        {busy ? 'Saving…' : 'Save changes'}
      </button>

      <div className="border-t border-edge pt-4">
        <label className="mb-1 block text-xs font-semibold text-muted">Customer photos</label>
        <p className="mb-2 text-xs text-muted">
          Upload photos of customers enjoying your food — they&rsquo;ll show up as a carousel on your public page.
        </p>
        {photos.length > 0 && (
          <div className="mb-2 grid grid-cols-3 gap-2">
            {photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <div key={p.id} className="relative">
                <img src={p.image_url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                <button onClick={() => removePhoto(p.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs font-bold text-white">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input type="file" accept="image/*" disabled={photoBusy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }}
          className="text-sm" />
      </div>
    </div>
  );
}
