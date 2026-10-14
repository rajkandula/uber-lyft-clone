/**
 * Kova driver simulator — brings a seeded demo driver to life.
 *
 *   node scripts/simulate-driver.js [username] [lat] [lng]
 *   (defaults: driver1 at Midtown Manhattan)
 *
 * What it does:
 *   1. Signs in through NextAuth credentials (driver1 / kovademo1)
 *   2. Goes online at the given location
 *   3. Connects to the /driver socket and streams GPS pings
 *   4. Auto-accepts ride offers, drives to the pickup, marks arrival,
 *      starts the trip with the rider's PIN, glides along the route,
 *      and completes — a full hands-free trip loop.
 *
 * Run it next to `npm run dev`, then book a ride as rider1 in the browser.
 */

const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const USERNAME = process.argv[2] || 'driver1';
const PASSWORD = process.env.SIM_PASSWORD || 'kovademo1';
const START = {
  lat: parseFloat(process.argv[3] || '40.7484'),
  lng: parseFloat(process.argv[4] || '-73.9857'),
};

/** Simulated driving speed (m/s) — brisk city pace so demos stay snappy. */
const SPEED = 20;
const TICK_MS = 1000;

let cookie = '';
const jar = new Map();

function storeCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const [name, ...v] = pair.split('=');
    jar.set(name.trim(), v.join('='));
  }
  cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function api(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      cookie,
      ...(options.headers || {}),
    },
    redirect: 'manual',
  });
  storeCookies(res);
  return res;
}

async function login() {
  const csrfRes = await api('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();

  const res = await api('/api/auth/callback/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      csrfToken,
      username: USERNAME,
      password: PASSWORD,
    }).toString(),
  });

  if (res.status !== 302 && res.status !== 200) {
    throw new Error(`Login failed (${res.status}) — did you run npm run seed?`);
  }

  const check = await api('/api/users/me');
  if (!check.ok) throw new Error('Login failed — invalid credentials?');
  const { user } = await check.json();
  if (user.role !== 'driver') throw new Error(`${USERNAME} is not a driver`);
  console.log(`✓ Signed in as ${user.name} (@${user.username})`);
}

const dist = (a, b) => {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

async function main() {
  await login();

  const statusRes = await api('/api/drivers/me/status', {
    method: 'POST',
    body: JSON.stringify({ online: true, location: START }),
  });
  if (!statusRes.ok) {
    const err = await statusRes.json().catch(() => ({}));
    throw new Error(`Could not go online: ${err.error || statusRes.status}`);
  }
  console.log(`✓ Online at ${START.lat.toFixed(4)}, ${START.lng.toFixed(4)}`);

  const tokenRes = await api('/api/auth/socket-token');
  const { token } = await tokenRes.json();

  const socket = io(`${BASE}/driver`, { auth: { token }, transports: ['websocket'] });

  let pos = { ...START };
  let activeRide = null;
  let legPath = null; // array of {lat,lng} to glide along
  let legIndex = 0;
  let legPhase = null; // 'to-pickup' | 'on-trip'

  const ping = () =>
    socket.emit('driver:location', { ...pos, rideId: activeRide?.id });

  socket.on('connect', () => {
    console.log('✓ Socket connected — waiting for ride requests…');
    ping();
  });
  socket.on('connect_error', (err) => console.error('Socket error:', err.message));

  socket.on('ride:offer', async (offer) => {
    if (activeRide) return;
    console.log(`\n🔔 Offer ${offer.rideId}: ${offer.pickup.address} → ${offer.dropoff.address} ($${offer.earnings})`);
    await new Promise((r) => setTimeout(r, 1500)); // pretend to read it

    const res = await api(`/api/rides/${offer.rideId}/accept`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.log(`  ✗ Accept failed: ${err.error}`);
      return;
    }
    const { ride } = await res.json();
    activeRide = ride;
    socket.emit('ride:subscribe', { rideId: ride.id });
    console.log('  ✓ Accepted — driving to pickup');

    legPath = buildPath(pos, { lat: ride.pickup.lat, lng: ride.pickup.lng });
    legIndex = 0;
    legPhase = 'to-pickup';
  });

  socket.on('ride:cancelled', (data) => {
    if (activeRide?.id === data.rideId) {
      console.log('  ✗ Rider cancelled the trip');
      activeRide = null;
      legPath = null;
      legPhase = null;
    }
  });

  socket.on('ride:message', (data) => {
    if (data.from === 'rider') console.log(`  💬 Rider: ${data.text}`);
  });

  function buildPath(from, to, stepMeters = SPEED) {
    const total = dist(from, to);
    const steps = Math.max(2, Math.ceil(total / stepMeters));
    const out = [];
    for (let i = 1; i <= steps; i++) {
      out.push({
        lat: from.lat + ((to.lat - from.lat) * i) / steps,
        lng: from.lng + ((to.lng - from.lng) * i) / steps,
      });
    }
    return out;
  }

  function routeToPath(geometry) {
    if (!geometry?.length) return null;
    const points = geometry.map(([lng, lat]) => ({ lat, lng }));
    // Densify long segments so movement stays smooth
    const out = [];
    for (let i = 1; i < points.length; i++) {
      const seg = buildPath(points[i - 1], points[i]);
      out.push(...seg);
    }
    return out;
  }

  setInterval(async () => {
    if (legPath && legIndex < legPath.length) {
      pos = legPath[legIndex++];
      ping();
      return;
    }

    if (legPath && legIndex >= legPath.length) {
      // Leg finished
      if (legPhase === 'to-pickup' && activeRide) {
        legPath = null;
        console.log('  ✓ Arrived at pickup');
        await api(`/api/rides/${activeRide.id}/arrive`, { method: 'POST' });

        // Read the PIN (drivers see it via ride detail) and start after a pause
        await new Promise((r) => setTimeout(r, 4000));
        const detail = await api(`/api/rides/${activeRide.id}`);
        const { ride } = await detail.json();
        const startRes = await api(`/api/rides/${activeRide.id}/start`, {
          method: 'POST',
          body: JSON.stringify({ pin: ride.pin }),
        });
        if (startRes.ok) {
          console.log('  ✓ Trip started — heading to destination');
          legPath =
            routeToPath(ride.route?.geometry) ||
            buildPath(pos, { lat: ride.dropoff.lat, lng: ride.dropoff.lng });
          legIndex = 0;
          legPhase = 'on-trip';
        } else {
          const err = await startRes.json().catch(() => ({}));
          console.log(`  ✗ Start failed: ${err.error}`);
        }
        return;
      }

      if (legPhase === 'on-trip' && activeRide) {
        legPath = null;
        const res = await api(`/api/rides/${activeRide.id}/complete`, { method: 'POST' });
        if (res.ok) {
          const { ride } = await res.json();
          console.log(`  ✓ Trip complete — earned $${ride.fare.driverEarnings}\n`);
        }
        activeRide = null;
        legPhase = null;
        ping();
        return;
      }
    }

    ping(); // idle heartbeat keeps the H3 index warm
  }, TICK_MS);

  process.on('SIGINT', async () => {
    console.log('\nGoing offline…');
    socket.emit('driver:offline');
    await api('/api/drivers/me/status', {
      method: 'POST',
      body: JSON.stringify({ online: false }),
    }).catch(() => {});
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
