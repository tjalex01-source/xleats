import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Schedule every ~15 min (Vercel cron). Flips past-expiry live sessions to off.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc('expire_stale_live_sessions');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
