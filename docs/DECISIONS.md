# Kova decisions

One entry per decision that can be seen in the code and README. The git
history starts at the open-source release on 2026-10-13, so earlier dates are
not known and every decision present in that release is dated to it. Each
entry gives the realistic options for that choice and the reason the code or
README gives for the one taken.

## 2026-10-13 · One process for pages, API and sockets

- **Decision:** Run Next.js and Socket.IO together in a custom Node server
  (`server.js`) and share the socket server with API routes through
  `global.io`.
- **Options:** `next start` plus a separate socket service; a hosted realtime
  service; one custom server.
- **Why:** API routes can emit ride events directly with no message broker,
  and there is one thing to build, deploy and monitor. The cost is that only
  one instance can run (README, "Run exactly one instance").

## 2026-10-13 · Socket.IO with one namespace per role

- **Decision:** Realtime over Socket.IO with `/rider`, `/driver` and `/admin`
  namespaces, each requiring a JWT whose role matches.
- **Options:** HTTP polling, server-sent events, raw WebSockets, Socket.IO.
- **Why:** Two-way traffic is needed (driver GPS in, offers and status out),
  Socket.IO reconnects by itself and falls back to long-polling, and rooms map
  cleanly to users and rides.

## 2026-10-13 · MongoDB with Mongoose for durable data

- **Decision:** Store users, drivers, rides, payments, ledger, pricing and
  support messages in MongoDB.
- **Options:** A relational database with a geo extension; MongoDB.
- **Why (inferred from how it is used):** Built-in 2dsphere indexes and
  `$geoNear` for driver search, and a ride fits one document with its timeline, chat and dispatch history
  embedded.

## 2026-10-13 · Redis only for state that can be rebuilt

- **Decision:** Keep driver positions, the H3 index, demand counts, offer and
  dispatch locks, ride-room membership and a contact-form counter in Redis,
  all with TTLs.
- **Options:** Keep everything in MongoDB; keep it in process memory; Redis.
- **Why:** These values change every few seconds and need fast set and lock
  operations. The README says Redis needs no persistence because nothing in
  it must survive a restart.

## 2026-10-13 · H3 hex index for finding drivers

- **Decision:** Index online drivers by H3 cell (resolution 9) in Redis sets
  and search outward ring by ring; fall back to MongoDB `$geoNear` when Redis
  has no candidates.
- **Options:** `$geoNear` on every request; a Redis GEO set; H3 cells.
- **Why:** Ring lookups are a few set reads, the same cells give a demand and
  supply ratio for surge, and the fallback keeps matching working when Redis
  is cold or down (`src/lib/services/ride-matcher.js`).

## 2026-10-13 · GPS pings go to Redis, MongoDB is updated in batches

- **Decision:** Socket GPS pings update Redis only; a background job flushes positions
  to MongoDB every 10 s with one bulk write.
- **Options:** Write every ping to MongoDB; Redis only; Redis plus batched
  flush.
- **Why:** Avoids a database write per ping while keeping the `$geoNear`
  fallback and admin views reasonably fresh
  (`src/lib/realtime/location-flusher.js`).

## 2026-10-13 · Offer rides to one driver at a time

- **Decision:** A dispatch cascade offers each ride to the best-scoring
  driver for 15 s, then the next, up to 8 offers, with a Redis key naming the
  current offer holder.
- **Options:** Broadcast to all nearby drivers and take the first accept;
  sequential offers.
- **Why (inferred from the code):** Each driver sees an exclusive offer with
  earnings and distance,
  only the holder can accept, and the score rewards rating and reliability as
  well as distance.

## 2026-10-13 · The server owns ride state

- **Decision:** Every ride transition is an API call that does an atomic,
  status-guarded update; sockets only announce what already happened.
- **Options:** Let clients change state over the socket; server-authoritative
  API.
- **Why:** Double accepts and out-of-order steps become 409 responses, and a
  client that drops its socket can resume from `GET /api/rides/active`.

## 2026-10-13 · Username and password sign-in with JWT sessions

- **Decision:** NextAuth v5 with one credentials provider, bcrypt hashes and
  30-day JWT sessions.
- **Options:** OAuth providers, email magic links, username and password.
- **Why (inferred, not recorded):** No outside identity provider or email
  service is needed to run the app, and email and phone stay optional on the
  profile.

## 2026-10-13 · A separate short-lived token for sockets

- **Decision:** `/api/auth/socket-token` issues a 12-hour JWT signed with the
  same secret, which `server.js` verifies on connect.
- **Options:** Read the session cookie in the socket handshake; a dedicated
  token.
- **Why:** `server.js` is plain CommonJS outside the Next.js bundle, so a
  small signed token is simpler to verify there, and it can carry the
  driver's profile id for the H3 index.

## 2026-10-13 · A prepaid wallet with a ledger

- **Decision:** New rides are paid only from the rider's wallet; every
  balance change writes a `wallettransactions` row with the balance after it.
  `cash` stays in the enums for older records.
- **Options:** Charge a card per ride; cash; a prepaid wallet.
- **Why (inferred from the code):** The fare is checked against the balance
  before booking and settled in one step at drop-off, and the ledger explains
  every balance.

## 2026-10-13 · Stripe Checkout for top-ups, demo credits without Stripe

- **Decision:** With `STRIPE_SECRET_KEY` set, top-ups go through Stripe
  Checkout and are credited idempotently by the webhook or the return page.
  Without it, the wallet grants instant demo credits, and that endpoint is
  refused once Stripe is configured.
