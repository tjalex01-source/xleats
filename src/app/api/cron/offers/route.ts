import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Schedule once each morning (Vercel cron). Matches birthday and
// holiday/custom date-triggered offers → delivers codes. new_follower offers
// are handled separately by a DB trigger on follow, not here.
// Runs as service role; trucks never see customer rows.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('generate_scheduled_offers');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // TODO(phase1): read new 'birthday'/'holiday'/'custom' notifications and push via Expo.
  return NextResponse.json({ delivered: data });
}
