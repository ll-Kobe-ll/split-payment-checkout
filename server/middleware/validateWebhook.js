import crypto from 'crypto';
import { getShopifyClient } from '../config/shopify.js';
import { getStripeWebhookSecret } from '../config/stripe.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to validate Shopify webhook HMAC signature
 */
export function validateShopifyWebhook(req, res, next) {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const topic = req.headers['x-shopify-topic'];
    const shop = req.headers['x-shopify-shop-domain'];

    if (!hmac || !topic || !shop) {
      logger.warn('Missing Shopify webhook headers', {
        hasHmac: !!hmac,
        hasTopic: !!topic,
        hasShop: !!shop
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_WEBHOOK',
          message: 'Missing required webhook headers'
        }
      });
    }

    const shopify = getShopifyClient();
    const apiSecret = process.env.SHOPIFY_API_SECRET;

    if (!apiSecret) {
      logger.error('SHOPIFY_API_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Server configuration error'
        }
      });
    }

    // Calculate HMAC
    const rawBody = JSON.stringify(req.body);
    const calculatedHmac = crypto
      .createHmac('sha256', apiSecret)
      .update(rawBody, 'utf8')
      .digest('base64');

    // Compare HMACs (use timing-safe comparison)
    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(calculatedHmac))) {
      logger.warn('Invalid Shopify webhook HMAC', {
        shop,
        topic
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_WEBHOOK',
          message: 'Invalid webhook signature'
        }
      });
    }

    // Store webhook metadata in request
    req.webhookTopic = topic;
    req.webhookShop = shop;

    logger.debug('Shopify webhook validated', { shop, topic });
    next();
  } catch (error) {
    logger.error('Error validating Shopify webhook', {
      error: error.message
    });
    return res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_VALIDATION_ERROR',
        message: 'Error validating webhook'
      }
    });
  }
}

/**
 * Middleware to validate Stripe webhook signature
 */
export async function validateStripeWebhook(req, res, next) {
  try {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = getStripeWebhookSecret();

    if (!signature) {
      logger.warn('Missing Stripe webhook signature');
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_WEBHOOK',
          message: 'Missing webhook signature'
        }
      });
    }

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONFIGURATION_ERROR',
          message: 'Server configuration error'
        }
      });
    }

    // For Express, we need the raw body
    // In production, use express.raw() middleware for /api/stripe/webhook route
    const rawBody = req.rawBody || JSON.stringify(req.body);

    // Stripe expects the raw body buffer
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    
    try {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret
      );

      req.stripeEvent = event;
      logger.debug('Stripe webhook validated', {
        type: event.type,
        id: event.id
      });

      next();
    } catch (err) {
      logger.warn('Invalid Stripe webhook signature', {
        error: err.message
      });
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_WEBHOOK',
          message: 'Invalid webhook signature'
        }
      });
    }
  } catch (error) {
    logger.error('Error validating Stripe webhook', {
      error: error.message
    });
    return res.status(500).json({
      success: false,
      error: {
        code: 'WEBHOOK_VALIDATION_ERROR',
        message: 'Error validating webhook'
      }
    });
  }
}

