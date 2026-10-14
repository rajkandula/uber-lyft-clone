export const metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of Kova.',
};

export default function TermsPage() {
  return (
    <article className="prose-page">
      <h1>Terms of Service</h1>
      <p className="updated">Last updated: August 12, 2026</p>

      <p>
        These Terms of Service (“Terms”) govern your access to and use of the
        Kova platform — our website, apps and services that connect riders
        with independent drivers. By creating an account or using Kova, you
        agree to these Terms.
      </p>

      <h2>1. The service</h2>
      <p>
        Kova is a technology platform. We match ride requests with nearby
        drivers, calculate upfront fares, process wallet payments and provide
        live trip tracking. Drivers are independent providers of
        transportation services; Kova does not itself provide transportation.
      </p>

      <h2>2. Fair economics</h2>
      <p>
        Kova is built driver-first. Our platform commission is a small,
        transparent percentage of each fare — published on every driver’s
        earnings screen — and exists only to cover the cost of operating the
        platform. The remainder of every fare belongs to the driver. Rider
        fares are shown upfront before booking and never change mid-trip,
        except for optional cancellation fees described below.
      </p>

      <h2>3. Accounts</h2>
      <ul>
        <li>You must provide accurate information and keep your credentials confidential.</li>
        <li>You are responsible for all activity under your account.</li>
        <li>One account per person; you must be legally able to enter a contract.</li>
        <li>Drivers must hold a valid licence, insurance and a roadworthy vehicle, and pass our approval process.</li>
      </ul>

      <h2>4. Bookings, cancellations and fees</h2>
      <ul>
        <li>Fares are quoted upfront based on route distance, time and current demand.</li>
        <li>You may cancel free of charge while we search for a driver or while the driver is on the way.</li>
        <li>A small cancellation fee applies if you cancel after your driver has already arrived; most of that fee compensates the driver.</li>
        <li>Trips are verified with a one-time PIN. Never start a trip in a vehicle that doesn’t match the app.</li>
      </ul>

      <h2>5. Payments, ride credits and payouts</h2>
      <p>
        Rides are paid using <strong>ride credits</strong>, which you purchase
        by card and which appear as your wallet balance. Every purchase and
        spend is recorded in a ledger visible in your account.
      </p>
      <ul>
        <li>
          Ride credits are redeemable <strong>only for Kova rides</strong>. They
          are not money, cannot be exchanged for cash, and cannot be
          transferred to another user or account.
        </li>
        <li>
          Credit purchases are final and non-refundable, except where refunds
          are required by law or where we cancel a trip in error.
        </li>
        <li>Credits do not expire while your account remains active.</li>
        <li>
          Rider fares are shown before you book and are charged from your
          credits when the trip completes.
        </li>
      </ul>
      <p>
        <strong>Driver earnings</strong> are credited to the driver the moment a
        trip completes, and are withdrawn to the driver’s own bank account
        through Stripe. Stripe collects and holds bank details directly; Kova
        does not store them. Payouts are subject to Stripe’s verification and
        typically arrive within one to two business days.
      </p>

      <h2>6. Conduct</h2>
      <ul>
        <li>Treat drivers and riders with respect; harassment or discrimination leads to removal.</li>
        <li>No unlawful use of the platform, no fraud, no interference with dispatch or pricing systems.</li>
        <li>Ratings and messages must be honest and appropriate.</li>
      </ul>

      <h2>7. Suspension and termination</h2>
      <p>
        We may suspend or terminate accounts that violate these Terms, create
        safety risks or abuse the platform. Drivers may go offline at any
        time; riders may close their account at any time.
      </p>

      <h2>8. Disclaimers and liability</h2>
      <p>
        The service is provided “as is”. To the maximum extent permitted by
        law, Kova is not liable for indirect or consequential damages arising
        from your use of the platform. Nothing in these Terms limits
        liability that cannot be limited by law.
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        announced in the app before they take effect. Continued use after
        changes means you accept the updated Terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these Terms? Reach us through the{' '}
        <a href="/contact" style={{ fontWeight: 600, color: 'var(--text)' }}>contact page</a>.
      </p>
    </article>
  );
}
