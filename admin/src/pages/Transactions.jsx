import React, { useState, useEffect } from 'react';
import TransactionTable from '../components/TransactionTable.jsx';
import RefundModal from '../components/RefundModal.jsx';
import api from '../api/client.js';

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showRefundModal, setShowRefundModal] = useState(false);

  useEffect(() => {
    loadTransactions();
  }, [page, statusFilter]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 20
      };

      if (statusFilter) {
        params.status = statusFilter;
      }

      const data = await api.getTransactions(params);
      setTransactions(data.transactions);
      setTotalPages(data.pages);
    } catch (error) {
      console.error('Error loading transactions:', error);
      alert('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (transactionId) => {
    try {
      const data = await api.getTransaction(transactionId);
      // Show details in alert (in production, use a modal)
      const paymentsInfo = data.payments.map(p => 
        `${p.card_brand} ****${p.card_last_four}: $${(p.amount / 100).toFixed(2)}`
      ).join('\n');
      
      alert(`Transaction Details:\n\nOrder: ${data.transaction.shopify_order_number}\nStatus: ${data.transaction.status}\nTotal: $${(data.transaction.total_amount / 100).toFixed(2)}\n\nPayments:\n${paymentsInfo}`);
    } catch (error) {
      console.error('Error loading transaction details:', error);
      alert('Failed to load transaction details');
    }
  };

  const handleRefund = (transaction) => {
    setSelectedTransaction(transaction);
    setShowRefundModal(true);
  };

  const handleRefundConfirm = async (transactionId, amount, reason) => {
    try {
      await api.createRefund(transactionId, amount, reason);
      alert('Refund processed successfully');
      loadTransactions(); // Refresh
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-6 flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Transactions</h2>
        
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <TransactionTable
            transactions={transactions}
            onViewDetails={handleViewDetails}
            onRefund={handleRefund}
          />

          {totalPages > 1 && (
            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {showRefundModal && (
        <RefundModal
          transaction={selectedTransaction}
          onClose={() => {
            setShowRefundModal(false);
            setSelectedTransaction(null);
          }}
          onConfirm={handleRefundConfirm}
        />
      )}
    </div>
  );
}

export default Transactions;

