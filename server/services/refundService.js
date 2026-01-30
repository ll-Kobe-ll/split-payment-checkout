import { getStripeClient } from '../config/stripe.js';
import { logger } from '../utils/logger.js';
import { distributeProportionally } from '../utils/currency.js';
import * as transactionQueries from '../db/queries/transactions.js';
import * as paymentQueries from '../db/queries/payments.js';
import * as refundQueries from '../db/queries/refunds.js';

/**
 * Refund service - handles proportional refunds for split payments
 */

/**
 * Calculate proportional refund amounts for each payment
 * @param {Array} payments - Array of payment records with amounts
 * @param {number} refundAmount - Total refund amount in cents
 * @returns {Array} Array of { paymentId, amount } for each refund
 */
function calculateProportionalRefunds(payments, refundAmount) {
  const paymentAmounts = payments.map(p => p.amount);
  const refundAmounts = distributeProportionally(refundAmount, paymentAmounts);

  return payments.map((payment, index) => ({
    paymentId: payment.id,
    stripePaymentIntentId: payment.stripe_payment_intent_id,
    originalAmount: payment.amount,
    refundAmount: refundAmounts[index]
  }));
}

/**
 * Process a full or partial refund for a transaction
 * @param {object} params - Refund parameters
 * @returns {Promise<object>} Refund results
 */
export async function processRefund(params) {
  const {
    transactionId,
    refundAmount,
    reason = 'requested_by_customer',
    initiatedBy = 'admin'
  } = params;

  // Get transaction
  const transaction = await transactionQueries.getTransactionById(transactionId);
  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'completed') {
    throw new Error('Can only refund completed transactions');
  }

  // Get all payments for this transaction
  const payments = await paymentQueries.getPaymentsByTransactionId(transactionId);
  if (payments.length === 0) {
    throw new Error('No payments found for transaction');
  }

  // Get existing refunds
  const existingRefunds = await refundQueries.getRefundsByTransactionId(transactionId);
  const totalRefunded = existingRefunds
    .filter(r => r.status === 'succeeded')
    .reduce((sum, r) => sum + r.amount, 0);

  const remainingRefundable = transaction.total_amount - totalRefunded;

  if (refundAmount > remainingRefundable) {
    throw new Error(
      `Refund amount (${refundAmount / 100}) exceeds remaining refundable amount (${remainingRefundable / 100})`
    );
  }

  // Calculate proportional refunds
  const refundSplits = calculateProportionalRefunds(payments, refundAmount);

  // Filter out zero-amount refunds
  const nonZeroRefunds = refundSplits.filter(r => r.refundAmount > 0);

  if (nonZeroRefunds.length === 0) {
    throw new Error('Refund amount is too small to distribute');
  }

  const stripe = getStripeClient();
  const refundResults = [];

  // Process each refund
  for (const refundSplit of nonZeroRefunds) {
    try {
      // Get payment record
      const payment = await paymentQueries.getPaymentByPaymentIntentId(
        refundSplit.stripePaymentIntentId
      );

      if (!payment) {
        throw new Error(`Payment not found: ${refundSplit.stripePaymentIntentId}`);
      }

      if (payment.status !== 'captured') {
        logger.warn('Attempting to refund non-captured payment', {
          paymentId: payment.id,
          status: payment.status
        });
        continue;
      }

      // Create refund in Stripe
      const refund = await stripe.refunds.create({
        payment_intent: refundSplit.stripePaymentIntentId,
        amount: refundSplit.refundAmount,
        reason: reason,
        metadata: {
          transactionId: transactionId.toString(),
          paymentId: payment.id.toString()
        }
      });

      // Create refund record in database
      const refundRecord = await refundQueries.createRefund({
        transactionId,
        paymentId: payment.id,
        stripeRefundId: refund.id,
        amount: refundSplit.refundAmount,
        reason,
        initiatedBy,
        status: refund.status === 'succeeded' ? 'succeeded' : 'pending'
      });

      refundResults.push({
        paymentId: payment.id,
        refundId: refundRecord.id,
        stripeRefundId: refund.id,
        amount: refundSplit.refundAmount,
        status: refund.status
      });

      logger.info('Refund processed', {
        transactionId,
        paymentId: payment.id,
        refundId: refund.id,
        amount: refundSplit.refundAmount
      });

    } catch (error) {
      logger.error('Error processing refund for payment', {
        error: error.message,
        transactionId,
        paymentId: refundSplit.paymentId,
        amount: refundSplit.refundAmount
      });

      refundResults.push({
        paymentId: refundSplit.paymentId,
        error: error.message,
        status: 'failed'
      });
    }
  }

  // Update transaction status if fully refunded
  const newTotalRefunded = totalRefunded + refundAmount;
  if (newTotalRefunded >= transaction.total_amount) {
    await transactionQueries.updateTransactionStatus(transactionId, 'refunded');
  } else if (newTotalRefunded > 0) {
    await transactionQueries.updateTransactionStatus(transactionId, 'partially_refunded');
  }

  // Check if all refunds succeeded
  const allSucceeded = refundResults.every(r => r.status === 'succeeded' || r.status === 'pending');

  return {
    success: allSucceeded,
    refunds: refundResults,
    totalRefunded: newTotalRefunded,
    transactionStatus: newTotalRefunded >= transaction.total_amount ? 'refunded' : 'partially_refunded'
  };
}

/**
 * Get refund details
 * @param {number} refundId - Refund ID
 * @returns {Promise<object>} Refund record
 */
export async function getRefund(refundId) {
  return await refundQueries.getRefundById(refundId);
}

/**
 * Get all refunds for a transaction
 * @param {number} transactionId - Transaction ID
 * @returns {Promise<Array>} Array of refund records
 */
export async function getRefundsByTransaction(transactionId) {
  return await refundQueries.getRefundsByTransactionId(transactionId);
}

