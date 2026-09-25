// Main App component
import { useState, useEffect, useRef } from 'react';
import Layout from './components/Layout';
import ProjectDashboard from './components/ProjectDashboard';
import TransactionForm from './components/TransactionForm';
import CajaList from './components/CajaList';
import AdminPanel from './components/AdminPanel';
import ReportsPanel from './components/ReportsPanel';
import ToastContainer from './components/ToastNotification';
import LoginScreen from './components/LoginScreen';
import { useAuth } from './context/AuthContext';
import { seedInitialData } from './services/db';
import syncService, { processSyncQueue, reapplyPendingOperations } from './services/syncService';
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
  const { currentUser, loading: authLoading, login, logout } = useAuth();

  // Depende del id, no del objeto: extractUserInfo() devuelve un objeto nuevo
  // en cada evento de auth, así que con `[currentUser]` un simple cambio de
  // nombre disparaba un clear+pull completo de toda la base.
  const userId = currentUser?.id;
  useEffect(() => {
    if (userId) {
      initializeApp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

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
      // FIRST: Push any pending local changes to Supabase before syncing
      // This ensures no local data is lost when we clear-and-replace
      if (navigator.onLine) {
        try {
          const syncResult = await processSyncQueue();
          if (syncResult.synced > 0) {
            console.log(`✅ Pushed ${syncResult.synced} pending operations before sync`);
          }
        } catch (err) {
          console.log('⚠️ Could not push pending operations:', err);
        }
      }

      // THEN: Sync from Supabase (clear local + replace with cloud data)
      await seedInitialData();

      // NO vaciar la cola aquí. processSyncQueue() ya elimina cada operación
      // que subió con éxito; lo único que queda en la cola son operaciones que
      // fallaron. Un clear() ciego destruía justamente el trabajo offline que
      // todavía no se ha podido guardar en la nube.
      //
      // Y como el pull hace clear+replace de las tablas locales, volvemos a
      // aplicar lo pendiente encima para que el usuario siga viendo lo que
      // registró sin señal.
      await reapplyPendingOperations();

      const count = await syncService.getPendingSyncCount();
      setPendingSync(count);

      if (count > 0) {
        toast.warning(
          `Hay ${count} cambio(s) sin sincronizar. Se reintentarán automáticamente.`
        );
      }

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

  // Auth loading state
  if (authLoading) {
    return (
      <div className="h-full bg-primary flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold mx-auto mb-4"></div>
          <p className="text-gray-400">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  // Not logged in - show login screen
  if (!currentUser) {
    return <LoginScreen onLogin={login} />;
  }

  // App loading state
  if (!initialized) {
    return (
      <div className="h-full bg-primary flex items-center justify-center">
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
        onLogout={logout}
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

