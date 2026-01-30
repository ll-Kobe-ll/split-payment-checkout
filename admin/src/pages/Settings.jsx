import React, { useState, useEffect } from 'react';
import api from '../api/client.js';

function Settings() {
  const [settings, setSettings] = useState({
    maxCards: 5,
    minAmount: 100
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // In production, load settings from API
    // For now, use defaults
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setSaved(false);

    try {
      await api.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-0">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>

      <div className="bg-white shadow rounded-lg">
        <form onSubmit={handleSubmit}>
          <div className="px-4 py-5 sm:p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Maximum Cards
              </label>
              <input
                type="number"
                min="2"
                max="5"
                value={settings.maxCards}
                onChange={(e) =>
                  setSettings({ ...settings, maxCards: parseInt(e.target.value, 10) })
                }
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Maximum number of cards allowed for split payment (2-5)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Amount per Card (cents)
              </label>
              <input
                type="number"
                min="100"
                value={settings.minAmount}
                onChange={(e) =>
                  setSettings({ ...settings, minAmount: parseInt(e.target.value, 10) })
                }
                className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                required
              />
              <p className="mt-1 text-sm text-gray-500">
                Minimum amount in cents (e.g., 100 = $1.00)
              </p>
            </div>

            {saved && (
              <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded">
                Settings saved successfully!
              </div>
            )}
          </div>

          <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Settings;

