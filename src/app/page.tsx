import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 text-center">
      <Image
        src="/truck-logo.png"
        alt="XLeats food truck"
        width={600}
        height={300}
        className="mb-2 w-full max-w-lg"
        priority
      />
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
