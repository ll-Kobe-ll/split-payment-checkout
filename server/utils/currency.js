/**
 * Currency formatting and conversion utilities
 */

/**
 * Format cents to currency string
 * @param {number} cents - Amount in cents
 * @param {string} currency - Currency code (default: USD)
 * @returns {string} Formatted currency string
 */
export function formatCents(cents, currency = 'USD') {
  const amount = cents / 100;
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  return formatter.format(amount);
}

/**
 * Convert dollars to cents
 * @param {number} dollars - Amount in dollars
 * @returns {number} Amount in cents
 */
export function dollarsToCents(dollars) {
  return Math.round(dollars * 100);
}

/**
 * Convert cents to dollars
 * @param {number} cents - Amount in cents
 * @returns {number} Amount in dollars
 */
export function centsToDollars(cents) {
  return cents / 100;
}

/**
 * Validate amount is positive and meets minimum
 * @param {number} cents - Amount in cents
 * @param {number} minCents - Minimum amount in cents (default: 100 = $1.00)
 * @returns {boolean} True if valid
 */
export function validateAmount(cents, minCents = 100) {
  return Number.isInteger(cents) && cents >= minCents;
}

/**
 * Round amount to nearest cent (handles floating point issues)
 * @param {number} amount - Amount that might have floating point issues
 * @returns {number} Rounded amount in cents
 */
export function roundToCents(amount) {
  return Math.round(amount * 100);
}

/**
 * Calculate proportional split
 * @param {number} totalAmount - Total amount in cents
 * @param {number} portion - Portion amount in cents
 * @param {number} splitAmount - Amount to split proportionally
 * @returns {number} Proportional amount in cents
 */
export function calculateProportionalAmount(totalAmount, portion, splitAmount) {
  if (totalAmount === 0) return 0;
  const proportion = portion / totalAmount;
  return Math.round(splitAmount * proportion);
}

/**
 * Distribute amount across multiple portions with rounding
 * @param {number} totalAmount - Total amount to distribute
 * @param {Array<number>} portions - Array of portion amounts
 * @returns {Array<number>} Array of distributed amounts
 */
export function distributeProportionally(totalAmount, portions) {
  const totalPortions = portions.reduce((sum, p) => sum + p, 0);
  
  if (totalPortions === 0) {
    return portions.map(() => 0);
  }

  // Calculate proportional amounts
  const distributed = portions.map(portion => {
    const proportion = portion / totalPortions;
    return Math.round(totalAmount * proportion);
  });

  // Handle rounding differences
  const distributedTotal = distributed.reduce((sum, d) => sum + d, 0);
  const difference = totalAmount - distributedTotal;

  if (difference !== 0) {
    // Add/subtract difference from largest portion
    const largestIndex = distributed.reduce((maxIdx, val, idx, arr) => 
      val > arr[maxIdx] ? idx : maxIdx, 0
    );
    distributed[largestIndex] += difference;
  }

  return distributed;
}

