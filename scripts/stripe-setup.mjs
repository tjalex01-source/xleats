// =============================================================================
// XLeats — one-time Stripe product/price setup (idempotent via lookup_key).
//
// Creates the Pro (flat) and Fleet (per-truck, quantity-based) products and
// prices, tagged with metadata xleats_plan so the webhook/sync helper can map
// a subscription back to an account_plan. Re-running is safe — it reuses any
// price found by lookup_key instead of creating duplicates.
//
// Run once per Stripe mode (test, then live):
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//   STRIPE_SECRET_KEY=sk_live_... node scripts/stripe-setup.mjs
//
// It prints the price IDs to paste into env (STRIPE_PRICE_*).
// =============================================================================
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error('Set STRIPE_SECRET_KEY'); process.exit(1); }
const stripe = new Stripe(key);

async function findOrCreateProduct(name, metadata) {
  const existing = await stripe.products.search({ query: `metadata['xleats_key']:'${metadata.xleats_key}'` });
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({ name, metadata });
}

async function findOrCreatePrice({ lookup_key, product, unit_amount, interval, xleats_plan }) {
  const existing = await stripe.prices.list({ lookup_keys: [lookup_key], limit: 1 });
  if (existing.data[0]) return existing.data[0];
  return stripe.prices.create({
    product,
    currency: 'usd',
    unit_amount,
    recurring: { interval },
    lookup_key,
    metadata: { xleats_plan },
  });
}

const proProduct = await findOrCreateProduct('XLeats Pro', { xleats_key: 'pro' });
const fleetProduct = await findOrCreateProduct('XLeats Fleet', { xleats_key: 'fleet' });

const proMonthly = await findOrCreatePrice({ lookup_key: 'xleats_pro_monthly', product: proProduct.id, unit_amount: 2000, interval: 'month', xleats_plan: 'pro' });
const proAnnual = await findOrCreatePrice({ lookup_key: 'xleats_pro_annual', product: proProduct.id, unit_amount: 20000, interval: 'year', xleats_plan: 'pro' });
const fleetMonthly = await findOrCreatePrice({ lookup_key: 'xleats_fleet_monthly', product: fleetProduct.id, unit_amount: 1500, interval: 'month', xleats_plan: 'fleet' });

console.log('\nPaste these into .env.local (test) or Vercel (live):\n');
console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`);
console.log(`STRIPE_PRICE_PRO_ANNUAL=${proAnnual.id}`);
console.log(`STRIPE_PRICE_FLEET_MONTHLY=${fleetMonthly.id}`);
