-- =============================================================================
-- XLeats — birthday offer matching job
-- Run this AFTER schema.sql. Call generate_birthday_offers() once per morning
-- from a Vercel cron or Supabase pg_cron (see README). It runs as the platform,
-- writes a per-customer redemption code, and NEVER exposes customer rows to
-- trucks — they only ever see counts via birthday_offer_stats().
-- =============================================================================

create or replace function generate_birthday_offers(p_date date default current_date)
returns int                       -- number of offers delivered
language plpgsql security definer set search_path = public, postgis as $$
declare
  v_month int := extract(month from p_date)::int;
  v_day   int := extract(day   from p_date)::int;
  v_count int := 0;
  o       record;
  p       record;
  v_radius int;
  v_truck_lat double precision;
  v_truck_lng double precision;
begin
  for o in
    select bo.*, t.service_radius_miles, t.account_id
      from birthday_offers bo
      join trucks t on t.id = bo.truck_id
     where bo.active
  loop
    v_radius := coalesce(o.radius_miles, o.service_radius_miles, 10);

    -- Truck anchor location = today's scheduled stop, if any (for radius match).
    select s.lat, s.lng into v_truck_lat, v_truck_lng
      from schedules s
     where s.truck_id = o.truck_id
       and (s.date = p_date
            or (s.recurring and s.day_of_week = extract(dow from p_date)::int))
       and s.lat is not null
     order by s.date nulls last
     limit 1;

    for p in
      select pr.id
        from profiles pr
       where pr.role = 'customer'
         and pr.birth_month = v_month
         and pr.birth_day   = v_day
         and (
              -- loyal: already follows this truck
              exists (select 1 from follows f where f.user_id = pr.id and f.truck_id = o.truck_id)
              -- OR new: within radius of the truck's stop today
              or (
                v_truck_lat is not null and pr.home_lat is not null
                and st_distancesphere(
                      st_makepoint(pr.home_lng, pr.home_lat),
                      st_makepoint(v_truck_lng, v_truck_lat)
                    ) <= v_radius * 1609.34   -- miles → meters
              )
         )
    loop
      insert into birthday_redemptions (birthday_offer_id, user_id, code, delivered_on)
      values (
        o.id, p.id,
        'BD-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6)),
        p_date
      )
      on conflict (birthday_offer_id, user_id, delivered_on) do nothing;

      if found then
        v_count := v_count + 1;
        -- queue an in-app notification (push fan-out reads this table)
        insert into notifications (user_id, truck_id, kind, title, body)
        values (p.id, o.truck_id, 'birthday',
                'Happy birthday! 🎉',
                o.title || ' — show your code at the window.');
      end if;
    end loop;
  end loop;

  return v_count;
end;
$$;
