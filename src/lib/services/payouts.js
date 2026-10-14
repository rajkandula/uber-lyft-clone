import connectDB from '@/lib/db/mongodb';
import Driver from '@/lib/db/models/Driver';
import User from '@/lib/db/models/User';
import WalletTransaction from '@/lib/db/models/WalletTransaction';
import { getStripe, isStripeEnabled } from './stripe';

/** Drivers must have at least this much earned before cashing out. */
export const MIN_PAYOUT = 5;

const round2 = (n) => Math.round(n * 100) / 100;

class PayoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export { PayoutError };

/**
 * Create (or reuse) the driver's Stripe Connect Express account and return a
 * hosted onboarding link. Stripe collects identity and bank details directly —
 * none of it touches our servers.
 */
export async function createOnboardingLink({ driverUserId, origin }) {
  if (!isStripeEnabled()) throw new PayoutError('Payouts are not configured', 501);
  const stripe = getStripe();

  await connectDB();
  const driver = await Driver.findOne({ userId: driverUserId });
  if (!driver) throw new PayoutError('Driver profile not found', 404);

  const user = await User.findById(driverUserId).select('email name').lean();

  let accountId = driver.payouts?.stripeAccountId;

  if (!accountId) {
    let account;
    try {
      account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: user?.email || undefined,
        business_type: 'individual',
        capabilities: {
          transfers: { requested: true },
        },
        business_profile: {
          product_description: 'Rideshare driver on the Kova platform',
          mcc: '4121', // taxicabs & limousines
        },
        metadata: {
          driverUserId: String(driverUserId),
          driverProfileId: String(driver._id),
        },
      });
    } catch (err) {
      // Surface Stripe's own message — it names the exact dashboard setting
      // that needs attention (e.g. an incomplete Connect platform profile).
      throw new PayoutError(
        err?.raw?.message || err?.message || 'Stripe could not create the payout account',
        // 4xx, not 5xx: a CDN or proxy in front of the app may replace 5xx
        // responses with its own error page, hiding this message from the driver.
        409
      );
    }
    accountId = account.id;
    driver.payouts.stripeAccountId = accountId;
    await driver.save();
  }

  let link;
  try {
    link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/driver/earnings?payout=refresh`,
      return_url: `${origin}/driver/earnings?payout=done`,
      type: 'account_onboarding',
    });
  } catch (err) {
    throw new PayoutError(
      err?.raw?.message || err?.message || 'Could not start Stripe onboarding',
      409
    );
  }

  return { url: link.url, accountId };
}

/**
 * Current payout state for a driver: onboarding status + what they can withdraw.
 */
export async function getPayoutStatus(driverUserId) {
  await connectDB();

  const [driver, user] = await Promise.all([
    Driver.findOne({ userId: driverUserId }).select('payouts').lean(),
    User.findById(driverUserId).select('wallet').lean(),
  ]);

  const balance = round2(user?.wallet?.balance ?? 0);
  const accountId = driver?.payouts?.stripeAccountId || '';

  let detailsSubmitted = driver?.payouts?.detailsSubmitted ?? false;
  let payoutsEnabled = driver?.payouts?.payoutsEnabled ?? false;

  // Refresh from Stripe so the UI is right even if a webhook was missed
  if (accountId && isStripeEnabled()) {
    try {
      const account = await getStripe().accounts.retrieve(accountId);
      detailsSubmitted = Boolean(account.details_submitted);
      payoutsEnabled = Boolean(account.payouts_enabled);
      await Driver.updateOne(
        { userId: driverUserId },
        { 'payouts.detailsSubmitted': detailsSubmitted, 'payouts.payoutsEnabled': payoutsEnabled }
      );
    } catch {
      /* fall back to stored values */
    }
  }

  return {
    configured: isStripeEnabled(),
    connected: Boolean(accountId),
    detailsSubmitted,
    payoutsEnabled,
    balance,
    minPayout: MIN_PAYOUT,
    canCashOut: payoutsEnabled && balance >= MIN_PAYOUT,
    lastPayoutAt: driver?.payouts?.lastPayoutAt || null,
  };
}

/**
 * Move a driver's earned balance to their bank via Stripe.
 *
 * The wallet is debited FIRST (atomically, guarded on sufficient balance) so a
 * double-click cannot pay twice; if Stripe then fails we credit it straight
 * back. Stripe is the money transmitter for this leg — we never touch the
 * driver's bank details.
 */
export async function cashOut({ driverUserId, amount }) {
  if (!isStripeEnabled()) throw new PayoutError('Payouts are not configured', 501);
  const stripe = getStripe();

  await connectDB();
  const driver = await Driver.findOne({ userId: driverUserId });
  if (!driver?.payouts?.stripeAccountId) {
    throw new PayoutError('Set up payouts before cashing out', 409);
  }
  if (!driver.payouts.payoutsEnabled) {
    throw new PayoutError('Stripe is still reviewing your details — try again shortly', 409);
  }

  const user = await User.findById(driverUserId).select('wallet').lean();
  const balance = round2(user?.wallet?.balance ?? 0);

  const requested = amount == null ? balance : round2(amount);
  if (requested < MIN_PAYOUT) {
    throw new PayoutError(`Minimum payout is $${MIN_PAYOUT.toFixed(2)}`, 400);
  }
  if (requested > balance) {
    throw new PayoutError('Amount exceeds your available earnings', 400);
  }

  // Debit first — guarded so concurrent requests can't both succeed
  const debited = await User.findOneAndUpdate(
    { _id: driverUserId, 'wallet.balance': { $gte: requested } },
    { $inc: { 'wallet.balance': -requested } },
    { new: true }
  );
  if (!debited) throw new PayoutError('Insufficient balance', 400);

  let transfer;
  try {
    transfer = await stripe.transfers.create(
      {
        amount: Math.round(requested * 100),
        currency: 'usd',
        destination: driver.payouts.stripeAccountId,
        description: 'Kova driver earnings',
        metadata: { driverUserId: String(driverUserId) },
      },
      // Idempotency: same driver + amount + minute can't double-send
      { idempotencyKey: `payout_${driverUserId}_${requested}_${Math.floor(Date.now() / 60000)}` }
    );
  } catch (err) {
    // Refund the wallet so the driver never loses money to a Stripe failure
    await User.findByIdAndUpdate(driverUserId, { $inc: { 'wallet.balance': requested } });
    throw new PayoutError(
      err?.raw?.message || 'Payout failed — your balance is unchanged',
      409
    );
  }

  await WalletTransaction.create({
    userId: driverUserId,
    type: 'payout',
    amount: -requested,
    balanceAfter: debited.wallet.balance,
    note: 'Payout to your bank account',
    ref: transfer.id,
  });

  await Driver.updateOne({ userId: driverUserId }, { 'payouts.lastPayoutAt': new Date() });

  return { amount: requested, balance: debited.wallet.balance, transferId: transfer.id };
}

/** Sync onboarding status from an `account.updated` webhook event. */
export async function syncAccountStatus(account) {
  await connectDB();
  await Driver.updateOne(
    { 'payouts.stripeAccountId': account.id },
    {
      'payouts.detailsSubmitted': Boolean(account.details_submitted),
      'payouts.payoutsEnabled': Boolean(account.payouts_enabled),
    }
  );
}
