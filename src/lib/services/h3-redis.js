/**
 * H3 Redis Spatial Index
 *
 * Uses Redis Sets to maintain a real-time spatial index of drivers
 * keyed by their H3 hex cell. This enables O(1) lookups for
 * "find all drivers in these cells" instead of scanning MongoDB.
 *
 * Redis Key Layout:
 *   h3:drivers:{h3Index}    → SET of driverIds in this cell
 *   h3:driver:cell:{driverId} → STRING of the driver's current h3Index
 *   h3:demand:{h3Index}     → SORTED SET with timestamp scores (ride requests)
 *   h3:supply:{h3Index}     → Counter of available drivers (for surge ratio)
 *
 * All keys use a TTL to auto-expire stale data (driver goes offline
 * without clean disconnect).
 */

import redis from '@/lib/db/redis';
import {
  latLngToH3Cell,
  getKRingCells,
  getCellParent,
  H3_RESOLUTION_DRIVER,
  H3_RESOLUTION_SURGE,
} from './h3-spatial';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Prefix for H3 driver cell sets */
const KEY_DRIVERS = 'h3:drivers';

/** Prefix for driver→cell reverse lookup */
const KEY_DRIVER_CELL = 'h3:driver:cell';

/** Prefix for demand tracking */
const KEY_DEMAND = 'h3:demand';

/** TTL for driver cell membership (auto-expire if no update in 5 min) */
const DRIVER_CELL_TTL = 300;

/** TTL for demand data (10 minutes) */
const DEMAND_TTL = 600;

// ─── Driver Location Index ─────────────────────────────────────────────────────

/**
 * Update a driver's H3 cell in the spatial index.
 * Atomically removes from old cell (if moved) and adds to new cell.
 *
 * This is called on every driver:location-update event.
 * If the driver hasn't changed cells, this is a no-op (just refreshes TTL).
 *
 * @param {string} driverId - Driver's database ID
 * @param {number} lat - Current latitude
 * @param {number} lng - Current longitude
 * @returns {{ h3Cell: string, changed: boolean }}
 */
export async function updateDriverCell(driverId, lat, lng) {
  const newCell = latLngToH3Cell(lat, lng, H3_RESOLUTION_DRIVER);
  const cellKey = `${KEY_DRIVER_CELL}:${driverId}`;

  try {
    // Get the driver's current cell
    const oldCell = await redis.get(cellKey);

    if (oldCell === newCell) {
      // Same cell — just refresh TTLs
      const pipeline = redis.pipeline();
      pipeline.expire(`${KEY_DRIVERS}:${newCell}`, DRIVER_CELL_TTL);
      pipeline.expire(cellKey, DRIVER_CELL_TTL);
      await pipeline.exec();

      return { h3Cell: newCell, changed: false };
    }

    // Driver moved to a new cell — atomic swap
    const pipeline = redis.pipeline();

    // Remove from old cell (if exists)
    if (oldCell) {
      pipeline.srem(`${KEY_DRIVERS}:${oldCell}`, driverId);
    }

    // Add to new cell
    pipeline.sadd(`${KEY_DRIVERS}:${newCell}`, driverId);
    pipeline.expire(`${KEY_DRIVERS}:${newCell}`, DRIVER_CELL_TTL);

    // Update reverse lookup
    pipeline.set(cellKey, newCell, 'EX', DRIVER_CELL_TTL);

    await pipeline.exec();

    return { h3Cell: newCell, changed: true };
  } catch (err) {
    console.error(`[H3-Redis] Failed to update driver cell for ${driverId}:`, err.message);
    // Don't throw — this is a performance optimization, not critical path
    return { h3Cell: newCell, changed: false };
  }
}

/**
 * Remove a driver from the spatial index entirely.
 * Called when a driver goes offline or disconnects.
 *
 * @param {string} driverId
 */
