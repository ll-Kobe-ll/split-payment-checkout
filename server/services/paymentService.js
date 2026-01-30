import { getStripeClient } from '../config/stripe.js';
import { logger } from '../utils/logger.js';
import { validatePaymentAmounts } from '../utils/validation.js';
import { transaction } from '../config/database.js';
import * as transactionQueries from '../db/queries/transactions.js';
import * as paymentQueries from '../db/queries/payments.js';

/**
 * Core payment service - handles split payment logic
 * This is the most critical part of the application
 */

/**
 * Create PaymentIntent for a single card (authorization only)
 * @param {object} params - Payment parameters
 * @returns {Promise<object>} PaymentIntent and payment record
 */
export async function createPaymentIntent(params) {
  const { transactionId, amount, currency = 'USD', metadata = {} } = params;

  const stripe = getStripeClient();

  try {
    // Create PaymentIntent with manual capture
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: currency.toLowerCase(),
      capture_method: 'manual', // CRITICAL - authorize only, don't capture yet
      metadata: {
        transactionId: transactionId.toString(),
        splitPayment: 'true',
        ...metadata
      },
      statement_descriptor_suffix: 'SPLITPAY'
    });

    logger.info('PaymentIntent created', {
      transactionId,
      paymentIntentId: paymentIntent.id,
      amount
    });

    return {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status
    };
  } catch (error) {
    logger.error('Error creating PaymentIntent', {
      error: error.message,
      transactionId,
      amount
    });
    throw error;
  }
}

/**
 * Cancel/void a PaymentIntent
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @returns {Promise<boolean>} Success status
 */
export async function cancelPaymentIntent(paymentIntentId) {
  const stripe = getStripeClient();

  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
    
    logger.info('PaymentIntent cancelled', { paymentIntentId });
    return true;
  } catch (error) {
    // If already cancelled or captured, that's okay
    if (error.code === 'payment_intent_unexpected_state') {
      logger.warn('PaymentIntent already in final state', { paymentIntentId });
      return true;
    }
    
    logger.error('Error cancelling PaymentIntent', {
      error: error.message,
      paymentIntentId
    });
    throw error;
  }
}

/**
 * Cancel multiple PaymentIntents (used when one card fails)
 * @param {Array<string>} paymentIntentIds - Array of PaymentIntent IDs
 * @returns {Promise<Array>} Results for each cancellation
 */
export async function cancelPaymentIntents(paymentIntentIds) {
  const results = await Promise.allSettled(
    paymentIntentIds.map(id => cancelPaymentIntent(id))
  );

  // Log any failures
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.error('Failed to cancel PaymentIntent', {
        paymentIntentId: paymentIntentIds[index],
        error: result.reason?.message
      });
    }
  });

  return results;
}

/**
 * Capture a PaymentIntent (actually charge the card)
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @returns {Promise<object>} Captured PaymentIntent
 */
export async function capturePaymentIntent(paymentIntentId) {
  const stripe = getStripeClient();

  try {
    const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);
    
    logger.info('PaymentIntent captured', { paymentIntentId });
    return paymentIntent;
  } catch (error) {
    logger.error('Error capturing PaymentIntent', {
      error: error.message,
      paymentIntentId
    });
    throw error;
  }
}

/**
 * Get PaymentIntent details
 * @param {string} paymentIntentId - Stripe PaymentIntent ID
 * @returns {Promise<object>} PaymentIntent object
 */
export async function getPaymentIntent(paymentIntentId) {
  const stripe = getStripeClient();

  try {
    return await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    logger.error('Error retrieving PaymentIntent', {
      error: error.message,
      paymentIntentId
    });
    throw error;
  }
}

/**
 * Complete checkout - the critical method
 * This handles the entire split payment flow:
 * 1. Validates amounts
 * 2. Confirms all PaymentIntents (authorizes)
 * 3. If all succeed, captures all
 * 4. If any fails, voids all successful ones
 * 
 * @param {object} params - Checkout parameters
 * @returns {Promise<object>} Result with success status
 */
