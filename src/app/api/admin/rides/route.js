import connectDB from '@/lib/db/mongodb';
import Ride from '@/lib/db/models/Ride';
import { requireAuth } from '@/lib/auth/helpers';

// GET /api/admin/rides — all rides with filters
export async function GET(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));
    const status = searchParams.get('status');

    const query = {};
    if (status) query.status = status;

    const [rides, total] = await Promise.all([
      Ride.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('riderId', 'name username')
        .populate('driverId', 'name username')
        .select('status pickup.address dropoff.address fare vehicleType payment createdAt completedAt')
        .lean(),
      Ride.countDocuments(query),
    ]);

    return Response.json({
      rides,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Admin rides error:', err);
    return Response.json({ error: 'Failed to fetch rides' }, { status: 500 });
  }
}
