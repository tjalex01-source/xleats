import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <div className="mb-6 flex flex-col items-center gap-1">
        <span className="font-display text-7xl font-extrabold tracking-tight text-brand sm:text-8xl">
          XLEATS
        </span>
        <div className="eyebrow">for food trucks</div>
      </div>
      <h1 className="font-display text-5xl font-extrabold leading-[0.95] sm:text-6xl">
        Tell your regulars<br />exactly where you are.
      </h1>
      <p className="mt-5 max-w-md text-lg text-muted">
        One tap to go live. Post your menu, schedule, and updates. Your followers
        get a notification the moment you park.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/signup" className="rounded-lg bg-brand px-6 py-3 font-display font-bold text-white">
          Start your truck
        </Link>
        <Link href="/login" className="rounded-lg border border-edge bg-white px-6 py-3 font-display font-bold">
          Log in
        </Link>
      </div>
    </main>
  );
}
