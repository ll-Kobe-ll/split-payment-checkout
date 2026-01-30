/**
 * Input validation utilities
 */

/**
 * Validate shop domain format
 * @param {string} shopDomain - Shop domain to validate
 * @returns {boolean} True if valid
 */
export function validateShopDomain(shopDomain) {
  if (!shopDomain || typeof shopDomain !== 'string') {
    return false;
  }
  
  // Format: mystore.myshopify.com
  const shopDomainRegex = /^[a-zA-Z0-9-]+\.myshopify\.com$/;
  return shopDomainRegex.test(shopDomain);
}

/**
 * Validate checkout token format
 * @param {string} token - Checkout token to validate
 * @returns {boolean} True if valid
 */
export function validateCheckoutToken(token) {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  // Shopify checkout tokens are alphanumeric, typically 32-64 characters
  const tokenRegex = /^[a-zA-Z0-9]{32,64}$/;
  return tokenRegex.test(token);
}

/**
 * Validate amount (must be positive integer in cents)
 * @param {number} amount - Amount to validate
 * @param {number} minAmount - Minimum amount in cents (default: 100)
 * @param {number} maxAmount - Maximum amount in cents (optional)
 * @returns {object} { valid: boolean, error?: string }
 */
export function validateAmount(amount, minAmount = 100, maxAmount = null) {
  if (typeof amount !== 'number' || isNaN(amount)) {
    return { valid: false, error: 'Amount must be a number' };
  }

  if (!Number.isInteger(amount)) {
    return { valid: false, error: 'Amount must be an integer (cents)' };
  }

  if (amount < minAmount) {
    return { 
      valid: false, 
      error: `Amount must be at least ${minAmount / 100} ${minAmount >= 100 ? 'dollars' : 'cents'}` 
    };
  }

  if (maxAmount !== null && amount > maxAmount) {
    return { 
      valid: false, 
      error: `Amount exceeds maximum of ${maxAmount / 100} dollars` 
    };
  }

  if (amount <= 0) {
    return { valid: false, error: 'Amount must be positive' };
  }

  return { valid: true };
}

/**
 * Validate payment amounts match total
 * @param {number} totalAmount - Expected total in cents
 * @param {Array<number>} paymentAmounts - Array of payment amounts in cents
 * @returns {object} { valid: boolean, error?: string }
 */
export function validatePaymentAmounts(totalAmount, paymentAmounts) {
  if (!Array.isArray(paymentAmounts) || paymentAmounts.length === 0) {
    return { valid: false, error: 'At least one payment is required' };
  }

  if (paymentAmounts.length < 2) {
    return { valid: false, error: 'Split payment requires at least 2 cards' };
  }

  if (paymentAmounts.length > 5) {
    return { valid: false, error: 'Maximum 5 cards allowed' };
  }

  // Validate each amount
  for (let i = 0; i < paymentAmounts.length; i++) {
    const validation = validateAmount(paymentAmounts[i]);
    if (!validation.valid) {
      return { valid: false, error: `Payment ${i + 1}: ${validation.error}` };
    }
  }

  // Check total matches
  const sum = paymentAmounts.reduce((total, amount) => total + amount, 0);
  
  if (sum !== totalAmount) {
    return { 
      valid: false, 
      error: `Payment amounts (${sum / 100}) do not match total (${totalAmount / 100})` 
    };
  }

  return { valid: true };
}

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate Stripe PaymentIntent ID format
 * @param {string} paymentIntentId - PaymentIntent ID to validate
 * @returns {boolean} True if valid
 */
export function validatePaymentIntentId(paymentIntentId) {
  if (!paymentIntentId || typeof paymentIntentId !== 'string') {
    return false;
  }
  
  // Stripe PaymentIntent IDs start with pi_
  return paymentIntentId.startsWith('pi_') && paymentIntentId.length > 3;
}

/**
 * Validate Stripe PaymentMethod ID format
 * @param {string} paymentMethodId - PaymentMethod ID to validate
 * @returns {boolean} True if valid
 */
export function validatePaymentMethodId(paymentMethodId) {
  if (!paymentMethodId || typeof paymentMethodId !== 'string') {
    return false;
  }
  
  // Stripe PaymentMethod IDs start with pm_
  return paymentMethodId.startsWith('pm_') && paymentMethodId.length > 3;
}

/**
 * Sanitize string input
 * @param {string} input - String to sanitize
 * @param {number} maxLength - Maximum length (optional)
 * @returns {string} Sanitized string
 */
export function sanitizeString(input, maxLength = null) {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = input.trim();
  
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if valid
 */
export function validateIpAddress(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }
  
  // IPv4 regex
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  // IPv6 regex (simplified)
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;
  
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

