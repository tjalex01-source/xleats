import { notFound } from 'next/navigation';
import Image from 'next/image';
import type { Metadata } from 'next';
import { createPublicClient, createAdminClient } from '@/lib/supabase/server';
import { formatTime12 } from '@/lib/format';
import CateringForm from './catering-form';

export const revalidate = 60;

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://xleats.com';

function statusLabel(status: string | undefined) {
  switch (status) {
    case 'live': return '🟢 Open now';
    case 'scheduled': return '🟡 Scheduled today';
    case 'catering': return '🟣 Catering today';
    case 'closed': return '🔴 Closed today';
    default: return null;
  }
}

function directionsUrl(address: string | null, lat: number | null, lng: number | null) {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicClient();

  const { data: truck } = await supabase
    .from('trucks')
    .select('id, name, cuisine, bio, logo_url, banner_url')
    .eq('slug', slug)
    .maybeSingle();

  if (!truck) return { title: 'Truck not found — XLeats' };

  const today = new Date().toISOString().slice(0, 10);
  const { data: session } = await supabase
    .from('live_sessions')
    .select('status')
    .eq('truck_id', truck.id)
    .eq('date', today)
    .maybeSingle();

  const label = statusLabel(session?.status);
  const title = label ? `${truck.name} — ${label} | XLeats` : `${truck.name} | XLeats`;
  const description =
    truck.bio ?? `See ${truck.name}'s live status, menu, and schedule on XLeats.`;
  const image = truck.banner_url ?? truck.logo_url ?? `${SITE_URL}/truck-logo.png`;
  const url = `${SITE_URL}/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: truck.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

function StatusBadge({ status, address, lat, lng, cateringNote, updatedAt }: {
  status: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cateringNote: string | null;
  updatedAt: string;
}) {
  const freshness = (() => {
    const mins = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ago`;
  })();
  const directions = directionsUrl(address, lat, lng);

  if (status === 'live') return (
    <div className="rounded-ticket border border-green-200 bg-green-50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.25)]" />
        <span className="font-display font-bold text-green-700">Open now</span>
        <span className="ml-auto text-xs text-green-600">confirmed {freshness}</span>
      </div>
      {address && (
        <p className="mt-1 text-sm text-green-700">
          {address}
          {directions && (
            <a href={directions} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
              Get directions
            </a>
          )}
        </p>
      )}
    </div>
  );

  if (status === 'scheduled') return (
    <div className="rounded-ticket border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="font-display font-bold text-amber-700">Scheduled today — not open yet</span>
      </div>
      {address && (
        <p className="mt-1 text-sm text-amber-700">
          Heading to {address}
          {directions && (
            <a href={directions} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
              Get directions
            </a>
          )}
        </p>
      )}
    </div>
  );

  if (status === 'catering') return (
    <div className="rounded-ticket border border-purple-200 bg-purple-50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-purple-500" />
        <span className="font-display font-bold text-purple-700">Catering a private event today</span>
      </div>
      {cateringNote && <p className="mt-1 text-sm text-purple-700">{cateringNote}</p>}
    </div>
  );

  if (status === 'closed') return (
    <div className="rounded-ticket border border-red-200 bg-red-50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-red-600" />
        <span className="font-display font-bold text-red-700">Closed today</span>
      </div>
    </div>
  );

  return (
    <div className="rounded-ticket border border-edge bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-gray-300" />
        <span className="font-display font-bold text-muted">Currently Offline</span>
      </div>
    </div>
  );
}

