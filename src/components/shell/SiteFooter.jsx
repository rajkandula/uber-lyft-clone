import Link from 'next/link';
import { KovaIcon } from '@/components/brand/KovaLogo';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { href: '/signup', label: 'Book a ride' },
      { href: '/signup?role=driver', label: 'Become a driver' },
      { href: '/login', label: 'Sign in' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/contact', label: 'Contact us' },
      { href: '/contact#support', label: 'Support' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms of service' },
      { href: '/privacy', label: 'Privacy policy' },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          padding: '48px 24px 32px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 1.4fr) repeat(3, minmax(140px, 1fr))',
            gap: 32,
          }}
          className="footer-grid"
        >
          <div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <KovaIcon size={30} />
              <span style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
                kova
              </span>
            </span>
            <p className="small muted mt-3" style={{ maxWidth: 260, lineHeight: 1.6 }}>
              Premium ride-hailing with upfront fares, live tracking and
              PIN-verified pickups. Move well.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4
                className="tiny"
                style={{
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--text-3)',
                  marginBottom: 14,
                }}
              >
                {col.title}
              </h4>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="small"
                      style={{ color: 'var(--text-2)', transition: 'color 150ms' }}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="flex items-center justify-between wrap gap-3"
          style={{ borderTop: '1px solid var(--border)', marginTop: 40, paddingTop: 20 }}
        >
          <span className="tiny muted">© {new Date().getFullYear()} Kova. All rights reserved.</span>
          <div className="flex gap-4 tiny muted">
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/contact">Contact</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
