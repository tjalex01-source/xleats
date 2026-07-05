'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
    </svg>
  );
}

// Facebook login is configured in Supabase but Meta's business verification
// isn't cleared yet, so the button is disabled here to avoid a broken-looking
// login option for real customers. Re-enable by restoring the button below
// once Facebook login actually works for non-testers.
// function FacebookIcon() {
//   return (
//     <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
//       <path fill="#fff" d="M18 9a9 9 0 1 0-10.4 8.89v-6.29H5.3V9h2.3V7c0-2.27 1.35-3.53 3.42-3.53.99 0 2.03.18 2.03.18v2.23h-1.14c-1.13 0-1.48.7-1.48 1.42V9h2.52l-.4 2.6h-2.12v6.29A9 9 0 0 0 18 9z"/>
//     </svg>
//   );
// }

export default function OAuthButtons() {
  const [loading, setLoading] = useState<'google' | 'facebook' | null>(null);

  async function signIn(provider: 'google' | 'facebook') {
    setLoading(provider);
    const { error } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setLoading(null);
  }

  return (
    <div className="mb-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => signIn('google')}
          disabled={loading !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-edge bg-white py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          <GoogleIcon /> {loading === 'google' ? '…' : 'Google'}
        </button>
        {/* <button
          type="button"
          onClick={() => signIn('facebook')}
          disabled={loading !== null}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#1877F2] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          <FacebookIcon /> {loading === 'facebook' ? '…' : 'Facebook'}
        </button> */}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-edge" />
        <span className="eyebrow">or</span>
        <div className="h-px flex-1 bg-edge" />
      </div>
    </div>
  );
}
