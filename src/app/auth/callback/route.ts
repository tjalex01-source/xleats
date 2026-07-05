import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // OAuth doesn't let us pass custom signup metadata like the email/password
      // form does, so the handle_new_user() trigger defaults new profiles to
      // role='customer'. This surface is vendor-only (no customer web signup
      // exists yet), so promote first-time OAuth sign-ins to 'owner'.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ role: 'owner' })
          .eq('id', user.id)
          .eq('role', 'customer');
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
