-- =============================================================================
-- XLeats — Stripe billing columns
--
-- accounts.stripe_customer_id already existed; add the active subscription id
-- so the webhook / sync helper can reconcile plan state. plan_expires_at /
-- comp_note stay reserved for the admin-comp flow (a Stripe-paid account has
-- plan_expires_at = null, so the plan-expire cron never touches it).
-- =============================================================================

alter table accounts add column if not exists stripe_subscription_id text;

notify pgrst, 'reload schema';
