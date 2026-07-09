-- =============================================================================
-- XLeats — structured address fields + real geocoding for schedules
--
-- Previously `address` was a single free-typed string on both `schedules`
-- and `saved_locations`, and lat/lng was ONLY ever set when a vendor picked
-- an existing saved location — but saved_locations.lat/lng was never
-- actually populated by anything either. So "Get directions" has always
-- fallen back to a Google Maps text search of whatever the vendor typed,
-- never a real pin. Adding street/city/state/zip as real columns (not just
-- composed into the string and discarded) so editing an existing entry
-- stays accurate, and geocoding (via the new /api/geocode route +
-- GOOGLE_GEOCODING_API_KEY) can populate real lat/lng going forward.
-- `address` is kept as the always-present composed display string used
-- everywhere already (public page, schedule list) — no existing rendering
-- code needs to change.
-- =============================================================================

alter table schedules add column if not exists street text;
alter table schedules add column if not exists city   text;
alter table schedules add column if not exists state  text;
alter table schedules add column if not exists zip    text;

alter table saved_locations add column if not exists street text;
alter table saved_locations add column if not exists city   text;
alter table saved_locations add column if not exists state  text;
alter table saved_locations add column if not exists zip    text;

notify pgrst, 'reload schema';
