import crypto from 'crypto';
import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';
import Ride, { ACTIVE_STATUSES } from '@/lib/db/models/Ride';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import Payment from '@/lib/db/models/Payment';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import { calculateFare } from './fare-calculator';
import { getRoute } from './routing';
import { estimateDriverETA } from './ride-matcher';
import { haversineDistance } from '@/lib/utils/geo';
import {
  startDispatch,
  signalDispatch,
  verifyOfferHolder,
  clearOffer,
} from '@/lib/realtime/dispatch';
import {
  emitToRider,
  emitToDriver,
  emitToRide,
  emitToAdmin,
  joinRiderToRide,
  joinDriverToRide,
  leaveRideRoom,
} from '@/lib/realtime/emit';

/** Fee charged when a rider cancels after the driver has already arrived. */
const LATE_CANCEL_FEE = 3.0;

class RideError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export { RideError };

const round2 = (n) => Math.round(n * 100) / 100;

/** Redis set of user ids allowed in a ride's socket room. */
async function addRideMember(rideId, userId) {
  try {
    await redis.sadd(`ride:members:${rideId}`, String(userId));
    await redis.expire(`ride:members:${rideId}`, 24 * 3600);
  } catch {
    /* server.js fails open when Redis is down */
  }
}

async function clearRideMembers(rideId) {
  try {
    await redis.del(`ride:members:${rideId}`);
  } catch {
    /* ignore */
  }
}

function point(lat, lng) {
  return { type: 'Point', coordinates: [lng, lat] };
}

function coordsToLatLng(location) {
  return { lat: location.coordinates[1], lng: location.coordinates[0] };
}

/** Public shape of a ride for API responses & socket payloads. */
export function serializeRide(ride, { driver, driverUser } = {}) {
  const r = ride.toObject ? ride.toObject({ virtuals: false }) : ride;
  return {
    id: String(r._id),
    status: r.status,
    pickup: { address: r.pickup.address, ...coordsToLatLng(r.pickup.location) },
    dropoff: { address: r.dropoff.address, ...coordsToLatLng(r.dropoff.location) },
    route: {
      distanceMeters: r.route.distanceMeters,
      durationSeconds: r.route.durationSeconds,
      geometry: r.route.geometry || null,
    },
    vehicleType: r.vehicleType,
    fare: r.fare,
    payment: r.payment,
    pin: r.pin,
    rating: r.rating,
    messages: r.messages || [],
    timeline: r.timeline || [],
    cancelledBy: r.cancelledBy,
    cancellationReason: r.cancellationReason,
    riderId: String(r.riderId),
    driverId: r.driverId ? String(r.driverId) : null,
    driver: driver
      ? {
          profileId: String(driver._id),
          name: driverUser?.name || '',
          avatar: driverUser?.avatar || '',
          rating: driver.stats?.averageRating ?? 5,
          totalTrips: driver.stats?.totalTrips ?? 0,
          vehicle: driver.vehicle,
          location: driver.location ? coordsToLatLng(driver.location) : null,
        }
      : undefined,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    createdAt: r.createdAt,
  };
}

/** Load a ride's driver + user docs for payload composition. */
async function loadDriverBundle(ride) {
  if (!ride.driverProfileId) return {};
  const [driver, driverUser] = await Promise.all([
    Driver.findById(ride.driverProfileId).lean(),
    User.findById(ride.driverId).lean(),
  ]);
  return { driver, driverUser };
}

// ─── Create & dispatch ────────────────────────────────────────────────────────

