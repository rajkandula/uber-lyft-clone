import { z } from 'zod';
import connectDB from '@/lib/db/mongodb';
import Ride from '@/lib/db/models/Ride';
import { requireAuth } from '@/lib/auth/helpers';
import { createRide, serializeRide, RideError } from '@/lib/services/ride-service';

const latLng = z.object({
  address: z.string().trim().min(1).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const createSchema = z.object({
  pickup: latLng,
  dropoff: latLng,
  vehicleType: z.enum(['economy', 'comfort', 'premium', 'xl']).default('economy'),
});

// GET /api/rides — ride history for the current rider/driver
export async function GET(request) {
  const { session, error } = await requireAuth(['rider', 'driver']);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const status = searchParams.get('status');

    const query =
      session.user.role === 'driver'
        ? { driverId: session.user.id }
        : { riderId: session.user.id };

    if (status) query.status = status;

    const [rides, total] = await Promise.all([
      Ride.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('riderId', 'name avatar rating')
        .populate('driverId', 'name avatar rating')
        .lean(),
      Ride.countDocuments(query),
    ]);

    return Response.json({
      rides,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('List rides error:', err);
    return Response.json({ error: 'Failed to fetch rides' }, { status: 500 });
  }
}

// POST /api/rides — book a ride (server computes route + fare, then dispatches)
export async function POST(request) {
  const { session, error } = await requireAuth(['rider']);
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request' },
        { status: 400 }
      );
    }

    const ride = await createRide({
      riderId: session.user.id,
      ...parsed.data,
    });

    return Response.json({ ride: serializeRide(ride) }, { status: 201 });
  } catch (err) {
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Create ride error:', err);
    return Response.json({ error: 'Failed to book ride' }, { status: 500 });
  }
}
