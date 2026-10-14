import { z } from 'zod';
import { requireAuth } from '@/lib/auth/helpers';
import { rateRide, RideError } from '@/lib/services/ride-service';

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

// POST /api/rides/[id]/rate — rate a completed ride
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(['rider', 'driver']);
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = rateSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Rating must be 1-5 stars' }, { status: 400 });
    }

    await rateRide({
      rideId: id,
      userId: session.user.id,
      role: session.user.role,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Rate ride error:', err);
    return Response.json({ error: 'Failed to rate ride' }, { status: 500 });
  }
}
