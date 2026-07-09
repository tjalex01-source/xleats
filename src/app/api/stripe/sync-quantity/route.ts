import { NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getStripe, MIN_FLEET_TRUCKS } from '@/lib/stripe';

// Keeps a Fleet subscription's billed quantity in sync with the account's
// actual truck count (min 2). Called after a Fleet account adds a truck.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: account } = await admin.from('accounts')
    .select('id, plan, stripe_subscription_id').eq('owner_id', user.id).maybeSingle();
  if (!account || account.plan !== 'fleet' || !account.stripe_subscription_id) {
    return NextResponse.json({ ok: true });
  }

  const { count } = await admin.from('trucks').select('*', { count: 'exact', head: true }).eq('account_id', account.id);
  const quantity = Math.max(count ?? 1, MIN_FLEET_TRUCKS);

  const sub = await getStripe().subscriptions.retrieve(account.stripe_subscription_id);
  const itemId = sub.items.data[0]?.id;
  if (itemId) {
    await getStripe().subscriptions.update(sub.id, { items: [{ id: itemId, quantity }] });
  }
  return NextResponse.json({ ok: true, quantity });
}
