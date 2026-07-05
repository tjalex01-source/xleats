-- =============================================================================
-- XLeats — seed today's live_sessions status from the weekly schedule
--
-- Called once daily by /api/cron/seed-status, before any vendor has likely
-- interacted with their dashboard yet. Skips any truck that already has a
-- row for today (a vendor manual action, or a previous run) — this never
-- overwrites an explicit choice, only fills in the blank.
--
-- Priority: a one-off dated exception for today beats the recurring weekly
-- pattern for today's day-of-week (so a "closed for the holiday" override
-- works even on a normally-open day). A day can have multiple entries now
-- (morning spot, afternoon spot, a catering block) — among same-priority
-- matches, the earliest by start_time wins, since that's the first thing
-- happening today; the vendor's own later actions (tapping Go Live when
-- they actually arrive at the next spot) naturally take over from there.
-- =============================================================================

create or replace function seed_daily_status_from_schedule()
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := current_date;
  dow   int  := extract(dow from current_date)::int;
begin
  insert into live_sessions (truck_id, date, status, confirmed_address, confirmed_lat, confirmed_lng)
  select
    t.id,
    today,
    (case when s.is_closed then 'closed' when s.is_catering then 'catering' else 'scheduled' end)::live_status,
    case when s.is_closed or s.is_catering then null else coalesce(s.address, s.location_name) end,
    case when s.is_closed or s.is_catering then null else s.lat end,
    case when s.is_closed or s.is_catering then null else s.lng end
  from trucks t
  join accounts a on a.id = t.account_id
  join lateral (
    select * from schedules sc
    where sc.truck_id = t.id
      and (
        (sc.recurring = false and sc.date = today)
        or (sc.recurring = true and sc.day_of_week = dow)
      )
    order by sc.recurring asc, sc.start_time asc nulls last
    limit 1
  ) s on true
  where a.suspended = false
    and not exists (
      select 1 from live_sessions ls where ls.truck_id = t.id and ls.date = today
    )
  on conflict (truck_id, date) do nothing;
end;
$$;

notify pgrst, 'reload schema';
