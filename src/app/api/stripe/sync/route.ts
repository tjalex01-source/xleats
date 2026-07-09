import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { syncCustomerPlan } from '@/lib/stripe';

// Called on return from Checkout (and can be hit anytime) to reconcile the
// account's plan with its live Stripe subscription — so the happy path never
// waits on a webhook.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: account } = await admin.from('accounts').select('stripe_customer_id').eq('owner_id', user.id).maybeSingle();
  if (!account?.stripe_customer_id) return NextResponse.json({ plan: 'free' });

  const plan = await syncCustomerPlan(account.stripe_customer_id);
  return NextResponse.json({ plan });
}
