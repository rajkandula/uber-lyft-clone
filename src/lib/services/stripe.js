import Stripe from 'stripe';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import WalletTransaction from '@/lib/db/models/WalletTransaction';

export function isStripeEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let client = null;

/** Lazily-initialized Stripe client (null when not configured). */
export function getStripe() {
  if (!isStripeEnabled()) return null;
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

/**
 * Credit a paid Checkout session to the user's wallet exactly once.
 * Safe to call from both the webhook and the success-return page —
 * the unique `ref` index makes double-credits impossible.
 *
 * @returns {{ credited: boolean, amount?: number, balance?: number }}
 */
export async function creditCheckoutSession(session) {
  if (session.payment_status !== 'paid') {
    return { credited: false, reason: 'not_paid' };
  }

  const userId = session.metadata?.userId;
  const amount = (session.amount_total ?? 0) / 100;
  if (!userId || amount <= 0) {
    return { credited: false, reason: 'invalid_session' };
  }

  await connectDB();

  // Already applied? (webhook and return page can race — ref is unique)
  const existing = await WalletTransaction.findOne({ ref: session.id }).lean();
  if (existing) {
    return { credited: false, reason: 'already_credited' };
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $inc: { 'wallet.balance': amount } },
    { new: true }
  );
  if (!user) return { credited: false, reason: 'user_not_found' };

  try {
    await WalletTransaction.create({
      userId,
      type: 'topup',
      amount,
      balanceAfter: user.wallet.balance,
      note: 'Card top-up (Stripe)',
      ref: session.id,
    });
  } catch (err) {
    if (err?.code === 11000) {
      // Lost the race with the other path — undo our duplicate credit
      await User.findByIdAndUpdate(userId, { $inc: { 'wallet.balance': -amount } });
      return { credited: false, reason: 'already_credited' };
    }
    throw err;
  }

  return { credited: true, amount, balance: user.wallet.balance };
}
