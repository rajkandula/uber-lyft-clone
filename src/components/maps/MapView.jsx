'use client';

import { useEffect, useRef } from 'react';
import { Map as MLMap, Marker, LngLatBounds, NavigationControl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * MapLibre GL map with premium light CARTO tiles (no API key).
 *
 * Props:
 *  - center {lat,lng}, zoom
 *  - pickup / dropoff {lat,lng} — pin markers
 *  - routeGeometry [[lng,lat],...] — drawn as an ink line
 *  - drivers [{id, location:{lat,lng}}] — nearby cars (dots)
 *  - driverPosition {lat,lng,heading} — the assigned driver (animated)
 *  - userPosition {lat,lng} — rider's own dot
 *  - fit — when true, fits bounds to pickup/dropoff/route
 *  - onClick(lngLat)
 */

const MAP_STYLE = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: ['a', 'b', 'c', 'd'].map(
        (s) => `https://${s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png`
      ),
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
};

function el(className, html) {
  const div = document.createElement('div');
  div.className = className;
  if (html) div.innerHTML = html;
  return div;
}

const CAR_SVG =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>';

const PIN_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="6"/></svg>';

const SQUARE_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';

export default function MapView({
  center = { lat: 40.7128, lng: -74.006 },
  zoom = 13,
  pickup,
  dropoff,
  routeGeometry,
  drivers = [],
  driverPosition,
  userPosition,
  fit = false,
  onClick,
  className = '',
  style,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const readyRef = useRef(false);
  const markersRef = useRef({ pickup: null, dropoff: null, driver: null, user: null });
  const driverDotsRef = useRef(new Map());
  const animRef = useRef(null);
  // Latest route geometry — the style 'load' handler reads this so a route
  // that arrives before the style finishes loading still gets drawn.
  const routeGeomRef = useRef(null);
  const onClickRef = useRef(onClick);
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // ── Init once ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = new MLMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [center.lng, center.lat],
      zoom,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');

    const applyRoute = () => {
      readyRef.current = drawRoute(map, routeGeomRef.current);
    };

    // The style may finish loading before OR after this handler is attached,
    // and a style reload wipes custom sources — so react to both events and
    // let drawRoute() re-create anything missing (it is idempotent).
    map.on('load', applyRoute);
    map.on('styledata', applyRoute);

    map.on('click', (e) => {
      onClickRef.current?.({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // Guarantee correct canvas size even when the container lays out
    // after map construction (flex/absolute parents, modals, HMR).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    requestAnimationFrame(() => map.resize());

    mapRef.current = map;

    return () => {
      ro.disconnect();
      cancelAnimationFrame(animRef.current);
      // Markers belong to this map instance — drop them so a remount
      // (StrictMode/HMR) recreates them on the new map.
      markersRef.current = { pickup: null, dropoff: null, driver: null, user: null };
      driverDotsRef.current.clear();
      try {
        map.remove();
      } catch (err) {
        // remove() can throw when torn down mid-load; never let that block
        // the next mount from creating a fresh map.
        console.warn('[MapView] map.remove() failed:', err?.message);
      }
      if (mapRef.current === map) mapRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pickup / dropoff / user markers ──
  function syncMarker(key, pos, make) {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;
    if (!pos) {
      markers[key]?.remove();
      markers[key] = null;
      return;
    }
    if (!markers[key]) {
      markers[key] = new Marker({ element: make() })
        .setLngLat([pos.lng, pos.lat])
        .addTo(map);
    } else {
      markers[key].setLngLat([pos.lng, pos.lat]);
    }
  }

  useEffect(() => {
    syncMarker('pickup', pickup, () => el('marker-pin pickup', PIN_SVG));
  }, [pickup?.lat, pickup?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncMarker('dropoff', dropoff, () => el('marker-pin dropoff', SQUARE_SVG));
  }, [dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    syncMarker('user', userPosition, () => {
      const dot = el('');
      dot.style.cssText =
        'width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.3)';
      return dot;
    });
  }, [userPosition?.lat, userPosition?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Assigned driver marker (smoothly animated) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const markers = markersRef.current;

    if (!driverPosition) {
      markers.driver?.remove();
      markers.driver = null;
      return;
    }

    const target = [driverPosition.lng, driverPosition.lat];

    if (!markers.driver) {
      markers.driver = new Marker({ element: el('marker-driver', CAR_SVG) })
        .setLngLat(target)
        .addTo(map);
      return;
    }

    // Lerp from current to target over ~900ms for a fluid glide
    const from = markers.driver.getLngLat();
    const start = performance.now();
    const D = 900;
    cancelAnimationFrame(animRef.current);
    const step = (now) => {
      const t = Math.min(1, (now - start) / D);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      markers.driver?.setLngLat([
        from.lng + (target[0] - from.lng) * e,
        from.lat + (target[1] - from.lat) * e,
      ]);
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }, [driverPosition?.lat, driverPosition?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Nearby driver dots ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const dots = driverDotsRef.current;
    const seen = new Set();

    for (const d of drivers) {
      if (!d?.location) continue;
      seen.add(d.id);
      const lngLat = [d.location.lng, d.location.lat];
      if (dots.has(d.id)) {
        dots.get(d.id).setLngLat(lngLat);
      } else {
        const m = new Marker({
          element: el('marker-driver', CAR_SVG),
        })
          .setLngLat(lngLat)
          .addTo(map);
        m.getElement().style.opacity = '0.85';
        m.getElement().style.transform += ' scale(0.85)';
        dots.set(d.id, m);
      }
    }

    for (const [id, marker] of dots) {
      if (!seen.has(id)) {
        marker.remove();
        dots.delete(id);
      }
    }
  }, [drivers]);

  // ── Route line ──
  useEffect(() => {
    routeGeomRef.current = routeGeometry || null;
    const map = mapRef.current;
    if (!map) return;
    // drawRoute self-guards on style readiness; if the style isn't up yet the
    // 'load'/'styledata' handlers will re-apply routeGeomRef.
    readyRef.current = drawRoute(map, routeGeometry);
  }, [routeGeometry]);

  // ── Fit bounds ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fit) return;

    const points = [];
    if (pickup) points.push([pickup.lng, pickup.lat]);
    if (dropoff) points.push([dropoff.lng, dropoff.lat]);
    if (driverPosition) points.push([driverPosition.lng, driverPosition.lat]);
    if (routeGeometry?.length) points.push(...routeGeometry);
    if (points.length < 2) {
      if (points.length === 1) map.easeTo({ center: points[0], zoom: 15, duration: 600 });
      return;
    }

    const bounds = points.reduce(
      (b, p) => b.extend(p),
      new LngLatBounds(points[0], points[0])
    );
    map.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 60, right: 60 }, duration: 700, maxZoom: 16 });
    // driverPosition is intentionally not a dep — refitting on every GPS
    // ping would make the camera jitter. It's included in bounds whenever
    // a route/endpoint change triggers a refit.
  }, [fit, pickup?.lat, dropoff?.lat, routeGeometry]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recenter when no fit target ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fit || pickup || dropoff) return;
    map.easeTo({ center: [center.lng, center.lat], zoom, duration: 600 });
  }, [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      aria-label="Map"
    />
  );
}

/**
 * Draw the route line, creating the source/layers if they don't exist yet.
 *
 * Idempotent and safe to call at any time: returns false (a no-op) while the
 * style isn't ready, so callers can simply try again on the next style event.
 */
function drawRoute(map, geometry) {
  const data = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: geometry || [] },
  };

  try {
    // Fast path: once the source exists, updating it never needs the style to
    // be "loaded" — isStyleLoaded() stays false while tiles stream in, so
    // gating on it here would drop routes indefinitely.
    const existing = map.getSource('route');
    if (existing) {
      existing.setData(data);
      return true;
    }
  } catch {
    // getSource throws before the style exists — fall through and wait
  }

  // Creating the source/layers does require a ready style
  let styleReady = false;
  try {
    styleReady = map.isStyleLoaded();
  } catch {
    styleReady = false;
  }
  if (!styleReady) return false;

  try {
    map.addSource('route', { type: 'geojson', data });
    if (!map.getLayer('route-casing')) {
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }
    if (!map.getLayer('route-line')) {
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#1c1917', 'line-width': 4 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
    }

    return true;
  } catch (err) {
    console.warn('[MapView] route draw failed:', err?.message);
    return false;
  }
}
