'use client';

import { LayoutDashboard, Route, Car, Users, DollarSign, Inbox } from 'lucide-react';
import Providers from '@/components/providers';
import AppShell from '@/components/shell/AppShell';

const NAV = [
  { href: '/admin/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/rides', label: 'Rides', icon: Route },
  { href: '/admin/drivers', label: 'Drivers', icon: Car },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/admin/support', label: 'Support', icon: Inbox },
];

export default function AdminLayout({ children }) {
  return (
    <Providers>
      <AppShell nav={NAV}>{children}</AppShell>
    </Providers>
  );
}
