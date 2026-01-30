import '@shopify/shopify-api/adapters/node';
import { shopifyApi, LATEST_API_VERSION } from '@shopify/shopify-api';
import { logger } from '../utils/logger.js';

let shopifyClient = null;

export function getShopifyClient() {
  if (!shopifyClient) {
    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;
    const scopes = process.env.SHOPIFY_SCOPES || 'read_checkouts,write_checkouts,read_orders,write_orders,read_products';
    const hostName = process.env.SHOPIFY_APP_URL || process.env.APP_URL || 'http://localhost:3000';

    if (!apiKey || !apiSecret) {
      throw new Error('SHOPIFY_API_KEY and SHOPIFY_API_SECRET environment variables are required');
    }

    shopifyClient = shopifyApi({
      apiKey,
      apiSecretKey: apiSecret,
      scopes: scopes.split(',').map(s => s.trim()),
      hostName: hostName.replace(/^https?:\/\//, '').replace(/\/$/, ''),
      apiVersion: LATEST_API_VERSION,
      isEmbeddedApp: true,
    });

    logger.info('Shopify API client initialized', {
      scopes: scopes,
      hostName: hostName
    });
  }

  return shopifyClient;
}

export function getShopifyScopes() {
  return (process.env.SHOPIFY_SCOPES || 'read_checkouts,write_checkouts,read_orders,write_orders,read_products')
    .split(',')
    .map(s => s.trim());
}

