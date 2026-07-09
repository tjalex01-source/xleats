-- =============================================================================
-- XLeats — Menu "Specials"
--
-- A special is a cross-cutting flag/schedule on an EXISTING menu item, not a
-- category and not a new item — so a Tuesday taco special stays correctly
-- categorized under "Entrees" while also being flagged as featured today.
-- Two scheduling modes: a one-time date, or recurring on specific days of
-- the week (same pattern as day-of-week recurrence already used elsewhere).
-- special_taps is a purely manual, honor-system tap counter (mirrors the
-- milestone contest pattern) so a vendor can track "today's special sold"
-- outside their payment software — feeds a future Stats page.
-- =============================================================================

create table specials (
  id                  uuid primary key default gen_random_uuid(),
  truck_id            uuid not null references trucks(id) on delete cascade,
  menu_item_id        uuid not null references menu_items(id) on delete cascade,
  special_price       numeric(8,2) not null,
  advertise_discount  boolean not null default true,   -- show "% off" / "$ off" vs the regular price
  recurring           boolean not null default false,
  days_of_week        int[] not null default '{}',      -- 0=Sun..6=Sat, used when recurring
  special_date        date,                              -- used when not recurring
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);
create index specials_truck_idx on specials(truck_id);
alter table specials enable row level security;
create policy specials_read  on specials for select using (active);
create policy specials_write on specials for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

create table special_taps (
  id          uuid primary key default gen_random_uuid(),
  special_id  uuid not null references specials(id) on delete cascade,
  tap_date    date not null default current_date,
  count       int not null default 0,
  unique (special_id, tap_date)
);
alter table special_taps enable row level security;
create policy special_taps_manage on special_taps for all
  using (exists (select 1 from specials s where s.id = special_id and owns_or_manages_truck(s.truck_id)))
  with check (exists (select 1 from specials s where s.id = special_id and owns_or_manages_truck(s.truck_id)));

create or replace function bump_special_tap_count(p_special uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare v_truck uuid; v_count int;
begin
  select truck_id into v_truck from specials where id = p_special;
  if v_truck is null or not owns_or_manages_truck(v_truck) then
    raise exception 'not found';
  end if;
  insert into special_taps (special_id, tap_date, count) values (p_special, current_date, 1)
  on conflict (special_id, tap_date) do update set count = special_taps.count + 1
  returning special_taps.count into v_count;
  return v_count;
end;
$$;

notify pgrst, 'reload schema';
