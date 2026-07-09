-- =============================================================================
-- XLeats — customer profile onboarding + column lockdown
--
-- The customer app captures birthday (month/day), zip, home coords, and the
-- two offer consents into the customer's own profiles row. profiles is the
-- most PII-sensitive table, so on top of the existing own-row RLS we add
-- column-scoped UPDATE grants: a customer can only edit their own safe
-- fields, never escalate `role` or tamper with other columns. handle_new_user
-- (SECURITY DEFINER) still sets role at signup; the vendor app still updates
-- display_name (in the allowed set).
-- =============================================================================

alter table profiles add column if not exists onboarded_at timestamptz;

revoke update on profiles from authenticated;
grant update (
  display_name, avatar_url,
  birth_month, birth_day, zip,
  home_lat, home_lng,
  allow_offers_from_followed, allow_offers_from_nearby,
  onboarded_at
) on profiles to authenticated;

notify pgrst, 'reload schema';
