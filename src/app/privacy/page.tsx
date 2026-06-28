import Link from 'next/link';

export const metadata = { title: 'Privacy Policy — XLeats' };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="eyebrow">← XLeats</Link>
      <h1 className="mt-4 font-display text-4xl font-extrabold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

      <div className="mt-8 space-y-6 text-muted leading-relaxed">
        <section>
          <h2 className="font-display text-xl font-bold text-ink">1. Information We Collect</h2>
          <p className="mt-2">We collect information you provide directly, including your name, email address, and truck information when you create an account. For customer accounts, we optionally collect birthday (month and day only) and zip code to enable birthday offers. We also collect location data when a truck owner or worker taps "Go Live" — this is a single GPS point captured at that moment, not continuous tracking.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">2. How We Use Your Information</h2>
          <p className="mt-2">We use your information to operate the Service, including displaying truck locations and menus to customers, sending push notifications about trucks you follow, and matching birthday offers to eligible customers. We do not sell your personal information to third parties.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">3. Location Data</h2>
          <p className="mt-2">For truck owners and workers: location is captured only when you explicitly tap "Go Live." We do not track your location continuously or in the background. For customers: we use your approximate location (based on zip code or device location when you grant permission) to show nearby trucks. We do not share your precise location with truck owners.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">4. Birthday Data</h2>
          <p className="mt-2">If you provide your birthday, we store only the month and day — never the year. This information is used exclusively by XLeats to deliver birthday offers from trucks near you. Food truck owners never see your birthday, name, or any identifying information. They receive only aggregate counts (e.g., "6 birthday offers redeemed this week").</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">5. Data Sharing</h2>
          <p className="mt-2">We do not share your personal information with food truck owners beyond what you explicitly choose to share (such as information submitted through a catering request form). We may share data with service providers who help us operate the platform (such as Supabase for database hosting and Expo for push notifications) under strict confidentiality agreements.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">6. Push Notifications</h2>
          <p className="mt-2">If you opt in to push notifications, we use your device token to send alerts about trucks you follow (such as when they go live or post an update). You can opt out of notifications at any time through your device settings.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">7. Data Retention</h2>
          <p className="mt-2">We retain your account information for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us at <a href="mailto:support@xleats.com" className="text-brand underline">support@xleats.com</a>. Location data from live sessions is retained for 90 days for operational purposes, then deleted.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">8. Security</h2>
          <p className="mt-2">We use industry-standard security practices including encrypted connections (HTTPS), row-level security on our database (so truck owners cannot access customer data), and secure authentication via Supabase Auth. No method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">9. Children's Privacy</h2>
          <p className="mt-2">XLeats is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe we have inadvertently collected such information, please contact us immediately.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">10. Changes to This Policy</h2>
          <p className="mt-2">We may update this Privacy Policy from time to time. We will notify registered users of material changes via email. Continued use of the Service after changes constitutes acceptance of the updated policy.</p>
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-ink">11. Contact</h2>
          <p className="mt-2">Questions about this Privacy Policy may be directed to <a href="mailto:support@xleats.com" className="text-brand underline">support@xleats.com</a>.</p>
        </section>
      </div>
    </main>
  );
}
