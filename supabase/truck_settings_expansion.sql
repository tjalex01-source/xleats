-- =============================================================================
-- XLeats — truck settings expansion
--
-- Adds facebook/website/phone/email + phone/email visibility toggles to
-- trucks, a truck_photos table + storage bucket for the customer-photo
-- carousel, and a storage bucket for real logo/banner uploads (the fields
-- stay as URL text columns — this just gives vendors an upload option too,
-- per T.J.'s "both" preference so vendors with an existing hosted image
-- don't lose that option).
-- =============================================================================

alter table trucks
  add column if not exists facebook    text,
  add column if not exists website_url text,
  add column if not exists phone       text,
  add column if not exists email       text,
  add column if not exists show_phone  boolean not null default false,
  add column if not exists show_email  boolean not null default false;

create table if not exists truck_photos (
  id         uuid primary key default gen_random_uuid(),
  truck_id   uuid not null references trucks(id) on delete cascade,
  image_url  text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists truck_photos_truck_idx on truck_photos(truck_id);
alter table truck_photos enable row level security;

create policy truck_photos_read on truck_photos for select using (true);
create policy truck_photos_write on truck_photos for all
  using (owns_or_manages_truck(truck_id)) with check (owns_or_manages_truck(truck_id));

insert into storage.buckets (id, name, public) values
  ('truck-photos', 'truck-photos', true),
  ('truck-branding', 'truck-branding', true)
on conflict (id) do nothing;

create policy truck_photos_bucket_read on storage.objects for select
  using (bucket_id = 'truck-photos');
create policy truck_photos_bucket_write on storage.objects for all
  using (bucket_id = 'truck-photos' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'truck-photos' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid));

create policy truck_branding_bucket_read on storage.objects for select
  using (bucket_id = 'truck-branding');
create policy truck_branding_bucket_write on storage.objects for all
  using (bucket_id = 'truck-branding' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'truck-branding' and owns_or_manages_truck(((storage.foldername(name))[1])::uuid));

notify pgrst, 'reload schema';