export async function createRide({ riderId, pickup, dropoff, vehicleType }) {
  await connectDB();

  // One live ride per rider
  const existing = await Ride.findOne({ riderId, status: { $in: ACTIVE_STATUSES } });
  if (existing) {
    throw new RideError('You already have a ride in progress', 409);
  }

  const route = await getRoute(pickup, dropoff);
  if (route.distanceMeters < 100) {
    throw new RideError('Pickup and destination are too close together');
  }
  if (route.distanceMeters > 200000) {
    throw new RideError('This trip is too long to book (200 km max)');
  }

  const fare = await calculateFare({
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    vehicleType,
    pickup,
  });

  const rider = await User.findById(riderId).select('wallet').lean();
  const balance = rider?.wallet?.balance ?? 0;

  // An outstanding balance (unpaid cancellation fee, or a fare that couldn't
  // be covered) must be cleared before booking again.
  if (balance < 0) {
    throw new RideError(
      `You have an outstanding balance of ${Math.abs(balance).toFixed(2)} — top up your wallet to book again`,
      402
    );
  }

  if (balance < fare.total) {
    throw new RideError(
      'Insufficient wallet balance — add funds to book this ride',
      402
    );
  }

  const pin = String(crypto.randomInt(1000, 10000));

  const ride = await Ride.create({
    riderId,
    status: 'searching',
    pickup: { address: pickup.address, location: point(pickup.lat, pickup.lng) },
    dropoff: { address: dropoff.address, location: point(dropoff.lat, dropoff.lng) },
    route: {
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      geometry: route.geometry || undefined,
    },
    vehicleType,
    fare,
    payment: { method: 'wallet', status: 'pending' },
    pin,
    timeline: [
      { status: 'searching', timestamp: new Date(), location: point(pickup.lat, pickup.lng) },
    ],
  });

  await addRideMember(String(ride._id), riderId);
  joinRiderToRide(String(riderId), String(ride._id));
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'searching' });

  // Fire the offer cascade — deliberately not awaited
  startDispatch(String(ride._id));

  return ride;
}

// ─── Driver accept / decline ──────────────────────────────────────────────────

export async function acceptRide({ rideId, driverUserId }) {
  await connectDB();

  const driver = await Driver.findOne({ userId: driverUserId });
  if (!driver) throw new RideError('Driver profile not found', 404);
  if (!driver.isApproved) throw new RideError('Your driver account is not approved yet', 403);

  const holdsOffer = await verifyOfferHolder(rideId, driver._id);
  if (!holdsOffer) {
    throw new RideError('This request was already taken or expired', 409);
  }

  // Claim the driver first (prevents accepting two rides at once)
  const claimedDriver = await Driver.findOneAndUpdate(
    { _id: driver._id, currentRideId: null },
    { currentRideId: rideId },
    { new: true }
  );
  if (!claimedDriver) throw new RideError('You already have an active ride', 409);

  // Atomically claim the ride
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, status: 'searching' },
    {
      status: 'accepted',
      driverId: driverUserId,
      driverProfileId: driver._id,
      $push: {
        timeline: {
          status: 'accepted',
          timestamp: new Date(),
          location: claimedDriver.location,
        },
      },
    },
    { new: true }
  );

  if (!ride) {
    // Lost the race or the ride was cancelled — release the driver
    await Driver.updateOne(
      { _id: driver._id, currentRideId: rideId },
      { currentRideId: null }
    );
    throw new RideError('This request was already taken or cancelled', 409);
  }

  await clearOffer(rideId);
  signalDispatch(rideId, 'accepted');

  // Update acceptance stats
  const total = (claimedDriver.stats.totalOffers || 0) + 1;
  const acceptedCount = (claimedDriver.stats.acceptedOffers || 0) + 1;
  await Driver.updateOne(
    { _id: driver._id },
    {
      'stats.totalOffers': total,
      'stats.acceptedOffers': acceptedCount,
      'stats.acceptanceRate': Math.round((acceptedCount / total) * 100),
    }
  );

  const driverUser = await User.findById(driverUserId).lean();
  const pickup = coordsToLatLng(ride.pickup.location);
  const driverLoc = claimedDriver.location ? coordsToLatLng(claimedDriver.location) : null;
  const etaMinutes = driverLoc
    ? estimateDriverETA(
        haversineDistance(driverLoc.lat, driverLoc.lng, pickup.lat, pickup.lng) * 1000
      )
    : 5;

  await addRideMember(String(ride._id), driverUserId);
  joinDriverToRide(String(driverUserId), String(ride._id));

  emitToRider(String(ride.riderId), 'ride:accepted', {
    ride: serializeRide(ride, { driver: claimedDriver, driverUser }),
    etaMinutes,
  });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'accepted' });

  return { ride, driver: claimedDriver, driverUser, etaMinutes };
}

