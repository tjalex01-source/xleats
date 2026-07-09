-- =============================================================================
-- XLeats — customer favorite cuisines + terms acceptance
--
-- favorite_cuisines feeds future discovery/recommendations; agreed_terms_at
-- records that the customer accepted Terms + Privacy at signup. Both are the
-- customer's own data — added to the column-scoped update grant so a customer
-- can edit their own row (own-row RLS already enforced).
-- =============================================================================

alter table profiles add column if not exists favorite_cuisines text[] not null default '{}';
alter table profiles add column if not exists agreed_terms_at timestamptz;

grant update (favorite_cuisines, agreed_terms_at) on profiles to authenticated;

notify pgrst, 'reload schema';
