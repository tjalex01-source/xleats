import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createPublicClient } from '@/lib/supabase/server';

// Takes a truck slug, not a raw URL — the actual destination is looked up
// server-side from the truck's own order_url. Never redirect to a URL taken
// directly from the query string; that would make xleats.com/order into an
// open redirect anyone could point at a phishing link.
export default async function OrderRedirect({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const { truck: slug } = await searchParams;
  if (!slug) notFound();

  const supabase = createPublicClient();
  const { data: truck } = await supabase
    .from('trucks')
    .select('name, slug, order_url')
    .eq('slug', slug)
    .maybeSingle();

  if (!truck || !truck.order_url) notFound();

  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="eyebrow mb-2">Leaving XLeats</div>
      <h1 className="font-display text-2xl font-extrabold">You&rsquo;re about to leave XLeats</h1>
      <p className="mt-3 text-muted">
        {truck.name} handles online ordering through their own ordering partner, not XLeats.
        We never see or process your payment information.
      </p>
      <a
        href={truck.order_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 font-display font-bold text-white"
      >
        Continue to order from {truck.name}
      </a>
      <div className="mt-4">
        <Link href={`/${truck.slug}`} className="text-sm text-muted underline">
          ← Go back
        </Link>
      </div>
    </div>
  );
}
