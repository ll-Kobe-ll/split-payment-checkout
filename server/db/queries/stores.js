import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * Get store by shop domain
 */
export async function getStoreByDomain(shopDomain) {
  try {
    const result = await query(
      'SELECT * FROM stores WHERE shop_domain = $1 AND is_active = true',
      [shopDomain]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting store by domain', { error: error.message, shopDomain });
    throw error;
  }
}

/**
 * Get store by ID
 */
export async function getStoreById(storeId) {
  try {
    const result = await query(
      'SELECT * FROM stores WHERE id = $1',
      [storeId]
    );
    return result.rows[0] || null;
  } catch (error) {
    logger.error('Error getting store by ID', { error: error.message, storeId });
    throw error;
  }
}

/**
 * Create or update store
 */
export async function upsertStore(shopDomain, accessToken, settings = {}) {
  try {
    const result = await query(
      `INSERT INTO stores (shop_domain, access_token, settings, installed_at, is_active)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, true)
       ON CONFLICT (shop_domain) 
       DO UPDATE SET 
         access_token = EXCLUDED.access_token,
         settings = EXCLUDED.settings,
         is_active = true,
         uninstalled_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [shopDomain, accessToken, JSON.stringify(settings)]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error upserting store', { error: error.message, shopDomain });
    throw error;
  }
}

/**
 * Mark store as uninstalled
 */
export async function uninstallStore(shopDomain) {
  try {
    const result = await query(
      `UPDATE stores 
       SET is_active = false, uninstalled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE shop_domain = $1
       RETURNING *`,
      [shopDomain]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error uninstalling store', { error: error.message, shopDomain });
    throw error;
  }
}

/**
 * Update store settings
 */
export async function updateStoreSettings(storeId, settings) {
  try {
    const result = await query(
      `UPDATE stores 
       SET settings = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(settings), storeId]
    );
    return result.rows[0];
  } catch (error) {
    logger.error('Error updating store settings', { error: error.message, storeId });
    throw error;
  }
}

/**
 * Get all active stores
 */
export async function getAllActiveStores() {
  try {
    const result = await query(
      'SELECT * FROM stores WHERE is_active = true ORDER BY installed_at DESC'
    );
    return result.rows;
  } catch (error) {
    logger.error('Error getting all active stores', { error: error.message });
    throw error;
  }
}

