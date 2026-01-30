import { logger } from '../utils/logger.js';
import * as storeQueries from '../db/queries/stores.js';
import * as transactionQueries from '../db/queries/transactions.js';

/**
 * Store service - manages store settings and statistics
 */

/**
 * Get store settings
 * @param {number} storeId - Store ID
 * @returns {Promise<object>} Store settings
 */
export async function getStoreSettings(storeId) {
  const store = await storeQueries.getStoreById(storeId);
  if (!store) {
    throw new Error('Store not found');
  }

  return {
    id: store.id,
    shopDomain: store.shop_domain,
    settings: store.settings || {},
    isActive: store.is_active,
    installedAt: store.installed_at
  };
}

/**
 * Update store settings
 * @param {number} storeId - Store ID
 * @param {object} settings - Settings to update
 * @returns {Promise<object>} Updated store
 */
export async function updateStoreSettings(storeId, settings) {
  const store = await storeQueries.getStoreById(storeId);
  if (!store) {
    throw new Error('Store not found');
  }

  // Merge with existing settings
  const currentSettings = store.settings || {};
  const updatedSettings = { ...currentSettings, ...settings };

  // Validate settings
  if (settings.maxCards !== undefined) {
    if (settings.maxCards < 2 || settings.maxCards > 5) {
      throw new Error('maxCards must be between 2 and 5');
    }
  }

  if (settings.minAmount !== undefined) {
    if (settings.minAmount < 100) {
      throw new Error('minAmount must be at least 100 cents ($1.00)');
    }
  }

  const updated = await storeQueries.updateStoreSettings(storeId, updatedSettings);

  logger.info('Store settings updated', {
    storeId,
    settings: updatedSettings
  });

  return updated;
}

/**
 * Get store statistics
 * @param {number} storeId - Store ID
 * @returns {Promise<object>} Store statistics
 */
export async function getStoreStats(storeId) {
  const store = await storeQueries.getStoreById(storeId);
  if (!store) {
    throw new Error('Store not found');
  }

  // Get transaction statistics
  const allTransactions = await transactionQueries.getTransactions({
    storeId,
    page: 1,
    limit: 10000 // Get all for stats
  });

  const transactions = allTransactions.transactions;
  const totalTransactions = transactions.length;
  const completedTransactions = transactions.filter(t => t.status === 'completed').length;
  const failedTransactions = transactions.filter(t => t.status === 'failed').length;
  
  const totalVolume = transactions
    .filter(t => t.status === 'completed')
    .reduce((sum, t) => sum + t.total_amount, 0);

  const successRate = totalTransactions > 0 
    ? (completedTransactions / totalTransactions) * 100 
    : 0;

  return {
    storeId: store.id,
    shopDomain: store.shop_domain,
    totalTransactions,
    completedTransactions,
    failedTransactions,
    successRate: Math.round(successRate * 100) / 100,
    totalVolume,
    totalVolumeFormatted: `$${(totalVolume / 100).toFixed(2)}`,
    isActive: store.is_active
  };
}

/**
 * Get all stores with basic info
 * @returns {Promise<Array>} Array of stores
 */
export async function getAllStores() {
  const stores = await storeQueries.getAllActiveStores();
  
  return stores.map(store => ({
    id: store.id,
    shopDomain: store.shop_domain,
    isActive: store.is_active,
    installedAt: store.installed_at,
    settings: store.settings || {}
  }));
}

