import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import AccountSettingsForm from '@/components/AccountSettingsForm';

export default async function AccountSettings() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('profiles').select('display_name').eq('id', user!.id).maybeSingle();
  const { data: account } = await supabase
    .from('accounts').select('id, name').eq('owner_id', user!.id).maybeSingle();

  return (
    <div className="mx-auto max-w-md">
      <Link href="/dashboard" className="eyebrow">← Dashboard</Link>
      <h1 className="mt-3 font-display text-3xl font-extrabold">Account settings</h1>
      <div className="mt-6">
        <AccountSettingsForm
          email={user?.email ?? ''}
          displayName={profile?.display_name ?? ''}
          account={account ?? null}
        />
      </div>
    </div>
  );
}