export async function declineOffer({ rideId, driverUserId }) {
  await connectDB();
  const driver = await Driver.findOne({ userId: driverUserId }).select('_id').lean();
  if (!driver) throw new RideError('Driver profile not found', 404);

  signalDispatch(rideId, 'declined', { driverProfileId: String(driver._id) });
  return { ok: true };
}

// ─── Trip progression ─────────────────────────────────────────────────────────

async function transition({ rideId, driverUserId, from, to, extra = {}, note }) {
  const ride = await Ride.findOneAndUpdate(
    { _id: rideId, driverId: driverUserId, status: from },
    {
      status: to,
      ...extra,
      $push: { timeline: { status: to, timestamp: new Date(), note } },
    },
    { new: true }
  );
  if (!ride) {
    throw new RideError(`Cannot move ride to "${to}" — check the current status`, 409);
  }
  return ride;
}

export async function driverArrived({ rideId, driverUserId }) {
  await connectDB();
  const ride = await transition({
    rideId,
    driverUserId,
    from: 'accepted',
    to: 'arrived',
    extra: { 'pickup.arrivedAt': new Date() },
  });

  emitToRide(rideId, 'ride:driver-arrived', { rideId: String(ride._id) });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'arrived' });
  return ride;
}

export async function startRide({ rideId, driverUserId, pin }) {
  await connectDB();

  const current = await Ride.findOne({ _id: rideId, driverId: driverUserId })
    .select('pin status')
    .lean();
  if (!current) throw new RideError('Ride not found', 404);
  if (current.status !== 'arrived') {
    throw new RideError('You must arrive at the pickup before starting the trip', 409);
  }
  if (current.pin && String(pin || '') !== current.pin) {
    throw new RideError('Incorrect PIN — ask the rider for their 4-digit code', 400);
  }

  const ride = await transition({
    rideId,
    driverUserId,
    from: 'arrived',
    to: 'in_progress',
    extra: { startedAt: new Date() },
  });

  emitToRide(rideId, 'ride:started', {
    rideId: String(ride._id),
    startedAt: ride.startedAt,
  });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'in_progress' });
  return ride;
}

export async function completeRide({ rideId, driverUserId }) {
  await connectDB();

  const ride = await transition({
    rideId,
    driverUserId,
    from: 'in_progress',
    to: 'completed',
    extra: { completedAt: new Date() },
  });

  // Actual trip duration (distance stays the quoted route)
  ride.route.actualDurationSeconds = Math.round(
    (ride.completedAt - ride.startedAt) / 1000
  );

  // ── Settle payment ──────────────────────────────────────────────
  const total = ride.fare.total;
  const driverEarnings = ride.fare.driverEarnings;

  // Charge the rider's wallet. The balance is allowed to go negative if it
  // dropped since booking — the trip happened, so the fare is owed and they
  // must settle before booking again (enforced in createRide).
  const rider = await User.findByIdAndUpdate(
    ride.riderId,
    { $inc: { 'wallet.balance': -total } },
    { new: true }
  );
  const shortfall = rider ? rider.wallet.balance < 0 : false;

  if (rider) {
    await WalletTransaction.create({
      userId: ride.riderId,
      type: 'ride_payment',
      amount: -total,
      balanceAfter: rider.wallet.balance,
      rideId: ride._id,
      note: `Ride to ${ride.dropoff.address}`.slice(0, 200),
    });
  }

  // Credit the driver their share regardless — they did the work, and any
  // rider shortfall is a platform receivable, not the driver's problem.
  const driverUser = await User.findByIdAndUpdate(
    ride.driverId,
    { $inc: { 'wallet.balance': driverEarnings } },
    { new: true }
  );
  if (driverUser) {
    await WalletTransaction.create({
      userId: ride.driverId,
      type: 'ride_earning',
      amount: driverEarnings,
      balanceAfter: driverUser.wallet.balance,
      rideId: ride._id,
      note: `Trip earnings`,
    });
  }

  ride.payment.status = 'captured';
  await ride.save();

  await Payment.create({
    rideId: ride._id,
    riderId: ride.riderId,
    driverId: ride.driverId,
    amount: total,
    currency: ride.fare.currency?.toLowerCase() || 'usd',
    platformFee: ride.fare.platformFee,
    driverPayout: driverEarnings,
    status: 'succeeded',
    method: 'wallet',
  });

  // ── Free the driver & update stats ──────────────────────────────
  await Driver.updateOne(
    { _id: ride.driverProfileId },
    {
      currentRideId: null,
      $inc: {
        'stats.totalTrips': 1,
        'stats.totalEarnings': driverEarnings,
      },
    }
  );

  emitToRide(rideId, 'ride:completed', {
    rideId: String(ride._id),
    fare: ride.fare,
    payment: ride.payment,
    completedAt: ride.completedAt,
    // The wallet went negative — the rider must settle before booking again
    shortfall,
  });
  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'completed' });

  leaveRideRoom('/rider', String(ride.riderId), String(ride._id));
  leaveRideRoom('/driver', String(ride.driverId), String(ride._id));
  await clearRideMembers(String(ride._id));

  return ride;
}

