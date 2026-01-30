import express from 'express';
import { validateStripeWebhook } from '../middleware/validateWebhook.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import * as paymentQueries from '../db/queries/payments.js';
import * as refundQueries from '../db/queries/refunds.js';

const router = express.Router();

/**
 * POST /api/stripe/webhook
 * Handle Stripe webhooks
 * Note: This route must use express.raw() middleware for signature verification
 */
router.post('/webhook',
  express.raw({ type: 'application/json' }),
  validateStripeWebhook,
  asyncHandler(async (req, res) => {
    const event = req.stripeEvent;

    logger.info('Stripe webhook received', {
      type: event.type,
      id: event.id
    });

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          await handlePaymentIntentFailed(event.data.object);
          break;

        case 'charge.refunded':
          await handleChargeRefunded(event.data.object);
          break;

        case 'charge.dispute.created':
          await handleDisputeCreated(event.data.object);
          break;

        default:
          logger.debug('Unhandled Stripe webhook type', { type: event.type });
      }

      res.json({ received: true });
    } catch (error) {
      logger.error('Error handling Stripe webhook', {
        error: error.message,
        type: event.type,
        id: event.id,
        stack: error.stack
      });

      // Return 200 to prevent Stripe from retrying
      res.status(200).json({ received: true, error: error.message });
    }
  })
);

/**
 * Handle payment_intent.succeeded
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  logger.info('PaymentIntent succeeded', {
    paymentIntentId: paymentIntent.id
  });

  // Update payment status if needed
  const payment = await paymentQueries.getPaymentByPaymentIntentId(paymentIntent.id);
  if (payment && payment.status !== 'captured') {
    await paymentQueries.updatePaymentStatus(payment.id, 'captured');

    // Update card details if available
    if (paymentIntent.payment_method) {
      // In production, retrieve payment method details
      // For now, we'll just log it
      logger.debug('Payment method attached', {
        paymentIntentId: paymentIntent.id,
        paymentMethodId: paymentIntent.payment_method
      });
    }
  }
}

/**
 * Handle payment_intent.payment_failed
 */
async function handlePaymentIntentFailed(paymentIntent) {
  logger.warn('PaymentIntent failed', {
    paymentIntentId: paymentIntent.id,
    error: paymentIntent.last_payment_error
  });

  // Update payment status
  const payment = await paymentQueries.getPaymentByPaymentIntentId(paymentIntent.id);
  if (payment) {
    const error = paymentIntent.last_payment_error;
    await paymentQueries.updatePaymentStatus(
      payment.id,
      'failed',
      error?.code,
      error?.message
    );
  }
}

/**
 * Handle charge.refunded
 */
async function handleChargeRefunded(charge) {
  logger.info('Charge refunded', {
    chargeId: charge.id,
    paymentIntentId: charge.payment_intent
  });

  // Find refund record
  const refund = await refundQueries.getRefundByStripeRefundId(charge.refund?.id || charge.id);
  
  if (refund) {
    // Update refund status
    await refundQueries.updateRefundStatus(
      refund.id,
      charge.refund?.status === 'succeeded' ? 'succeeded' : 'pending'
    );
  } else {
    logger.warn('Refund record not found for Stripe refund', {
      chargeId: charge.id,
      refundId: charge.refund?.id
    });
  }
}

/**
 * Handle charge.dispute.created
 */
async function handleDisputeCreated(charge) {
  logger.warn('Dispute created', {
    chargeId: charge.id,
    paymentIntentId: charge.payment_intent,
    disputeId: charge.dispute?.id
  });

  // In production, you might want to:
  // - Notify admin
  // - Update transaction status
  // - Log for review
}

export default router;

