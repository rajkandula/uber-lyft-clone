import { z } from 'zod';
import { requireAuth } from '@/lib/auth/helpers';
import { addRideMessage, RideError } from '@/lib/services/ride-service';

const messageSchema = z.object({
  text: z.string().trim().min(1, 'Message cannot be empty').max(500),
});

// POST /api/rides/[id]/messages — send an in-ride chat message
// (persisted, then relayed over the socket to the other party)
export async function POST(request, { params }) {
  const { session, error } = await requireAuth(['rider', 'driver']);
  if (error) return error;

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
    }

    const message = await addRideMessage({
      rideId: id,
      userId: session.user.id,
      role: session.user.role,
      text: parsed.data.text,
    });

    return Response.json({ message }, { status: 201 });
  } catch (err) {
    if (err instanceof RideError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Ride message error:', err);
    return Response.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
