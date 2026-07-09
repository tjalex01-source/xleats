import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Server-only proxy to the Google Geocoding API — the key must never reach
// the browser. Requires a logged-in session so this can't be spammed
// anonymously to burn through the API quota/bill.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { address } = await req.json();
  if (!address || typeof address !== 'string') {
    return NextResponse.json({ lat: null, lng: null });
  }

  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key) {
    return NextResponse.json({ lat: null, lng: null, error: 'geocoding not configured' });
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.[0]) {
    return NextResponse.json({ lat: null, lng: null, status: data.status });
  }

  const { lat, lng } = data.results[0].geometry.location;
  return NextResponse.json({ lat, lng });
}
