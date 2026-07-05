import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <Image
        src="/xleats-logo.png"
        alt="XLeats"
        width={400}
        height={200}
        className="w-64 sm:w-80"
        priority
      />
      <p className="font-display -mt-1 mb-2 text-sm font-bold uppercase tracking-wide text-ink/70 sm:text-base">
        Your Food Truck&rsquo;s Wingman
      </p>
      <div className="truck-roll mb-2 w-full max-w-2xl">
        <Image
          src="/truck-logo.png"
          alt="XLeats food truck"
          width={800}
          height={400}
          className="w-full"
          priority
        />
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
      <footer className="mt-16 pb-6 text-xs text-muted">
        © {new Date().getFullYear()} Xandland Enterprises, LLC
      </footer>
    </main>
  );
}