- **Options:** Require Stripe to run at all; demo credits only; both, switched
  by configuration.
- **Why:** The app can be tried with no payment account, while a configured
  deployment cannot mint free balance (README, Configuration).

## 2026-10-13 · Stripe Connect Express for driver payouts

- **Decision:** Drivers onboard to Connect Express and cash out with Stripe
  transfers. The wallet is debited before the transfer and refunded if the
  transfer fails.
- **Options:** Manual payouts by an admin; Connect Express.
- **Why:** Stripe collects identity and bank details directly, and debiting
  first means a double click cannot pay twice (`src/lib/services/payouts.js`).

## 2026-10-13 · Driver-first pricing with a capped surge

- **Decision:** Fares are base plus per-km plus per-minute, with a minimum and
  a booking fee, priced from `pricingrules` or built-in defaults with an 8 to
  10 percent platform commission. Surge comes from H3 demand and supply and is
  capped per rule (default 3x).
- **Options:** Fixed fares; rules in the database; rules in code.
- **Why:** The code comment calls Kova driver-first: drivers keep about 90
  percent or more of each fare. Admins can change rules without a deploy, and
  the defaults keep pricing working on an empty database.

## 2026-10-13 · Free, keyless maps, geocoding and routing

- **Decision:** MapLibre GL with CARTO and OpenStreetMap raster tiles, Photon
  for place search, OSRM for routes, with `OSRM_URL` and `PHOTON_URL`
  overrides and a straight-line fallback for routing.
- **Options:** Paid map platforms with API keys; free public services.
- **Why:** The README's first promise is no paid map APIs and no keys. The
  public instances have no SLA, so the URLs can point at self-hosted ones.

## 2026-10-13 · Avatars in MongoDB, a bucket only when wanted

- **Decision:** Profile pictures are resized to a 256 px JPEG and stored on
  the user document; an S3-compatible bucket is optional and used only by the
  presigned upload endpoint.
- **Options:** Require object storage; store small images inline.
- **Why:** A 256 px JPEG is small enough to keep in MongoDB, so the app runs
  with zero storage configuration.

## 2026-10-13 · Driver approval is a switch

- **Decision:** New drivers are approved at once unless
  `DRIVER_AUTO_APPROVE=false`, in which case an admin approves them in
  `/admin/drivers`.
- **Options:** Always manual; always automatic; configurable.
- **Why:** Instant approval makes demos work; the README tells real launches
  to turn it off.

## 2026-10-13 · A PIN at pickup and a late-cancel fee

- **Decision:** Each ride gets a random 4-digit PIN the driver must enter to
  start. A rider who cancels after the driver has arrived pays 3.00, 80
  percent of which goes to the driver. A balance may go negative after a trip
  or fee, and booking is then blocked until a top-up.
- **Options:** No pickup check; PIN check. No fee; flat late fee.
- **Why:** The PIN confirms the right rider is in the car, and the fee pays a
  driver who drove to the pickup. Allowing a negative balance means the fare
  or fee is always recorded and the driver is always paid.

## 2026-10-13 · Rate limits in process memory

- **Decision:** `src/proxy.js` limits POSTs per IP on sign-up, sign-in and the
  contact form in memory; the contact route also counts in Redis.
- **Options:** Redis-only limits; an external limiter; in-memory limits.
- **Why:** With exactly one server process an in-memory counter is exact and
  has no dependency; the limiter fails open so it can never take the app down.

## 2026-10-13 · Open source under MIT

- **Decision:** Publish Kova under the MIT licence and list it on Nucleus.
- **Options:** Keep it private; a copyleft licence; MIT.
- **Why:** The README presents Kova as a complete ride-hailing platform that
  anyone can run on their own Node host, and lists it on Nucleus' explore
  page. MIT is a permissive licence; the reason for choosing it over others
  is not recorded.

## 2026-10-13 · No lock-in to a hosting provider

- **Decision:** Configure everything through environment variables, ship a
  `Dockerfile` and `docker-compose.yml`, accept any S3-compatible bucket, and
  let routing and geocoding point at any OSRM or Photon instance.
- **Options:** Build on one provider's managed services; stay portable.
- **Why:** The README says any Node host works (`npm run build && npm start`
  or the Docker image), and the only required services are MongoDB and Redis.

## 2026-10-13 · Security hardening in the published code

- **Decision:** The release ships with: security headers and no
  `X-Powered-By`; `no-store` on API responses; `.env*` and credential files
  ignored by git with only `.env.example` committed; demo top-ups disabled
  once Stripe is on; Checkout return credits limited to the caller's own
  session; a nearby-drivers payload without user ids or names; ride-room
  membership checks for sockets; a seed that never overwrites existing
  accounts and a README warning that the demo password is public.
- **Options:** Publish as is; harden first.
- **Why:** The repository is public and meant to be deployed by others.
  Because history starts at the release commit, it cannot be told which of
  these were fixes made before publishing and which were there from the
  start.

## 2026-10-14 · Project docs

- **Decision:** Add `docs/ARCHITECTURE.md`, `docs/SYSTEM-DESIGN.md`, this file
  and `docs/presentation.html`, written from the code, with the gaps listed
  plainly in SYSTEM-DESIGN.md.
- **Options:** README only; separate docs.
- **Why:** The README covers setup; these cover how the system works and why,
  in the four-document form Nucleus shows in every repo's Docs tab.
