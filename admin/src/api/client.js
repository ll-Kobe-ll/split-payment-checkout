/**
 * API client for admin dashboard
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/admin';

/**
 * Get shop domain and host from URL params
 */
function getShopParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    shop: params.get('shop'),
    host: params.get('host')
  };
}

/**
 * Get auth headers
 */
function getAuthHeaders() {
  const { shop, host } = getShopParams();
  const headers = {
    'Content-Type': 'application/json'
  };

  if (shop) {
    headers['x-shopify-shop-domain'] = shop;
  }

  if (host) {
    headers['x-shopify-host'] = host;
  }

  // In production, get session token from App Bridge
  const sessionToken = window.sessionToken || localStorage.getItem('sessionToken');
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  return headers;
}

/**
 * Make API request
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    ...getAuthHeaders(),
    ...options.headers
  };

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'API request failed');
    }

    return data;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}

/**
 * API methods
 */
export const api = {
  // Stats
  getStats: () => request('/stats'),

  // Transactions
  getTransactions: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/transactions?${query}`);
  },

  getTransaction: (id) => request(`/transactions/${id}`),

  // Refunds
  createRefund: (transactionId, amount, reason) =>
    request('/refund', {
      method: 'POST',
      body: JSON.stringify({ transactionId, amount, reason })
    }),

  // Stores
  getStores: () => request('/stores'),

  // Settings
  updateSettings: (settings) =>
    request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    })
};

export default api;

