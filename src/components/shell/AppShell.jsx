'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';
import { KovaLogo } from '@/components/brand/KovaLogo';
import { Avatar } from '@/components/ui/bits';

/**
 * Authenticated app shell: sidebar on desktop, bottom tab bar on mobile.
 * @param {{nav: Array<{href:string,label:string,icon:any}>, children:any}} props
 */
export default function AppShell({ nav, children }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link href="/" aria-label="Kova home">
            <KovaLogo size={30} />
          </Link>
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link key={href} href={href} className={`nav-item ${active ? 'active' : ''}`}>
                <Icon size={19} strokeWidth={2} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <Avatar name={user?.name || ''} src={user?.avatar || ''} size="sm" />
            <div className="flex-1 truncate">
              <div className="small truncate" style={{ fontWeight: 600 }}>
                {user?.name || '—'}
              </div>
              <div className="tiny muted truncate">@{user?.username || ''}</div>
            </div>
            <button
              className="btn btn-ghost btn-icon"
              style={{ minHeight: 36, width: 36 }}
              onClick={() => signOut({ callbackUrl: '/' })}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
