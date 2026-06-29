import { loadConfig } from '../../config.js';
import { prisma } from '../../lib/prisma.js';

let stripe: any = null;

async function getStripe() {
  if (!stripe) {
    const config = loadConfig();
    if (!config.STRIPE_SECRET_KEY) {
      throw Object.assign(new Error('Stripe not configured'), { statusCode: 501, code: 'STRIPE_NOT_CONFIGURED' });
    }
    const Stripe = (await import('stripe')).default;
    stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia' });
  }
  return stripe;
}

export async function createCheckoutSession(userId: string, email: string) {
  const config = loadConfig();
  const s = await getStripe();

  const session = await s.checkout.sessions.create({
    customer_email: email,
    mode: 'subscription',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'HanZiWeb Pro' },
          unit_amount: 499,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    success_url: config.STRIPE_SUCCESS_URL,
    cancel_url: config.STRIPE_CANCEL_URL,
    metadata: { userId },
  });

  return { url: session.url, sessionId: session.id };
}

export async function handleWebhook(rawBody: Buffer, signature: string) {
  const config = loadConfig();
  const s = await getStripe();

  let event: any;
  try {
    event = s.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET!);
  } catch {
    throw Object.assign(new Error('Webhook signature verification failed'), { statusCode: 400, code: 'WEBHOOK_SIGNATURE_INVALID' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            subscriptionTier: 'pro',
            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            stripeCustomerId: session.customer,
          },
        });
      }
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      const user = await prisma.user.findFirst({ where: { stripeCustomerId: customerId } });
      if (user) {
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionTier: isActive ? 'pro' : 'free',
            subscriptionExpiresAt: isActive ? new Date(subscription.current_period_end * 1000) : null,
          },
        });
      }
      break;
    }
  }

  return { received: true };
}
