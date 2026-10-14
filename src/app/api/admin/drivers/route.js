import { z } from 'zod';
import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import Driver from '@/lib/db/models/Driver';
import { requireAuth } from '@/lib/auth/helpers';

// GET /api/admin/drivers — driver list (?pending=1 for approval queue)
export async function GET(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const pending = searchParams.get('pending') === '1';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));

    const query = pending ? { isApproved: false } : {};

    const [drivers, total] = await Promise.all([
      Driver.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name username avatar rating createdAt')
        .lean(),
      Driver.countDocuments(query),
    ]);

    return Response.json({
      drivers,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Admin drivers error:', err);
    return Response.json({ error: 'Failed to fetch drivers' }, { status: 500 });
  }
}

const patchSchema = z.object({
  driverId: z.string(),
  isApproved: z.boolean(),
});

// PATCH /api/admin/drivers — approve / suspend a driver
export async function PATCH(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success || !mongoose.Types.ObjectId.isValid(parsed.data.driverId)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    await connectDB();
    const update = { isApproved: parsed.data.isApproved };
    if (!parsed.data.isApproved) update.isOnline = false; // suspend also knocks them offline

    const driver = await Driver.findByIdAndUpdate(parsed.data.driverId, update, {
      new: true,
    })
      .populate('userId', 'name username')
      .lean();

    if (!driver) return Response.json({ error: 'Driver not found' }, { status: 404 });

    return Response.json({ driver });
  } catch (err) {
    console.error('Admin driver update error:', err);
    return Response.json({ error: 'Failed to update driver' }, { status: 500 });
  }
}
