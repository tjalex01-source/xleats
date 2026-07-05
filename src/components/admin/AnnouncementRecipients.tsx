'use client';
import { useState } from 'react';
import AccountPicker, { type PickableAccount } from './AccountPicker';

export default function AnnouncementRecipients({ accounts }: { accounts: PickableAccount[] }) {
  const [everyone, setEveryone] = useState(true);

  return (
    <div>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={everyone} onChange={() => setEveryone(true)} className="accent-brand" />
          Everyone
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!everyone} onChange={() => setEveryone(false)} className="accent-brand" />
          Selected vendors
        </label>
      </div>

      {/* The server action reads this; the radios above are just the UI. */}
      <input type="checkbox" name="targetAll" checked={everyone} readOnly hidden />

      {!everyone && (
        <div className="mt-3">
          <AccountPicker accounts={accounts} />
        </div>
      )}
    </div>
  );
}
