import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';
import Ride from '@/lib/db/models/Ride';
import Driver from '@/lib/db/models/Driver';
import { findBestDriver, estimateDriverETA } from '@/lib/services/ride-matcher';
import { emitToRider, emitToDriver, emitToAdmin, rideBus } from './emit';

/** Seconds a driver has to respond to an offer (client shows 15s). */
const OFFER_TIMEOUT_MS = 16000;
/** Redis TTL for the active offer claim. */
const OFFER_TTL_SECONDS = 25;
/** Give up after this many drivers have been offered the ride. */
const MAX_OFFERS = 8;

const offerKey = (rideId) => `ride:offer:${rideId}`;
const dispatchLockKey = (rideId) => `ride:dispatch:${rideId}`;

/**
 * Wait for an accept/decline/cancel signal for a ride, or time out.
 * Signals are published on the global ride bus by the API routes.
 */
function waitForSignal(rideId, timeoutMs) {
  const bus = rideBus();
  return new Promise((resolve) => {
    const event = `ride:${rideId}`;
    const timer = setTimeout(() => {
      bus.off(event, onSignal);
      resolve({ type: 'timeout' });
    }, timeoutMs);

    function onSignal(signal) {
      clearTimeout(timer);
      bus.off(event, onSignal);
      resolve(signal);
    }

    bus.on(event, onSignal);
  });
}

async function recordOfferOutcome(driverProfileId, accepted) {
  try {
    const driver = await Driver.findById(driverProfileId);
    if (!driver) return;
    const total = (driver.stats.totalOffers || 0) + 1;
    const acceptedCount = (driver.stats.acceptedOffers || 0) + (accepted ? 1 : 0);
    driver.stats.totalOffers = total;
    driver.stats.acceptedOffers = acceptedCount;
    driver.stats.acceptanceRate = Math.round((acceptedCount / total) * 100);
    await driver.save();
  } catch (err) {
    console.warn('[Dispatch] Failed to record offer outcome:', err.message);
  }
}

/**
 * Run the offer cascade for a ride. Fire-and-forget from the API route.
 *
 * One driver is offered the ride at a time; on decline/timeout the next
 * candidate is tried. A Redis lock prevents two dispatch loops for the
 * same ride (e.g. duplicate POST or sweeper overlap).
 */
export async function startDispatch(rideId) {
  await connectDB();

  // Prevent concurrent dispatch loops for the same ride
  try {
    const locked = await redis.set(dispatchLockKey(rideId), '1', 'EX', 300, 'NX');
    if (!locked) return;
  } catch {
    // Redis down — proceed without the lock rather than not dispatching
  }

  try {
    await runCascade(rideId);
  } catch (err) {
    console.error(`[Dispatch] Cascade failed for ride ${rideId}:`, err);
  } finally {
    try {
      await redis.del(dispatchLockKey(rideId));
    } catch {
      /* ignore */
    }
  }
}

