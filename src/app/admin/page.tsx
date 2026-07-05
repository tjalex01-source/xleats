import { createAdminClient } from '@/lib/supabase/server';
import { setSuspended, setPlan } from './actions';

export default async function AdminVendors() {
  const admin = createAdminClient();

  const { data: accounts } = await admin
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: false });
  const { data: trucks } = await admin
    .from('trucks')
    .select('id, account_id, name, slug');

  // Small vendor list for now (Phase 1, pre-launch) — a single listUsers() call
  // is enough to map owner_id -> email without an admin.getUserById() per row.
  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const emailFor = (ownerId: string) =>
    usersPage?.users.find((u) => u.id === ownerId)?.email ?? '(unknown)';

  const trucksFor = (accountId: string) => trucks?.filter((t) => t.account_id === accountId) ?? [];

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Vendors</h1>
      <p className="mt-1 text-muted">{accounts?.length ?? 0} accounts</p>

      <div className="mt-6 space-y-4">
        {accounts?.map((account) => (
          <div key={account.id} className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-lg font-bold">{account.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    account.plan === 'free' ? 'border border-edge text-muted' : 'bg-brand text-white'
                  }`}>
                    {account.plan.toUpperCase()}
                  </span>
                  {account.suspended && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">
                      SUSPENDED
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted">{emailFor(account.owner_id)}</div>
                <div className="mt-1 text-sm text-muted">
                  {trucksFor(account.id).map((t) => (
                    <a key={t.id} href={`https://xleats.com/${t.slug}`} target="_blank" rel="noopener noreferrer"
                      className="mr-3 text-brand underline">
                      {t.name}
                    </a>
                  ))}
                  {trucksFor(account.id).length === 0 && 'No trucks yet'}
                </div>
                {account.plan_expires_at && (
                  <div className="mt-1 text-xs text-muted">
                    Plan expires {new Date(account.plan_expires_at).toLocaleDateString()}
                  </div>
                )}
                {account.comp_note && (
                  <div className="mt-1 text-xs italic text-muted">&ldquo;{account.comp_note}&rdquo;</div>
                )}
              </div>

              <form action={setSuspended.bind(null, account.id, !account.suspended)}>
                <button
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    account.suspended
                      ? 'border-edge text-ink hover:bg-black/5'
                      : 'border-red-600 text-red-600 hover:bg-red-50'
                  }`}
                >
                  {account.suspended ? 'Unsuspend' : 'Suspend'}
                </button>
              </form>
            </div>

            <form action={setPlan} className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
              <input type="hidden" name="accountId" value={account.id} />
              <select name="plan" defaultValue={account.plan}
                className="rounded-lg border border-edge px-2 py-1.5 text-sm">
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="fleet">Fleet</option>
              </select>
              <select name="duration" defaultValue="lifetime"
                className="rounded-lg border border-edge px-2 py-1.5 text-sm">
                <option value="lifetime">No expiration</option>
                <option value="1month">1 month, then back to Free</option>
              </select>
              <input name="note" defaultValue={account.comp_note ?? ''} placeholder="Note (e.g. early adopter reward)"
                className="min-w-[200px] flex-1 rounded-lg border border-edge px-2 py-1.5 text-sm" />
              <button className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white">
                Update plan
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
