import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

// Drains the notifications queue → Expo push. Runs frequently (every minute).
// Every "notify a customer" feature (blasts, offers, contest/milestone
// winners, later go-live/new-post) writes a notifications row; this delivers
// it to the recipient's registered devices and stamps pushed_at. A row for a
// user with no registered device is still marked pushed (they'll see it
// in-app) so it isn't reprocessed forever.
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const admin = createAdminClient();

  const { data: notifs } = await admin
    .from('notifications')
    .select('id, user_id, title, body, kind, truck_id')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(300);

  if (!notifs || notifs.length === 0) return NextResponse.json({ pushed: 0 });

  const userIds = Array.from(new Set(notifs.map((n) => n.user_id)));
  const { data: devices } = await admin
    .from('devices')
    .select('user_id, expo_push_token')
    .in('user_id', userIds);

  const tokensByUser = new Map<string, string[]>();
  for (const d of devices ?? []) {
    tokensByUser.set(d.user_id, [...(tokensByUser.get(d.user_id) ?? []), d.expo_push_token]);
  }

  type ExpoMessage = { to: string; title: string; body: string; sound: 'default'; data: Record<string, unknown> };
  const messages: ExpoMessage[] = [];
  for (const n of notifs) {
    for (const token of tokensByUser.get(n.user_id) ?? []) {
      messages.push({
        to: token,
        title: n.title ?? 'XLeats',
        body: n.body ?? '',
        sound: 'default',
        data: { kind: n.kind, truck_id: n.truck_id, notification_id: n.id },
      });
    }
  }

  // Expo accepts up to 100 messages per request.
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (res.ok) sent += batch.length;
  }

  await admin.from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .in('id', notifs.map((n) => n.id));

  return NextResponse.json({ notifications: notifs.length, messages: messages.length, sent });
}
