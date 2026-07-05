-- =============================================================================
-- XLeats — multiple locations per day, saved locations, private catering days
--
-- Drops the "one recurring entry per weekday" rule added earlier — vendors
-- need to set a morning spot and a different afternoon spot (or a spot plus
-- a catering block) on the same day. Ordering within a day now comes from
-- start_time rather than a uniqueness guarantee.
-- =============================================================================

drop index if exists schedules_one_recurring_per_day;

alter table schedules add column if not exists is_catering boolean not null default false;

-- Truck-scoped list of frequently-used spots, so a vendor can pick from a
-- dropdown instead of retyping the same address every week. Not shared
-- across a Fleet account's trucks — different trucks usually park in
-- different places.
create table if not exists saved_locations (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references trucks(id) on delete cascade,
  name       text not null,
  address    text,
  lat        double precision,
  lng        double precision,
  created_at timestamptz not null default now()
);
create index if not exists saved_locations_truck_idx on saved_locations(truck_id);
alter table saved_locations enable row level security;

create policy saved_locations_manage on saved_locations for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

notify pgrst, 'reload schema';