// ─── Cancellation ─────────────────────────────────────────────────────────────

export async function cancelRide({ rideId, userId, role, reason }) {
  await connectDB();

  const match =
    role === 'rider'
      ? { _id: rideId, riderId: userId, status: { $in: ['searching', 'accepted', 'arrived'] } }
      : { _id: rideId, driverId: userId, status: { $in: ['accepted', 'arrived'] } };

  const ride = await Ride.findOne(match);
  if (!ride) {
    throw new RideError('This ride can no longer be cancelled', 409);
  }

  const hadDriver = Boolean(ride.driverProfileId);

  if (role === 'driver') {
    // Driver bails — free them, penalize, and put the ride back in dispatch
    await Driver.updateOne(
      { _id: ride.driverProfileId, currentRideId: ride._id },
      { currentRideId: null, $inc: { 'stats.cancellationRate': 1 } }
    );

    ride.dispatch.declinedBy.push(ride.driverProfileId);
    ride.status = 'searching';
    ride.driverId = null;
    ride.driverProfileId = null;
    ride.timeline.push({
      status: 'searching',
      timestamp: new Date(),
      note: `Driver cancelled${reason ? `: ${reason}` : ''} — finding a new driver`,
    });
    await ride.save();

    try {
      await redis.srem(`ride:members:${ride._id}`, String(userId));
    } catch {
      /* ignore */
    }

    emitToRider(String(ride.riderId), 'ride:driver-cancelled', {
      rideId: String(ride._id),
      reason: reason || '',
    });
    emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'searching' });

    startDispatch(String(ride._id));
    return ride;
  }

  // Rider cancel
  signalDispatch(String(ride._id), 'cancelled');

  let cancellationFee = 0;
  if (ride.status === 'arrived') {
    cancellationFee = LATE_CANCEL_FEE;
  }

  ride.status = 'cancelled';
  ride.cancelledBy = 'rider';
  ride.cancellationReason = reason || '';
  ride.fare.cancellationFee = cancellationFee;
  ride.payment.status = cancellationFee > 0 ? 'captured' : 'waived';
  ride.timeline.push({
    status: 'cancelled',
    timestamp: new Date(),
    note: reason || 'Cancelled by rider',
  });
  await ride.save();

  // Charge the late-cancel fee. The balance may go negative — the rider must
  // clear it before booking again, so the fee is always collectable and the
  // driver is always compensated.
  if (cancellationFee > 0) {
    const rider = await User.findByIdAndUpdate(
      ride.riderId,
      { $inc: { 'wallet.balance': -cancellationFee } },
      { new: true }
    );
    if (rider) {
      await WalletTransaction.create({
        userId: ride.riderId,
        type: 'cancellation_fee',
        amount: -cancellationFee,
        balanceAfter: rider.wallet.balance,
        rideId: ride._id,
        note: 'Late cancellation fee',
      });
    }
    // Compensate the driver who already drove to the pickup
    if (hadDriver && ride.driverId) {
      const driverShare = round2(cancellationFee * 0.8);
      const driverUser = await User.findByIdAndUpdate(
        ride.driverId,
        { $inc: { 'wallet.balance': driverShare } },
        { new: true }
      );
      if (driverUser) {
        await WalletTransaction.create({
          userId: driverUser._id,
          type: 'ride_earning',
          amount: driverShare,
          balanceAfter: driverUser.wallet.balance,
          rideId: ride._id,
          note: 'Cancellation compensation',
        });
      }
    }
  }

  // Free the driver
  if (hadDriver) {
    await Driver.updateOne(
      { _id: ride.driverProfileId, currentRideId: ride._id },
      { currentRideId: null }
    );
    emitToDriver(String(ride.driverId), 'ride:cancelled', {
      rideId: String(ride._id),
      cancelledBy: 'rider',
      reason: reason || '',
      compensation: cancellationFee > 0 ? round2(cancellationFee * 0.8) : 0,
    });
    leaveRideRoom('/driver', String(ride.driverId), String(ride._id));
  }

  emitToAdmin('ride:updated', { rideId: String(ride._id), status: 'cancelled' });
  leaveRideRoom('/rider', String(ride.riderId), String(ride._id));
  await clearRideMembers(String(ride._id));

  return ride;
}

