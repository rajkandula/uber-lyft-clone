import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import { requireAuth } from '@/lib/auth/helpers';

// GET /api/admin/users — user list
export async function GET(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));
    const role = searchParams.get('role');
    const q = searchParams.get('q');

    const query = {};
    if (role) query.role = role;
    if (q) {
      query.$or = [
        { name: { $regex: q, $options: 'i' } },
        { username: { $regex: q, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('name username role rating wallet.balance isActive createdAt lastLoginAt')
        .lean(),
      User.countDocuments(query),
    ]);

    return Response.json({
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Admin users error:', err);
    return Response.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}
