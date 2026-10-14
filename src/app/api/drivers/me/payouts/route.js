import { z } from 'zod';
import { requireAuth } from '@/lib/auth/helpers';
import {
  createOnboardingLink,
  getPayoutStatus,
  cashOut,
  PayoutError,
} from '@/lib/services/payouts';

// GET /api/drivers/me/payouts — onboarding + balance status
export async function GET() {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    return Response.json(await getPayoutStatus(session.user.id));
  } catch (err) {
    if (err instanceof PayoutError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Payout status error:', err);
    return Response.json({ error: 'Failed to load payout status' }, { status: 500 });
  }
}

const actionSchema = z.object({
  action: z.enum(['onboard', 'cashout']),
  amount: z.number().positive().max(10000).optional(),
});

// POST /api/drivers/me/payouts — start onboarding, or cash out earnings
export async function POST(request) {
  const { session, error } = await requireAuth(['driver']);
  if (error) return error;

  try {
    const body = await request.json();
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid request' }, { status: 400 });
    }

    if (parsed.data.action === 'onboard') {
      const origin =
        request.headers.get('origin') ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'http://localhost:3000';
      const { url } = await createOnboardingLink({
        driverUserId: session.user.id,
        origin,
      });
      return Response.json({ url });
    }

    const result = await cashOut({
      driverUserId: session.user.id,
      amount: parsed.data.amount,
    });
    return Response.json(result);
  } catch (err) {
    if (err instanceof PayoutError) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error('Payout action error:', err);
    return Response.json({ error: 'Payout failed' }, { status: 500 });
  }
}
