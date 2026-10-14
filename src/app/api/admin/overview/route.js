import connectDB from '@/lib/db/mongodb';
import Ride from '@/lib/db/models/Ride';
import User from '@/lib/db/models/User';
import Driver from '@/lib/db/models/Driver';
import ContactMessage from '@/lib/db/models/ContactMessage';
import { requireAuth } from '@/lib/auth/helpers';

function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n) {
  const d = startOfDay();
  d.setDate(d.getDate() - n);
  return d;
}

// GET /api/admin/overview — platform KPIs
export async function GET() {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    await connectDB();
    const today = startOfDay();

    const [
      ridesToday,
      activeRides,
      revenueAgg,
      totalUsers,
      totalDrivers,
      onlineDrivers,
      pendingDrivers,
      recentRides,
      revenue7d,
      statusBreakdown,
      openSupport,
    ] = await Promise.all([
      Ride.countDocuments({ createdAt: { $gte: today } }),
      Ride.countDocuments({ status: { $in: ['searching', 'accepted', 'arrived', 'in_progress'] } }),
      Ride.aggregate([
        { $match: { status: 'completed', completedAt: { $gte: today } } },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$fare.total' },
            platformFees: { $sum: '$fare.platformFee' },
            trips: { $sum: 1 },
          },
        },
      ]),
      User.countDocuments({ role: 'rider' }),
      Driver.countDocuments({}),
      Driver.countDocuments({ isOnline: true }),
      Driver.countDocuments({ isApproved: false }),
      Ride.find({})
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('riderId', 'name')
        .populate('driverId', 'name')
        .select('status pickup.address dropoff.address fare.total vehicleType createdAt')
        .lean(),
      Ride.aggregate([
        { $match: { status: 'completed', completedAt: { $gte: daysAgo(6) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
            revenue: { $sum: '$fare.total' },
            platformFees: { $sum: '$fare.platformFee' },
            driverEarnings: { $sum: '$fare.driverEarnings' },
            trips: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Ride.aggregate([
        { $match: { createdAt: { $gte: daysAgo(6) } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      ContactMessage.countDocuments({ status: 'open' }),
    ]);

    return Response.json({
      ridesToday,
      activeRides,
      revenueToday: revenueAgg[0]?.revenue || 0,
      platformFeesToday: revenueAgg[0]?.platformFees || 0,
      completedToday: revenueAgg[0]?.trips || 0,
      totalUsers,
      totalDrivers,
      onlineDrivers,
      pendingDrivers,
      recentRides,
      revenue7d,
      statusBreakdown: Object.fromEntries(statusBreakdown.map((s) => [s._id, s.count])),
      openSupport,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    return Response.json({ error: 'Failed to fetch overview' }, { status: 500 });
  }
}