// ─── Rating ───────────────────────────────────────────────────────────────────

export async function rateRide({ rideId, userId, role, rating, comment }) {
  await connectDB();

  const match =
    role === 'rider'
      ? { _id: rideId, riderId: userId, status: 'completed' }
      : { _id: rideId, driverId: userId, status: 'completed' };

  const ride = await Ride.findOne(match);
  if (!ride) throw new RideError('Ride not found or not completed', 404);

  const field = role === 'rider' ? 'byRider' : 'byDriver';
  if (ride.rating?.[field]) throw new RideError('You already rated this ride', 409);

  ride.rating = ride.rating || {};
  ride.rating[field] = rating;
  if (comment) {
    ride.rating[role === 'rider' ? 'riderComment' : 'driverComment'] = comment.slice(0, 500);
  }
  await ride.save();

  // Update the counterpart's aggregate rating
  const targetUserId = role === 'rider' ? ride.driverId : ride.riderId;
  if (targetUserId) {
    const target = await User.findById(targetUserId);
    if (target) {
      const count = (target.rating?.count || 0) + 1;
      const avg =
        ((target.rating?.average || 5) * (count - 1) + rating) / count;
      target.rating = { average: round2(avg), count };
      await target.save();

      if (role === 'rider') {
        await Driver.updateOne(
          { userId: targetUserId },
          { 'stats.averageRating': round2(avg) }
        );
      }
    }
  }

  return ride;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** The user's current live ride (for reconnect/resume), with driver info. */
export async function getActiveRide({ userId, role }) {
  await connectDB();

  const query =
    role === 'driver'
      ? { driverId: userId, status: { $in: ['accepted', 'arrived', 'in_progress'] } }
      : { riderId: userId, status: { $in: ACTIVE_STATUSES } };

  const ride = await Ride.findOne(query).sort({ createdAt: -1 });
  if (!ride) return null;

  const { driver, driverUser } = await loadDriverBundle(ride);
  return serializeRide(ride, { driver, driverUser });
}

/** Persisted chat message + realtime relay. */
export async function addRideMessage({ rideId, userId, role, text }) {
  await connectDB();

  const match =
    role === 'rider'
      ? { _id: rideId, riderId: userId }
      : { _id: rideId, driverId: userId };

  const ride = await Ride.findOneAndUpdate(
    { ...match, status: { $in: ['accepted', 'arrived', 'in_progress'] } },
    { $push: { messages: { from: role, text: text.slice(0, 500), at: new Date() } } },
    { new: true }
  );
  if (!ride) throw new RideError('No active ride to message', 404);

  const message = ride.messages[ride.messages.length - 1];
  emitToRide(rideId, 'ride:message', {
    rideId: String(ride._id),
    from: role,
    text: message.text,
    at: message.at,
  });

  return message;
}
