import connectDB from '@/lib/db/mongodb';
import Driver from '@/lib/db/models/Driver';
import { requireAuth, signSocketToken } from '@/lib/auth/helpers';

// GET /api/auth/socket-token — short-lived JWT for Socket.IO handshake
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const extraClaims = {};

    // Drivers carry their profile id — the H3 spatial index is keyed by it
    if (session.user.role === 'driver') {
      await connectDB();
      const driver = await Driver.findOne({ userId: session.user.id })
        .select('_id')
        .lean();
      if (driver) extraClaims.profileId = String(driver._id);
    }

    const token = signSocketToken(session.user, extraClaims);
    return Response.json({ token });
  } catch (err) {
    console.error('Socket token error:', err);
    return Response.json({ error: 'Failed to issue token' }, { status: 500 });
  }
}
