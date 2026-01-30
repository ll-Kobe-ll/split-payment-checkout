import express from 'express';
import { getShopifyClient } from '../config/shopify.js';
import { logger } from '../utils/logger.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import * as storeQueries from '../db/queries/stores.js';
import { validateShopDomain } from '../utils/validation.js';

const router = express.Router();

/**
 * GET /api/auth/install
 * Initiate Shopify OAuth installation flow
 */
router.get('/install', asyncHandler(async (req, res) => {
  const shop = req.query.shop;

  if (!shop) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_SHOP',
        message: 'Shop parameter is required'
      }
    });
  }

  if (!validateShopDomain(shop)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SHOP',
        message: 'Invalid shop domain format'
      }
    });
  }

  const shopify = getShopifyClient();
  const authRoute = await shopify.auth.begin({
    shop: shop,
    callbackPath: '/api/auth/callback',
    isOnline: false
  });

  logger.info('OAuth installation initiated', { shop });
  res.redirect(authRoute);
}));

/**
 * GET /api/auth/callback
 * Handle Shopify OAuth callback
 */
router.get('/callback', asyncHandler(async (req, res) => {
  const { code, shop, state } = req.query;

  if (!code || !shop) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_PARAMS',
        message: 'Missing code or shop parameter'
      }
    });
  }

  if (!validateShopDomain(shop)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_SHOP',
        message: 'Invalid shop domain format'
      }
    });
  }

  try {
    const shopify = getShopifyClient();
    const callbackResponse = await shopify.auth.callback({
      code,
      shop
    });

    const { accessToken, scope } = callbackResponse.session;

    // Store or update store in database
    await storeQueries.upsertStore(shop, accessToken, {
      scope: scope,
      installedAt: new Date().toISOString()
    });

    logger.info('Store installed successfully', { shop });

    // Redirect to app (embedded app URL)
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    res.redirect(`${appUrl}/admin?shop=${shop}&host=${req.query.host || ''}`);
  } catch (error) {
    logger.error('OAuth callback error', {
      error: error.message,
      shop,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'INSTALLATION_ERROR',
        message: 'Failed to complete installation'
      }
    });
  }
}));

export default router;

