import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import Ride from '@/lib/db/models/Ride';
import { requireAuth } from '@/lib/auth/helpers';
import { serializeRide } from '@/lib/services/ride-service';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';

// GET /api/rides/[id] — ride detail (participants + admin only)
export async function GET(request, { params }) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return Response.json({ error: 'Ride not found' }, { status: 404 });
    }

    await connectDB();
    const ride = await Ride.findById(id);
    if (!ride) return Response.json({ error: 'Ride not found' }, { status: 404 });

    const isParticipant =
      String(ride.riderId) === session.user.id ||
      (ride.driverId && String(ride.driverId) === session.user.id);
    if (!isParticipant && session.user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let driver = null;
    let driverUser = null;
    if (ride.driverProfileId) {
      [driver, driverUser] = await Promise.all([
        Driver.findById(ride.driverProfileId).lean(),
        User.findById(ride.driverId).lean(),
      ]);
    }

    const rider = await User.findById(ride.riderId).select('name avatar rating').lean();

    return Response.json({
      ride: serializeRide(ride, { driver, driverUser }),
      rider: rider
        ? { name: rider.name, avatar: rider.avatar, rating: rider.rating?.average ?? 5 }
        : null,
    });
  } catch (err) {
    console.error('Ride detail error:', err);
    return Response.json({ error: 'Failed to fetch ride' }, { status: 500 });
  }
}
