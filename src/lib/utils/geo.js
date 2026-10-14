/**
 * Geo utility functions for distance calculation and coordinate helpers
 */

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Straight-line road distance estimate between two {lat,lng} points.
 * Applies a 1.35× factor for real street routing.
 * @returns {number} metres
 */
export function roadDistanceMeters(from, to) {
  if (!from || !to) return 0;
  return Math.round(haversineDistance(from.lat, from.lng, to.lat, to.lng) * 1000 * 1.35);
}

/**
 * Travel time estimate for a distance at typical city speed.
 * @param {number} meters
 * @param {number} [speedKmh=25]
 * @returns {number} minutes (minimum 1)
 */
export function etaMinutes(meters, speedKmh = 25) {
  const minutes = Math.ceil((meters / 1000 / speedKmh) * 60);
  return Math.max(1, minutes);
}

/**
 * Format distance for display
 * @param {number} meters
 * @returns {string}
 */
export function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Format duration for display
 * @param {number} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (seconds < 60) {
    return `${Math.round(seconds)} sec`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}

/**
 * Format currency
 * @param {number} amount
 * @param {string} currency
 * @returns {string}
 */
export function formatCurrency(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format date relative to now
 * @param {Date|string} date
 * @returns {string}
 */
export function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - new Date(date);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: days > 365 ? 'numeric' : undefined,
  });
}

/**
 * Format a date for display
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Get the midpoint between two coordinates
 */
export function getMidpoint(lat1, lon1, lat2, lon2) {
  return {
    lat: (lat1 + lat2) / 2,
    lng: (lon1 + lon2) / 2,
  };
}

/**
 * Generate a bounding box around a point
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 */
export function getBoundingBox(lat, lng, radiusKm) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(toRad(lat)));

  return {
    north: lat + latDelta,
    south: lat - latDelta,
    east: lng + lngDelta,
    west: lng - lngDelta,
  };
}

// ─── H3 Visualization Helpers ─────────────────────────────────────────────────

/**
 * Color palette for H3 k-ring levels (for Google Maps polygon styling).
 * Ring 0 (center) is the brightest, fading out for outer rings.
 *
 * @param {number} ring - Ring distance from center (0-based)
 * @returns {{ fillColor: string, strokeColor: string, fillOpacity: number, strokeWeight: number }}
 */
export function getH3CellStyle(ring = 0) {
  const styles = [
    { fillColor: '#00E676', strokeColor: '#00C853', fillOpacity: 0.40, strokeWeight: 2 },
    { fillColor: '#00BFA5', strokeColor: '#00897B', fillOpacity: 0.25, strokeWeight: 1.5 },
    { fillColor: '#0091EA', strokeColor: '#01579B', fillOpacity: 0.18, strokeWeight: 1 },
    { fillColor: '#6200EA', strokeColor: '#4A148C', fillOpacity: 0.12, strokeWeight: 1 },
    { fillColor: '#AA00FF', strokeColor: '#7B1FA2', fillOpacity: 0.08, strokeWeight: 0.5 },
    { fillColor: '#FF6D00', strokeColor: '#E65100', fillOpacity: 0.06, strokeWeight: 0.5 },
  ];
  return styles[Math.min(ring, styles.length - 1)];
}

/**
 * Color for surge heatmap cells based on demand level.
 *
 * @param {number} demand - Number of ride requests in the cell
 * @param {number} maxDemand - Max demand value for normalization
 * @returns {{ fillColor: string, fillOpacity: number }}
 */
export function getSurgeCellStyle(demand, maxDemand = 10) {
  const intensity = Math.min(demand / maxDemand, 1);

  if (intensity > 0.8) {
    return { fillColor: '#FF1744', fillOpacity: 0.5 };  // Extreme — red
  } else if (intensity > 0.6) {
    return { fillColor: '#FF9100', fillOpacity: 0.4 };  // High — orange
  } else if (intensity > 0.4) {
    return { fillColor: '#FFEA00', fillOpacity: 0.3 };  // Moderate — yellow
  } else if (intensity > 0.2) {
    return { fillColor: '#76FF03', fillOpacity: 0.2 };  // Low — green
  }
  return { fillColor: '#00E5FF', fillOpacity: 0.1 };    // Minimal — cyan
}

/**
 * Convert H3 GeoJSON FeatureCollection to Google Maps Polygon paths.
 * Useful for rendering H3 grid overlays on Google Maps.
 *
 * @param {Object} geojson - GeoJSON FeatureCollection from h3CellsToGeoJSON()
 * @returns {Array<{ paths: Array<{lat, lng}>, properties: Object }>}
 */
export function h3GeoJSONToGoogleMaps(geojson) {
  if (!geojson?.features) return [];

  return geojson.features.map((feature) => {
    const coordinates = feature.geometry.coordinates[0];
    // GeoJSON is [lng, lat], Google Maps needs {lat, lng}
    const paths = coordinates.map(([lng, lat]) => ({ lat, lng }));

    return {
      paths,
      properties: feature.properties,
    };
  });
}
