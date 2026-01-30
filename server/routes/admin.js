import express from 'express';
import { verifySessionToken } from '../middleware/auth.js';
import { adminRateLimit } from '../middleware/rateLimit.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import * as storeQueries from '../db/queries/stores.js';
import * as transactionQueries from '../db/queries/transactions.js';
import * as paymentQueries from '../db/queries/payments.js';
import * as refundQueries from '../db/queries/refunds.js';
import * as storeService from '../services/storeService.js';
import * as refundService from '../services/refundService.js';

const router = express.Router();

// Apply auth and rate limiting to all admin routes
router.use(verifySessionToken);
router.use(adminRateLimit);

/**
 * GET /api/admin/stats
 * Get dashboard statistics
 */
router.get('/stats', asyncHandler(async (req, res) => {
  const shop = req.shop;

  // Get store
  const store = await storeQueries.getStoreByDomain(shop);
  if (!store) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'STORE_NOT_FOUND',
        message: 'Store not found'
      }
    });
  }

  // Get all transactions for stats
  const transactionsData = await transactionQueries.getTransactions({
    storeId: store.id,
    page: 1,
    limit: 10000
  });

  const transactions = transactionsData.transactions;
  const totalTransactions = transactions.length;
  const completedTransactions = transactions.filter(t => t.status === 'completed').length;
  const failedTransactions = transactions.filter(t => t.status === 'failed').length;
  
  const totalVolume = transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + t.total_amount, 0);

  const successRate = totalTransactions > 0 
    ? (completedTransactions / totalTransactions) * 100 
    : 0;

  // Get all active stores count
  const allStores = await storeQueries.getAllActiveStores();
  const activeStores = allStores.length;

  res.json({
    success: true,
    stats: {
      totalTransactions,
      completedTransactions,
      failedTransactions,
      successRate: Math.round(successRate * 100) / 100,
      totalVolume,
      totalVolumeFormatted: `$${(totalVolume / 100).toFixed(2)}`,
      activeStores
    }
  });
}));

/**
 * GET /api/admin/transactions
 * Get paginated transaction list
 */
router.get('/transactions', asyncHandler(async (req, res) => {
  const shop = req.shop;
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '20', 10);
  const status = req.query.status;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  // Get store
  const store = await storeQueries.getStoreByDomain(shop);
  if (!store) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'STORE_NOT_FOUND',
        message: 'Store not found'
      }
    });
  }

  const result = await transactionQueries.getTransactions({
    storeId: store.id,
    page,
    limit,
    status,
    startDate,
    endDate
  });

  res.json({
    success: true,
    ...result
  });
}));

/**
 * GET /api/admin/transactions/:id
 * Get single transaction with payments and refunds
 */
router.get('/transactions/:id', asyncHandler(async (req, res) => {
  const shop = req.shop;
  const transactionId = parseInt(req.params.id, 10);

  // Get store
  const store = await storeQueries.getStoreByDomain(shop);
  if (!store) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'STORE_NOT_FOUND',
        message: 'Store not found'
      }
    });
  }

  // Get transaction
  const transaction = await transactionQueries.getTransactionById(transactionId);
  if (!transaction) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found'
      }
    });
  }

  // Verify transaction belongs to store
  if (transaction.store_id !== store.id) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Transaction does not belong to this store'
      }
    });
  }

  // Get payments
  const payments = await paymentQueries.getPaymentsByTransactionId(transactionId);

  // Get refunds
  const refunds = await refundQueries.getRefundsByTransactionId(transactionId);

  res.json({
    success: true,
    transaction,
    payments,
    refunds
  });
}));

/**
 * POST /api/admin/refund
 * Initiate manual refund
 */
router.post('/refund', asyncHandler(async (req, res) => {
  const shop = req.shop;
  const { transactionId, amount, reason = 'requested_by_customer' } = req.body;

  if (!transactionId || !amount) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_PARAMS',
        message: 'transactionId and amount are required'
      }
    });
  }

  // Get store
  const store = await storeQueries.getStoreByDomain(shop);
  if (!store) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'STORE_NOT_FOUND',
        message: 'Store not found'
      }
    });
  }

  // Get transaction
  const transaction = await transactionQueries.getTransactionById(transactionId);
  if (!transaction) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found'
      }
    });
  }

  // Verify transaction belongs to store
  if (transaction.store_id !== store.id) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Transaction does not belong to this store'
      }
    });
  }

  // Process refund
  const result = await refundService.processRefund({
    transactionId,
    refundAmount: parseInt(amount, 10),
    reason,
    initiatedBy: 'admin'
  });

  res.json({
    success: result.success,
    refunds: result.refunds,
    totalRefunded: result.totalRefunded,
    transactionStatus: result.transactionStatus
  });
}));

/**
 * GET /api/admin/stores
 * List all installed stores
 */
router.get('/stores', asyncHandler(async (req, res) => {
  const stores = await storeService.getAllStores();

  res.json({
    success: true,
    stores
  });
}));

/**
 * PUT /api/admin/settings
 * Update store settings
 */
router.put('/settings', asyncHandler(async (req, res) => {
  const shop = req.shop;
  const settings = req.body;

  // Get store
  const store = await storeQueries.getStoreByDomain(shop);
  if (!store) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'STORE_NOT_FOUND',
        message: 'Store not found'
      }
    });
  }

  // Update settings
  const updated = await storeService.updateStoreSettings(store.id, settings);

  res.json({
    success: true,
    settings: updated.settings
  });
}));

export default router;

