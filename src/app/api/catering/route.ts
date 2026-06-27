import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { truck_id, name, email, phone, event_date, headcount, location, note } = body;

    if (!truck_id || !name || !email || !event_date) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient();

    const { error } = await supabase.from('catering_requests').insert({
      truck_id,
      requester_name: name,
      email,
      phone: phone || null,
      event_date,
      headcount: headcount ? parseInt(headcount) : null,
      location: location || null,
      note: note || null,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Catering request error:', err);
    return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
  }
}