export async function removeDriverFromIndex(driverId) {
  try {
    const cellKey = `${KEY_DRIVER_CELL}:${driverId}`;
    const currentCell = await redis.get(cellKey);

    if (currentCell) {
      const pipeline = redis.pipeline();
      pipeline.srem(`${KEY_DRIVERS}:${currentCell}`, driverId);
      pipeline.del(cellKey);
      await pipeline.exec();
    }
  } catch (err) {
    console.error(`[H3-Redis] Failed to remove driver ${driverId}:`, err.message);
  }
}

/**
 * Find all driver IDs in the given H3 cells.
 * Uses Redis SUNION to combine multiple cell sets in one call.
 *
 * @param {string[]} h3Cells - Array of H3 cell indices
 * @returns {string[]} Array of driver IDs
 */
export async function findDriversInCells(h3Cells) {
  if (!h3Cells || h3Cells.length === 0) return [];

  try {
    const keys = h3Cells.map((cell) => `${KEY_DRIVERS}:${cell}`);

    if (keys.length === 1) {
      return await redis.smembers(keys[0]);
    }

    return await redis.sunion(...keys);
  } catch (err) {
    console.error('[H3-Redis] Failed to find drivers in cells:', err.message);
    return [];
  }
}

/**
 * Progressive driver search — expand k-rings until we find enough drivers
 * or exhaust all tiers.
 *
 * @param {number} lat - Rider latitude
 * @param {number} lng - Rider longitude
 * @param {Object} [options]
 * @param {number} [options.minDrivers=1] - Minimum drivers to find before stopping
 * @param {number} [options.maxK=5] - Maximum k-ring expansion
 * @param {string[]} [options.excludeIds=[]] - Driver IDs to exclude (already declined, etc.)
 * @returns {{ drivers: string[], k: number, cellsSearched: number }}
 */
export async function findNearbyDriversH3(lat, lng, options = {}) {
  const { minDrivers = 1, maxK = 5, excludeIds = [] } = options;

  const centerCell = latLngToH3Cell(lat, lng, H3_RESOLUTION_DRIVER);
  const excludeSet = new Set(excludeIds);
  const allFound = new Set();

  for (let k = 1; k <= maxK; k++) {
    const cells = getKRingCells(centerCell, k);
    const driverIds = await findDriversInCells(cells);

    // Merge results, excluding specified IDs
    for (const id of driverIds) {
      if (!excludeSet.has(id)) {
        allFound.add(id);
      }
    }

    if (allFound.size >= minDrivers) {
      return {
        drivers: [...allFound],
        k,
        cellsSearched: cells.length,
        centerCell,
      };
    }
  }

  // Exhausted all tiers
  return {
    drivers: [...allFound],
    k: maxK,
    cellsSearched: getKRingCells(centerCell, maxK).length,
    centerCell,
  };
}

/**
 * Get a driver's current H3 cell from the index.
 * @param {string} driverId
 * @returns {string|null} H3 cell index or null
 */
export async function getDriverCell(driverId) {
  try {
    return await redis.get(`${KEY_DRIVER_CELL}:${driverId}`);
  } catch {
    return null;
  }
}

/**
 * Get all driver IDs currently indexed (for admin/debug).
 * WARNING: Scans Redis keys — use only for admin/debug, not production queries.
 * @returns {number} Count of indexed drivers
 */
export async function getIndexedDriverCount() {
  try {
    const keys = await redis.keys(`${KEY_DRIVER_CELL}:*`);
    return keys.length;
  } catch {
    return 0;
  }
}

// ─── Demand Tracking (for Surge Pricing) ────────────────────────────────────────

/**
 * Record a ride request in the demand index.
 * Uses a sorted set with timestamp scores so we can count
 * requests within a time window.
 *
 * @param {number} lat - Pickup latitude
 * @param {number} lng - Pickup longitude
 */
