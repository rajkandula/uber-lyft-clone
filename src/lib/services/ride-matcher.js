import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import Driver from '@/lib/db/models/Driver';
import { findNearbyDriversH3, recordDemand } from './h3-redis';

/**
 * Find and match the best driver for a ride request.
 *
 * Two-phase approach:
 *   Phase 1 — H3 fast filter (Redis): gridDisk → SUNION → candidate IDs in <1ms
 *   Phase 2 — MongoDB refine: fetch candidates by _id, apply scoring algorithm
 *
 * Falls back to the original $geoNear full-scan if Redis is cold or returns
 * no results (e.g. first deploy, Redis restart).
 *
 * @param {Object} params
 * @param {Object} params.pickup - { lat, lng }
 * @param {string} params.vehicleType
 * @param {number} params.maxRadiusKm - Maximum search radius in km
 * @param {string[]} params.excludeDriverIds - IDs to exclude
 * @returns {Object|null} Best matched driver or null
 */
export async function findBestDriver({
  pickup,
  vehicleType = 'economy',
  maxRadiusKm = 10,
  excludeDriverIds = [],
}) {
  await connectDB();

  // Record demand for surge pricing
  try {
    await recordDemand(pickup.lat, pickup.lng);
  } catch {
    // Non-critical — don't block ride matching
  }

  // ─── Phase 1: H3 Fast Path (Redis) ─────────────────────────────────────────
  try {
    const maxK = Math.max(1, Math.min(10, Math.ceil(maxRadiusKm / 0.5)));

    const { drivers: candidateIds, k } = await findNearbyDriversH3(
      pickup.lat,
      pickup.lng,
      {
        minDrivers: 3, // Find at least 3 candidates to score
        maxK,
        excludeIds: excludeDriverIds.map(String),
      }
    );

    if (candidateIds.length > 0) {
      // Phase 2: MongoDB — fetch & score only these candidates
      const objectIds = candidateIds.map((id) => new mongoose.Types.ObjectId(id));
      const drivers = await Driver.aggregate([
        {
          $match: {
            _id: { $in: objectIds },
            isOnline: true,
            isApproved: true,
            currentRideId: null,
            'vehicle.type': vehicleType,
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          // Calculate distance from pickup to each candidate
          $addFields: {
            distance: {
              $multiply: [
                {
                  $sqrt: {
                    $add: [
                      { $pow: [{ $subtract: [{ $arrayElemAt: ['$location.coordinates', 1] }, pickup.lat] }, 2] },
                      { $pow: [{ $subtract: [{ $arrayElemAt: ['$location.coordinates', 0] }, pickup.lng] }, 2] },
                    ],
                  },
                },
                111320, // degrees → meters (approximate)
              ],
            },
          },
        },
        {
          $addFields: {
            // Same scoring: distance (40%), rating (25%), acceptance (20%), cancellation (15%)
            matchScore: {
              $add: [
                { $multiply: [{ $subtract: [1, { $min: [{ $divide: ['$distance', maxRadiusKm * 1000] }, 1] }] }, 40] },
                { $multiply: [{ $divide: [{ $ifNull: ['$stats.averageRating', 5] }, 5] }, 25] },
                { $multiply: [{ $divide: [{ $ifNull: ['$stats.acceptanceRate', 100] }, 100] }, 20] },
                { $multiply: [{ $subtract: [1, { $divide: [{ $ifNull: ['$stats.cancellationRate', 0] }, 100] }] }, 15] },
              ],
            },
          },
        },
        { $sort: { matchScore: -1 } },
        { $limit: 5 },
      ]);

      if (drivers.length > 0) {
        console.log(`[RideMatcher] H3 fast path: found ${drivers.length} candidates at k=${k}`);
        return drivers[0];
      }
    }
  } catch (err) {
    console.warn('[RideMatcher] H3 fast path failed, falling back to $geoNear:', err.message);
  }

  // ─── Fallback: Original $geoNear (MongoDB full scan) ──────────────────────
  return findBestDriverGeoNear({ pickup, vehicleType, maxRadiusKm, excludeDriverIds });
}

/**
 * Original $geoNear-based driver matching.
 * Used as fallback when Redis/H3 index is unavailable.
 */
async function findBestDriverGeoNear({
  pickup,
  vehicleType = 'economy',
  maxRadiusKm = 10,
  excludeDriverIds = [],
}) {
  // Try expanding radius: 2km → 5km → maxRadiusKm
  const radiusTiers = [2000, 5000, maxRadiusKm * 1000];
  const excludeObjectIds = excludeDriverIds.map((id) =>
    typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
  );

  for (const radiusMeters of radiusTiers) {
    const drivers = await Driver.aggregate([
      {
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [pickup.lng, pickup.lat],
          },
          distanceField: 'distance',
          maxDistance: radiusMeters,
          query: {
            isOnline: true,
            isApproved: true,
            currentRideId: null,
            'vehicle.type': vehicleType,
            _id: { $nin: excludeObjectIds },
          },
          spherical: true,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $addFields: {
          // Score: distance (40%), rating (25%), acceptance (20%), lower cancelation (15%)
          matchScore: {
            $add: [
              // Closer = higher score (invert distance, normalize)
              { $multiply: [{ $subtract: [1, { $divide: ['$distance', radiusMeters] }] }, 40] },
              // Higher rating = higher score
              { $multiply: [{ $divide: ['$stats.averageRating', 5] }, 25] },
              // Higher acceptance rate = higher score
              { $multiply: [{ $divide: ['$stats.acceptanceRate', 100] }, 20] },
              // Lower cancellation rate = higher score
              { $multiply: [{ $subtract: [1, { $divide: ['$stats.cancellationRate', 100] }] }, 15] },
            ],
          },
        },
      },
      { $sort: { matchScore: -1 } },
      { $limit: 5 },
    ]);

    if (drivers.length > 0) {
      console.log(`[RideMatcher] $geoNear fallback: found ${drivers.length} at ${radiusMeters}m`);
      return drivers[0];
    }
  }

  return null;
}

