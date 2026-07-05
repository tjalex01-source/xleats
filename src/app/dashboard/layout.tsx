import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SignOut from '@/components/SignOut';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: account } = await supabase
    .from('accounts').select('suspended').eq('owner_id', user!.id).maybeSingle();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-edge bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3">
          <Link href="/dashboard" className="font-display text-xl font-extrabold tracking-tight">
            XL<span className="text-brand">eats</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-muted sm:inline">{user?.email}</span>
            {!account?.suspended && (
              <Link href="/dashboard/settings" className="font-semibold text-muted hover:text-ink">
                Settings
              </Link>
            )}
            <SignOut />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-6">
        {account?.suspended ? (
          <div className="rounded-ticket border border-brand bg-white p-8 text-center shadow-ticket">
            <div className="eyebrow mb-2">Account suspended</div>
            <h1 className="font-display text-2xl font-extrabold">This account is suspended</h1>
            <p className="mx-auto mt-2 max-w-sm text-muted">
              Your XLeats account has been suspended and your public page is temporarily
              unavailable. Contact support if you think this is a mistake.
            </p>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
