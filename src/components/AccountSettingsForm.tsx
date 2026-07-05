'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function AccountSettingsForm({
  email,
  displayName: initialDisplayName,
  account,
}: {
  email: string;
  displayName: string;
  account: { id: string; name: string } | null;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [accountName, setAccountName] = useState(account?.name ?? '');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const inputCls = 'w-full rounded-lg border border-edge px-3 py-2.5 outline-none focus:border-brand';

  async function saveProfile() {
    setProfileBusy(true); setProfileError(null); setProfileSaved(false);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setProfileBusy(false); return; }

    const { error: profileErr } = await supabase
      .from('profiles').update({ display_name: displayName }).eq('id', user.id);
    if (profileErr) { setProfileError(profileErr.message); setProfileBusy(false); return; }

    if (account) {
      const { error: accountErr } = await supabase
        .from('accounts').update({ name: accountName }).eq('id', account.id);
      if (accountErr) { setProfileError(accountErr.message); setProfileBusy(false); return; }
    }

    setProfileBusy(false);
    setProfileSaved(true);
  }

  async function savePassword() {
    setPasswordError(null); setPasswordSaved(false);
    if (password.length < 8) { setPasswordError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setPasswordError('Passwords do not match.'); return; }

    setPasswordBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setPasswordBusy(false);
    if (error) { setPasswordError(error.message); return; }
    setPassword(''); setConfirmPassword('');
    setPasswordSaved(true);
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="eyebrow">Profile</div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Email</label>
          <input className={`${inputCls} bg-black/[0.03] text-muted`} value={email} disabled />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Your name</label>
          <input className={inputCls} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        {account && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">Account / business name</label>
            <input className={inputCls} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
          </div>
        )}
        {profileError && <p className="text-sm text-brand">{profileError}</p>}
        {profileSaved && !profileError && <p className="text-sm text-green-700">Saved.</p>}
        <button onClick={saveProfile} disabled={profileBusy}
          className="w-full rounded-lg bg-brand px-4 py-2.5 font-display font-bold text-white disabled:opacity-60">
          {profileBusy ? 'Saving…' : 'Save profile'}
        </button>
      </section>

      <section className="space-y-3 border-t border-edge pt-6">
        <div className="eyebrow">Password</div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">New password</label>
          <input className={inputCls} type="password" placeholder="8+ characters"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Confirm new password</label>
          <input className={inputCls} type="password"
            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </div>
        {passwordError && <p className="text-sm text-brand">{passwordError}</p>}
        {passwordSaved && !passwordError && <p className="text-sm text-green-700">Password updated.</p>}
        <button onClick={savePassword} disabled={passwordBusy || !password || !confirmPassword}
          className="w-full rounded-lg border border-edge px-4 py-2.5 font-display font-bold disabled:opacity-60">
          {passwordBusy ? 'Updating…' : 'Update password'}
        </button>
      </section>
    </div>
  );
}
