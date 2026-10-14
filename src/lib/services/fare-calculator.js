import connectDB from '@/lib/db/mongodb';
import PricingRule from '@/lib/db/models/PricingRule';
import { calculateSurgeForLocation } from './h3-redis';

/**
 * Default pricing rules (fallback if none exist in DB).
 *
 * Kova is driver-first: the platform keeps a small single-digit commission
 * (just enough to run the service), drivers keep ~90%+ of every fare, and
 * base rates are kept below big-app pricing so rides stay affordable.
 */
const DEFAULT_PRICING = {
  economy: {
    baseFare: 2.0,
    perKmRate: 1.0,
    perMinRate: 0.15,
    minimumFare: 4.0,
    bookingFee: 0.5,
    platformCommission: 8,
  },
  comfort: {
    baseFare: 3.0,
    perKmRate: 1.5,
    perMinRate: 0.25,
    minimumFare: 6.5,
    bookingFee: 0.75,
    platformCommission: 8,
  },
  premium: {
    baseFare: 5.0,
    perKmRate: 2.5,
    perMinRate: 0.4,
    minimumFare: 12.0,
    bookingFee: 1.0,
    platformCommission: 10,
  },
  xl: {
    baseFare: 4.0,
    perKmRate: 1.8,
    perMinRate: 0.3,
    minimumFare: 8.0,
    bookingFee: 0.75,
    platformCommission: 8,
  },
};

/**
 * Calculate fare for a ride.
 *
 * If no surgeMultiplier is explicitly provided and a pickup location is given,
 * the system will automatically calculate surge from H3 demand/supply data.
 *
 * @param {Object} params
 * @param {number} params.distanceMeters - Distance in meters
 * @param {number} params.durationSeconds - Duration in seconds
 * @param {string} params.vehicleType - Vehicle type
 * @param {number} [params.surgeMultiplier] - Override surge multiplier (auto-calculated if omitted)
 * @param {Object} [params.pickup] - { lat, lng } for H3-based surge calculation
 * @param {string} params.city - City for pricing rules
 * @returns {Object} Fare breakdown
 */
export async function calculateFare({
  distanceMeters,
  durationSeconds,
  vehicleType = 'economy',
  surgeMultiplier,
  pickup,
  city = 'default',
}) {
  // Try to fetch pricing from DB
  let pricing;
  try {
    await connectDB();
    pricing = await PricingRule.findOne({
      vehicleType,
      city,
      isActive: true,
    }).lean();
  } catch (err) {
    // Fall back to defaults
  }

  if (!pricing) {
    pricing = DEFAULT_PRICING[vehicleType] || DEFAULT_PRICING.economy;
  }

  // ─── H3-Based Dynamic Surge ────────────────────────────────────────────────
  let surgeInfo = null;
  if (surgeMultiplier == null && pickup) {
    try {
      surgeInfo = await calculateSurgeForLocation(pickup.lat, pickup.lng);
      surgeMultiplier = surgeInfo.multiplier;
    } catch {
      surgeMultiplier = 1.0;
    }
  }
  surgeMultiplier = surgeMultiplier || 1.0;

  // Enforce the configured surge cap
  const surgeCap = pricing.surgeMultiplierCap || 3.0;
  surgeMultiplier = Math.min(surgeMultiplier, surgeCap);

  const distanceKm = distanceMeters / 1000;
  const durationMin = durationSeconds / 60;

  // Base calculations
  const distanceFare = distanceKm * pricing.perKmRate;
  const timeFare = durationMin * pricing.perMinRate;
  let subtotal = pricing.baseFare + distanceFare + timeFare;

  // Apply surge
  let surgeFare = 0;
  if (surgeMultiplier > 1.0) {
    surgeFare = subtotal * (surgeMultiplier - 1);
    subtotal *= surgeMultiplier;
  }

  // Apply minimum fare
  subtotal = Math.max(subtotal, pricing.minimumFare);

  // Add booking fee
  const total = subtotal + pricing.bookingFee;

  // Platform fee
  const platformFee = total * (pricing.platformCommission / 100);
  const driverEarnings = total - platformFee;

  const result = {
    baseFare: round(pricing.baseFare),
    distanceFare: round(distanceFare),
    timeFare: round(timeFare),
    surgeFare: round(surgeFare),
    surgeMultiplier,
    bookingFee: round(pricing.bookingFee),
    platformFee: round(platformFee),
    driverEarnings: round(driverEarnings),
    total: round(total),
    estimatedTotal: round(total),
    currency: 'USD',
  };

  // Include H3 surge details if available
  if (surgeInfo) {
    result.surgeDetails = {
      level: surgeInfo.level,
      demand: surgeInfo.demand,
      supply: surgeInfo.supply,
      source: 'h3',
    };
  }

  return result;
}

/**
 * Get fare estimates for all vehicle types
 */
export async function getAllFareEstimates({
  distanceMeters,
  durationSeconds,
  surgeMultiplier,
  pickup,
  city = 'default',
}) {
  const types = ['economy', 'comfort', 'premium', 'xl'];
  const estimates = {};

  // Calculate surge once for all vehicle types (they share the same location)
  let sharedSurge = surgeMultiplier;
  if (sharedSurge == null && pickup) {
    try {
      const surgeInfo = await calculateSurgeForLocation(pickup.lat, pickup.lng);
      sharedSurge = surgeInfo.multiplier;
    } catch {
      sharedSurge = 1.0;
    }
  }

  for (const type of types) {
    estimates[type] = await calculateFare({
      distanceMeters,
      durationSeconds,
      vehicleType: type,
      surgeMultiplier: sharedSurge,
      pickup,
      city,
    });
  }

  return estimates;
}

function round(num) {
  return Math.round(num * 100) / 100;
}
