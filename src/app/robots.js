const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Keep private surfaces and APIs out of search results
        disallow: ['/api/', '/dashboard', '/driver', '/admin', '/wallet', '/rides', '/profile'],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
