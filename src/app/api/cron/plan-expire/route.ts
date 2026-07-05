import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Daily. Reverts comped accounts (admin-granted Pro/Fleet with a plan_expires_at)
// back to free once that date has passed.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc('expire_comped_plans');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
