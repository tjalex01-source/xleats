import { notFound } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import CateringForm from './catering-form';

function StatusBadge({ status, address, cateringNote, updatedAt }: {
  status: string;
  address: string | null;
  cateringNote: string | null;
  updatedAt: string;
}) {
  const freshness = (() => {
    const mins = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    return `${Math.floor(mins / 60)}h ago`;
  })();

  if (status === 'live') return (
    <div className="rounded-ticket border border-green-200 bg-green-50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-green-500 shadow-[0_0_0_3px_rgba(34,197,94,0.25)]" />
        <span className="font-display font-bold text-green-700">Open now</span>
        <span className="ml-auto text-xs text-green-600">confirmed {freshness}</span>
      </div>
      {address && <p className="mt-1 text-sm text-green-700">{address}</p>}
    </div>
  );

  if (status === 'scheduled') return (
    <div className="rounded-ticket border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-amber-400" />
        <span className="font-display font-bold text-amber-700">Out today — not open yet</span>
      </div>
      {address && <p className="mt-1 text-sm text-amber-700">Heading to {address}</p>}
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

  return (
    <div className="rounded-ticket border border-edge bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-gray-300" />
        <span className="font-display font-bold text-muted">Not out today</span>
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
  const supabase = await createClient();

  const { data: truck } = await supabase
    .from('trucks')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (!truck) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const todayDow = new Date().getDay();

  const [{ data: session }, { data: menuItems }, { data: schedules }, { data: posts }] =
    await Promise.all([
      supabase
        .from('live_sessions')
        .select('*')
        .eq('truck_id', truck.id)
        .eq('date', today)
        .maybeSingle(),
      supabase
        .from('menu_items')
        .select('*')
        .eq('truck_id', truck.id)
        .eq('is_available', true)
        .order('category')
        .order('sort_order'),
      supabase
        .from('schedules')
        .select('*')
        .eq('truck_id', truck.id)
        .or(`date.gte.${today},and(recurring.eq.true,day_of_week.eq.${todayDow})`)
        .order('date', { ascending: true })
        .limit(7),
      supabase
        .from('posts')
        .select('*')
        .eq('truck_id', truck.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

  type MenuRow = NonNullable<typeof menuItems>[number];
  const menuByCategory = (menuItems ?? []).reduce<Record<string, MenuRow[]>>((acc, item) => {
    const cat = item.category ?? 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const showCateringForm = session?.status === 'catering' || !session;

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
          cateringNote={session?.catering_note ?? null}
          updatedAt={session?.started_at ?? new Date().toISOString()}
        />
      </div>

      {/* Schedule */}
      {schedules && schedules.length > 0 && (
        <section className="mb-6">
          <h2 className="eyebrow mb-3">Upcoming spots</h2>
          <div className="space-y-2">
            {schedules.map((s) => (
              <div key={s.id} className="rounded-ticket border border-edge bg-white p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-display font-bold">
                    {s.location_name ?? s.address ?? 'TBD'}
                  </span>
                  <span className="text-sm text-muted">
                    {s.date
                      ? new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric',
                        })
                      : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][s.day_of_week ?? 0] + 's'}
                  </span>
                </div>
                {(s.start_time || s.end_time) && (
                  <p className="text-sm text-muted">
                    {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Posts */}
      {posts && posts.length > 0 && (
        <section className="mb-6">
          <h2 className="eyebrow mb-3">Latest</h2>
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
        </section>
      )}

      {/* Menu */}
      {Object.keys(menuByCategory).length > 0 && (
        <section className="mb-6">
          <h2 className="eyebrow mb-3">Menu</h2>
          {Object.entries(menuByCategory).map(([cat, items]) => (
            <div key={cat} className="mb-4">
              <h3 className="mb-2 font-display font-bold">{cat}</h3>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between rounded-ticket border border-edge bg-white p-3">
                    <div>
                      <p className="font-bold">{item.name}</p>
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
                ))}
              </div>
            </div>
          ))}
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
    </div>
  );
}
