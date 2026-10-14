import { z } from 'zod';
import { requireAuth } from '@/lib/auth/helpers';
import { getStripe, isStripeEnabled, creditCheckoutSession } from '@/lib/services/stripe';

const checkoutSchema = z.object({
  amount: z
    .number()
    .min(5, 'Minimum top-up is $5')
    .max(1000, 'Maximum top-up is $1,000'),
});

// POST /api/wallet/checkout — create a Stripe Checkout session for a top-up
export async function POST(request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  if (!isStripeEnabled()) {
    return Response.json({ error: 'Card payments are not configured' }, { status: 501 });
  }

  try {
    const body = await request.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message || 'Invalid amount' },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const origin =
      request.headers.get('origin') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000';
    const amountCents = Math.round(parsed.data.amount * 100);

    const checkout = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: 'Kova wallet top-up',
              description: 'Funds are available for rides immediately after payment',
            },
          },
          quantity: 1,
        },
      ],
      metadata: { userId: session.user.id },
      success_url: `${origin}/wallet?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/wallet?topup=cancelled`,
    });

    return Response.json({ url: checkout.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    return Response.json(
      { error: 'Could not start the card payment — try again shortly' },
      { status: 502 }
    );
  }
}

// GET /api/wallet/checkout?session_id=cs_… — verify a completed session and
// credit the wallet (fallback for when the webhook hasn't arrived yet)
export async function GET(request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  if (!isStripeEnabled()) {
    return Response.json({ error: 'Card payments are not configured' }, { status: 501 });
  }

  try {
    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId || !sessionId.startsWith('cs_')) {
      return Response.json({ error: 'Invalid session' }, { status: 400 });
    }

    const stripe = getStripe();
    const checkout = await stripe.checkout.sessions.retrieve(sessionId);

    // Only the buyer may claim their own session
    if (checkout.metadata?.userId !== session.user.id) {
      return Response.json({ error: 'Session does not belong to you' }, { status: 403 });
    }

    const result = await creditCheckoutSession(checkout);
    return Response.json({
      paid: checkout.payment_status === 'paid',
      ...result,
    });
  } catch (err) {
    console.error('Stripe verify error:', err.message);
    return Response.json({ error: 'Could not verify the payment' }, { status: 502 });
  }
}
