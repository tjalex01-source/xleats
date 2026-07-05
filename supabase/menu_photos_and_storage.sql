-- =============================================================================
-- XLeats — menu_photos table + storage buckets/policies for menu images
-- =============================================================================

create table if not exists menu_photos (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references trucks(id) on delete cascade,
  image_url  text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists menu_photos_truck_idx on menu_photos(truck_id);
alter table menu_photos enable row level security;

create policy menu_photos_read on menu_photos for select using (true);
create policy menu_photos_write on menu_photos for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

insert into storage.buckets (id, name, public) values
  ('menu-photos', 'menu-photos', true)
on conflict (id) do nothing;

create policy menu_bucket_read on storage.objects for select
  using (bucket_id = 'menu');
create policy menu_bucket_write on storage.objects for all
  using (bucket_id = 'menu' and owns_or_manages_account(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'menu' and owns_or_manages_account(((storage.foldername(name))[1])::uuid));

create policy menu_photos_bucket_read on storage.objects for select
  using (bucket_id = 'menu-photos');
create policy menu_photos_bucket_write on storage.objects for all
  using (bucket_id = 'menu-photos' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'menu-photos' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid));
