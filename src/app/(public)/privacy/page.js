export const metadata = {
  title: 'Privacy Policy',
  description: 'How Kova collects, uses and protects your data.',
};

export default function PrivacyPage() {
  return (
    <article className="prose-page">
      <h1>Privacy Policy</h1>
      <p className="updated">Last updated: August 12, 2026</p>

      <p>
        This policy explains what data Kova collects, why we collect it, and
        the choices you have. We collect the minimum needed to run a safe,
        reliable ride platform — and nothing is sold to advertisers.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account data</strong> — name, username, and optionally phone and email.</li>
        <li><strong>Location data</strong> — pickup and destination for each trip; drivers share live GPS only while online or on a trip.</li>
        <li><strong>Trip data</strong> — route, fare breakdown, timestamps, ratings and in-ride messages.</li>
        <li><strong>Payment data</strong> — wallet balance and transaction ledger. We never store card numbers.</li>
        <li><strong>Driver data</strong> — vehicle details and licence information needed for approval.</li>
      </ul>

      <h2>2. How we use it</h2>
      <ul>
        <li>Matching riders with nearby drivers and navigating trips.</li>
        <li>Calculating upfront fares, including local demand-based pricing.</li>
        <li>Safety features: PIN pickup verification, trip records, two-way ratings.</li>
        <li>Support — resolving disputes and responding to your messages.</li>
      </ul>

      <h2>3. What we don’t do</h2>
      <ul>
        <li>We do not sell your personal data.</li>
        <li>We do not track your location when you’re not using the app.</li>
        <li>We do not share rider phone numbers with drivers — in-ride chat keeps contact details private.</li>
      </ul>

      <h2>4. Sharing</h2>
      <p>
        Trip participants see what they need: your driver sees your name,
        pickup and destination; your rider sees your name, photo, vehicle and
        plate. Beyond that, data is shared only with service providers that
        host our infrastructure, or when the law requires it.
      </p>

      <h2>5. Retention</h2>
      <p>
        Trip records are kept for as long as your account is active — they
        power your ride history, receipts and earnings ledger. You can
        request deletion of your account and associated personal data at any
        time via the contact page.
      </p>

      <h2>6. Security</h2>
      <p>
        Passwords are stored as salted bcrypt hashes. Realtime connections
        are authenticated with short-lived signed tokens. Access to
        production data is restricted and audited.
      </p>

      <h2>7. Your choices</h2>
      <ul>
        <li>Edit your profile details at any time from the app.</li>
        <li>Drivers control when they are visible by going online or offline.</li>
        <li>Request a copy or deletion of your data via the contact page.</li>
      </ul>

      <h2>8. Contact</h2>
      <p>
        Privacy questions? Reach us through the{' '}
        <a href="/contact" style={{ fontWeight: 600, color: 'var(--text)' }}>contact page</a>.
      </p>
    </article>
  );
}
