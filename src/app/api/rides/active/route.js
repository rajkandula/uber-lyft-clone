import { requireAuth } from '@/lib/auth/helpers';
import { getActiveRide } from '@/lib/services/ride-service';

// GET /api/rides/active — current live ride for reconnect/resume
export async function GET() {
  const { session, error } = await requireAuth(['rider', 'driver']);
  if (error) return error;

  try {
    const ride = await getActiveRide({
      userId: session.user.id,
      role: session.user.role,
    });
    return Response.json({ ride });
  } catch (err) {
    console.error('Active ride error:', err);
    return Response.json({ error: 'Failed to fetch active ride' }, { status: 500 });
  }
}
