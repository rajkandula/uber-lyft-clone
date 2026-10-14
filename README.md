# Kova — premium ride-hailing platform

A full-stack, realtime Uber-style platform: rider app, driver app and admin
console in one Next.js 16 codebase. No paid map APIs — maps, geocoding and
routing all run on free, keyless services.

Kova is open source under the [MIT licence](LICENSE) and listed on
[Nucleus](https://nucleus.harakumo.com/-/explore).

## Stack

| Layer | Tech |
| --- | --- |
| Web | Next.js 16 (App Router), React 19, vanilla CSS design system |
| Realtime | Socket.IO on a custom Node server (`server.js`), JWT-authenticated namespaces |
| Data | MongoDB (Mongoose), Redis (ioredis) |
| Spatial | Uber H3 hex index in Redis for driver lookup + surge pricing |
| Maps | MapLibre GL + CARTO/OSM raster tiles (no API key) |
| Geocoding | Photon (komoot) — search + reverse |
| Routing | OSRM public API with haversine fallback |
| Auth | NextAuth v5 credentials (username/password), bcrypt, JWT sessions |
| Payments | Stripe Checkout wallet top-ups, Stripe Connect Express driver payouts (optional) |
| Storage | Any S3-compatible bucket for presigned uploads (optional) |

## Quick start

```bash
npm install
cp .env.example .env.local   # set NEXTAUTH_SECRET (openssl rand -base64 32)
npm run db:up                # MongoDB + Redis via docker compose
npm run seed                 # admin, demo rider, 5 approved drivers, pricing
npm run dev                  # custom server: Next.js + Socket.IO on :3000
```

Demo accounts (password `kovademo1` for all): `admin`, `rider1`,
`driver1`…`driver5`. The seed password is public, so change it (and delete the
demo accounts) on any instance other people can reach.

### Demo a full ride without a second device

```bash
npm run sim:driver           # driver1 goes online and auto-runs trips
```

Then sign in as `rider1`, book a ride near Midtown Manhattan (where the demo
drivers are seeded), and watch the driver accept, arrive, verify your PIN,
drive the route and complete — live. Pass `[username] [lat] [lng]` to start the
simulated driver somewhere else.

## How a ride flows

1. **Estimate** — server computes the OSRM route and prices all 4 tiers
   (base + per-km + per-min, minimum fare, booking fee, H3 demand/supply
   surge capped by pricing rules).
2. **Book** — `POST /api/rides` validates wallet balance, stores the ride
   (`searching`), and fires the dispatch cascade.
3. **Dispatch** — the matcher (H3 Redis fast path → `$geoNear` fallback)
   scores candidates (distance/rating/acceptance/cancellations) and offers
   the ride to one driver at a time over sockets, 15 s each, Redis-locked
   against double-accepts. Exhausted cascade → `no_drivers`.
4. **Trip** — accept → arrive → PIN-verified start → complete. Every
   transition is an atomic, server-authoritative API call; sockets push the
   updates (status, live GPS, chat) to the other party and the admin feed.
5. **Settle** — wallet payments move rider → driver balances with a ledger
   (`WalletTransaction`), cash is recorded, driver stats update, both sides
   can rate. Drivers cash out their earnings to a bank account through Stripe
   Connect.

Disconnects are safe: active rides resume from `GET /api/rides/active`,
socket reconnects re-subscribe to the ride room, a sweeper re-dispatches
stuck rides after a restart, and driver positions expire from the H3 index
via TTL if a driver vanishes.

## Surfaces

- `/` marketing page · `/login` `/signup` (rider or driver) · `/contact`
  `/terms` `/privacy`
- **Rider** — `/dashboard` booking + live tracking, `/rides` history +
  receipts, `/wallet` top-ups + ledger, `/profile`
- **Driver** — `/driver/dashboard` go online + offers + trip flow,
  `/driver/earnings` (earnings + payouts), `/driver/wallet`, `/driver/trips`,
  `/driver/profile` (vehicle onboarding)
- **Admin** — `/admin/dashboard` KPIs + live fleet map, `/admin/rides`,
  `/admin/drivers` (approve/suspend), `/admin/users`, `/admin/pricing`,
  `/admin/support` (contact-form inbox)

Role-based routing is enforced in `src/proxy.js`; every API route re-checks
the session.

## Configuration

Everything is set through environment variables; `.env.example` lists and
explains each one.

- **Required:** `MONGODB_URI`, `REDIS_URL`, `NEXTAUTH_SECRET` (also signs the
  Socket.IO tokens), and `NEXT_PUBLIC_APP_URL` in production.
- **Stripe (optional):** `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` turn on
  card top-ups and driver payouts. Register `<your origin>/api/webhooks/stripe`
  for `checkout.session.completed` and `account.updated`. Without Stripe the
  wallet hands out **instant demo credits**, which is fine for a demo and
  wrong for real money.
- **Drivers:** `DRIVER_AUTO_APPROVE=false` makes an admin approve each new
  driver; anything else approves them instantly.
- **Storage (optional):** `STORAGE_*` points `/api/upload/presigned` at any
  S3-compatible bucket; until it is set that endpoint answers 503. Profile
  pictures are resized and stored in MongoDB, so they need no bucket.
- **Geo (optional):** `OSRM_URL` and `PHOTON_URL` replace the free public
  routing and geocoding instances, which have no SLA.

## Run Kova on Harakumo

Kova is a Node server (`server.js` runs Next.js and Socket.IO in one
process), so on Harakumo it runs as a **server app** (Pro plan and up), not a
static site.

1. **Create a project** at [harakumo.com/dashboard](https://harakumo.com/dashboard) → Projects → New project.
2. **Create an API key** under Settings → API keys (the CLI below signs in with it).
3. **Add the environment** (Project → Environment), from `.env.example`:
   - `MONGODB_URI` — a MongoDB database (include the database name in the
     path). **MongoDB is required for now**; bring your own.
   - `REDIS_URL` — a Redis instance. **Redis is required too**; bring your
     own. It only holds rebuildable state (driver index, dispatch locks, ride
     rooms, rate-limit counters), so it needs no persistence.
   - `NEXTAUTH_SECRET` — a long random string (`openssl rand -base64 32`).
   - `NEXT_PUBLIC_APP_URL` — your app's public origin. It is inlined at build
     time, so redeploy after changing it.
   - `DRIVER_AUTO_APPROVE=false` for a real launch.
   - Optional: the Stripe and `STORAGE_*` values described above.
4. **Deploy** from a folder with the CLI, or ask your AI assistant with the
   Harakumo connector:

   ```bash
   npm i -g @harakumo/cli
   harakumo login --key <your API key>
   harakumo deploy <project id> .
   ```

   Every deploy is saved as a commit in the project's private Nucleus repo.
   The app builds with `npm run build` and starts with `npm start`.
5. **Seed the first admin** once, from your machine, with `MONGODB_URI` set to
   the production database: `npm run seed`. Then sign in as `admin`, change
   the password, and delete the demo accounts from `/admin/users`.
6. **Check it:** `GET /api/health` returns 200 only when MongoDB and Redis are
   both reachable, and 503 naming the failing component otherwise.

Notes:

- **Run exactly one instance.** Socket.IO connections, the offer cascade and
  the dispatch sweeper live in the server process. To scale out you would add
  `@socket.io/redis-adapter`, move the offer cascade behind a Redis queue, and
  self-host OSRM and Photon.
- **HTTPS is required in production:** browsers only allow geolocation on
  secure origins, so drivers cannot go online over plain HTTP.
- **Realtime** tries WebSockets first and falls back to HTTP long-polling.
  A redeploy drops sockets for a moment; clients reconnect on their own and
  re-subscribe to their ride.
- **Your MongoDB and Redis must accept the server's connections:** allow its
  address range, and use credentials limited to this app.
- **Rate limits:** `src/proxy.js` limits POSTs per IP in server memory:
  sign-up 15/hour, sign-in 30 per 10 minutes, contact form 5/hour (the
  contact form also keeps its own 5/hour counter in Redis).
- **Any other Node host works too:** `npm run build && npm start`, or the
  `Dockerfile` (`docker build --build-arg NEXT_PUBLIC_APP_URL=https://your-domain.com -t kova .`).

### Before carrying real passengers

The code is the easy part. Ride-hailing is regulated almost everywhere: check
your local transportation-network-company (TNC) licensing and driver
background-check rules, commercial insurance for every trip, whether a
stored-value wallet needs a money-transmission licence where you operate, and
how your drivers are classified.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Custom server (Next.js dev + Socket.IO) on :3000 |
| `npm run build` | Production build |
| `npm start` | Custom server in production mode |
| `npm run seed` | Idempotent demo data (never overwrites existing accounts) |
| `npm run sim:driver [user] [lat] [lng]` | Hands-free driver bot |
| `npm run db:up` / `db:down` | Local MongoDB + Redis via docker compose |
| `npm run docker:build` / `docker:run` | Build and run the container image |
| `npm run lint` | ESLint |
