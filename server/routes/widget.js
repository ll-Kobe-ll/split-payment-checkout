import express from 'express';
import { widgetRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { validateShopDomain, validateCheckoutToken, validateAmount } from '../utils/validation.js';
import * as storeQueries from '../db/queries/stores.js';
import * as transactionQueries from '../db/queries/transactions.js';
import * as paymentQueries from '../db/queries/payments.js';
import * as paymentService from '../services/paymentService.js';
import * as orderService from '../services/orderService.js';

const router = express.Router();

// Store for widget sessions (in production, use Redis)
const widgetSessions = new Map();

/**
 * POST /api/widget/init
 * Initialize widget session
 */
router.post('/init',
  widgetRateLimit,
  asyncHandler(async (req, res) => {
    const { shopDomain, checkoutToken } = req.body;

    // Validate input
    if (!shopDomain || !checkoutToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'shopDomain and checkoutToken are required'
        }
      });
    }

    if (!validateShopDomain(shopDomain)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SHOP',
          message: 'Invalid shop domain format'
        }
      });
    }

    if (!validateCheckoutToken(checkoutToken)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid checkout token format'
        }
      });
    }

    // Get store
    const store = await storeQueries.getStoreByDomain(shopDomain);
    if (!store) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'STORE_NOT_FOUND',
          message: 'Store not found or app not installed'
        }
      });
    }

    // Check for existing transaction
    let transaction = await transactionQueries.getTransactionByCheckoutToken(checkoutToken);

    // If no transaction, create one
    // Note: In production, fetch actual checkout total from Shopify
    // For now, we'll use a placeholder
    if (!transaction) {
      transaction = await transactionQueries.createTransaction({
        storeId: store.id,
        shopifyCheckoutToken: checkoutToken,
        totalAmount: 0, // Will be set when actual checkout data is available
        currency: 'USD',
        customerEmail: null,
        customerIp: req.ip,
        userAgent: req.get('user-agent')
      });
    }

    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    widgetSessions.set(sessionId, {
      transactionId: transaction.id,
      shopDomain,
      checkoutToken,
      payments: []
    });

    // Get store settings
    const settings = store.settings || {};

    res.json({
      success: true,
      sessionId,
      transactionId: transaction.id,
      totalAmount: transaction.total_amount,
      currency: transaction.currency || 'USD',
      maxCards: settings.maxCards || 5,
      minAmount: settings.minAmount || 100
    });
  })
);

/**
 * POST /api/widget/create-payment-intent
 * Create a PaymentIntent for a single card
 */
router.post('/create-payment-intent',
  widgetRateLimit,
  asyncHandler(async (req, res) => {
    const { sessionId, amount } = req.body;

    if (!sessionId || !amount) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'sessionId and amount are required'
        }
      });
    }

    // Validate amount
    const amountValidation = validateAmount(amount);
    if (!amountValidation.valid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_AMOUNT',
          message: amountValidation.error
        }
      });
    }

    // Get session
    const session = widgetSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session expired, please refresh'
        }
      });
    }

    // Get transaction
    const transaction = await transactionQueries.getTransactionById(session.transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found'
        }
      });
    }

    // Check payment count
    if (session.payments.length >= 5) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TOO_MANY_CARDS',
          message: 'Maximum 5 cards allowed'
        }
      });
    }

    // Create PaymentIntent
    const { paymentIntentId, clientSecret } = await paymentService.createPaymentIntent({
      transactionId: transaction.id,
      amount: parseInt(amount, 10),
      currency: transaction.currency || 'USD',
      metadata: {
        cardIndex: session.payments.length + 1,
        totalCards: session.payments.length + 1
      }
    });

    // Create payment record
    const payment = await paymentQueries.createPayment({
      transactionId: transaction.id,
      stripePaymentIntentId: paymentIntentId,
      amount: parseInt(amount, 10)
    });

    // Add to session
    session.payments.push({
      paymentId: payment.id,
      paymentIntentId,
      amount: parseInt(amount, 10)
    });

    res.json({
      success: true,
      paymentIntentId,
      clientSecret,
      paymentId: payment.id
    });
  })
);

/**
 * POST /api/widget/remove-payment
 * Remove a pending payment
 */
router.post('/remove-payment',
  widgetRateLimit,
  asyncHandler(async (req, res) => {
    const { sessionId, paymentIntentId } = req.body;

    if (!sessionId || !paymentIntentId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'sessionId and paymentIntentId are required'
        }
      });
    }

    // Get session
    const session = widgetSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session expired'
        }
      });
    }

    // Find and remove payment
    const paymentIndex = session.payments.findIndex(
      p => p.paymentIntentId === paymentIntentId
    );

    if (paymentIndex === -1) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found in session'
        }
      });
    }

    // Cancel PaymentIntent
    try {
      await paymentService.cancelPaymentIntent(paymentIntentId);
    } catch (error) {
      logger.warn('Error cancelling PaymentIntent', {
        error: error.message,
        paymentIntentId
      });
    }

    // Remove from session
    session.payments.splice(paymentIndex, 1);

    res.json({ success: true });
  })
);

/**
 * POST /api/widget/complete-checkout
 * Complete checkout - process all payments
 */
router.post('/complete-checkout',
  widgetRateLimit,
  asyncHandler(async (req, res) => {
    const { sessionId, payments } = req.body;

    if (!sessionId || !payments || !Array.isArray(payments)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'sessionId and payments array are required'
        }
      });
    }

    // Get session
    const session = widgetSessions.get(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SESSION_NOT_FOUND',
          message: 'Session expired'
        }
      });
    }

    // Get transaction
    const transaction = await transactionQueries.getTransactionById(session.transactionId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found'
        }
      });
    }

    // Map payments to include paymentId from database
    const paymentData = await Promise.all(
      payments.map(async (p) => {
        const payment = await paymentQueries.getPaymentByPaymentIntentId(p.paymentIntentId);
        if (!payment) {
          throw new Error(`Payment not found: ${p.paymentIntentId}`);
        }
        return {
          paymentId: payment.id,
          paymentIntentId: p.paymentIntentId,
          paymentMethodId: p.paymentMethodId,
          amount: payment.amount
        };
      })
    );

    try {
      // Complete checkout
      const result = await paymentService.completeCheckout({
        transactionId: transaction.id,
        payments: paymentData,
        totalAmount: transaction.total_amount
      });

      // Create Shopify order
      const order = await orderService.createShopifyOrder({
        transactionId: transaction.id,
        shopDomain: session.shopDomain,
        checkoutToken: session.checkoutToken
      });

      // Clean up session
      widgetSessions.delete(sessionId);

      res.json({
        success: true,
        orderId: order.orderId,
        orderNumber: order.orderNumber
      });

    } catch (error) {
      logger.error('Checkout completion failed', {
        error: error.message,
        transactionId: transaction.id
      });

      // Find which payment failed
      const failedPayment = paymentData.find(
        p => error.message.includes(p.paymentIntentId)
      );

      res.status(400).json({
        success: false,
        error: {
          code: 'CHECKOUT_FAILED',
          message: error.message,
          failedCard: failedPayment ? {
            paymentIntentId: failedPayment.paymentIntentId
          } : null
        }
      });
    }
  })
);

export default router;