/**
 * Find all nearby available drivers.
 * H3-first with $geoNear fallback.
 *
 * @param {Object} params
 * @param {Object} params.location - { lat, lng }
 * @param {number} params.radiusKm
 * @param {string} params.vehicleType - Optional filter
 * @param {number} params.limit
 * @returns {Array} List of nearby drivers with distance
 */
export async function findNearbyDrivers({
  location,
  radiusKm = 5,
  vehicleType,
  limit = 20,
}) {
  await connectDB();

  // ─── H3 Fast Path ──────────────────────────────────────────────────────────
  try {
    const maxK = Math.max(1, Math.min(10, Math.ceil(radiusKm / 0.5)));

    const { drivers: candidateIds } = await findNearbyDriversH3(
      location.lat,
      location.lng,
      { minDrivers: limit, maxK }
    );

    if (candidateIds.length > 0) {
      const query = {
        _id: { $in: candidateIds.map((id) => new mongoose.Types.ObjectId(id)) },
        isOnline: true,
        isApproved: true,
        currentRideId: null,
      };

      if (vehicleType) {
        query['vehicle.type'] = vehicleType;
      }

      const drivers = await Driver.aggregate([
        { $match: query },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $addFields: {
            distance: {
              $multiply: [
                {
                  $sqrt: {
                    $add: [
                      { $pow: [{ $subtract: [{ $arrayElemAt: ['$location.coordinates', 1] }, location.lat] }, 2] },
                      { $pow: [{ $subtract: [{ $arrayElemAt: ['$location.coordinates', 0] }, location.lng] }, 2] },
                    ],
                  },
                },
                111320,
              ],
            },
          },
        },
        {
          $project: {
            _id: 1,
            userId: 1,
            'user.name': 1,
            'user.avatar': 1,
            'user.rating': 1,
            vehicle: 1,
            location: 1,
            distance: 1,
            h3Cell: 1,
            'stats.totalTrips': 1,
            'stats.averageRating': 1,
          },
        },
        { $sort: { distance: 1 } },
        { $limit: limit },
      ]);

      if (drivers.length > 0) {
        return drivers;
      }
    }
  } catch (err) {
    console.warn('[RideMatcher] H3 findNearby failed, falling back:', err.message);
  }

  // ─── Fallback: $geoNear ────────────────────────────────────────────────────
  return findNearbyDriversGeoNear({ location, radiusKm, vehicleType, limit });
}

/**
 * Original $geoNear-based nearby driver search (fallback).
 */
async function findNearbyDriversGeoNear({
  location,
  radiusKm = 5,
  vehicleType,
  limit = 20,
}) {
  const query = {
    isOnline: true,
    isApproved: true,
    currentRideId: null,
  };

  if (vehicleType) {
    query['vehicle.type'] = vehicleType;
  }

  const drivers = await Driver.aggregate([
    {
      $geoNear: {
        near: {
          type: 'Point',
          coordinates: [location.lng, location.lat],
        },
        distanceField: 'distance',
        maxDistance: radiusKm * 1000,
        query,
        spherical: true,
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    {
      $project: {
        _id: 1,
        userId: 1,
        'user.name': 1,
        'user.avatar': 1,
        'user.rating': 1,
        vehicle: 1,
        location: 1,
        distance: 1,
        'stats.totalTrips': 1,
        'stats.averageRating': 1,
      },
    },
    { $sort: { distance: 1 } },
    { $limit: limit },
  ]);

  return drivers;
}

/**
 * Estimate ETA for a driver to reach a pickup point
 * @param {number} distanceMeters
 * @returns {number} Estimated time in minutes
 */
export function estimateDriverETA(distanceMeters) {
  // Assume average city speed of 25 km/h
  const avgSpeedKmH = 25;
  const distanceKm = distanceMeters / 1000;
  const timeHours = distanceKm / avgSpeedKmH;
  const timeMinutes = Math.ceil(timeHours * 60);
  return Math.max(timeMinutes, 1); // minimum 1 minute
}
