import React, { useState, useEffect } from 'react';
import StoreStats from '../components/StoreStats.jsx';
import TransactionTable from '../components/TransactionTable.jsx';
import RefundModal from '../components/RefundModal.jsx';
import api from '../api/client.js';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [transactionDetails, setTransactionDetails] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [statsData, transactionsData] = await Promise.all([
        api.getStats(),
        api.getTransactions({ page: 1, limit: 10 })
      ]);

      setStats(statsData.stats);
      setTransactions(transactionsData.transactions);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      alert('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (transactionId) => {
    try {
      const data = await api.getTransaction(transactionId);
      setTransactionDetails(data);
      // In production, show a modal or navigate to details page
      alert(`Transaction Details:\nOrder: ${data.transaction.shopify_order_number}\nStatus: ${data.transaction.status}\nPayments: ${data.payments.length}`);
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
      loadData(); // Refresh data
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
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Dashboard</h2>
        <StoreStats stats={stats} />
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
            Recent Transactions
          </h3>
          <TransactionTable
            transactions={transactions}
            onViewDetails={handleViewDetails}
            onRefund={handleRefund}
          />
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

export default Dashboard;

