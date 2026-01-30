/**
 * Split-Pay Checkout Widget
 * Injected into Shopify checkout to enable split payments
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    apiUrl: window.SPLIT_PAY_API_URL || 'https://your-app.railway.app/api/widget',
    stripePublicKey: window.SPLIT_PAY_STRIPE_KEY || '',
    maxCards: 5,
    minAmount: 100, // $1.00 in cents
    sessionTimeout: 30 * 60 * 1000 // 30 minutes
  };

  // State
  let state = {
    sessionId: null,
    transactionId: null,
    totalAmount: 0,
    currency: 'USD',
    payments: [],
    stripe: null,
    elements: null,
    currentCardElement: null,
    isProcessing: false
  };

  /**
   * Initialize widget
   */
  async function init() {
    try {
      // Wait for DOM
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
        return;
      }

      // Check if Stripe is loaded
      if (typeof Stripe === 'undefined') {
        console.error('Stripe.js is not loaded');
        return;
      }

      // Initialize Stripe
      state.stripe = Stripe(CONFIG.stripePublicKey);

      // Get checkout data from Shopify
      const checkoutData = getCheckoutData();
      if (!checkoutData) {
        console.warn('Could not get checkout data');
        return;
      }

      // Initialize session
      await initializeSession(checkoutData);

      // Inject widget UI
      injectWidget();

    } catch (error) {
      console.error('Error initializing widget:', error);
      showError('Failed to initialize split payment. Please refresh the page.');
    }
  }

  /**
   * Get checkout data from Shopify
   */
  function getCheckoutData() {
    // Try to get from window object (set by theme)
    if (window.checkout) {
      return {
        shopDomain: window.checkout.shop || window.Shopify?.shop,
        checkoutToken: window.checkout.token || window.Shopify?.checkout?.token,
        totalPrice: window.checkout.total_price || window.Shopify?.checkout?.total_price
      };
    }

    // Try to parse from page
    const shopMatch = document.location.hostname.match(/(.+)\.myshopify\.com/);
    if (shopMatch) {
      return {
        shopDomain: shopMatch[0],
        checkoutToken: getCheckoutTokenFromPage(),
        totalPrice: getTotalPriceFromPage()
      };
    }

    return null;
  }

  /**
   * Get checkout token from page
   */
  function getCheckoutTokenFromPage() {
    // Try various methods to get token
    const tokenInput = document.querySelector('input[name="checkout[token]"]');
    if (tokenInput) return tokenInput.value;

    const urlMatch = window.location.pathname.match(/\/checkouts\/([a-zA-Z0-9]+)/);
    if (urlMatch) return urlMatch[1];

    return null;
  }

  /**
   * Get total price from page
   */
  function getTotalPriceFromPage() {
    const totalElement = document.querySelector('[data-checkout-total-price]') ||
                        document.querySelector('.total-line__price') ||
                        document.querySelector('.order-summary__section--total .order-summary__emphasis');
    
    if (totalElement) {
      const text = totalElement.textContent || totalElement.innerText;
      const match = text.match(/[\d,]+\.\d{2}/);
      if (match) {
        return parseFloat(match[0].replace(/,/g, '')) * 100; // Convert to cents
      }
    }

    return 0;
  }

  /**
   * Initialize widget session
   */
  async function initializeSession(checkoutData) {
    try {
      const response = await fetch(`${CONFIG.apiUrl}/init`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shopDomain: checkoutData.shopDomain,
          checkoutToken: checkoutData.checkoutToken
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to initialize session');
      }

      state.sessionId = data.sessionId;
      state.transactionId = data.transactionId;
      state.totalAmount = data.totalAmount || checkoutData.totalPrice;
      state.currency = data.currency || 'USD';
      CONFIG.maxCards = data.maxCards || CONFIG.maxCards;
      CONFIG.minAmount = data.minAmount || CONFIG.minAmount;

      // Set session timeout
      setTimeout(() => {
        if (state.sessionId) {
          console.warn('Session expired');
          state.sessionId = null;
        }
      }, CONFIG.sessionTimeout);

    } catch (error) {
      console.error('Error initializing session:', error);
      throw error;
    }
  }

  /**
   * Inject widget UI into checkout
   */
  function injectWidget() {
    // Hide default payment section
    const defaultPayment = document.querySelector('[data-step="payment_method"]') ||
                          document.querySelector('.step[data-step="payment_method"]');
    if (defaultPayment) {
      defaultPayment.style.display = 'none';
    }

    // Create widget container
    const widgetContainer = document.createElement('div');
    widgetContainer.id = 'split-pay-widget';
    widgetContainer.className = 'split-pay-container';

    // Insert before checkout button or at end of form
    const checkoutButton = document.querySelector('[name="commit"]') ||
                          document.querySelector('button[type="submit"]') ||
                          document.querySelector('.step__footer__continue-btn');
    
    if (checkoutButton && checkoutButton.parentElement) {
      checkoutButton.parentElement.insertBefore(widgetContainer, checkoutButton);
    } else {
      document.body.appendChild(widgetContainer);
    }

    // Render initial state
    renderWidget();
  }

  /**
   * Render widget UI
   */
  function renderWidget() {
    const container = document.getElementById('split-pay-widget');
    if (!container) return;

    const remainingBalance = getRemainingBalance();

    container.innerHTML = `
      <div class="split-pay-header">
        <h3>Split Your Payment</h3>
        <p class="split-pay-total">Total: ${formatCurrency(state.totalAmount)}</p>
      </div>

      <div class="split-pay-cards">
        ${renderCardsList()}
      </div>

      <div class="split-pay-balance">
        <strong>Remaining: ${formatCurrency(remainingBalance)}</strong>
      </div>

      ${remainingBalance > 0 && state.payments.length < CONFIG.maxCards ? renderAddCardForm() : ''}

      ${remainingBalance === 0 && state.payments.length > 0 ? renderCompleteButton() : ''}

      <div class="split-pay-messages" id="split-pay-messages"></div>
    `;

    // Attach event listeners
    attachEventListeners();
  }

  /**
   * Render cards list
   */
  function renderCardsList() {
    if (state.payments.length === 0) {
      return '<p class="split-pay-empty">Add a payment method to get started</p>';
    }

    return state.payments.map((payment, index) => `
      <div class="split-pay-card" data-payment-id="${payment.paymentIntentId}">
        <div class="split-pay-card-info">
          <span class="split-pay-card-brand">${payment.cardBrand || 'Card'}</span>
          <span class="split-pay-card-number">**** ${payment.cardLastFour || '****'}</span>
          <span class="split-pay-card-amount">${formatCurrency(payment.amount)}</span>
        </div>
        ${!state.isProcessing ? `
          <button class="split-pay-remove" data-payment-id="${payment.paymentIntentId}">
            Remove
          </button>
        ` : ''}
      </div>
    `).join('');
  }

  /**
   * Render add card form
   */
  function renderAddCardForm() {
    return `
      <div class="split-pay-add-card">
        <div class="split-pay-amount-input">
          <label>Amount for this card:</label>
          <input 
            type="number" 
            id="split-pay-amount" 
            min="${CONFIG.minAmount / 100}" 
            max="${getRemainingBalance() / 100}" 
            step="0.01"
            placeholder="${formatCurrency(getRemainingBalance())}"
          />
        </div>
        <div id="split-pay-card-element" class="split-pay-card-element"></div>
        <button id="split-pay-add-button" class="split-pay-add-button">
          Add This Card
        </button>
      </div>
    `;
  }

  /**
   * Render complete button
   */
  function renderCompleteButton() {
    return `
      <button id="split-pay-complete" class="split-pay-complete-button" ${state.isProcessing ? 'disabled' : ''}>
        ${state.isProcessing ? 'Processing...' : 'Complete Purchase'}
      </button>
    `;
  }

  /**
   * Attach event listeners
   */
  function attachEventListeners() {
    // Remove card buttons
    document.querySelectorAll('.split-pay-remove').forEach(button => {
      button.addEventListener('click', async (e) => {
        const paymentIntentId = e.target.dataset.paymentId;
        await removePayment(paymentIntentId);
      });
    });

    // Add card button
    const addButton = document.getElementById('split-pay-add-button');
    if (addButton) {
      addButton.addEventListener('click', async () => {
        await addPaymentMethod();
      });
    }

    // Complete button
    const completeButton = document.getElementById('split-pay-complete');
    if (completeButton) {
      completeButton.addEventListener('click', async () => {
        await completeCheckout();
      });
    }

    // Initialize Stripe Elements if form is visible
    if (document.getElementById('split-pay-card-element')) {
      initializeStripeElements();
    }
  }

  /**
   * Initialize Stripe Elements
   */
  function initializeStripeElements() {
    if (state.elements) {
      state.elements = null;
    }

    state.elements = state.stripe.elements();
    state.currentCardElement = state.elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#424770',
          '::placeholder': {
            color: '#aab7c4',
          },
        },
        invalid: {
          color: '#9e2146',
        },
      },
    });

    state.currentCardElement.mount('#split-pay-card-element');
  }

  /**
   * Add payment method
   */
  async function addPaymentMethod() {
    try {
      const amountInput = document.getElementById('split-pay-amount');
      const amount = parseFloat(amountInput.value) * 100; // Convert to cents

      // Validation
      if (isNaN(amount) || amount < CONFIG.minAmount) {
        showError(`Minimum amount is ${formatCurrency(CONFIG.minAmount)}`);
        return;
      }

      const remainingBalance = getRemainingBalance();
      if (amount > remainingBalance) {
        showError(`Amount cannot exceed remaining balance of ${formatCurrency(remainingBalance)}`);
        return;
      }

      if (state.payments.length >= CONFIG.maxCards) {
        showError(`Maximum ${CONFIG.maxCards} cards allowed`);
        return;
      }

      // Create PaymentIntent
      const response = await fetch(`${CONFIG.apiUrl}/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: state.sessionId,
          amount: Math.round(amount)
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to create payment intent');
      }

      // Create payment method from card element
      const { paymentMethod, error } = await state.stripe.createPaymentMethod({
        type: 'card',
        card: state.currentCardElement,
      });

      if (error) {
        throw new Error(error.message);
      }

      // Get card details
      const cardDetails = paymentMethod.card;

      // Store payment
      state.payments.push({
        paymentId: data.paymentId,
        paymentIntentId: data.paymentIntentId,
        paymentMethodId: paymentMethod.id,
        clientSecret: data.clientSecret,
        amount: Math.round(amount),
        cardBrand: cardDetails.brand,
        cardLastFour: cardDetails.last4
      });

      // Clear form
      amountInput.value = '';
      if (state.currentCardElement) {
        state.currentCardElement.clear();
      }

      // Re-render
      renderWidget();

    } catch (error) {
      console.error('Error adding payment method:', error);
      showError(error.message || 'Failed to add payment method');
    }
  }

  /**
   * Remove payment
   */
  async function removePayment(paymentIntentId) {
    try {
      const response = await fetch(`${CONFIG.apiUrl}/remove-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: state.sessionId,
          paymentIntentId
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to remove payment');
      }

      // Remove from state
      state.payments = state.payments.filter(p => p.paymentIntentId !== paymentIntentId);

      // Re-render
      renderWidget();

    } catch (error) {
      console.error('Error removing payment:', error);
      showError(error.message || 'Failed to remove payment');
    }
  }

  /**
   * Complete checkout
   */
  async function completeCheckout() {
    if (state.isProcessing) return;

    const remainingBalance = getRemainingBalance();
    if (remainingBalance !== 0) {
      showError('Payment amounts must equal total');
      return;
    }

    if (state.payments.length < 2) {
      showError('At least 2 cards required for split payment');
      return;
    }

    state.isProcessing = true;
    renderWidget();

    try {
      // Confirm all PaymentIntents
      const confirmResults = await Promise.all(
        state.payments.map(async (payment) => {
          const result = await state.stripe.confirmCardPayment(payment.clientSecret, {
            payment_method: payment.paymentMethodId
          });

          if (result.error) {
            throw { payment, error: result.error };
          }

          return result;
        })
      );

      // All confirmed - send to backend
      const response = await fetch(`${CONFIG.apiUrl}/complete-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: state.sessionId,
          payments: state.payments.map(p => ({
            paymentIntentId: p.paymentIntentId,
            paymentMethodId: p.paymentMethodId
          }))
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error?.message || 'Checkout failed');
      }

      // Success - redirect to thank you page
      showSuccess(`Payment successful! Order #${data.orderNumber}`);
      
      // Redirect after delay
      setTimeout(() => {
        window.location.href = `/checkouts/${state.sessionId}/thank_you`;
      }, 2000);

    } catch (error) {
      state.isProcessing = false;
      renderWidget();

      const failedCard = error.payment;
      if (failedCard) {
        showError(`Card ending in ${failedCard.cardLastFour} was declined: ${error.error.message}`);
      } else {
        showError(error.message || 'Payment failed. Please try again.');
      }
    }
  }

  /**
   * Get remaining balance
   */
  function getRemainingBalance() {
    const paid = state.payments.reduce((sum, p) => sum + p.amount, 0);
    return state.totalAmount - paid;
  }

  /**
   * Format currency
   */
  function formatCurrency(cents) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: state.currency
    }).format(cents / 100);
  }

  /**
   * Show error message
   */
  function showError(message) {
    const messagesDiv = document.getElementById('split-pay-messages');
    if (messagesDiv) {
      messagesDiv.innerHTML = `<div class="split-pay-error">${message}</div>`;
      setTimeout(() => {
        messagesDiv.innerHTML = '';
      }, 5000);
    }
  }

  /**
   * Show success message
   */
  function showSuccess(message) {
    const messagesDiv = document.getElementById('split-pay-messages');
    if (messagesDiv) {
      messagesDiv.innerHTML = `<div class="split-pay-success">${message}</div>`;
    }
  }

  // Initialize when script loads
  init();

})();

