import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Once daily, early morning. Fills in today's live_sessions row from each
// truck's weekly schedule, for any truck that hasn't already gotten a
// manual status update today.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc('seed_daily_status_from_schedule');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
