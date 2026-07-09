-- =============================================================================
-- XLeats — vendor Stats page functions
--
-- All aggregate-only, SECURITY DEFINER with an owns_or_manages_truck() gate,
-- so the follows-privacy boundary is never crossed — a truck gets counts
-- (followers, new-followers-this-week, etc.) but never a customer row, same
-- pattern as truck_follower_count()/offer_stats(). Returning zero rows when
-- the caller doesn't manage the truck is intentional (no data leak).
-- =============================================================================

-- Headline totals for the stats dashboard.
create or replace function truck_stats(p_truck uuid)
returns table (
  followers             int,
  new_followers_30d     int,
  go_lives_30d          int,
  posts_30d             int,
  discount_redemptions  int,   -- all-time, summed across this truck's codes
  offers_delivered      int,   -- all-time
  offers_redeemed       int,   -- all-time
  special_taps_30d      int,
  active_discount_codes int,
  active_offers         int,
  open_contests         int
)
language sql security definer stable set search_path = public as $$
  select
    (select count(*)::int from follows where truck_id = p_truck),
    (select count(*)::int from follows where truck_id = p_truck and created_at >= now() - interval '30 days'),
    (select count(*)::int from live_sessions where truck_id = p_truck and started_at is not null and date >= current_date - 30),
    (select count(*)::int from posts where truck_id = p_truck and created_at >= now() - interval '30 days'),
    (select coalesce(sum(redemptions), 0)::int from discount_codes where truck_id = p_truck),
    (select count(*)::int from offer_redemptions r join offers o on o.id = r.offer_id where o.truck_id = p_truck),
    (select count(*)::int from offer_redemptions r join offers o on o.id = r.offer_id where o.truck_id = p_truck and r.redeemed_at is not null),
    (select coalesce(sum(t.count), 0)::int from special_taps t join specials s on s.id = t.special_id where s.truck_id = p_truck and t.tap_date >= current_date - 30),
    (select count(*)::int from discount_codes where truck_id = p_truck and active),
    (select count(*)::int from offers where truck_id = p_truck and active),
    (select count(*)::int from contests where truck_id = p_truck and status = 'open')
  where owns_or_manages_truck(p_truck);
$$;

-- Weekly time series for the mini bar charts (followers gained / go-lives /
-- posts per week), most recent p_weeks weeks, oldest first.
create or replace function truck_activity_by_week(p_truck uuid, p_weeks int default 8)
returns table (week_start date, new_followers int, go_lives int, posts int)
language sql security definer stable set search_path = public as $$
  with weeks as (
    select (date_trunc('week', current_date)::date - (i * 7)) as week_start
      from generate_series(0, greatest(p_weeks, 1) - 1) as i
  )
  select
    w.week_start,
    (select count(*)::int from follows f
       where f.truck_id = p_truck and date_trunc('week', f.created_at)::date = w.week_start),
    (select count(*)::int from live_sessions l
       where l.truck_id = p_truck and l.started_at is not null and date_trunc('week', l.date)::date = w.week_start),
    (select count(*)::int from posts p
       where p.truck_id = p_truck and date_trunc('week', p.created_at)::date = w.week_start)
  from weeks w
  where owns_or_manages_truck(p_truck)
  order by w.week_start;
$$;

notify pgrst, 'reload schema';
