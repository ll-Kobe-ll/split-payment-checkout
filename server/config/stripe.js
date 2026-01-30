import Stripe from 'stripe';
import { logger } from '../utils/logger.js';

let stripeClient = null;

export function getStripeClient() {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    stripeClient = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      maxNetworkRetries: 2,
      timeout: 30000,
    });

    logger.info('Stripe client initialized', {
      apiVersion: stripeClient.getApiField('version')
    });
  }

  return stripeClient;
}

export function getStripePublicKey() {
  const publicKey = process.env.STRIPE_PUBLIC_KEY;
  
  if (!publicKey) {
    throw new Error('STRIPE_PUBLIC_KEY environment variable is required');
  }

  return publicKey;
}

export function getStripeWebhookSecret() {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    logger.warn('STRIPE_WEBHOOK_SECRET not set - webhook validation will fail');
  }

  return webhookSecret;
}

