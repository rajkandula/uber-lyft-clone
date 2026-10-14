import { requireAuth } from '@/lib/auth/helpers';
import { completeRide, serializeRide, RideError } from '@/lib/services/ride-service';

// POST /api/rides/[id]/complete — driver ends the trip; settles payment
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    const { id } = await params;
    const ride = await completeRide({ rideId: id, driverUserId: session.user.id });
    return Response.json({ ride: serializeRide(ride) });
  } catch (err) {
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Complete ride error:', err);
    return Response.json({ error: 'Failed to complete ride' }, { status: 500 });
  }
}
