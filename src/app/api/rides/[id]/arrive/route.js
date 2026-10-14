import { requireAuth } from '@/lib/auth/helpers';
import { driverArrived, serializeRide, RideError } from '@/lib/services/ride-service';

// POST /api/rides/[id]/arrive — driver marks arrival at pickup
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    const { id } = await params;
    const ride = await driverArrived({ rideId: id, driverUserId: session.user.id });
    return Response.json({ ride: serializeRide(ride) });
  } catch (err) {
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Arrive error:', err);
    return Response.json({ error: 'Failed to update ride' }, { status: 500 });
  }
}
