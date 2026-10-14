/**
 * H3 Hexagonal Spatial Index — Core Module
 *
 * Wraps Uber's h3-js library to provide hexagonal spatial indexing
 * for the Kova rideshare platform. Used for:
 *   - Driver location indexing (Redis-backed)
 *   - k-Ring expansion for progressive driver search
 *   - Demand heatmap cells for surge pricing
 *   - Map visualization (GeoJSON polygon boundaries)
 *
 * Resolution 9 (~174m edge, ~0.1 km² area) is the primary resolution
 * for driver tracking. Resolution 7 (~1.2 km edge) is used for
 * city-level surge zone aggregation.
 */

import {
  latLngToCell,
  cellToLatLng,
  cellToBoundary,
  gridDisk,
  gridRingUnsafe,
  getResolution,
  cellToParent,
  cellToChildren,
  getHexagonEdgeLengthAvg,
  isPentagon,
  isValidCell,
  UNITS,
} from 'h3-js';

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Resolution for tracking individual driver positions (~174m edge) */
export const H3_RESOLUTION_DRIVER = 9;

/** Resolution for surge pricing zones (~1.22 km edge) */
export const H3_RESOLUTION_SURGE = 7;

/** Resolution for city-level demand overview (~4.6 km edge) */
export const H3_RESOLUTION_CITY = 5;

/**
 * k-ring sizes and their approximate radius at resolution 9:
 *   k=1 →  7 cells  → ~500m
 *   k=2 → 19 cells  → ~1 km
 *   k=3 → 37 cells  → ~1.5 km
 *   k=4 → 61 cells  → ~2 km
 *   k=5 → 91 cells  → ~2.5 km
 *   k=6 → 127 cells → ~3 km
 */
export const K_RING_TIERS = [
  { k: 1, label: 'immediate', approxRadiusKm: 0.5 },
  { k: 2, label: 'nearby', approxRadiusKm: 1.0 },
  { k: 3, label: 'neighborhood', approxRadiusKm: 1.5 },
  { k: 4, label: 'district', approxRadiusKm: 2.0 },
  { k: 5, label: 'area', approxRadiusKm: 2.5 },
  { k: 6, label: 'wide', approxRadiusKm: 3.0 },
];

// ─── Core Conversions ───────────────────────────────────────────────────────────

/**
 * Convert a GPS lat/lng to an H3 cell index.
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} [resolution=H3_RESOLUTION_DRIVER] - H3 resolution (0-15)
 * @returns {string} H3 cell index (e.g. "892a100d2c3ffff")
 */
export function latLngToH3Cell(lat, lng, resolution = H3_RESOLUTION_DRIVER) {
  return latLngToCell(lat, lng, resolution);
}

/**
 * Get the center point of an H3 cell.
 * @param {string} h3Index - H3 cell index
 * @returns {{ lat: number, lng: number }}
 */
export function h3CellToLatLng(h3Index) {
  const [lat, lng] = cellToLatLng(h3Index);
  return { lat, lng };
}

/**
 * Get the polygon boundary of an H3 cell (for map rendering).
 * @param {string} h3Index - H3 cell index
 * @returns {Array<{lat: number, lng: number}>} Array of boundary vertices
 */
export function h3CellToBoundary(h3Index) {
  const boundary = cellToBoundary(h3Index);
  return boundary.map(([lat, lng]) => ({ lat, lng }));
}

// ─── k-Ring Expansion ───────────────────────────────────────────────────────────

/**
 * Get all cells within k rings of a center cell (inclusive).
 * This is the gridDisk operation.
 *
 *   k=0 →  1 cell
 *   k=1 →  7 cells  (1 + 6)
 *   k=2 → 19 cells  (1 + 6 + 12)
 *   k=3 → 37 cells  (formula: 3k² + 3k + 1)
 *
 * @param {string} h3Index - Center cell
 * @param {number} k - Number of rings
 * @returns {string[]} Array of H3 cell indices
 */
export function getKRingCells(h3Index, k) {
  return gridDisk(h3Index, k);
}

