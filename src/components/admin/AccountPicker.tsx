'use client';
import { useState } from 'react';

export type PickableAccount = { id: string; label: string };

// Renders every checkbox up front and hides non-matching ones with CSS
// (rather than not rendering them), so a vendor checked under one search
// term stays checked after the search text changes — no controlled
// per-checkbox state needed, the native form still just works on submit.
export default function AccountPicker({ accounts }: { accounts: PickableAccount[] }) {
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(0);
  const q = query.trim().toLowerCase();

  function onChange() {
    // Recompute the selected count on any checkbox change.
    setCount(document.querySelectorAll('input[name="accountIds"]:checked').length);
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search vendors by name, truck, or email…"
        className="w-full rounded-lg border border-edge px-3 py-2.5 text-sm outline-none focus:border-brand"
      />
      <p className="mt-1 text-xs text-muted">{count} selected</p>
      <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-edge p-2">
        {accounts.map((a) => {
          const matches = !q || a.label.toLowerCase().includes(q);
          return (
            <label
              key={a.id}
              style={{ display: matches ? 'flex' : 'none' }}
              className="items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-black/[0.03]"
            >
              <input type="checkbox" name="accountIds" value={a.id} onChange={onChange} className="accent-brand" />
              {a.label}
            </label>
          );
        })}
        {accounts.length === 0 && <p className="p-2 text-sm text-muted">No vendors yet.</p>}
      </div>
    </div>
  );
}