export async function completeCheckout(params) {
  const {
    transactionId,
    payments, // Array of { paymentIntentId, paymentMethodId, amount }
    totalAmount
  } = params;

  // Validate payment amounts
  const paymentAmounts = payments.map(p => p.amount);
  const validation = validatePaymentAmounts(totalAmount, paymentAmounts);
  
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Get transaction
  const transaction = await transactionQueries.getTransactionById(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  // Update transaction status to processing
  await transactionQueries.updateTransactionStatus(transactionId, 'processing');

  const stripe = getStripeClient();
  const authorizedPayments = [];
  const failedPayment = { paymentIntentId: null, error: null };

  try {
    // Step 1: Confirm all PaymentIntents (authorize)
    logger.info('Authorizing payments', { transactionId, count: payments.length });

    const authorizationResults = await Promise.allSettled(
      payments.map(async (payment) => {
        const paymentIntent = await stripe.paymentIntents.retrieve(payment.paymentIntentId);
        
        // If already confirmed, skip
        if (paymentIntent.status === 'requires_capture' || paymentIntent.status === 'succeeded') {
          return { paymentIntentId: payment.paymentIntentId, status: 'authorized' };
        }

        // Confirm the PaymentIntent
        const confirmed = await stripe.paymentIntents.confirm(payment.paymentIntentId, {
          payment_method: payment.paymentMethodId
        });

        // Handle 3D Secure if required
        if (confirmed.status === 'requires_action') {
          throw new Error('3D Secure authentication required - should be handled on frontend');
        }

        if (confirmed.status !== 'requires_capture' && confirmed.status !== 'succeeded') {
          throw new Error(`PaymentIntent in unexpected state: ${confirmed.status}`);
        }

        return { paymentIntentId: payment.paymentIntentId, status: 'authorized' };
      })
    );

    // Check authorization results
    for (let i = 0; i < authorizationResults.length; i++) {
      const result = authorizationResults[i];
      const payment = payments[i];

      if (result.status === 'fulfilled') {
        authorizedPayments.push(payment.paymentIntentId);
        
        // Update payment status in database
        await paymentQueries.updatePaymentStatus(
          payment.paymentId,
          'authorized'
        );
      } else {
        // Authorization failed
        failedPayment.paymentIntentId = payment.paymentIntentId;
        failedPayment.error = result.reason?.message || 'Authorization failed';
        
        // Update payment status
        await paymentQueries.updatePaymentStatus(
          payment.paymentId,
          'failed',
          result.reason?.code,
          result.reason?.message
        );

        // Cancel all successfully authorized payments
        if (authorizedPayments.length > 0) {
          logger.warn('Cancelling authorized payments due to failure', {
            transactionId,
            failedPayment: payment.paymentIntentId,
            cancelling: authorizedPayments
          });
          
          await cancelPaymentIntents(authorizedPayments);
          
          // Update payment statuses to voided
          for (const piId of authorizedPayments) {
            const paymentRecord = await paymentQueries.getPaymentByPaymentIntentId(piId);
            if (paymentRecord) {
              await paymentQueries.updatePaymentStatus(paymentRecord.id, 'voided');
            }
          }
        }

        // Update transaction status
        await transactionQueries.updateTransactionStatus(
          transactionId,
          'failed',
          `Payment failed: ${failedPayment.error}`
        );

        throw new Error(`Card payment failed: ${failedPayment.error}`);
      }
    }

    // Step 2: All authorizations succeeded - capture all
    logger.info('All payments authorized, capturing', { transactionId });

    const captureResults = await Promise.allSettled(
      authorizedPayments.map(piId => capturePaymentIntent(piId))
    );

    // Check if any captures failed
    const failedCaptures = [];
    for (let i = 0; i < captureResults.length; i++) {
      const result = captureResults[i];
      const piId = authorizedPayments[i];

      if (result.status === 'fulfilled') {
        // Update payment status to captured
        const paymentRecord = await paymentQueries.getPaymentByPaymentIntentId(piId);
        if (paymentRecord) {
          await paymentQueries.updatePaymentStatus(paymentRecord.id, 'captured');
        }
      } else {
        failedCaptures.push({ paymentIntentId: piId, error: result.reason });
      }
    }

    // If any captures failed, this is a critical error
    // We've already authorized, so we need to void the failed ones
    if (failedCaptures.length > 0) {
      logger.error('Some captures failed after authorization', {
        transactionId,
        failedCaptures
      });

      // Attempt to void failed captures
      for (const failed of failedCaptures) {
        try {
          await cancelPaymentIntent(failed.paymentIntentId);
        } catch (err) {
          logger.error('Failed to void after capture failure', {
            paymentIntentId: failed.paymentIntentId,
            error: err.message
          });
        }
      }

      // Mark transaction as failed
      await transactionQueries.updateTransactionStatus(
        transactionId,
        'failed',
        'Capture failed after authorization'
      );

      throw new Error('Payment capture failed - transaction voided');
    }

    // Step 3: All payments captured successfully
    await transactionQueries.updateTransactionStatus(transactionId, 'completed');

    logger.info('Checkout completed successfully', {
      transactionId,
      paymentCount: payments.length
    });

    return {
      success: true,
      transactionId
    };

  } catch (error) {
    logger.error('Error completing checkout', {
      error: error.message,
      transactionId,
      stack: error.stack
    });

    // Ensure transaction is marked as failed
    await transactionQueries.updateTransactionStatus(
      transactionId,
      'failed',
      error.message
    );

    throw error;
  }
}

