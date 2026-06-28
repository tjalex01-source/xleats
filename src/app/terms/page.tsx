import Link from 'next/link';

export const metadata = { title: 'Terms of Service — XLeats' };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="eyebrow">← XLeats</Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

      <div className="mt-8 space-y-6 text-muted leading-relaxed">
        <section>
          <h2 className="font-display text-xl font-bold text-ink">1. Acceptance of Terms</h2>
          <p className="mt-2">By creating an account on XLeats ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the Service. XLeats reserves the right to update these terms at any time, and continued use of the Service constitutes acceptance of any changes.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">2. Description of Service</h2>
          <p className="mt-2">XLeats provides a platform for food truck owners and operators to manage and share their location, menu, schedule, and promotions with customers. The Service includes a web dashboard for truck owners and a customer-facing mobile application.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">3. Accounts and Registration</h2>
          <p className="mt-2">You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account credentials and for all activity that occurs under your account. You must be at least 18 years of age to create an account.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">4. Food Truck Owner Responsibilities</h2>
          <p className="mt-2">As a food truck owner using XLeats, you agree to: (a) provide accurate information about your truck, menu, and location; (b) ensure all posted content complies with applicable food safety and health regulations; (c) honor any promotions, discounts, or offers published through the Service; and (d) not use the platform to engage in fraudulent or deceptive practices.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">5. Acceptable Use</h2>
          <p className="mt-2">You agree not to use the Service to post false, misleading, or harmful content; to spam or harass other users; to violate any applicable laws or regulations; or to attempt to gain unauthorized access to any part of the Service.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">6. Promotions and Contests</h2>
          <p className="mt-2">Food truck owners who run promotions, contests, or giveaways through the Service are solely responsible for ensuring compliance with applicable laws and regulations governing such activities, including but not limited to sweepstakes and lottery laws. XLeats provides tools to facilitate promotions but is not a sponsor of any promotion.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">7. Payments and Subscriptions</h2>
          <p className="mt-2">Paid subscription plans are billed monthly or annually as selected. All fees are non-refundable unless otherwise required by law. XLeats reserves the right to change pricing with 30 days notice. Failure to pay may result in suspension or termination of your account.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">8. Intellectual Property</h2>
          <p className="mt-2">You retain ownership of content you upload to XLeats (menus, photos, posts). By uploading content, you grant XLeats a non-exclusive license to display and distribute that content through the Service. XLeats retains all rights to its platform, design, and technology.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">9. Limitation of Liability</h2>
          <p className="mt-2">XLeats is provided "as is" without warranties of any kind. XLeats is not liable for any indirect, incidental, or consequential damages arising from your use of the Service, including lost revenue, lost customers, or inaccurate location information.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">10. Termination</h2>
          <p className="mt-2">XLeats reserves the right to suspend or terminate your account at any time for violations of these terms. You may cancel your account at any time through your account settings.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">11. Contact</h2>
          <p className="mt-2">Questions about these Terms may be directed to <a href="mailto:support@xleats.com" className="text-brand underline">support@xleats.com</a>.</p>
        </section>
      </div>
    </main>
  );
}
