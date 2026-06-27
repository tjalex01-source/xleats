import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Upserts today's live_sessions row. RLS (can_post_live) authorizes the caller.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json();
  const { truck_id, status, lat, lng, catering_note } = body;
  const today = new Date().toISOString().slice(0, 10);

  // Default live window: until today's scheduled end, else +4h.
  let expires_at: string | null = null;
  if (status === 'live') {
    const dow = new Date().getDay();
    const { data: sched } = await supabase
      .from('schedules')
      .select('end_time')
      .eq('truck_id', truck_id)
      .or(`date.eq.${today},and(recurring.eq.true,day_of_week.eq.${dow})`)
      .not('end_time', 'is', null)
      .order('end_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sched?.end_time) {
      expires_at = new Date(`${today}T${sched.end_time}`).toISOString();
    } else {
      expires_at = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    }
  }

  const row = {
    truck_id,
    date: today,
    status,
    started_at: status === 'live' ? new Date().toISOString() : null,
    expires_at,
    confirmed_lat: status === 'live' ? lat : null,
    confirmed_lng: status === 'live' ? lng : null,
    catering_note: status === 'catering' ? catering_note : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('live_sessions')
    .upsert(row, { onConflict: 'truck_id,date' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // TODO(phase1): on transition to 'live', fan out push to followers via devices.
  return NextResponse.json(data);
}
