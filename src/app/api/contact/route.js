import { z } from 'zod';
import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';
import ContactMessage from '@/lib/db/models/ContactMessage';
import { auth } from '@/lib/auth/config';

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name').max(100),
  email: z.string().trim().email('Enter a valid email address').max(200),
  topic: z
    .enum(['general', 'ride_issue', 'driver_support', 'payments', 'safety', 'data_request'])
    .default('general'),
  message: z.string().trim().min(10, 'Tell us a bit more (10+ characters)').max(2000),
  // Honeypot — real users never fill this
  company: z.string().max(0).optional().or(z.literal('')),
});

// POST /api/contact — public contact form (rate limited per IP)
export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = contactSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    // Simple per-IP rate limit: 5 messages/hour
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';
    try {
      const key = `contact:rl:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 3600);
      if (count > 5) {
        return Response.json(
          { error: 'Too many messages — please try again later' },
          { status: 429 }
        );
      }
    } catch {
      /* Redis down — accept the message rather than lose it */
    }

    const session = await auth().catch(() => null);

    await connectDB();
    const { name, email, topic, message } = parsed.data;
    await ContactMessage.create({
      name,
      email,
      topic,
      message,
      userId: session?.user?.id || null,
    });

    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('Contact error:', err);
    return Response.json({ error: 'Failed to send your message' }, { status: 500 });
  }
}