/**
 * Get ONLY the cells in a specific ring k (not inside rings).
 * Useful for incremental expansion — search ring 1, then ring 2, etc.
 * without re-checking inner rings.
 *
 * @param {string} h3Index - Center cell
 * @param {number} k - Ring number (0 = center only)
 * @returns {string[]} Array of H3 cell indices in ring k only
 */
export function getRingCells(h3Index, k) {
  if (k === 0) return [h3Index];
  try {
    return gridRingUnsafe(h3Index, k);
  } catch {
    // gridRingUnsafe can fail near pentagons — fall back to set difference
    const outer = new Set(gridDisk(h3Index, k));
    const inner = new Set(gridDisk(h3Index, k - 1));
    return [...outer].filter((cell) => !inner.has(cell));
  }
}

/**
 * Calculate the total number of cells in a k-ring disk.
 * Formula: 3k² + 3k + 1
 * @param {number} k
 * @returns {number}
 */
export function kRingCellCount(k) {
  return 3 * k * k + 3 * k + 1;
}

// ─── Progressive Search ─────────────────────────────────────────────────────────

/**
 * Progressive ring expansion — start tight, expand until we find enough drivers.
 *
 * Returns an array of search tiers, each with the NEW cells to search
 * (excluding cells from previous tiers).
 *
 * @param {number} lat - Rider latitude
 * @param {number} lng - Rider longitude
 * @param {number[]} [kValues=[1,2,3,4,5]] - k values to expand through
 * @param {number} [resolution=H3_RESOLUTION_DRIVER]
 * @returns {Array<{ k: number, cells: string[], totalCells: number }>}
 */
export function getProgressiveSearchRings(
  lat,
  lng,
  kValues = [1, 2, 3, 4, 5],
  resolution = H3_RESOLUTION_DRIVER
) {
  const centerCell = latLngToH3Cell(lat, lng, resolution);
  const searched = new Set();
  const tiers = [];

  for (const k of kValues) {
    const allCells = gridDisk(centerCell, k);
    const newCells = allCells.filter((cell) => !searched.has(cell));
    newCells.forEach((cell) => searched.add(cell));

    tiers.push({
      k,
      cells: newCells,
      totalCells: searched.size,
      approxRadiusKm: K_RING_TIERS.find((t) => t.k === k)?.approxRadiusKm || k * 0.35,
    });
  }

  return tiers;
}

/**
 * Get all cells for a specific k-ring around a GPS point.
 * Convenience function combining latLngToH3Cell + getKRingCells.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} k - Ring count
 * @param {number} [resolution=H3_RESOLUTION_DRIVER]
 * @returns {{ centerCell: string, cells: string[], cellCount: number }}
 */
export function getCellsAroundPoint(lat, lng, k, resolution = H3_RESOLUTION_DRIVER) {
  const centerCell = latLngToH3Cell(lat, lng, resolution);
  const cells = getKRingCells(centerCell, k);
  return {
    centerCell,
    cells,
    cellCount: cells.length,
  };
}

// ─── Resolution Helpers ─────────────────────────────────────────────────────────

/**
 * Get the resolution of an existing H3 cell index.
 * @param {string} h3Index
 * @returns {number} Resolution (0-15)
 */
export function getCellResolution(h3Index) {
  return getResolution(h3Index);
}

/**
 * Convert a cell to a parent cell at a coarser resolution.
 * Used for aggregating driver-level (res 9) cells into surge zones (res 7).
 *
 * @param {string} h3Index
 * @param {number} parentResolution
 * @returns {string} Parent cell index
 */
export function getCellParent(h3Index, parentResolution) {
  return cellToParent(h3Index, parentResolution);
}

/**
 * Get all children cells of a coarser cell at a finer resolution.
 * @param {string} h3Index
 * @param {number} childResolution
 * @returns {string[]} Child cell indices
 */
export function getCellChildren(h3Index, childResolution) {
  return cellToChildren(h3Index, childResolution);
}

/**
 * Suggest the best k value for a desired search radius (at resolution 9).
 * @param {number} radiusKm - Desired search radius in kilometers
 * @returns {{ k: number, approxRadiusKm: number, cellCount: number }}
 */
