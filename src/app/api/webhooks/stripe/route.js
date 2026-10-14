import { getStripe, isStripeEnabled, creditCheckoutSession } from '@/lib/services/stripe';
import { syncAccountStatus } from '@/lib/services/payouts';

// POST /api/webhooks/stripe — Stripe event delivery.
// Register this URL in the Stripe Dashboard (Developers → Webhooks) with the
// `checkout.session.completed` (wallet top-ups) and `account.updated` (driver
// payouts) events, using the same signing secret as STRIPE_WEBHOOK_SECRET.
export async function POST(request) {
  if (!isStripeEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return Response.json({ error: 'Webhook not configured' }, { status: 501 });
  }

  const stripe = getStripe();
  const signature = request.headers.get('stripe-signature');
  const payload = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.warn('Stripe webhook signature verification failed:', err.message);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    // Driver finished (or changed) Connect onboarding
    if (event.type === 'account.updated') {
      await syncAccountStatus(event.data.object);
      console.log(
        `[Stripe] account.updated ${event.data.object.id}:`,
        `payouts_enabled=${event.data.object.payouts_enabled}`
      );
      return Response.json({ received: true });
    }

    if (event.type === 'checkout.session.completed') {
      const result = await creditCheckoutSession(event.data.object);
      console.log(
        `[Stripe] checkout.session.completed ${event.data.object.id}:`,
        result.credited ? `credited $${result.amount}` : result.reason
      );
    }
    return Response.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    // Non-2xx makes Stripe retry — desirable for transient DB failures
    return Response.json({ error: 'Handler failed' }, { status: 500 });
  }
}
