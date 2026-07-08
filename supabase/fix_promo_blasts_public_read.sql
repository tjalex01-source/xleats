-- =============================================================================
-- XLeats — public-read policy for sent promo blasts
--
-- promo_blasts had no public-read policy at all, so the public truck page's
-- nested PostgREST join (discount_codes -> promo_blasts) silently returned
-- null for every row, and the "Specials & Promos" section never showed
-- anything — found live while verifying the blast feature. Drafts and
-- merely-scheduled blasts stay private; only actually-sent ones are visible.
-- =============================================================================

create policy promo_blasts_public_read on promo_blasts for select using (sent_at is not null);

notify pgrst, 'reload schema';
