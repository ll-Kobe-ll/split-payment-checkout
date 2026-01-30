import { query, getPool } from '../server/config/database.js';
import { logger } from '../server/utils/logger.js';
import * as storeQueries from '../server/db/queries/stores.js';
import * as transactionQueries from '../server/db/queries/transactions.js';
import * as paymentQueries from '../server/db/queries/payments.js';

/**
 * Seed script for test data
 */

async function seed() {
  try {
    logger.info('Seeding test data...');

    // Create test store
    const store = await storeQueries.upsertStore(
      'test-store.myshopify.com',
      'test_access_token_12345',
      {
        maxCards: 5,
        minAmount: 100
      }
    );

    logger.info('Created test store', { storeId: store.id });

    // Create test transactions
    const transactions = [];

    for (let i = 0; i < 5; i++) {
      const transaction = await transactionQueries.createTransaction({
        storeId: store.id,
        shopifyCheckoutToken: `test_checkout_${Date.now()}_${i}`,
        totalAmount: (100 + i * 50) * 100, // $100, $150, $200, etc.
        currency: 'USD',
        customerEmail: `customer${i}@example.com`,
        customerIp: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Test)'
      });

      transactions.push(transaction);

      // Create payments for each transaction
      const paymentCount = 2 + (i % 3); // 2, 3, or 4 payments
      const amountPerPayment = transaction.total_amount / paymentCount;

      for (let j = 0; j < paymentCount; j++) {
        await paymentQueries.createPayment({
          transactionId: transaction.id,
          stripePaymentIntentId: `pi_test_${transaction.id}_${j}`,
          amount: Math.round(amountPerPayment)
        });
      }

      // Mark some as completed
      if (i < 3) {
        await transactionQueries.updateTransactionStatus(transaction.id, 'completed');
        await transactionQueries.updateTransactionOrder(
          transaction.id,
          `shopify_order_${transaction.id}`,
          `${1000 + transaction.id}`
        );
      } else if (i === 3) {
        await transactionQueries.updateTransactionStatus(transaction.id, 'failed', 'Test failure');
      }
    }

    logger.info(`Created ${transactions.length} test transactions`);

    logger.info('Seed data created successfully');

  } catch (error) {
    logger.error('Error seeding data', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    await getPool().end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed().catch(() => process.exit(1));
}

export { seed };

