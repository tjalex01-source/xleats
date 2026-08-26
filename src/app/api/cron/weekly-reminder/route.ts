import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Monday mornings. Broadcasts an announcement nudging every vendor to fill
// in their weekly schedule.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { error } = await admin.rpc('send_weekly_schedule_reminder');
  if (error) {
    // Log the real Postgres error server-side; never return it to the caller.
    console.error('cron failed', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
