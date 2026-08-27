import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next 16 renamed the `middleware` convention to `proxy`. Note the runtime
// changed with it: `proxy` is always nodejs, never edge. That's fine here --
// all this does is refresh the Supabase session cookie and guard /dashboard,
// which @supabase/ssr supports on node.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
