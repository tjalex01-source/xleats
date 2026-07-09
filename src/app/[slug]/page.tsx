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
  const [{ data: accountRow }, { data: session }, { data: allMenuItems }, { data: schedules }, { data: posts }, { data: menuPhotos }, { data: truckPhotos }, { data: closedContests }, { data: allDiscountCodes }, { data: allSpecials }] =
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
      supabase
        .from('truck_photos')
        .select('*')
        .eq('truck_id', truck.id)
        .order('sort_order'),
      supabase
        .from('contests')
        .select('id, type, title, winner_note, winner_entry_ids')
        .eq('truck_id', truck.id)
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('discount_codes')
        .select('*, promo_blasts(sent_at)')
        .eq('truck_id', truck.id)
        .eq('active', true),
      supabase
        .from('specials')
        .select('*')
        .eq('truck_id', truck.id)
        .eq('active', true),
    ]);

  if (accountRow?.suspended) notFound();
  const isFreePlan = (accountRow?.plan ?? 'free') === 'free';

  // Specials & Promos — only actually-blasted codes, within their active window.
  const nowMs = Date.now();
  const activePromoCodes = (allDiscountCodes ?? []).filter((d) => {
    if (!d.promo_blasts?.sent_at) return false;
    if (d.starts_at && new Date(d.starts_at).getTime() > nowMs) return false;
    if (d.expires_at && new Date(d.expires_at).getTime() < nowMs) return false;
    return true;
  });

  // Today's menu Specials — a special is a schedule/flag on an existing menu
  // item (one-time date, or recurring day-of-week), not a separate item.
  const todayIso = today;
  const todayDow = new Date().getDay();
  const menuItemById = new Map((allMenuItems ?? []).map((i) => [i.id, i]));
  const todaysMenuSpecials = (allSpecials ?? [])
    .filter((s) => (s.recurring ? (s.days_of_week ?? []).includes(todayDow) : s.special_date === todayIso))
    .map((s) => ({ special: s, item: menuItemById.get(s.menu_item_id) }))
    .filter((x) => !!x.item);

  // Contest winner announcements — first name ONLY, via a SECURITY DEFINER
  // function. manual/milestone contests already store a freeform winner_note
  // the vendor typed themselves (no profile lookup needed for those).
  const winnerAnnouncements: { id: string; title: string; text: string }[] = [];
  for (const c of closedContests ?? []) {
    if ((c.type === 'manual' || c.type === 'milestone') && c.winner_note) {
      winnerAnnouncements.push({ id: c.id, title: c.title, text: `${c.winner_note} won: ${c.title}!` });
    } else if ((c.winner_entry_ids ?? []).length > 0) {
      const { data: names } = await supabase.rpc('contest_winner_first_names', { p_contest: c.id });
      const firstNames = (names ?? []).map((n: { first_name: string }) => n.first_name).filter(Boolean);
      if (firstNames.length > 0) {
        winnerAnnouncements.push({ id: c.id, title: c.title, text: `${firstNames.join(' & ')} won: ${c.title}!` });
      }
    }
  }

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
        <div className="ml-auto flex flex-col items-end gap-0.5 text-sm">
          {truck.instagram && (
            <a
              href={`https://instagram.com/${truck.instagram.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline"
            >
              @{truck.instagram.replace('@', '')}
            </a>
          )}
          {truck.facebook && (
            <a
              href={`https://facebook.com/${truck.facebook.replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline"
            >
              {truck.facebook.replace('@', '')}
            </a>
          )}
          {truck.website_url && (
            <a href={truck.website_url} target="_blank" rel="noopener noreferrer" className="text-brand underline">
              Website
            </a>
          )}
        </div>
      </div>

      {truck.bio && <p className="mb-4 text-muted">{truck.bio}</p>}

      {(truck.show_phone && truck.phone) || (truck.show_email && truck.email) ? (
        <p className="mb-6 text-sm text-muted">
          {truck.show_phone && truck.phone && <a href={`tel:${truck.phone}`} className="underline">{truck.phone}</a>}
          {truck.show_phone && truck.phone && truck.show_email && truck.email && <span> · </span>}
          {truck.show_email && truck.email && <a href={`mailto:${truck.email}`} className="underline">{truck.email}</a>}
        </p>
      ) : null}

      {/* Customer photos */}
      {(truckPhotos ?? []).length > 0 && (
        <section className="mb-6 -mx-4 overflow-x-auto px-4">
          <div className="flex gap-2">
            {truckPhotos!.map((p) => (
              <Image key={p.id} src={p.image_url} alt="" width={200} height={200}
                className="h-32 w-32 shrink-0 rounded-ticket border border-edge object-cover" />
            ))}
          </div>
        </section>
      )}

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

      {/* Today's Specials */}
      {todaysMenuSpecials.length > 0 && (
        <section className="mb-6">
          <h2 className="eyebrow mb-3">Today&rsquo;s Specials</h2>
          <div className="space-y-2">
            {todaysMenuSpecials.map(({ special, item }) => {
              const regular = item!.price != null ? Number(item!.price) : null;
              const savings = special.advertise_discount && regular != null && regular > 0
                ? Math.round((1 - Number(special.special_price) / regular) * 100)
                : null;
              return (
                <div key={special.id} className="flex items-center gap-3 rounded-ticket border border-amber-200 bg-amber-50 p-3">
                  {item!.photo_url ? (
                    <Image src={item!.photo_url} alt={item!.name} width={64} height={64}
                      className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-amber-300 bg-white text-2xl">🍽️</div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="font-display font-bold text-amber-800">{item!.name}</span>
                      <span className="font-display font-bold text-amber-800">
                        ${Number(special.special_price).toFixed(2)}
                        {savings != null && savings > 0 && <span className="ml-1 text-xs font-semibold">({savings}% off)</span>}
                      </span>
                    </div>
                    {item!.description && <p className="text-sm text-amber-700">{item!.description}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Specials & Promos */}
      {activePromoCodes.length > 0 && (
        <section className="mb-6">
          <h2 className="eyebrow mb-3">Specials & Promos</h2>
          <div className="space-y-2">
            {activePromoCodes.map((d) => (
              <div key={d.id} className="rounded-ticket border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-bold text-amber-800">
                    {d.type === 'percent' && `${d.value}% off`}
                    {d.type === 'amount' && `$${d.value} off`}
                    {d.type === 'free_item' && (d.description || 'Free item')}
                  </span>
                  {d.expires_at && (
                    <span className="text-xs text-amber-700">Ends {new Date(d.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  )}
                </div>
                {d.type !== 'free_item' && d.description && <p className="text-sm text-amber-700">{d.description}</p>}
                <p className="mt-1 text-xs text-amber-700">Mention code <span className="font-mono font-bold">{d.code}</span> at the window.</p>
              </div>
            ))}
          </div>
        </section>
      )}

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

      {/* Contest winners — first name only, never anything else about the customer */}
      {winnerAnnouncements.length > 0 && (
        <section className="mb-6 space-y-2">
          {winnerAnnouncements.map((w) => (
            <div key={w.id} className="rounded-ticket border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
              🎉 {w.text}
            </div>
          ))}
        </section>
      )}

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
                    {item.photo_url ? (
                      <Image src={item.photo_url} alt="" width={560} height={280}
                        className="mb-2 w-full rounded-lg object-cover" style={{ maxHeight: 160 }} />
                    ) : (
                      <div className="mb-2 flex w-full items-center justify-center rounded-lg border border-dashed border-edge bg-cream text-3xl" style={{ height: 100 }}>
                        🍽️
                      </div>
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
