import { getShopifyClient } from '../config/shopify.js';
import { logger } from '../utils/logger.js';
import * as storeQueries from '../db/queries/stores.js';
import * as transactionQueries from '../db/queries/transactions.js';
import * as paymentQueries from '../db/queries/payments.js';

/**
 * Order service - handles Shopify order creation
 */

/**
 * Create order in Shopify after successful payment
 * @param {object} params - Order parameters
 * @returns {Promise<object>} Created order
 */
export async function createShopifyOrder(params) {
  const {
    transactionId,
    shopDomain,
    checkoutToken
  } = params;

  try {
    // Get store
    const store = await storeQueries.getStoreByDomain(shopDomain);
    if (!store) {
      throw new Error(`Store not found: ${shopDomain}`);
    }

    // Get transaction
    const transaction = await transactionQueries.getTransactionById(transactionId);
    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    // Get payments for transaction details
    const payments = await paymentQueries.getPaymentsByTransactionId(transactionId);

    // Initialize Shopify API client
    const shopify = getShopifyClient();
    const session = shopify.session.customAppSession(shopDomain);
    session.accessToken = store.access_token;

    // Get checkout details from Shopify
    // Note: In production, you'd fetch the actual checkout data
    // For now, we'll create an order with the transaction data

    const orderData = {
      email: transaction.customer_email || '',
      financial_status: 'paid',
      fulfillment_status: null,
      line_items: [
        // In production, fetch actual line items from checkout
        {
          title: 'Split Payment Order',
          quantity: 1,
          price: (transaction.total_amount / 100).toFixed(2)
        }
      ],
      total_price: (transaction.total_amount / 100).toFixed(2),
      currency: transaction.currency || 'USD',
      note: `Split payment across ${payments.length} cards. Transaction ID: ${transactionId}`,
      tags: 'split-payment',
      metafields: [
        {
          key: 'split_payment',
          value: 'true',
          type: 'boolean',
          namespace: 'custom'
        },
        {
          key: 'transaction_id',
          value: transactionId.toString(),
          type: 'number_integer',
          namespace: 'custom'
        },
        {
          key: 'payment_count',
          value: payments.length.toString(),
          type: 'number_integer',
          namespace: 'custom'
        }
      ]
    };

    // Create order using Shopify Admin API
    const client = new shopify.clients.Rest({ session });
    const response = await client.post({
      path: 'orders',
      data: { order: orderData }
    });

    const order = response.body.order;

    // Update transaction with order info
    await transactionQueries.updateTransactionOrder(
      transactionId,
      order.id.toString(),
      order.order_number?.toString() || order.id.toString()
    );

    logger.info('Shopify order created', {
      transactionId,
      shopifyOrderId: order.id,
      orderNumber: order.order_number
    });

    return {
      orderId: order.id.toString(),
      orderNumber: order.order_number?.toString() || order.id.toString(),
      orderName: order.name
    };

  } catch (error) {
    logger.error('Error creating Shopify order', {
      error: error.message,
      transactionId,
      shopDomain,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get order details from Shopify
 * @param {string} shopDomain - Shop domain
 * @param {string} orderId - Shopify order ID
 * @returns {Promise<object>} Order details
 */
export async function getShopifyOrder(shopDomain, orderId) {
  try {
    const store = await storeQueries.getStoreByDomain(shopDomain);
    if (!store) {
      throw new Error(`Store not found: ${shopDomain}`);
    }

    const shopify = getShopifyClient();
    const session = shopify.session.customAppSession(shopDomain);
    session.accessToken = store.access_token;

    const client = new shopify.clients.Rest({ session });
    const response = await client.get({
      path: `orders/${orderId}`
    });

    return response.body.order;
  } catch (error) {
    logger.error('Error getting Shopify order', {
      error: error.message,
      shopDomain,
      orderId
    });
    throw error;
  }
}

