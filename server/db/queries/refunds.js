import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Create a refund record
 */
export async function createRefund(data) {
  try {
    const {
      transactionId,
      paymentId,
      stripeRefundId,
      amount,
      reason,
      initiatedBy = 'admin',
      status = 'pending'
    } = data;

    const result = await query(
      `INSERT INTO refunds 
       (transaction_id, payment_id, stripe_refund_id, amount, reason, status, initiated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [transactionId, paymentId, stripeRefundId, amount, reason, status, initiatedBy]
    );
    
    logger.info('Refund created', { 
      refundId: result.rows[0].id, 
      transactionId,
      paymentId,
      amount 
    });
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating refund', { error: error.message, data });
    throw error;
  }
}

/**
 * Get refund by ID
 */
export async function getRefundById(refundId) {
  try {
    const result = await query(
      'SELECT * FROM refunds WHERE id = $1',
      [refundId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting refund by ID', { error: error.message, refundId });
    throw error;
  }
}

/**
 * Get refund by Stripe refund ID
 */
export async function getRefundByStripeRefundId(stripeRefundId) {
  try {
    const result = await query(
      'SELECT * FROM refunds WHERE stripe_refund_id = $1',
      [stripeRefundId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting refund by Stripe refund ID', { 
      error: error.message, 
      stripeRefundId 
    });
    throw error;
  }
}

/**
 * Get all refunds for a transaction
 */
export async function getRefundsByTransactionId(transactionId) {
  try {
    const result = await query(
      'SELECT * FROM refunds WHERE transaction_id = $1 ORDER BY created_at DESC',
      [transactionId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting refunds by transaction ID', { 
      error: error.message, 
      transactionId 
    });
    throw error;
  }
}

/**
 * Get all refunds for a payment
 */
export async function getRefundsByPaymentId(paymentId) {
  try {
    const result = await query(
      'SELECT * FROM refunds WHERE payment_id = $1 ORDER BY created_at DESC',
      [paymentId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting refunds by payment ID', { 
      error: error.message, 
      paymentId 
    });
    throw error;
  }
}

/**
 * Update refund status
 */
export async function updateRefundStatus(refundId, status, failureReason = null) {
  try {
    const updates = ['status = $2'];
    const params = [refundId, status];

    if (failureReason) {
      updates.push('failure_reason = $3');
      params.push(failureReason);
    }

    const result = await query(
      `UPDATE refunds 
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING *`,
      params
    );
    
    logger.info('Refund status updated', { refundId, status });
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating refund status', { error: error.message, refundId, status });
    throw error;
  }
}

/**
 * Get total refunded amount for a transaction
 */
export async function getTotalRefundedByTransactionId(transactionId) {
  try {
    const result = await query(
      `SELECT COALESCE(SUM(amount), 0) as total_refunded 
       FROM refunds 
       WHERE transaction_id = $1 AND status = 'succeeded'`,
      [transactionId]
    );
    return parseInt(result.rows[0].total_refunded, 10);
  } catch (error) {
    logger.error('Error getting total refunded amount', { error: error.message, transactionId });
    throw error;
  }
}

