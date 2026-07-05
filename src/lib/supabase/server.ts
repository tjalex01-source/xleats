import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server components / route handlers. Honors the logged-in user via cookies.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet: { name: string; value: string; options?: any }[]) => {
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // called from a Server Component — middleware refreshes the session
          }
        },
      },
    }
  );
}

// Service-role client for cron jobs / the birthday matcher. SERVER ONLY.
import { createClient as createSb } from '@supabase/supabase-js';
export function createAdminClient() {
  return createSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Anon client for public, logged-out reads (e.g. the /[slug] truck page).
// Does NOT touch cookies(), so pages using it stay eligible for ISR/`revalidate`
// instead of being forced into fully dynamic rendering. Still respects RLS.
export function createPublicClient() {
  return createSb(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
