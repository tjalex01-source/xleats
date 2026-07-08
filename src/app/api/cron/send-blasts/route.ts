import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Runs every 15 min. Fires any promo blast whose scheduled send time has arrived.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('process_due_blasts');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sent: data });
}
