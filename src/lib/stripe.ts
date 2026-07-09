import Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase/server';

// Lazy — the Stripe constructor throws on an empty key, and this module is
// evaluated at build time (page-data collection) before env vars are read.
// Constructing on first actual use keeps the build green and fails loudly
// only at request time if the key is genuinely missing.
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');
  return _stripe;
}

export const PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
  pro_annual: process.env.STRIPE_PRICE_PRO_ANNUAL ?? '',
  fleet_monthly: process.env.STRIPE_PRICE_FLEET_MONTHLY ?? '',
};

// Fleet is the multi-truck tier — billed per truck, minimum 2, which keeps
// Pro ($20, 1 truck) the cheapest single-truck option (2 × $15 = $30 floor).
export const MIN_FLEET_TRUCKS = 2;

// Reconcile an account's plan from its live Stripe subscription state. Called
// both from the webhook (out-of-band changes: portal cancellations, failed
// renewals) and on the post-checkout return (so the happy path doesn't depend
// on a webhook arriving). Runs as service role — no user session.
export async function syncCustomerPlan(customerId: string): Promise<'free' | 'pro' | 'fleet'> {
  const admin = createAdminClient();
  const subs = await getStripe().subscriptions.list({ customer: customerId, status: 'all', limit: 20 });
  const active = subs.data.find((s) => s.status === 'active' || s.status === 'trialing');

  if (active) {
    const plan = (active.items.data[0]?.price?.metadata?.xleats_plan as 'pro' | 'fleet') ?? 'pro';
    await admin.from('accounts').update({
      plan,
      stripe_subscription_id: active.id,
      plan_expires_at: null, // a real payer — clear any leftover admin-comp expiry
    }).eq('stripe_customer_id', customerId);
    return plan;
  }

  await admin.from('accounts').update({
    plan: 'free',
    stripe_subscription_id: null,
  }).eq('stripe_customer_id', customerId);
  return 'free';
}
