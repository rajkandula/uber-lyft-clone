import { z } from 'zod';
import connectDB from '@/lib/db/mongodb';
import Driver from '@/lib/db/models/Driver';
import { requireAuth } from '@/lib/auth/helpers';

const vehicleSchema = z.object({
  vehicle: z.object({
    make: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(50),
    year: z.number().int().min(1990).max(2030),
    color: z.string().trim().min(1).max(30),
    plate: z.string().trim().min(2).max(15),
    type: z.enum(['economy', 'comfort', 'premium', 'xl']),
  }),
  license: z
    .object({
      number: z.string().trim().max(50).optional(),
    })
    .optional(),
});

// GET /api/drivers/me — driver profile
export async function GET() {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    await connectDB();
    let driver = await Driver.findOne({ userId: session.user.id }).lean();

    // Self-heal: driver user without a profile (e.g. role changed by admin)
    if (!driver) {
      const autoApprove = process.env.DRIVER_AUTO_APPROVE !== 'false';
      driver = (
        await Driver.create({ userId: session.user.id, isApproved: autoApprove })
      ).toObject();
    }

    return Response.json({ driver });
  } catch (err) {
    console.error('Driver profile error:', err);
    return Response.json({ error: 'Failed to fetch driver profile' }, { status: 500 });
  }
}

// PATCH /api/drivers/me — update vehicle / onboarding details
export async function PATCH(request) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = vehicleSchema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return Response.json(
        { error: `${first?.path?.join('.') || 'input'}: ${first?.message || 'invalid'}` },
        { status: 400 }
      );
    }

    await connectDB();

    const update = { vehicle: parsed.data.vehicle };
    if (parsed.data.license?.number) {
      update['license.number'] = parsed.data.license.number;
    }

    const driver = await Driver.findOneAndUpdate(
      { userId: session.user.id },
      update,
      { new: true }
    ).lean();

    if (!driver) {
      return Response.json({ error: 'Driver profile not found' }, { status: 404 });
    }

    return Response.json({ driver });
  } catch (err) {
    console.error('Driver update error:', err);
    return Response.json({ error: 'Failed to update driver profile' }, { status: 500 });
  }
}
