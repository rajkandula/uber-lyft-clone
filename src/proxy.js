import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/config';

// Routes that require authentication
const protectedRoutes = ['/dashboard', '/driver', '/admin', '/profile', '/wallet', '/rides'];
const authRoutes = ['/login', '/signup'];
const adminRoutes = ['/admin'];
const driverRoutes = ['/driver'];
const riderRoutes = ['/dashboard', '/rides', '/wallet'];

// ─── Per-IP limits on the unauthenticated auth and contact endpoints ────────
// POST only. Held in this process's memory, which is exact for Kova's single
// server process (see README: run exactly one instance). The contact route
// also keeps its own Redis counter as a second layer.
const RATE_LIMITS = {
  // Carrier NAT means real users share IPs — generous enough for people,
  // useless for a bot farm.
  '/api/auth/signup': { limit: 15, windowMs: 60 * 60 * 1000 },
  // Username + password sign-in (next-auth posts the credentials form here)
  '/api/auth/callback/credentials': { limit: 30, windowMs: 10 * 60 * 1000 },
  // Public, unauthenticated — the classic spam target.
  '/api/contact': { limit: 5, windowMs: 60 * 60 * 1000 },
};

const rateWindows = new Map();
let lastSweep = 0;

/** The caller's address as the platform forwards it; best effort. */
function clientIp(request) {
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded ? forwarded.split(',')[0].trim() : 'unknown';
}

/** A 429 response when this caller is over the limit, otherwise null. */
function rateLimit(request) {
  if (request.method !== 'POST') return null;
  const { pathname } = request.nextUrl;
  const rule = RATE_LIMITS[pathname];
  if (!rule) return null;

  const now = Date.now();
  if (now - lastSweep > 60_000) {
    lastSweep = now;
    for (const [key, w] of rateWindows) if (now > w.resetAt) rateWindows.delete(key);
  }

  const key = `${pathname}|${clientIp(request)}`;
  let w = rateWindows.get(key);
  if (!w || now > w.resetAt) {
    w = { n: 0, resetAt: now + rule.windowMs };
    rateWindows.set(key, w);
  }
  w.n++;
  if (w.n <= rule.limit) return null;

  const body = { error: 'Too many attempts — please wait a bit and try again.' };
  if (pathname === '/api/auth/callback/credentials') {
    // next-auth's client signIn() parses the error code out of `url`
    body.url = new URL('/login?error=TooManyRequests', request.url).href;
  }
  return NextResponse.json(body, {
    status: 429,
    headers: { 'Retry-After': String(Math.max(1, Math.ceil((w.resetAt - now) / 1000))) },
  });
}

export default async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    try {
      const limited = rateLimit(request);
      if (limited) return limited;
    } catch (err) {
      // Never let the limiter take the app down — allow the request.
      console.error('Rate limiter failed; allowing request:', err);
    }
    return NextResponse.next();
  }

  const session = await auth();

  // Check if user is trying to access a protected route
  const isProtected = protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  // Redirect unauthenticated users to login
  if (isProtected && !session) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (isAuthRoute && session) {
    const role = session.user?.role;
    if (role === 'admin') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    if (role === 'driver') {
      return NextResponse.redirect(new URL('/driver/dashboard', request.url));
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Role-based access control
  if (session) {
    const role = session.user?.role;

    // Admin routes - only admins
    if (adminRoutes.some((r) => pathname.startsWith(r)) && role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Driver routes - only drivers
    if (driverRoutes.some((r) => pathname.startsWith(r)) && role !== 'driver') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    // Rider routes - send drivers/admins to their own home
    if (riderRoutes.some((r) => pathname.startsWith(r)) && role !== 'rider') {
      if (role === 'driver') {
        return NextResponse.redirect(new URL('/driver/dashboard', request.url));
      }
      if (role === 'admin') {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url));
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/driver/:path*',
    '/admin/:path*',
    '/profile/:path*',
    '/wallet/:path*',
    '/rides/:path*',
    '/login',
    '/signup',
    // Rate limits only (see RATE_LIMITS)
    '/api/auth/signup',
    '/api/auth/callback/credentials',
    '/api/contact',
  ],
};
