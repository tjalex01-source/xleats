import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/stripe';

// Opens Stripe's hosted Billing Portal so a vendor can update card, view
// invoices, or cancel — Stripe handles the UI; our webhook/sync reconciles
// the plan afterward.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: account } = await admin.from('accounts').select('stripe_customer_id').eq('owner_id', user.id).maybeSingle();
  if (!account?.stripe_customer_id) return NextResponse.json({ error: 'no billing account' }, { status: 400 });

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const session = await getStripe().billingPortal.sessions.create({
    customer: account.stripe_customer_id,
    return_url: `${origin}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}
