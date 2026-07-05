import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

// Call at the top of every admin page/server action. Never trust the UI
// alone — this re-checks on the server every time, since the admin client
// bypasses RLS entirely once past this gate.
export async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) redirect('/dashboard');
  return user!;
}
