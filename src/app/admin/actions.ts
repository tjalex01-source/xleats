'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/server';

export async function setSuspended(accountId: string, suspended: boolean) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from('accounts').update({ suspended }).eq('id', accountId);
  revalidatePath('/admin');
}

export async function setPlan(formData: FormData) {
  await requireAdmin();
  const accountId = formData.get('accountId') as string;
  const plan = formData.get('plan') as string;
  const duration = formData.get('duration') as string;
  const note = (formData.get('note') as string) || null;

  let plan_expires_at: string | null = null;
  if (duration === '1month' && plan !== 'free') {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    plan_expires_at = d.toISOString();
  }

  const admin = createAdminClient();
  await admin.from('accounts').update({ plan, plan_expires_at, comp_note: note }).eq('id', accountId);
  revalidatePath('/admin');
}

export async function sendAnnouncement(formData: FormData) {
  await requireAdmin();
  const title = formData.get('title') as string;
  const body = formData.get('body') as string;
  const targetAll = formData.get('targetAll') === 'on';
  const accountIds = formData.getAll('accountIds') as string[];
  if (!title || !body) return;
  if (!targetAll && accountIds.length === 0) return;

  const admin = createAdminClient();
  const { data: announcement, error } = await admin
    .from('announcements')
    .insert({ title, body, target_all: targetAll })
    .select().single();
  if (error || !announcement) return;

  if (!targetAll && accountIds.length > 0) {
    await admin.from('announcement_recipients').insert(
      accountIds.map((accountId) => ({ announcement_id: announcement.id, account_id: accountId }))
    );
  }
  revalidatePath('/admin/announcements');
}

export async function deleteAnnouncement(id: string) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from('announcements').delete().eq('id', id);
  revalidatePath('/admin/announcements');
}
