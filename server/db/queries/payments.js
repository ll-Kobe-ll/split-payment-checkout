import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Create a payment record
 */
export async function createPayment(data) {
  try {
    const {
      transactionId,
      stripePaymentIntentId,
      amount
    } = data;

    const result = await query(
      `INSERT INTO payments 
       (transaction_id, stripe_payment_intent_id, amount, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING *`,
      [transactionId, stripePaymentIntentId, amount]
    );
    
    logger.info('Payment created', { 
      paymentId: result.rows[0].id, 
      transactionId,
      amount 
    });
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating payment', { error: error.message, data });
    throw error;
  }
}

/**
 * Get payment by ID
 */
export async function getPaymentById(paymentId) {
  try {
    const result = await query(
      'SELECT * FROM payments WHERE id = $1',
      [paymentId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting payment by ID', { error: error.message, paymentId });
    throw error;
  }
}

/**
 * Get payment by Stripe PaymentIntent ID
 */
export async function getPaymentByPaymentIntentId(stripePaymentIntentId) {
  try {
    const result = await query(
      'SELECT * FROM payments WHERE stripe_payment_intent_id = $1',
      [stripePaymentIntentId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting payment by PaymentIntent ID', { 
      error: error.message, 
      stripePaymentIntentId 
    });
    throw error;
  }
}

/**
 * Get all payments for a transaction
 */
export async function getPaymentsByTransactionId(transactionId) {
  try {
    const result = await query(
      'SELECT * FROM payments WHERE transaction_id = $1 ORDER BY created_at ASC',
      [transactionId]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting payments by transaction ID', { 
      error: error.message, 
      transactionId 
    });
    throw error;
  }
}

/**
 * Update payment with card details
 */
export async function updatePaymentCardDetails(paymentId, cardDetails) {
  try {
    const {
      cardBrand,
      cardLastFour,
      cardExpMonth,
      cardExpYear,
      stripePaymentMethodId
    } = cardDetails;

    const result = await query(
      `UPDATE payments 
       SET card_brand = $2, 
           card_last_four = $3, 
           card_exp_month = $4, 
           card_exp_year = $5,
           stripe_payment_method_id = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [paymentId, cardBrand, cardLastFour, cardExpMonth, cardExpYear, stripePaymentMethodId]
    );
    
    logger.info('Payment card details updated', { paymentId });
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating payment card details', { error: error.message, paymentId });
    throw error;
  }
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(paymentId, status, failureCode = null, failureMessage = null) {
  try {
    const updates = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [paymentId, status];

    if (status === 'authorized') {
      updates.push('authorized_at = CURRENT_TIMESTAMP');
    } else if (status === 'captured') {
      updates.push('captured_at = CURRENT_TIMESTAMP');
    } else if (status === 'voided') {
      updates.push('voided_at = CURRENT_TIMESTAMP');
    }

    if (failureCode) {
      updates.push('failure_code = $3');
      params.push(failureCode);
      if (failureMessage) {
        updates.push('failure_message = $4');
        params.push(failureMessage);
      }
    }

    const result = await query(
      `UPDATE payments 
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING *`,
      params
    );
    
    logger.info('Payment status updated', { paymentId, status });
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating payment status', { error: error.message, paymentId, status });
    throw error;
  }
}

/**
 * Get payments by status
 */
export async function getPaymentsByStatus(status) {
  try {
    const result = await query(
      'SELECT * FROM payments WHERE status = $1 ORDER BY created_at DESC',
      [status]
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting payments by status', { error: error.message, status });
    throw error;
  }
}

