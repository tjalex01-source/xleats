import Link from 'next/link';

export const metadata = { title: 'Pricing — XLeats' };

const check = '✓';

export default function Pricing() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="eyebrow">← XLeats</Link>
      <div className="mt-4 text-center">
        <h1 className="font-display text-4xl font-extrabold">Simple pricing for every truck</h1>
        <p className="mt-3 text-muted">Start free. Upgrade when you're ready to grow.</p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">

        {/* FREE */}
        <div className="rounded-ticket border border-edge bg-white p-6 shadow-ticket">
          <div className="eyebrow mb-1">Starter</div>
          <div className="font-display text-4xl font-extrabold">Free</div>
          <p className="mt-1 text-sm text-muted">Forever</p>
          <ul className="mt-6 space-y-2 text-sm">
            {[
              '1 truck',
              'Public truck page',
              'Menu & schedule',
              'Posts for followers',
              '4-state live status',
              'Catering request form',
              'Customer follows & notifications',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-green-600">{check}</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link href="/signup"
            className="mt-8 block rounded-lg border border-edge py-2.5 text-center font-display font-bold text-ink hover:border-brand">
            Get started free
          </Link>
        </div>

        {/* PRO */}
        <div className="rounded-ticket border-2 border-brand bg-white p-6 shadow-ticket relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-0.5 text-xs font-bold text-white">
            Most popular
          </div>
          <div className="eyebrow mb-1">Pro</div>
          <div className="font-display text-4xl font-extrabold">$25<span className="text-lg font-normal text-muted">/mo</span></div>
          <p className="mt-1 text-sm text-muted">or $20/mo billed annually</p>
          <ul className="mt-6 space-y-2 text-sm">
            {[
              'Everything in Free',
              'Up to 3 trucks',
              'Discount codes',
              'Contests & giveaways',
              'Birthday offers',
              'Push blasts to all followers',
              'Follower & redemption analytics',
              'Priority support',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-green-600">{check}</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link href="/signup"
            className="mt-8 block rounded-lg bg-brand py-2.5 text-center font-display font-bold text-white">
            Start Pro free for 14 days
          </Link>
        </div>

        {/* FLEET */}
        <div className="rounded-ticket border border-edge bg-white p-6 shadow-ticket">
          <div className="eyebrow mb-1">Fleet</div>
          <div className="font-display text-4xl font-extrabold">$60<span className="text-lg font-normal text-muted">/mo</span></div>
          <p className="mt-1 text-sm text-muted">or $50/mo billed annually</p>
          <ul className="mt-6 space-y-2 text-sm">
            {[
              'Everything in Pro',
              'Unlimited trucks',
              'Bulk menu updates across trucks',
              'Brand-level announcements',
              'Multi-location analytics dashboard',
              'Team member management',
              'Dedicated account support',
            ].map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 font-bold text-green-600">{check}</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link href="/signup"
            className="mt-8 block rounded-lg border border-edge py-2.5 text-center font-display font-bold text-ink hover:border-brand">
            Contact us
          </Link>
        </div>

      </div>

      <p className="mt-8 text-center text-sm text-muted">
        All plans include a free customer app for your followers. No setup fees. Cancel any time.{' '}
        <Link href="/signup" className="font-semibold text-ink underline">Get started →</Link>
      </p>
    </main>
  );
}
