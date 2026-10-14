import { z } from 'zod';
import bcrypt from 'bcryptjs';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import Driver from '@/lib/db/models/Driver';

const signupSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(3, 'Username must be at least 3 characters')
      .max(30)
      .regex(/^[a-z0-9_.]+$/, 'Username can only contain letters, numbers, dots and underscores'),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    confirmPassword: z.string(),
    role: z.enum(['rider', 'driver']).default('rider'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// POST /api/auth/signup
export async function POST(request) {
  try {
    const body = await request.json();
    const parsed = signupSchema.safeParse(body);

    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return Response.json(
        { error: first?.message || 'Invalid input', field: first?.path?.[0] },
        { status: 400 }
      );
    }

    const { name, username, password, role } = parsed.data;

    await connectDB();

    const existing = await User.findOne({ username });
    if (existing) {
      return Response.json(
        { error: 'This username is already taken', field: 'username' },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      username,
      passwordHash,
      role,
    });

    // Drivers get a driver profile; vehicle details come from onboarding
    if (role === 'driver') {
      const autoApprove = process.env.DRIVER_AUTO_APPROVE !== 'false';
      await Driver.create({
        userId: user._id,
        isApproved: autoApprove,
      });
    }

    return Response.json(
      {
        user: {
          id: user._id.toString(),
          name: user.name,
          username: user.username,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // Duplicate key race (unique index) — treat as taken username
    if (error?.code === 11000) {
      return Response.json(
        { error: 'This username is already taken', field: 'username' },
        { status: 409 }
      );
    }
    console.error('Signup error:', error);
    return Response.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
