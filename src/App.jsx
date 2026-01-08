// Main App component
import { useState, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import ProjectDashboard from './components/ProjectDashboard';
import TransactionForm from './components/TransactionForm';
import CajaList from './components/CajaList';
import AdminPanel from './components/AdminPanel';
import ReportsPanel from './components/ReportsPanel';
import ToastContainer from './components/ToastNotification';
import { db, seedInitialData } from './services/db';
import syncService from './services/syncService';
import useOnlineStatus from './hooks/useOnlineStatus';
import useToast from './hooks/useToast';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [pendingSync, setPendingSync] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const isOnline = useOnlineStatus();
  const toast = useToast();
  const wasOnline = useRef(true);

  useEffect(() => {
    initializeApp();
  }, []);

  // Detect online/offline changes and show notifications
  useEffect(() => {
    if (wasOnline.current && !isOnline) {
      toast.warning('📴 Modo sin conexión - Los cambios se guardarán localmente');
    } else if (!wasOnline.current && isOnline) {
      toast.success('🌐 Conexión restablecida');
      if (pendingSync > 0) {
        handleSync();
      }
    }
    wasOnline.current = isOnline;
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
    const count = await syncService.getPendingSyncCount();
    setPendingSync(count);

    if (result.success && result.synced > 0) {
      toast.success(`✅ Sincronizado: ${result.synced} operación(es)`);
    } else if (result.errors && result.errors.length > 0) {
      toast.error(`❌ Error de sincronización`);
    }
  }

  async function handleTransactionAdded() {
    const count = await syncService.getPendingSyncCount();
    setPendingSync(count);
    toast.success('✅ Transacción guardada');
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
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
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
    </>
  );
}

export default App;
