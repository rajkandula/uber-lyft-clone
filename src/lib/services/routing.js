import { haversineDistance } from '@/lib/utils/geo';

const OSRM_BASE = process.env.OSRM_URL || 'https://router.project-osrm.org';

/**
 * Get a driving route between two points.
 *
 * Uses the public OSRM API; falls back to a haversine estimate
 * (×1.35 road factor, 25 km/h city speed) if OSRM is unreachable,
 * so ride booking keeps working offline.
 *
 * @param {{lat:number,lng:number}} from
 * @param {{lat:number,lng:number}} to
 * @returns {{distanceMeters:number, durationSeconds:number, geometry:Array<[number,number]>|null, source:string}}
 */
export async function getRoute(from, to) {
  try {
    const url =
      `${OSRM_BASE}/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson&alternatives=false&steps=false`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'kovaride/1.0' },
    });

    if (res.ok) {
      const data = await res.json();
      const route = data?.routes?.[0];
      if (route && route.distance > 0) {
        return {
          distanceMeters: Math.round(route.distance),
          durationSeconds: Math.round(route.duration),
          geometry: route.geometry?.coordinates || null,
          source: 'osrm',
        };
      }
    }
  } catch {
    // fall through to estimate
  }

  return estimateRoute(from, to);
}

/**
 * Haversine-based route estimate for when routing is unavailable.
 */
export function estimateRoute(from, to) {
  const straightKm = haversineDistance(from.lat, from.lng, to.lat, to.lng);
  const distanceMeters = Math.round(straightKm * 1000 * 1.35); // road curvature factor
  const durationSeconds = Math.round((distanceMeters / 1000 / 25) * 3600); // 25 km/h
  return {
    distanceMeters,
    durationSeconds,
    geometry: [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ],
    source: 'estimate',
  };
}
