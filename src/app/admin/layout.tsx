import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import SignOut from '@/components/SignOut';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-edge bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-5">
            <Link href="/admin" className="font-display text-xl font-extrabold tracking-tight">
              XL<span className="text-brand">eats</span> <span className="eyebrow">admin</span>
            </Link>
            <Link href="/admin" className="text-sm font-semibold text-muted hover:text-ink">Vendors</Link>
            <Link href="/admin/announcements" className="text-sm font-semibold text-muted hover:text-ink">Announcements</Link>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-muted hover:text-ink">← Back to dashboard</Link>
            <SignOut />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-6">{children}</main>
    </div>
  );
}