export async function recordDemand(lat, lng) {
  try {
    // Use surge-resolution cells (coarser, ~1.2km) for demand aggregation
    const surgeCell = latLngToH3Cell(lat, lng, H3_RESOLUTION_SURGE);
    const key = `${KEY_DEMAND}:${surgeCell}`;
    const now = Date.now();

    const pipeline = redis.pipeline();
    // Add timestamped entry
    pipeline.zadd(key, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
    // Clean up entries older than 10 minutes
    pipeline.zremrangebyscore(key, 0, now - DEMAND_TTL * 1000);
    // Set TTL on the key itself
    pipeline.expire(key, DEMAND_TTL);
    await pipeline.exec();
  } catch (err) {
    console.error('[H3-Redis] Failed to record demand:', err.message);
  }
}

/**
 * Get demand count in an area over a time window.
 *
 * @param {number} lat - Center latitude
 * @param {number} lng - Center longitude
 * @param {number} [k=1] - k-ring expansion at surge resolution
 * @param {number} [windowMs=600000] - Time window in ms (default 10 min)
 * @returns {number} Total ride requests in the area
 */
export async function getDemandInArea(lat, lng, k = 1, windowMs = 600000) {
  try {
    const surgeCell = latLngToH3Cell(lat, lng, H3_RESOLUTION_SURGE);
    const cells = getKRingCells(surgeCell, k);
    const now = Date.now();
    const since = now - windowMs;

    let totalDemand = 0;
    for (const cell of cells) {
      const count = await redis.zcount(`${KEY_DEMAND}:${cell}`, since, now);
      totalDemand += count;
    }

    return totalDemand;
  } catch (err) {
    console.error('[H3-Redis] Failed to get demand:', err.message);
    return 0;
  }
}

/**
 * Get supply count (available drivers) in an area.
 * Uses the driver-resolution cells.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} [k=2] - k-ring expansion at driver resolution
 * @returns {number} Number of available drivers
 */
export async function getSupplyInArea(lat, lng, k = 2) {
  try {
    const centerCell = latLngToH3Cell(lat, lng, H3_RESOLUTION_DRIVER);
    const cells = getKRingCells(centerCell, k);
    const drivers = await findDriversInCells(cells);
    return drivers.length;
  } catch {
    return 0;
  }
}

/**
 * Calculate surge multiplier based on demand/supply ratio.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{ multiplier: number, demand: number, supply: number, level: string }}
 */
export async function calculateSurgeForLocation(lat, lng) {
  const [demand, supply] = await Promise.all([
    getDemandInArea(lat, lng, 1),
    getSupplyInArea(lat, lng, 2),
  ]);

  let multiplier = 1.0;
  let level = 'normal';

  if (supply === 0) {
    // No drivers — high surge if there's demand
    if (demand > 0) {
      multiplier = 2.5;
      level = 'extreme';
    }
  } else {
    const ratio = demand / supply;

    if (ratio > 3.0) {
      multiplier = 2.5;
      level = 'extreme';
    } else if (ratio > 2.0) {
      multiplier = 2.0;
      level = 'high';
    } else if (ratio > 1.5) {
      multiplier = 1.75;
      level = 'elevated';
    } else if (ratio > 1.0) {
      multiplier = 1.25;
      level = 'moderate';
    }
  }

  return { multiplier, demand, supply, level };
}

/**
 * Get demand heatmap data for a region.
 * Returns cells with their demand counts for visualization.
 *
 * @param {number} lat - Center latitude
 * @param {number} lng - Center longitude
 * @param {number} [k=3] - k-ring at surge resolution
 * @returns {Array<{ cell: string, demand: number, center: {lat, lng} }>}
 */
export async function getDemandHeatmap(lat, lng, k = 3) {
  try {
    const surgeCell = latLngToH3Cell(lat, lng, H3_RESOLUTION_SURGE);
    const cells = getKRingCells(surgeCell, k);
    const now = Date.now();
    const since = now - DEMAND_TTL * 1000;

    const heatmap = [];
    for (const cell of cells) {
      const count = await redis.zcount(`${KEY_DEMAND}:${cell}`, since, now);
      if (count > 0) {
        const [centerLat, centerLng] = (await import('h3-js')).cellToLatLng(cell);
        heatmap.push({
          cell,
          demand: count,
          center: { lat: centerLat, lng: centerLng },
        });
      }
    }

    return heatmap;
  } catch (err) {
    console.error('[H3-Redis] Failed to get demand heatmap:', err.message);
    return [];
  }
}
