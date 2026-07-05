import { createAdminClient } from '@/lib/supabase/server';
import { sendAnnouncement, deleteAnnouncement } from '../actions';
import AnnouncementRecipients from '@/components/admin/AnnouncementRecipients';

export default async function AdminAnnouncements() {
  const admin = createAdminClient();

  const [{ data: accounts }, { data: trucks }, { data: usersPage }, { data: announcements }, { data: recipients }] =
    await Promise.all([
      admin.from('accounts').select('id, name').order('name'),
      admin.from('trucks').select('account_id, name, slug'),
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from('announcements').select('*').order('created_at', { ascending: false }),
      admin.from('announcement_recipients').select('announcement_id, account_id'),
    ]);

  const emailFor = (ownerId: string) =>
    usersPage?.users.find((u) => u.id === ownerId)?.email ?? '(unknown)';
  const accountName = (id: string) => accounts?.find((a) => a.id === id)?.name ?? '(deleted account)';

  const pickableAccounts = (accounts ?? []).map((a) => {
    const ownedTrucks = trucks?.filter((t) => t.account_id === a.id) ?? [];
    const label = [a.name, emailFor(a.id), ...ownedTrucks.map((t) => t.name)].filter(Boolean).join(' — ');
    return { id: a.id, label };
  });

  const recipientsFor = (announcementId: string) =>
    recipients?.filter((r) => r.announcement_id === announcementId).map((r) => accountName(r.account_id)) ?? [];

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Announcements</h1>
      <p className="mt-1 text-muted">
        Shows up in the vendor dashboard. Broadcast to everyone, or search and pick
        specific vendors.
      </p>

      <form action={sendAnnouncement} className="mt-6 space-y-3 rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <AnnouncementRecipients accounts={pickableAccounts} />
        <input name="title" placeholder="Title" required
          className="w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand" />
        <textarea name="body" placeholder="Message" required rows={4}
          className="w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand" />
        <button className="rounded-lg bg-brand px-4 py-2.5 font-display font-bold text-white">
          Send
        </button>
      </form>

      <div className="mt-8 space-y-3">
        <div className="eyebrow">Sent</div>
        {announcements?.length === 0 && <p className="text-sm text-muted">Nothing sent yet.</p>}
        {announcements?.map((a) => (
          <div key={a.id} className="rounded-ticket border border-edge bg-white p-4 shadow-ticket">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display font-bold">{a.title}</div>
                <div className="text-xs text-muted">
                  To: {a.target_all ? 'Everyone' : (recipientsFor(a.id).join(', ') || '(no vendors)')}
                  {' · '}{new Date(a.created_at).toLocaleString()}
                </div>
                <p className="mt-2 text-sm">{a.body}</p>
              </div>
              <form action={deleteAnnouncement.bind(null, a.id)}>
                <button className="text-sm text-muted underline hover:text-brand">Delete</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
