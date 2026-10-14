import { z } from 'zod';
import { requireAuth } from '@/lib/auth/helpers';
import { cancelRide, serializeRide, RideError } from '@/lib/services/ride-service';

const cancelSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});

// POST /api/rides/[id]/cancel — rider or driver cancels
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(['rider', 'driver']);
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);

    const ride = await cancelRide({
      rideId: id,
      userId: session.user.id,
      role: session.user.role,
      reason: parsed.success ? parsed.data.reason : '',
    });

    return Response.json({ ride: serializeRide(ride) });
  } catch (err) {
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Cancel ride error:', err);
    return Response.json({ error: 'Failed to cancel ride' }, { status: 500 });
  }
}
