import React from 'react';

function StoreStats({ stats }) {
  if (!stats) {
    return <div>Loading stats...</div>;
  }

  const formatCurrency = (cents) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  };

  const statCards = [
    {
      title: 'Total Transactions',
      value: stats.totalTransactions || 0,
      color: 'bg-blue-500'
    },
    {
      title: 'Success Rate',
      value: `${(stats.successRate || 0).toFixed(1)}%`,
      color: 'bg-green-500'
    },
    {
      title: 'Total Volume',
      value: formatCurrency(stats.totalVolume || 0),
      color: 'bg-purple-500'
    },
    {
      title: 'Active Stores',
      value: stats.activeStores || 0,
      color: 'bg-orange-500'
    }
  ];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className="bg-white overflow-hidden shadow rounded-lg"
        >
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`${stat.color} rounded-md p-3`}>
                  <div className="h-6 w-6 text-white"></div>
                </div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    {stat.title}
                  </dt>
                  <dd className="text-lg font-semibold text-gray-900">
                    {stat.value}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default StoreStats;

