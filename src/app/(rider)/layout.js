'use client';

import { Navigation, Clock, Wallet, UserRound } from 'lucide-react';
import Providers from '@/components/providers';
import AppShell from '@/components/shell/AppShell';

const NAV = [
  { href: '/dashboard', label: 'Ride', icon: Navigation },
  { href: '/rides', label: 'My rides', icon: Clock },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/profile', label: 'Profile', icon: UserRound },
];

export default function RiderLayout({ children }) {
  return (
    <Providers>
      <AppShell nav={NAV}>{children}</AppShell>
    </Providers>
  );
}
