import { DM_Sans } from 'next/font/google';
import './globals.css';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Kova — Ride with confidence',
    template: '%s · Kova',
  },
  description:
    'Premium ride-hailing where drivers keep 90%+ of every fare. Upfront pricing, live tracking and PIN-verified pickups.',
  applicationName: 'Kova',
  keywords: ['ride-hailing', 'taxi', 'rideshare', 'transportation', 'kova', 'kovaride'],
  authors: [{ name: 'Kova' }],
  openGraph: {
    title: 'Kova — Ride with confidence',
    description:
      'Drivers keep 90%+ of every fare. Upfront pricing, live tracking, PIN-verified pickups.',
    siteName: 'Kova',
    url: BASE_URL,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kova — Ride with confidence',
    description: 'Drivers keep 90%+ of every fare. Upfront pricing, live tracking.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport = {
  themeColor: '#0C0A09',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  );
}
