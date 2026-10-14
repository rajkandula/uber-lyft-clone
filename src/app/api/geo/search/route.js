import { requireAuth } from '@/lib/auth/helpers';

const PHOTON_BASE = process.env.PHOTON_URL || 'https://photon.komoot.io';

function formatFeature(f) {
  const p = f.properties || {};
  const parts = [p.name, p.street, p.housenumber, p.district, p.city, p.state, p.country]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i);
  return {
    name: p.name || p.street || 'Unknown place',
    address: parts.join(', '),
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    type: p.osm_value || p.type || '',
  };
}

// GET /api/geo/search?q=...&lat=..&lng=..  — place autocomplete (Photon/OSM)
// GET /api/geo/search?reverse=1&lat=..&lng=..  — reverse geocode
export async function GET(request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const { searchParams } = request.nextUrl;
    const q = searchParams.get('q') || '';
    const lat = parseFloat(searchParams.get('lat'));
    const lng = parseFloat(searchParams.get('lng'));
    const reverse = searchParams.get('reverse') === '1';

    let url;
    if (reverse) {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return Response.json({ error: 'lat and lng required for reverse geocode' }, { status: 400 });
      }
      url = `${PHOTON_BASE}/reverse?lon=${lng}&lat=${lat}&limit=1`;
    } else {
      if (q.trim().length < 2) {
        return Response.json({ results: [] });
      }
      url = `${PHOTON_BASE}/api/?q=${encodeURIComponent(q.trim())}&limit=6`;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        // Bias hard toward the user's area — nearby streets should beat
        // same-named streets in other cities
        url += `&lat=${lat}&lon=${lng}&zoom=14&location_bias_scale=0.4`;
      }
    }

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'kovaride/1.0' },
    });

    if (!res.ok) {
      return Response.json(
        { results: [], error: 'Place search is temporarily unavailable' },
        { status: 502 }
      );
    }

    const data = await res.json();
    const results = (data.features || []).map(formatFeature);
    return Response.json({ results });
  } catch (err) {
    console.warn('Geo search error:', err.message);
    return Response.json(
      { results: [], error: 'Place search is temporarily unavailable' },
      { status: 502 }
    );
  }
}
