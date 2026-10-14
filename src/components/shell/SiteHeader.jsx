import Link from 'next/link';
import { KovaLogo } from '@/components/brand/KovaLogo';

export default function SiteHeader() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        background: 'rgba(250, 250, 249, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <nav
        className="flex items-center justify-between"
        style={{ maxWidth: 1120, margin: '0 auto', padding: '14px 24px' }}
        aria-label="Primary"
      >
        <Link href="/" aria-label="Kova home">
          <KovaLogo size={32} />
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm">
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