export function getKForRadius(radiusKm) {
  // At resolution 9, each k step ≈ 0.35-0.5 km
  // Approximate: k ≈ radiusKm / 0.5, clamped to [1, 10]
  const k = Math.max(1, Math.min(10, Math.ceil(radiusKm / 0.5)));
  return {
    k,
    approxRadiusKm: k * 0.5,
    cellCount: kRingCellCount(k),
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────────

/**
 * Check if a string is a valid H3 cell index.
 * @param {string} h3Index
 * @returns {boolean}
 */
export function isValidH3Cell(h3Index) {
  return isValidCell(h3Index);
}

/**
 * Check if a cell is a pentagon (rare edge case, 12 per resolution).
 * Pentagons have 5 neighbors instead of 6.
 * @param {string} h3Index
 * @returns {boolean}
 */
export function isCellPentagon(h3Index) {
  return isPentagon(h3Index);
}

// ─── GeoJSON / Visualization ────────────────────────────────────────────────────

/**
 * Convert an array of H3 cells to a GeoJSON FeatureCollection.
 * Used for rendering hex grids on the frontend map.
 *
 * @param {string[]} h3Cells - Array of H3 cell indices
 * @param {Object} [options]
 * @param {string} [options.centerCell] - If provided, cells get a `ring` property
 *   indicating their distance from center (0 = center, 1 = first ring, etc.)
 * @returns {Object} GeoJSON FeatureCollection
 */
export function h3CellsToGeoJSON(h3Cells, options = {}) {
  const { centerCell } = options;

  // Pre-compute ring distances if centerCell is provided
  let ringMap = null;
  if (centerCell) {
    ringMap = new Map();
    ringMap.set(centerCell, 0);
    // Compute up to k=10 rings to assign ring distances
    for (let k = 1; k <= 10; k++) {
      const ringCells = getRingCells(centerCell, k);
      for (const cell of ringCells) {
        if (!ringMap.has(cell)) {
          ringMap.set(cell, k);
        }
      }
    }
  }

  const features = h3Cells.map((cell) => {
    const boundary = cellToBoundary(cell);
    // h3-js returns [lat, lng] but GeoJSON wants [lng, lat]
    const coordinates = boundary.map(([lat, lng]) => [lng, lat]);
    // Close the polygon
    coordinates.push(coordinates[0]);

    const [centerLat, centerLng] = cellToLatLng(cell);

    const properties = {
      h3Index: cell,
      resolution: getResolution(cell),
      centerLat,
      centerLng,
    };

    if (ringMap) {
      properties.ring = ringMap.get(cell) ?? -1;
    }

    return {
      type: 'Feature',
      properties,
      geometry: {
        type: 'Polygon',
        coordinates: [coordinates],
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Get a color for a specific ring level.
 * Used for styling hex cells on the map.
 *
 * @param {number} ring - Ring distance from center (0-based)
 * @returns {{ fill: string, stroke: string, opacity: number }}
 */
export function getH3RingStyle(ring) {
  const styles = [
    { fill: '#00E676', stroke: '#00C853', opacity: 0.45 }, // k=0: center — bright green
    { fill: '#00BFA5', stroke: '#00897B', opacity: 0.30 }, // k=1: inner ring — teal
    { fill: '#0091EA', stroke: '#01579B', opacity: 0.20 }, // k=2: mid ring — blue
    { fill: '#6200EA', stroke: '#4A148C', opacity: 0.15 }, // k=3: outer ring — purple
    { fill: '#AA00FF', stroke: '#7B1FA2', opacity: 0.10 }, // k=4: wide — violet
    { fill: '#FF6D00', stroke: '#E65100', opacity: 0.08 }, // k=5+: distant — orange
  ];

  return styles[Math.min(ring, styles.length - 1)];
}

/**
 * Get edge length of a cell at a given resolution (in km).
 * @param {number} resolution
 * @returns {number} Average edge length in km
 */
export function getEdgeLengthKm(resolution) {
  return getHexagonEdgeLengthAvg(resolution, UNITS.km);
}
