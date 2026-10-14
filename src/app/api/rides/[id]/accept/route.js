import { requireAuth } from '@/lib/auth/helpers';
import { acceptRide, serializeRide, RideError } from '@/lib/services/ride-service';

// POST /api/rides/[id]/accept — driver accepts an offered ride
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    const { id } = await params;
    const { ride, driver, driverUser, etaMinutes } = await acceptRide({
      rideId: id,
      driverUserId: session.user.id,
    });

    return Response.json({
      ride: serializeRide(ride, { driver, driverUser }),
      etaMinutes,
    });
  } catch (err) {
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Accept ride error:', err);
    return Response.json({ error: 'Failed to accept ride' }, { status: 500 });
  }
}
