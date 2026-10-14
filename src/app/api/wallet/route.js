import { z } from 'zod';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import { requireAuth } from '@/lib/auth/helpers';
import { isStripeEnabled } from '@/lib/services/stripe';

const topupSchema = z.object({
  amount: z
    .number()
    .positive('Amount must be positive')
    .max(1000, 'Maximum top-up is $1,000'),
});

// GET /api/wallet — balance + transaction history
export async function GET(request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const limit = Math.min(100, parseInt(searchParams.get('limit') || '30', 10));

    const [user, transactions] = await Promise.all([
      User.findById(session.user.id).select('wallet').lean(),
      WalletTransaction.find({ userId: session.user.id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
    ]);

    return Response.json({
      wallet: user?.wallet || { balance: 0, currency: 'USD' },
      transactions,
      stripeEnabled: isStripeEnabled(),
    });
  } catch (err) {
    console.error('Wallet error:', err);
    return Response.json({ error: 'Failed to fetch wallet' }, { status: 500 });
  }
}

// POST /api/wallet — demo top-up (instant credit). Automatically disabled
// once Stripe is configured, so real deployments can't mint free balance.
export async function POST(request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  if (isStripeEnabled()) {
    return Response.json(
      { error: 'Top-ups are processed by card — use the Add funds button' },
      { status: 409 }
    );
  }

  try {
    const body = await request.json();
    const parsed = topupSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || 'Invalid amount' },
        { status: 400 }
      );
    }

    const amount = Math.round(parsed.data.amount * 100) / 100;

    await connectDB();
    const user = await User.findByIdAndUpdate(
      session.user.id,
      { $inc: { 'wallet.balance': amount } },
      { new: true }
    );

    const txn = await WalletTransaction.create({
      userId: session.user.id,
      type: 'topup',
      amount,
      balanceAfter: user.wallet.balance,
      note: 'Wallet top-up',
    });

    return Response.json({ wallet: user.wallet, transaction: txn }, { status: 201 });
  } catch (err) {
    console.error('Top-up error:', err);
    return Response.json({ error: 'Failed to top up wallet' }, { status: 500 });
  }
}
