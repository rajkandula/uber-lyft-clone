import { z } from 'zod';
import mongoose from 'mongoose';
import connectDB from '@/lib/db/mongodb';
import ContactMessage from '@/lib/db/models/ContactMessage';
import { requireAuth } from '@/lib/auth/helpers';

// GET /api/admin/support — support inbox (?status=open|resolved)
export async function GET(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(50, parseInt(searchParams.get('limit') || '20', 10));

    const query = {};
    if (status) query.status = status;

    const [messages, total, openCount] = await Promise.all([
      ContactMessage.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('userId', 'name username role')
        .lean(),
      ContactMessage.countDocuments(query),
      ContactMessage.countDocuments({ status: 'open' }),
    ]);

    return Response.json({
      messages,
      openCount,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Support inbox error:', err);
    return Response.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

const patchSchema = z.object({
  id: z.string(),
  status: z.enum(['open', 'resolved']),
});

// PATCH /api/admin/support — resolve / reopen a message
export async function PATCH(request) {
  const { error } = await requireAuth(['admin']);
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success || !mongoose.Types.ObjectId.isValid(parsed.data.id)) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    await connectDB();
    const message = await ContactMessage.findByIdAndUpdate(
      parsed.data.id,
      {
        status: parsed.data.status,
        resolvedAt: parsed.data.status === 'resolved' ? new Date() : null,
      },
      { new: true }
    ).lean();

    if (!message) return Response.json({ error: 'Message not found' }, { status: 404 });
    return Response.json({ message });
  } catch (err) {
    console.error('Support update error:', err);
    return Response.json({ error: 'Failed to update message' }, { status: 500 });
  }
}
