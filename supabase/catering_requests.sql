-- =============================================================================
-- XLeats — catering_requests table
--
-- The /api/catering route has been inserting into this table since it was
-- first built, but the table itself was never created — every submission
-- has been silently failing (the route catches the error and returns a
-- generic 500, so nothing surfaced this until now). Columns match exactly
-- what src/app/api/catering/route.ts already sends.
-- =============================================================================

create table if not exists catering_requests (
  id             uuid primary key default gen_random_uuid(),
  truck_id       uuid not null references trucks(id) on delete cascade,
  requester_name text not null,
  email          text not null,
  phone          text,
  event_date     date not null,
  headcount      int,
  location       text,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists catering_requests_truck_idx on catering_requests(truck_id);
alter table catering_requests enable row level security;

-- Public marketing CTA — anyone can submit a request, no login required.
create policy catering_requests_insert on catering_requests for insert with check (true);
-- Only the truck's own manager can see submitted requests.
create policy catering_requests_read on catering_requests for select using (owns_or_manages_truck(truck_id));

notify pgrst, 'reload schema';