async function runCascade(rideId) {
  const User = (await import('@/lib/db/models/User')).default;
  let riderInfo = null;

  for (let attempt = 0; attempt < MAX_OFFERS; attempt++) {
    const ride = await Ride.findById(rideId);
    if (!ride || ride.status !== 'searching') return; // accepted or cancelled

    if (!riderInfo) {
      const rider = await User.findById(ride.riderId).select('name rating').lean();
      riderInfo = {
        name: rider?.name || 'Rider',
        rating: rider?.rating?.average ?? 5,
      };
    }

    const pickup = {
      lat: ride.pickup.location.coordinates[1],
      lng: ride.pickup.location.coordinates[0],
    };

    const excludeIds = (ride.dispatch?.offeredTo || []).map(String);
    const candidate = await findBestDriver({
      pickup,
      vehicleType: ride.vehicleType,
      maxRadiusKm: 15,
      excludeDriverIds: excludeIds,
    });

    if (!candidate) {
      await failDispatch(ride, attempt);
      return;
    }

    const driverUserId = String(candidate.userId);
    const etaMinutes = estimateDriverETA(candidate.distance || 0);

    // Claim the offer in Redis so only this driver can accept right now
    try {
      await redis.set(offerKey(rideId), String(candidate._id), 'EX', OFFER_TTL_SECONDS);
    } catch {
      /* non-fatal */
    }

    ride.dispatch.offeredTo.push(candidate._id);
    ride.dispatch.offersSent = (ride.dispatch.offersSent || 0) + 1;
    await ride.save();

    emitToDriver(driverUserId, 'ride:offer', {
      rideId: String(ride._id),
      pickup: { address: ride.pickup.address, ...pickup },
      dropoff: {
        address: ride.dropoff.address,
        lat: ride.dropoff.location.coordinates[1],
        lng: ride.dropoff.location.coordinates[0],
      },
      vehicleType: ride.vehicleType,
      distanceMeters: ride.route.distanceMeters,
      durationSeconds: ride.route.durationSeconds,
      earnings: ride.fare.driverEarnings,
      surgeMultiplier: ride.fare.surgeMultiplier,
      distanceToPickupMeters: Math.round(candidate.distance || 0),
      etaMinutes,
      rider: riderInfo,
      expiresInSeconds: Math.round(OFFER_TIMEOUT_MS / 1000) - 1,
    });

    emitToRider(String(ride.riderId), 'ride:searching-update', {
      rideId: String(ride._id),
      offersSent: ride.dispatch.offersSent,
    });

    const signal = await waitForSignal(rideId, OFFER_TIMEOUT_MS);

    if (signal.type === 'accepted') {
      // Accept route already updated everything
      return;
    }

    if (signal.type === 'cancelled') {
      emitToDriver(driverUserId, 'ride:offer-withdrawn', { rideId: String(ride._id) });
      try {
        await redis.del(offerKey(rideId));
      } catch {
        /* ignore */
      }
      return;
    }

    // declined or timeout — clear claim, penalize acceptance, continue
    try {
      await redis.del(offerKey(rideId));
    } catch {
      /* ignore */
    }

    if (signal.type === 'timeout') {
      emitToDriver(driverUserId, 'ride:offer-expired', { rideId: String(ride._id) });
    }
    await recordOfferOutcome(candidate._id, false);

    if (signal.type === 'declined') {
      await Ride.updateOne(
        { _id: rideId },
        { $addToSet: { 'dispatch.declinedBy': candidate._id } }
      );
    }
  }

  const ride = await Ride.findById(rideId);
  if (ride && ride.status === 'searching') {
    await failDispatch(ride, MAX_OFFERS);
  }
}

async function failDispatch(ride, offersSent) {
  ride.status = 'no_drivers';
  ride.timeline.push({
    status: 'no_drivers',
    timestamp: new Date(),
    note: offersSent > 0 ? `No driver accepted (${offersSent} offered)` : 'No drivers nearby',
  });
  await ride.save();

  emitToRider(String(ride.riderId), 'ride:no-drivers', {
    rideId: String(ride._id),
    offersSent,
  });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'no_drivers' });
  console.log(`[Dispatch] Ride ${ride._id} failed — no drivers (${offersSent} offers)`);
}

/**
 * Check that the accepting driver holds the current offer.
 * When Redis is down we allow the accept (the ride status update is
 * atomic anyway, so double-accept is still impossible).
 */
export async function verifyOfferHolder(rideId, driverProfileId) {
  try {
    const holder = await redis.get(offerKey(rideId));
    if (holder == null) return true; // expired or Redis flushed — let atomic update decide
    return holder === String(driverProfileId);
  } catch {
    return true;
  }
}

/** Clear the offer claim (after accept). */
export async function clearOffer(rideId) {
  try {
    await redis.del(offerKey(rideId));
  } catch {
    /* ignore */
  }
}

/**
 * Signal the dispatch loop from API routes.
 * type: 'accepted' | 'declined' | 'cancelled'
 */
export function signalDispatch(rideId, type, payload = {}) {
  rideBus().emit(`ride:${rideId}`, { type, ...payload });
}

/**
 * Sweeper: re-dispatch rides stuck in `searching` (e.g. server restarted
 * mid-cascade). Started once per process from instrumentation.js.
 */
export function startDispatchSweeper() {
  if (global.__dispatchSweeper) return;
  global.__dispatchSweeper = setInterval(async () => {
    try {
      await connectDB();
      const cutoff = new Date(Date.now() - 90 * 1000);
      const stuck = await Ride.find({
        status: 'searching',
        updatedAt: { $lt: cutoff },
      })
        .select('_id')
        .limit(20)
        .lean();

      for (const ride of stuck) {
        console.log(`[Dispatch] Sweeper re-dispatching stuck ride ${ride._id}`);
        startDispatch(String(ride._id));
      }
    } catch (err) {
      console.warn('[Dispatch] Sweeper error:', err.message);
    }
  }, 60 * 1000);
}
