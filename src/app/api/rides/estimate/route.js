import { z } from 'zod';
import { requireAuth } from '@/lib/auth/helpers';
import { getRoute } from '@/lib/services/routing';
import { getAllFareEstimates } from '@/lib/services/fare-calculator';

const coord = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const estimateSchema = z.object({
  pickup: coord,
  dropoff: coord,
});

// POST /api/rides/estimate — route + fares for all vehicle types
export async function POST(request) {
  const { error } = await requireAuth();
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = estimateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Pickup and dropoff coordinates are required' }, { status: 400 });
    }

    const { pickup, dropoff } = parsed.data;
    const route = await getRoute(pickup, dropoff);

    const estimates = await getAllFareEstimates({
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      pickup,
    });

    return Response.json({
      route: {
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
        geometry: route.geometry,
        source: route.source,
      },
      estimates,
    });
  } catch (err) {
    console.error('Estimate error:', err);
    return Response.json({ error: 'Failed to estimate fare' }, { status: 500 });
  }
}
