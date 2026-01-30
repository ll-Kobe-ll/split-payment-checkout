import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Create a new transaction
 */
export async function createTransaction(data) {
  try {
    const {
      storeId,
      shopifyCheckoutToken,
      totalAmount,
      currency = 'USD',
      customerEmail,
      customerIp,
      userAgent
    } = data;

    const result = await query(
      `INSERT INTO transactions 
       (store_id, shopify_checkout_token, total_amount, currency, customer_email, customer_ip, user_agent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [storeId, shopifyCheckoutToken, totalAmount, currency, customerEmail, customerIp, userAgent]
    );
    
    logger.info('Transaction created', { transactionId: result.rows[0].id, storeId });
    return result.rows[0];
  } catch (error) {
    logger.error('Error creating transaction', { error: error.message, data });
    throw error;
  }
}

/**
 * Get transaction by ID
 */
export async function getTransactionById(transactionId) {
  try {
    const result = await query(
      'SELECT * FROM transactions WHERE id = $1',
      [transactionId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting transaction by ID', { error: error.message, transactionId });
    throw error;
  }
}

/**
 * Get transaction by Shopify order ID
 */
export async function getTransactionByOrderId(shopifyOrderId) {
  try {
    const result = await query(
      'SELECT * FROM transactions WHERE shopify_order_id = $1',
      [shopifyOrderId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting transaction by order ID', { error: error.message, shopifyOrderId });
    throw error;
  }
}

/**
 * Get transaction by checkout token
 */
export async function getTransactionByCheckoutToken(checkoutToken) {
  try {
    const result = await query(
      'SELECT * FROM transactions WHERE shopify_checkout_token = $1 ORDER BY created_at DESC LIMIT 1',
      [checkoutToken]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting transaction by checkout token', { error: error.message });
    throw error;
  }
}

/**
 * Update transaction status
 */
export async function updateTransactionStatus(transactionId, status, failureReason = null) {
  try {
    const updates = ['status = $2', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [transactionId, status];

    if (status === 'completed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }

    if (failureReason) {
      updates.push('failure_reason = $3');
      params.push(failureReason);
    }

    const result = await query(
      `UPDATE transactions 
       SET ${updates.join(', ')}
       WHERE id = $1
       RETURNING *`,
      params
    );
    
    logger.info('Transaction status updated', { transactionId, status });
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating transaction status', { error: error.message, transactionId, status });
    throw error;
  }
}

/**
 * Update transaction with Shopify order info
 */
export async function updateTransactionOrder(transactionId, shopifyOrderId, shopifyOrderNumber) {
  try {
    const result = await query(
      `UPDATE transactions 
       SET shopify_order_id = $2, shopify_order_number = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [transactionId, shopifyOrderId, shopifyOrderNumber]
    );
    
    logger.info('Transaction order updated', { transactionId, shopifyOrderId });
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating transaction order', { error: error.message, transactionId });
    throw error;
  }
}

/**
 * Get paginated transactions
 */
export async function getTransactions(filters = {}) {
  try {
    const {
      storeId,
      status,
      startDate,
      endDate,
      page = 1,
      limit = 20
    } = filters;

    let whereClauses = [];
    let params = [];
    let paramIndex = 1;

    if (storeId) {
      whereClauses.push(`store_id = $${paramIndex++}`);
      params.push(storeId);
    }

    if (status) {
      whereClauses.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (startDate) {
      whereClauses.push(`created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      whereClauses.push(`created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    const whereClause = whereClauses.length > 0 
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM transactions ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get transactions
    const result = await query(
      `SELECT * FROM transactions 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );

    return {
      transactions: result.rows,
      total,
      page,
      pages: Math.ceil(total / limit)
    };
  } catch (error) {
    logger.error('Error getting transactions', { error: error.message, filters });
    throw error;
  }
}

