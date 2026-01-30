-- Stores table: Tracks installed Shopify stores
CREATE TABLE stores (
    id SERIAL PRIMARY KEY,
    shop_domain VARCHAR(255) UNIQUE NOT NULL,      -- e.g., "mystore.myshopify.com"
    access_token TEXT NOT NULL,                     -- Encrypted Shopify access token
    stripe_account_id VARCHAR(255),                 -- If using Stripe Connect (future)
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',                    -- Store-specific settings
    installed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uninstalled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Transactions table: One row per checkout attempt
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    store_id INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    shopify_checkout_token VARCHAR(255),           -- Shopify checkout token
    shopify_order_id VARCHAR(255),                 -- Created after successful payment
    shopify_order_number VARCHAR(50),              -- Human-readable order number
    
    -- Amounts (all in cents to avoid floating point)
    total_amount INTEGER NOT NULL,                 -- Total order amount in cents
    currency VARCHAR(3) DEFAULT 'USD',
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',          -- pending, processing, completed, failed, refunded, partially_refunded
    failure_reason TEXT,                           -- If failed, why
    
    -- Metadata
    customer_email VARCHAR(255),
    customer_ip VARCHAR(45),                       -- IPv6 compatible
    user_agent TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Payments table: Individual card payments within a transaction (2-5 per transaction)
CREATE TABLE payments (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    
    -- Stripe data
    stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_payment_method_id VARCHAR(255),
    
    -- Amount for this specific card
    amount INTEGER NOT NULL,                       -- Amount in cents
    
    -- Card details (for display, NOT full card numbers)
    card_brand VARCHAR(50),                        -- visa, mastercard, amex, etc.
    card_last_four VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    
    -- Status
    status VARCHAR(50) DEFAULT 'pending',          -- pending, authorized, captured, failed, voided, refunded
    failure_code VARCHAR(100),
    failure_message TEXT,
    
    -- Capture tracking
    authorized_at TIMESTAMP,
    captured_at TIMESTAMP,
    voided_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Refunds table: Track all refunds
CREATE TABLE refunds (
    id SERIAL PRIMARY KEY,
    transaction_id INTEGER REFERENCES transactions(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES payments(id) ON DELETE CASCADE,
    
    stripe_refund_id VARCHAR(255) UNIQUE NOT NULL,
    amount INTEGER NOT NULL,                       -- Refund amount in cents
    reason VARCHAR(255),                           -- duplicate, fraudulent, requested_by_customer
    
    status VARCHAR(50) DEFAULT 'pending',          -- pending, succeeded, failed
    failure_reason TEXT,
    
    initiated_by VARCHAR(50),                      -- admin, webhook, automatic
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_transactions_store_id ON transactions(store_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);
CREATE INDEX idx_transactions_shopify_order_id ON transactions(shopify_order_id);
CREATE INDEX idx_payments_transaction_id ON payments(transaction_id);
CREATE INDEX idx_payments_stripe_pi ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_refunds_transaction_id ON refunds(transaction_id);
CREATE INDEX idx_stores_shop_domain ON stores(shop_domain);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stores_updated_at BEFORE UPDATE ON stores
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

