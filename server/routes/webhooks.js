import express from 'express';
import { validateShopifyWebhook } from '../middleware/validateWebhook.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import * as storeQueries from '../db/queries/stores.js';
import * as transactionQueries from '../db/queries/transactions.js';

const router = express.Router();

/**
 * POST /api/webhooks/shopify
 * Handle Shopify webhooks
 */
router.post('/shopify', 
  express.raw({ type: 'application/json' }),
  validateShopifyWebhook,
  asyncHandler(async (req, res) => {
    const topic = req.webhookTopic;
    const shop = req.webhookShop;
    const payload = req.body;

    logger.info('Shopify webhook received', { topic, shop });

    try {
      switch (topic) {
        case 'app/uninstalled':
          await handleAppUninstalled(shop);
          break;

        case 'orders/create':
          await handleOrderCreate(shop, payload);
          break;

        case 'orders/refunded':
          await handleOrderRefunded(shop, payload);
          break;

        case 'checkouts/delete':
          await handleCheckoutDelete(shop, payload);
          break;

        default:
          logger.warn('Unhandled webhook topic', { topic, shop });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      logger.error('Error handling webhook', {
        error: error.message,
        topic,
        shop,
        stack: error.stack
      });
      
      // Still return 200 to prevent Shopify from retrying
      res.status(200).json({ success: false, error: error.message });
    }
  })
);

/**
 * Handle app uninstalled webhook
 */
async function handleAppUninstalled(shop) {
  logger.info('App uninstalled', { shop });
  await storeQueries.uninstallStore(shop);
}

/**
 * Handle order created webhook
 */
async function handleOrderCreate(shop, payload) {
  logger.info('Order created webhook', { shop, orderId: payload.id });
  // Could update transaction status if needed
}

/**
 * Handle order refunded webhook
 */
async function handleOrderRefunded(shop, payload) {
  logger.info('Order refunded webhook', { shop, orderId: payload.id });
  
  // Find transaction by Shopify order ID
  const transaction = await transactionQueries.getTransactionByOrderId(payload.id.toString());
  
  if (transaction) {
    // Update transaction status
    // Note: Actual refund processing is handled by Stripe webhook
    logger.info('Transaction found for refunded order', {
      transactionId: transaction.id,
      orderId: payload.id
    });
  }
}

/**
 * Handle checkout delete webhook
 */
async function handleCheckoutDelete(shop, payload) {
  logger.info('Checkout deleted webhook', { shop, checkoutId: payload.id });
  // Could clean up pending transactions
}

/**
 * GDPR webhook endpoints
 */
router.post('/gdpr/customers/data_request', asyncHandler(async (req, res) => {
  logger.info('GDPR customer data request', { shop: req.body.shop_domain });
  // In production, return customer data
  res.status(200).json({ success: true });
}));

router.post('/gdpr/customers/redact', asyncHandler(async (req, res) => {
  logger.info('GDPR customer redact', { shop: req.body.shop_domain });
  // In production, delete customer data
  res.status(200).json({ success: true });
}));

router.post('/gdpr/shop/redact', asyncHandler(async (req, res) => {
  logger.info('GDPR shop redact', { shop: req.body.shop_domain });
  // In production, delete shop data
  await storeQueries.uninstallStore(req.body.shop_domain);
  res.status(200).json({ success: true });
}));

export default router;

