-- =============================================================================
-- Customer app: truck discovery ("who's live near me" + follow)
-- =============================================================================
-- discover_trucks(lat, lng) powers the customer app's Discover + Following
-- screens. One row per non-suspended truck with:
--   * today's effective status (live/scheduled/catering/closed/off)
--   * the truck's best-known location TODAY (live pin if live, else today's
--     scheduled spot) — never a catering address (privacy rule)
--   * distance in miles from the customer (null if either side lacks coords)
--   * whether the calling customer already follows it (+ true follower count
--     via the SECURITY DEFINER broker, since follows RLS hides other rows)
--   * cheap "has a promo / special today" badges for the discovery shelf
--
-- SECURITY INVOKER (default): reads only public-readable rows (trucks,
-- live_sessions, schedules, specials, sent discount_codes) plus the caller's
-- OWN follows. follower counts come from truck_follower_count() so the
-- privacy boundary (a truck/customer never reads the follows rows) holds.
-- Coordinates can be null (customer declined location) — distance is then null
-- and the list still sorts by status, then followers.
-- =============================================================================
-- Is this truck publicly visible (i.e. its account isn't suspended)? Brokered
-- because `accounts` RLS is owner-only: a customer can read `trucks` but never
-- `accounts`, so joining the two directly from a client-facing query silently
-- returns ZERO rows -- which is exactly what the first cut of discover_trucks()
-- did. The vendor-side public page sidesteps this with the service-role client;
-- the customer app has no such client, so it needs this broker instead.
create or replace function truck_is_active(p_truck uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from trucks t
      join accounts a on a.id = t.account_id
     where t.id = p_truck
       and not coalesce(a.suspended, false)
  );
$$;

create or replace function discover_trucks(
  p_lat double precision default null,
  p_lng double precision default null
)
returns table (
  id              uuid,
  name            text,
  slug            text,
  cuisine         text,
  bio             text,
  logo_url        text,
  banner_url      text,
  status          text,
  started_at      timestamptz,
  expires_at      timestamptz,
  confirmed_address text,
  catering_note   text,
  loc_name        text,
  loc_address     text,
  loc_lat         double precision,
  loc_lng         double precision,
  distance_miles  double precision,
  is_following    boolean,
  follower_count  int,
  has_promo       boolean,
  has_special     boolean
)
language sql stable
set search_path = public, postgis, extensions as $$
  with dow as (select extract(dow from current_date)::int as d)
  select
    t.id, t.name, t.slug, t.cuisine, t.bio, t.logo_url, t.banner_url,
    -- effective status: live_sessions row if present, else infer 'scheduled'
    -- when the truck has a real spot on today's schedule, else 'off'.
    coalesce(ls.status::text, case when sc.lat is not null then 'scheduled' else 'off' end) as status,
    ls.started_at,
    ls.expires_at,
    ls.confirmed_address,
    ls.catering_note,
    sc.location_name as loc_name,
    sc.address       as loc_address,
    -- location shown to the customer: the live pin when live+confirmed,
    -- otherwise today's scheduled spot. Catering never exposes coords.
    coalesce(ls.confirmed_lat, sc.lat) as loc_lat,
    coalesce(ls.confirmed_lng, sc.lng) as loc_lng,
    case
      when p_lat is not null and p_lng is not null
       and coalesce(ls.confirmed_lat, sc.lat) is not null
      then st_distancesphere(
             st_makepoint(p_lng, p_lat),
             st_makepoint(coalesce(ls.confirmed_lng, sc.lng), coalesce(ls.confirmed_lat, sc.lat))
           ) / 1609.34
    end as distance_miles,
    exists (select 1 from follows f where f.truck_id = t.id and f.user_id = auth.uid()) as is_following,
    truck_follower_count(t.id) as follower_count,
    exists (
      select 1 from discount_codes dc
        join promo_blasts pb on pb.id = dc.blast_id
       where dc.truck_id = t.id and dc.active and pb.sent_at is not null
         and (dc.starts_at  is null or dc.starts_at  <= now())
         and (dc.expires_at is null or dc.expires_at >  now())
    ) as has_promo,
    exists (
      select 1 from specials s, dow
       where s.truck_id = t.id and s.active
         and (
           (s.recurring and dow.d = any(s.days_of_week))
           or (not s.recurring and s.special_date = current_date)
         )
    ) as has_special
  from trucks t
  left join live_sessions ls on ls.truck_id = t.id and ls.date = current_date
  -- today's first real (non-closed, non-catering, geocoded) scheduled spot
  left join lateral (
    select s.location_name, s.address, s.lat, s.lng
      from schedules s, dow
     where s.truck_id = t.id
       and (s.date = current_date or (s.recurring and s.day_of_week = dow.d))
       and coalesce(s.is_closed, false)   = false
       and coalesce(s.is_catering, false) = false
       and s.lat is not null and s.lng is not null
     order by s.start_time nulls last
     limit 1
  ) sc on true
  -- Brokered, NOT a join to `accounts` — see truck_is_active() above.
  where truck_is_active(t.id)
  order by
    case coalesce(ls.status::text, case when sc.lat is not null then 'scheduled' else 'off' end)
      when 'live' then 0 when 'scheduled' then 1 when 'catering' then 2
      when 'closed' then 3 else 4 end,
    distance_miles nulls last,
    truck_follower_count(t.id) desc,
    t.name;
$$;

notify pgrst, 'reload schema';
