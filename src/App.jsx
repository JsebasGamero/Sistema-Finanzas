// Main App component
import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import ProjectDashboard from './components/ProjectDashboard';
import TransactionForm from './components/TransactionForm';
import CajaList from './components/CajaList';
import AdminPanel from './components/AdminPanel';
import ReportsPanel from './components/ReportsPanel';
import { db, seedInitialData } from './services/db';
import syncService from './services/syncService';
import useOnlineStatus from './hooks/useOnlineStatus';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingSync, setPendingSync] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const isOnline = useOnlineStatus();

  useEffect(() => {
    initializeApp();
  }, []);

  // Try to sync when coming back online
  useEffect(() => {
    if (isOnline && pendingSync > 0) {
      handleSync();
    }
  }, [isOnline]);

  async function initializeApp() {
    try {
      // Seed initial data if needed
      await seedInitialData();

      // Check pending sync count
      const count = await syncService.getPendingSyncCount();
      setPendingSync(count);

      setInitialized(true);
    } catch (error) {
      console.error('Error initializing app:', error);
      setInitialized(true);
    }
  }

  async function handleSync() {
    const result = await syncService.processSyncQueue();
    if (result.success) {
      const count = await syncService.getPendingSyncCount();
      setPendingSync(count);
    }
  }

  async function handleTransactionAdded() {
    const count = await syncService.getPendingSyncCount();
    setPendingSync(count);
  }

  if (!initialized) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold mx-auto mb-4"></div>
          <p className="text-gray-400">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout
      activeTab={activeTab}
      setActiveTab={setActiveTab}
      pendingSync={pendingSync}
      onSync={handleSync}
    >
      {activeTab === 'dashboard' && <ProjectDashboard />}
      {activeTab === 'nueva' && <TransactionForm onTransactionAdded={handleTransactionAdded} />}
      {activeTab === 'cajas' && <CajaList />}
      {activeTab === 'config' && <AdminPanel />}
      {activeTab === 'reportes' && <ReportsPanel />}
    </Layout>
  );
}

export default App;
