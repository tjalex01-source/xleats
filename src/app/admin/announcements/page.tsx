import { createAdminClient } from '@/lib/supabase/server';
import { sendAnnouncement, deleteAnnouncement } from '../actions';

export default async function AdminAnnouncements() {
  const admin = createAdminClient();

  const { data: accounts } = await admin
    .from('accounts').select('id, name').order('name');
  const { data: announcements } = await admin
    .from('announcements').select('*').order('created_at', { ascending: false });

  const accountName = (id: string | null) =>
    id ? accounts?.find((a) => a.id === id)?.name ?? '(deleted account)' : 'Everyone';

  return (
    <div>
      <h1 className="font-display text-3xl font-extrabold">Announcements</h1>
      <p className="mt-1 text-muted">
        Shows up in the vendor dashboard. Pick a specific truck owner, or leave it as
        Everyone to broadcast to all vendors.
      </p>

      <form action={sendAnnouncement} className="mt-6 space-y-3 rounded-ticket border border-edge bg-white p-4 shadow-ticket">
        <select name="targetAccountId" defaultValue=""
          className="w-full rounded-lg border border-edge px-3 py-2.5 text-sm">
          <option value="">Everyone</option>
          {accounts?.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
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
                  To: {accountName(a.target_account_id)} · {new Date(a.created_at).toLocaleString()}
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
