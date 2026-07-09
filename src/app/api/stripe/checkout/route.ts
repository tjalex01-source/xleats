import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getStripe, PRICES, MIN_FLEET_TRUCKS } from '@/lib/stripe';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { plan, interval } = await req.json() as { plan: 'pro' | 'fleet'; interval?: 'monthly' | 'annual' };
  const admin = createAdminClient();
  const { data: account } = await admin.from('accounts').select('*').eq('owner_id', user.id).maybeSingle();
  if (!account) return NextResponse.json({ error: 'no account' }, { status: 400 });

  // Ensure a Stripe customer exists for this account.
  let customerId: string = account.stripe_customer_id;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email ?? undefined,
      metadata: { account_id: account.id },
    });
    customerId = customer.id;
    await admin.from('accounts').update({ stripe_customer_id: customerId }).eq('id', account.id);
  }

  let priceId: string;
  let quantity = 1;
  if (plan === 'fleet') {
    priceId = PRICES.fleet_monthly;
    const { count } = await admin.from('trucks').select('*', { count: 'exact', head: true }).eq('account_id', account.id);
    quantity = Math.max(count ?? 1, MIN_FLEET_TRUCKS);
  } else {
    priceId = interval === 'annual' ? PRICES.pro_annual : PRICES.pro_monthly;
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity }],
    success_url: `${origin}/dashboard/billing?checkout=success`,
    cancel_url: `${origin}/dashboard/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
