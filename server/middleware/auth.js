import { getShopifyClient } from '../config/shopify.js';
import { logger } from '../utils/logger.js';

/**
 * Middleware to verify Shopify session token
 * Used for admin dashboard endpoints
 */
export async function verifyShopifySession(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or invalid authorization header'
        }
      });
    }

    const token = authHeader.substring(7);
    const shopify = getShopifyClient();

    // Verify the session token
    const session = await shopify.auth.callback({
      code: token,
      shop: req.headers['x-shopify-shop-domain']
    });

    // For embedded apps, we need to verify the token differently
    // This is a simplified version - in production, use proper session token verification
    const shop = req.headers['x-shopify-shop-domain'];
    
    if (!shop) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing shop domain header'
        }
      });
    }

    // Store shop domain in request for use in routes
    req.shop = shop;
    req.shopifySession = session;

    next();
  } catch (error) {
    logger.error('Shopify session verification failed', {
      error: error.message,
      shop: req.headers['x-shopify-shop-domain']
    });

    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid session token'
      }
    });
  }
}

/**
 * Simplified session verification for embedded apps
 * In production, use @shopify/shopify-api's session token verification
 */
export async function verifySessionToken(req, res, next) {
  try {
    const token = req.headers['x-shopify-session-token'];
    const shop = req.headers['x-shopify-shop-domain'];

    if (!token || !shop) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing session token or shop domain'
        }
      });
    }

    // In production, verify the JWT token here
    // For now, we'll trust the token if it exists
    // TODO: Implement proper JWT verification using Shopify's public keys

    req.shop = shop;
    req.sessionToken = token;

    next();
  } catch (error) {
    logger.error('Session token verification failed', {
      error: error.message
    });

    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid session token'
      }
    });
  }
}

