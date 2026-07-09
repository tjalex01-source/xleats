import { NextResponse } from 'next/server';
import { getStripe, syncCustomerPlan } from '@/lib/stripe';

// Handles out-of-band subscription changes (portal cancellations, failed
// renewals, plan swaps). The post-checkout /sync route covers the happy
// path, so this is the safety net. Set STRIPE_WEBHOOK_SECRET (Stripe
// Dashboard → Webhooks → signing secret) and point the endpoint at
// /api/stripe/webhook.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'webhook not configured' }, { status: 400 });

  const body = await req.text();
  const sig = req.headers.get('stripe-signature') ?? '';

  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  const relevant = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
  ];
  if (relevant.includes(event.type)) {
    const obj = event.data.object as { customer?: string };
    if (obj.customer) await syncCustomerPlan(obj.customer);
  }

  return NextResponse.json({ received: true });
}