export default async function PublicTruckPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createPublicClient();

  const { data: truck } = await supabase
    .from('trucks')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!truck) notFound();

  const today = new Date().toISOString().slice(0, 10);

  // accounts has no public-read RLS policy, so the suspension check needs the
  // service-role client — this never reaches the browser, it only decides
  // whether the rest of the page renders.
  const [{ data: accountRow }, { data: session }, { data: allMenuItems }, { data: schedules }, { data: posts }, { data: menuPhotos }] =
    await Promise.all([
      createAdminClient()
        .from('accounts')
        .select('suspended, plan')
        .eq('id', truck.account_id)
        .maybeSingle(),
      supabase
        .from('live_sessions')
        .select('*')
        .eq('truck_id', truck.id)
        .eq('date', today)
        .maybeSingle(),
      supabase
        .from('menu_items')
        .select('*')
        .eq('account_id', truck.account_id)
        .eq('is_available', true)
        .order('category')
        .order('sort_order'),
      supabase
        .from('schedules')
        .select('*')
        .eq('truck_id', truck.id),
      supabase
        .from('posts')
        .select('*')
        .eq('truck_id', truck.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('menu_photos')
        .select('*')
        .eq('truck_id', truck.id)
        .order('sort_order'),
    ]);

  if (accountRow?.suspended) notFound();
  const isFreePlan = (accountRow?.plan ?? 'free') === 'free';

  // menu_items are account-scoped and may apply to all trucks or a specific
  // subset — resolve which ones actually show on THIS truck.
  const scopedItemIds = (allMenuItems ?? []).filter((i) => !i.applies_to_all_trucks).map((i) => i.id);
  let assignedTruckIds = new Set<string>();
  if (scopedItemIds.length > 0) {
    const { data: assignments } = await supabase
      .from('menu_item_trucks')
      .select('menu_item_id')
      .eq('truck_id', truck.id)
      .in('menu_item_id', scopedItemIds);
    assignedTruckIds = new Set((assignments ?? []).map((a) => a.menu_item_id));
  }
  const visibleMenuItems = (allMenuItems ?? []).filter(
    (i) => i.applies_to_all_trucks || assignedTruckIds.has(i.id)
  );
  const menuItems = visibleMenuItems.filter((i) => !i.is_catering);
  const cateringMenuItems = isFreePlan ? [] : visibleMenuItems.filter((i) => i.is_catering);

  type MenuRow = (typeof menuItems)[number];
  const menuByCategory = menuItems.reduce<Record<string, MenuRow[]>>((acc, item) => {
    const cat = item.category ?? 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const showCateringForm = !isFreePlan && (session?.status === 'catering' || !session);

  type ScheduleRow = NonNullable<typeof schedules>[number];
  const byStartTime = (a: ScheduleRow, b: ScheduleRow) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99');
  const recurringByDay = new Map<number, ScheduleRow[]>();
  const oneOffByDate = new Map<string, ScheduleRow[]>();
  for (const s of schedules ?? []) {
    if (s.recurring && s.day_of_week != null) {
      recurringByDay.set(s.day_of_week, [...(recurringByDay.get(s.day_of_week) ?? []), s]);
    } else if (!s.recurring && s.date) {
      oneOffByDate.set(s.date, [...(oneOffByDate.get(s.date) ?? []), s]);
    }
  }
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const entries = (oneOffByDate.get(iso) ?? recurringByDay.get(d.getDay()) ?? []).slice().sort(byStartTime);
    return { iso, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), entries };
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        {truck.logo_url ? (
          <Image
            src={truck.logo_url}
            alt={truck.name}
            width={72}
            height={72}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-2xl font-extrabold text-white font-display">
            {truck.name[0]}
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl font-extrabold">{truck.name}</h1>
          {truck.cuisine && <p className="eyebrow mt-0.5">{truck.cuisine}</p>}
        </div>
        {truck.instagram && (
          <a
            href={`https://instagram.com/${truck.instagram.replace('@', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-sm text-brand underline"
          >
            @{truck.instagram.replace('@', '')}
          </a>
        )}
      </div>

      {truck.bio && <p className="mb-6 text-muted">{truck.bio}</p>}

      {/* Live status */}
      <div className="mb-6">
        <StatusBadge
          status={session?.status ?? 'off'}
          address={session?.confirmed_address ?? null}
          lat={session?.confirmed_lat ?? null}
          lng={session?.confirmed_lng ?? null}
          cateringNote={session?.catering_note ?? null}
          updatedAt={session?.started_at ?? new Date().toISOString()}
        />
      </div>

      {/* Schedule */}
      <section className="mb-6">
        <h2 className="eyebrow mb-3">This week</h2>
        <div className="space-y-2">
          {weekDays.map(({ iso, label, entries }) => (
            <div key={iso} className="rounded-ticket border border-edge bg-white p-3">
              <div className="font-display font-bold">{label}</div>
              {entries.length === 0 ? (
                <span className="text-sm text-muted">Not posted yet</span>
              ) : (
                <div className="mt-1 space-y-1.5">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-baseline justify-between">
                      {entry.is_closed || entry.is_catering ? (
                        <span className="text-sm font-semibold text-red-600">Closed</span>
                      ) : (
                        <>
                          <span className="text-sm text-muted">{entry.location_name ?? entry.address}</span>
                          {(entry.start_time || entry.end_time) && (
                            <span className="text-sm text-muted">
                              {formatTime12(entry.start_time)} – {formatTime12(entry.end_time)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Posts */}
      <section className="mb-6">
        <h2 className="eyebrow mb-3">Latest</h2>
        {!posts || posts.length === 0 ? (
          <p className="rounded-ticket border border-edge bg-white p-3 text-sm text-muted">
            No updates yet
            {truck.instagram ? (
              <>
                {' — follow '}
                <a
                  href={`https://instagram.com/${truck.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline"
                >
                  @{truck.instagram.replace('@', '')}
                </a>
                {' for the latest.'}
              </>
            ) : (
              ' — check back soon.'
            )}
          </p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="rounded-ticket border border-edge bg-white p-4">
                {post.image_url && (
                  <Image
                    src={post.image_url}
                    alt=""
                    width={560}
                    height={280}
                    className="mb-3 w-full rounded-lg object-cover"
                  />
                )}
                <p className="text-sm">{post.body}</p>
                <p className="mt-1 text-xs text-muted">
                  {new Date(post.created_at).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric',
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Menu */}
      <section className="mb-6">
        <h2 className="eyebrow mb-3">Menu</h2>
        {Object.keys(menuByCategory).length === 0 && (menuPhotos ?? []).length === 0 ? (
          <p className="rounded-ticket border border-edge bg-white p-3 text-sm text-muted">
            Menu coming soon.
          </p>
        ) : (
          Object.entries(menuByCategory).map(([cat, items]) => (
            <div key={cat} className="mb-4">
              <h3 className="mb-2 font-display font-bold">{cat}</h3>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="rounded-ticket border border-edge bg-white p-3">
                    {item.photo_url && (
                      <Image src={item.photo_url} alt="" width={560} height={280}
                        className="mb-2 w-full rounded-lg object-cover" style={{ maxHeight: 160 }} />
                    )}
                    <div className="flex justify-between">
                      <div>
                        <p className="font-bold">
                          {item.name}
                          {item.is_new && (
                            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
                              NEW ITEM
                            </span>
                          )}
                        </p>
                        {item.description && (
                          <p className="text-sm text-muted">{item.description}</p>
                        )}
                      </div>
                      {item.price != null && (
                        <span className="ml-4 shrink-0 font-display font-bold text-brand">
                          ${Number(item.price).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        {(menuPhotos ?? []).length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {menuPhotos!.map((p) => (
              <Image key={p.id} src={p.image_url} alt="Menu" width={400} height={500}
                className="rounded-ticket border border-edge object-cover" />
            ))}
          </div>
        )}
      </section>

      {/* Order Online — only shown once the vendor has actually set a link */}
      {truck.order_url && (
        <div className="mb-6 text-center">
          <a
            href={`/order?truck=${truck.slug}`}
            className="inline-block w-full rounded-lg bg-brand px-6 py-3 font-display font-bold text-white"
          >
            Order Online
          </a>
        </div>
      )}

      {/* Catering menu (Pro/Fleet only) */}
      {cateringMenuItems.length > 0 && (
        <section className="mb-6">
          <h2 className="eyebrow mb-3">Catering menu</h2>
          <div className="space-y-2">
            {cateringMenuItems.map((item) => (
              <div key={item.id} className="flex justify-between rounded-ticket border border-purple-200 bg-purple-50 p-3">
                <div>
                  <p className="font-bold">{item.name}</p>
                  {item.description && <p className="text-sm text-purple-700">{item.description}</p>}
                </div>
                {item.price != null && (
                  <span className="ml-4 shrink-0 font-display font-bold text-brand">
                    ${Number(item.price).toFixed(2)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Catering CTA */}
      {showCateringForm && (
        <section className="rounded-ticket border border-purple-200 bg-purple-50 p-5">
          <h2 className="font-display text-lg font-bold text-purple-800">
            Book {truck.name} for your event
          </h2>
          <p className="mb-4 text-sm text-purple-700">
            Available for private events, corporate catering, and parties.
          </p>
          <CateringForm truckId={truck.id} truckName={truck.name} />
        </section>
      )}

      {/* Footer */}
      <footer className="mt-10 border-t border-edge pt-4 text-center text-xs text-muted">
        <a href={SITE_URL} className="underline">
          Powered by XLeats
        </a>
      </footer>
    </div>
  );
}
