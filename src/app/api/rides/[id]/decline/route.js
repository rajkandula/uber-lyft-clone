import { requireAuth } from '@/lib/auth/helpers';
import { declineOffer, RideError } from '@/lib/services/ride-service';

// POST /api/rides/[id]/decline — driver declines an offered ride
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    const { id } = await params;
    await declineOffer({ rideId: id, driverUserId: session.user.id });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Decline ride error:', err);
    return Response.json({ error: 'Failed to decline ride' }, { status: 500 });
  }
}
