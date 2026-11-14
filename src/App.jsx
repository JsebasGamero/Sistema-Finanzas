// Componente raíz: sesión, arranque de los datos (push -> pull -> replay),
// estado de la cola de sincronización y navegación entre pantallas.
import { Component, Suspense, lazy, useEffect, useEffectEvent, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Layout from './components/Layout';
import ProjectDashboard from './components/ProjectDashboard';
import TransactionForm from './components/TransactionForm';
import CajaList from './components/CajaList';
import ToastContainer from './components/ToastNotification';
import LoginScreen from './components/LoginScreen';
import { MarcaIcono } from './components/Marca';
import { useAuth } from './context/useAuth';
import { hayDatosLocales, seedInitialData } from './services/db';
import {
  getPendingSyncCount,
  processSyncQueue,
  reapplyPendingOperations,
  suscribirCambiosCola,
} from './services/syncService';
import { isSupabaseConfigured } from './services/supabase';
import useOnlineStatus from './hooks/useOnlineStatus';
import useToast from './hooks/useToast';
import './index.css';

// ---------------------------------------------------------------------------
// Pantallas de carga diferida (REP-15, Q5)
//
// Reportes arrastra AG-Grid, Recharts, jsPDF y xlsx; Configuración es pesada
// y poco usada. Ninguna hace falta para registrar un gasto, así que salen
// del bundle inicial.
//
// Sin service worker, en la versión web un chunk que nunca se descargó no se
// puede abrir sin señal. Por eso se precargan en segundo plano cuando la app
// ya arrancó, y si aun así falla se muestra un aviso con "Reintentar" en vez
// de una pantalla en blanco. React.lazy recuerda un fallo para siempre: el
// reintento crea un lazy nuevo.
// ---------------------------------------------------------------------------
function cargaDiferida(importar) {
  const actual = { Componente: lazy(importar) };
  return {
    actual,
    precargar: () => importar().catch(() => {}),
    reiniciar: () => { actual.Componente = lazy(importar); },
  };
}

const PANTALLA_REPORTES = cargaDiferida(() => import('./presentation/reportes/ReportesPanel'));
const PANTALLA_CONFIGURACION = cargaDiferida(() => import('./components/AdminPanel'));
const PANTALLA_NUEVA_CONTRASENA = cargaDiferida(() => import('./components/NuevaContrasenaScreen'));
const PANTALLAS_DIFERIDAS = [PANTALLA_REPORTES, PANTALLA_CONFIGURACION, PANTALLA_NUEVA_CONTRASENA];

function PantallaDiferida({ pantalla, ...props }) {
  const Pantalla = pantalla.actual.Componente;
  return <Pantalla {...props} />;
}

class LimiteDeCarga extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('No se pudo abrir la pantalla:', error);
  }

  reintentar = () => {
    this.props.onReintentar?.();
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    const sinSenal = typeof navigator !== 'undefined' && !navigator.onLine;
    return (
      <div className="card m-4" role="alert">
        <h2 className="panel-title">No se pudo abrir esta pantalla</h2>
        <p className="text-ink-2 text-sm mt-1">
          {sinSenal
            ? 'Sin conexión: esta pantalla se descarga la primera vez que se abre. Intenta de nuevo cuando tengas señal.'
            : 'Ocurrió un error al cargarla. Intenta de nuevo.'}
        </p>
        <button type="button" className="btn-secondary mt-3" onClick={this.reintentar}>
          <RefreshCw size={16} aria-hidden="true" />
          Reintentar
        </button>
      </div>
    );
  }
}

function PantallaDeCarga({ mensaje, detalle }) {
  return (
    <div className="h-full bg-paper flex items-center justify-center px-4" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4 text-center max-w-xs">
        <MarcaIcono tam={48} />
        <div>
          <p className="text-ink font-semibold">FinanzasObra</p>
          <p className="text-ink-2 text-sm mt-1">{mensaje}</p>
          {detalle && <p className="text-ink-3 text-xs mt-2">{detalle}</p>}
        </div>
        <div className="skeleton h-1 w-24" aria-hidden="true" />
      </div>
    </div>
  );
}

function CargandoPantalla() {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando pantalla">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-24 w-full" />
      <div className="skeleton h-64 w-full" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Arranque de los datos
// ---------------------------------------------------------------------------

// Con datos locales, una señal que no pasa datos no debe dejar la app en
// "Cargando" (SYNC-14): pasado este tiempo se muestra lo local y el arranque
// sigue en segundo plano. Con la base vacía se espera siempre.
const ESPERA_MAXIMA_INICIO_MS = 8000;

/**
 * Secuencia de arranque. El orden es obligatorio (invariantes 1 y 2):
 * 1. Push: subir lo pendiente ANTES de reemplazar la base local.
 * 2. Pull: syncFromSupabase() reemplaza las tablas con la nube y
 * 3. Replay: vuelve a aplicar lo que sigue en la cola, en la misma
 *    transacción que el pull. NUNCA se vacía la cola aquí: lo que queda en
 *    ella son cambios que todavía no llegaron a la nube.
 * Nunca rechaza.
 */
async function inicializarDatos({ modoLocal }) {
  // Modo local: no hay nube; la base local es la única fuente.
  if (modoLocal || !isSupabaseConfigured()) return { pendientes: 0, descargado: false, intentoDescarga: false };

  let descargado = false;
  const intentoDescarga = navigator.onLine;
  try {
    if (intentoDescarga) {
      try {
        await processSyncQueue();
      } catch (error) {
        console.warn('No se pudieron subir los cambios pendientes antes de descargar:', error);
      }
      descargado = await seedInitialData();
    }
    // Sin pull (sin señal, sin sesión o falló), la base local queda como
    // estaba. El replay es idempotente y cubre una base recién vaciada por
    // un logout: lo pendiente vuelve a verse.
    if (!descargado) await reapplyPendingOperations();
  } catch (error) {
    console.error('Error al iniciar los datos:', error);
  }

  const pendientes = await getPendingSyncCount().catch(() => 0);
  return { pendientes, descargado, intentoDescarga };
}

async function esperarInicio(inicio) {
  // Base vacía (primer ingreso, o recién cerrada la sesión): pintar las
  // pantallas ahora las dejaría en cero, porque cargan una sola vez al
  // montarse y nadie las recarga tras el pull (ADM-10).
  if (!(await hayDatosLocales())) return inicio;
  return Promise.race([inicio, new Promise((resolver) => setTimeout(resolver, ESPERA_MAXIMA_INICIO_MS))]);
}

function App() {
  const isOnline = useOnlineStatus();
  const toast = useToast();
  const {
    currentUser,
    loading: authLoading,
    login,
    logout,
    recuperacionPendiente,
    completarRecuperacion,
  } = useAuth();

  // Depende del id, no del objeto: el usuario es un objeto nuevo en cada
  // evento de auth, y un cambio de nombre no debe disparar un pull completo.
  const userId = currentUser?.id;
  const modoLocal = Boolean(currentUser?.modoLocal);
  const sinConexion = Boolean(currentUser?.sinConexion);

  // Todo el estado de la sesión se reinicia al cambiar de usuario, incluido
  // cerrar sesión y volver a entrar con el mismo (SYNC-15, ADM-10). Antes
  // `initialized` nunca volvía a false y la app se pintaba sobre la base que
  // el logout acababa de vaciar.
  const [listoPara, setListoPara] = useState(null);
  const [usuarioPrevio, setUsuarioPrevio] = useState(userId);
  const [activeTab, setActiveTab] = useState('dashboard');
  if (usuarioPrevio !== userId) {
    setUsuarioPrevio(userId);
    setListoPara(null);
    setActiveTab('dashboard');
  }
  const initialized = Boolean(userId) && listoPara === userId;

  const [estadoCola, setEstadoCola] = useState({ pendientes: 0, errores: 0 });
  const [intentoCarga, setIntentoCarga] = useState(0);
  const sincronizandoRef = useRef(false);

  const avisarFinDeInicio = useEffectEvent(({ pendientes, descargado, intentoDescarga }) => {
    if (intentoDescarga && !descargado) {
      toast.warning('No se pudieron descargar los datos de la nube. Se muestran los de este dispositivo.');
    }
    if (pendientes > 0) {
      toast.warning(`Hay ${pendientes} cambio(s) sin subir a la nube. Se reintentarán automáticamente.`);
    }
  });

  useEffect(() => {
    if (!userId || recuperacionPendiente) return undefined;
    let vigente = true;
    const inicio = inicializarDatos({ modoLocal });
    esperarInicio(inicio)
      .catch(() => {})
      .then(() => { if (vigente) setListoPara(userId); });
    inicio.then((resumen) => { if (vigente) avisarFinDeInicio(resumen); });
    return () => { vigente = false; };
  }, [userId, modoLocal, recuperacionPendiente]);

  // Contadores derivados de Dexie (SYNC-13, DEU-5): cualquier escritura en la
  // cola o en la bandeja, venga de donde venga, los actualiza.
  useEffect(() => {
    if (!userId || modoLocal) return undefined;
    return suscribirCambiosCola(setEstadoCola);
  }, [userId, modoLocal]);
  const pendingSync = userId && !modoLocal ? estadoCola.pendientes : 0;
  const erroresSync = userId && !modoLocal ? estadoCola.errores : 0;

  async function sincronizar({ manual }) {
    // SYNC-3: nunca con la pantalla de login ni en modo local.
    if (!currentUser || currentUser.modoLocal) return;
    if (!navigator.onLine) {
      if (manual) toast.warning('Sin conexión. Los cambios se subirán al volver la señal.');
      return;
    }
    if (sincronizandoRef.current) return;
    sincronizandoRef.current = true;
    try {
      const resultado = await processSyncQueue();
      if (resultado.enBandeja > 0) {
        toast.error(`${resultado.enBandeja} cambio(s) no se pudieron guardar en la nube. Revísalos en el aviso de errores.`);
      } else if (resultado.detenido) {
        if (manual) toast.warning(resultado.detenido.mensaje);
      } else if (resultado.synced > 0) {
        toast.success(`Sincronizado: ${resultado.synced} cambio(s)`);
      } else if (manual) {
        toast.info('No hay cambios pendientes.');
      }
    } catch (error) {
      console.error('Error al sincronizar:', error);
      if (manual) toast.error('No se pudo sincronizar. Se reintentará más tarde.');
    } finally {
      sincronizandoRef.current = false;
    }
  }

  // Avisos de conexión. Al volver la señal se sincroniza SIEMPRE: el
  // contador local pudo no enterarse de lo que se hizo sin señal (SYNC-13).
  const enLineaPrevio = useRef(isOnline);
  const alCambiarConexion = useEffectEvent((enLinea) => {
    if (!currentUser || currentUser.modoLocal) return;
    if (!enLinea) {
      toast.warning('Sin conexión. Los cambios se guardan en este dispositivo.');
      return;
    }
    toast.success('Conexión restablecida');
    if (initialized) sincronizar({ manual: false });
  });
  useEffect(() => {
    if (enLineaPrevio.current === isOnline) return;
    enLineaPrevio.current = isOnline;
    alCambiarConexion(isOnline);
  }, [isOnline]);

  // Se entró sin conexión (SYNC-6) y la sesión volvió: completar en segundo
  // plano lo que el arranque no pudo hacer (push -> pull -> replay).
  const sinConexionPrevio = useRef(sinConexion);
  const alRecuperarSesion = useEffectEvent(() => {
    if (!initialized || modoLocal) return;
    inicializarDatos({ modoLocal: false }).then(({ descargado }) => {
      if (descargado) toast.success('Sesión restablecida. Datos actualizados.');
    });
  });
  useEffect(() => {
    const antes = sinConexionPrevio.current;
    sinConexionPrevio.current = sinConexion;
    if (antes && !sinConexion) alRecuperarSesion();
  }, [sinConexion]);

  // Precarga de las pantallas diferidas cuando la app ya está en uso, para
  // que se puedan abrir aunque después se vaya la señal.
  useEffect(() => {
    if (!initialized) return undefined;
    const programar = window.requestIdleCallback ?? ((fn) => setTimeout(fn, 1500));
    const cancelar = window.cancelIdleCallback ?? clearTimeout;
    const id = programar(() => PANTALLAS_DIFERIDAS.forEach((pantalla) => pantalla.precargar()));
    return () => cancelar(id);
  }, [initialized]);

  function reintentarCarga() {
    PANTALLAS_DIFERIDAS.forEach((pantalla) => pantalla.reiniciar());
    setIntentoCarga((n) => n + 1);
  }

  function handleTransactionAdded() {
    toast.success('Movimiento guardado');
  }

  if (authLoading) {
    return <PantallaDeCarga mensaje="Verificando la sesión" />;
  }

  // El enlace de "recuperar contraseña" inicia sesión: antes de entrar hay
  // que definir la nueva (SYNC-16, ADM-5).
  if (currentUser && recuperacionPendiente) {
    return (
      <LimiteDeCarga key={`recuperacion-${intentoCarga}`} onReintentar={reintentarCarga}>
        <Suspense fallback={<PantallaDeCarga mensaje="Cargando" />}>
          <PantallaDiferida
            pantalla={PANTALLA_NUEVA_CONTRASENA}
            onGuardar={async (nueva) => {
              await completarRecuperacion(nueva);
              // La pantalla se desmonta al guardar: el aviso queda en el toast.
              toast.success('Contraseña guardada.');
            }}
            onCancelar={logout}
          />
        </Suspense>
      </LimiteDeCarga>
    );
  }

  if (!currentUser) {
    return <LoginScreen onLogin={login} />;
  }

  if (!initialized) {
    if (modoLocal) return <PantallaDeCarga mensaje="Abriendo el modo local de pruebas" />;
    return isOnline
      ? (
        <PantallaDeCarga
          mensaje="Sincronizando con la nube"
          detalle="Primero se suben los cambios pendientes y luego se descargan los datos."
        />
      )
      : <PantallaDeCarga mensaje="Abriendo los datos de este dispositivo" />;
  }

  return (
    <>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <Layout
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingSync={pendingSync}
        erroresSync={erroresSync}
        onSync={() => sincronizar({ manual: true })}
        onLogout={logout}
      >
        <LimiteDeCarga key={`${activeTab}-${intentoCarga}`} onReintentar={reintentarCarga}>
          <Suspense fallback={<CargandoPantalla />}>
            {activeTab === 'dashboard' && <ProjectDashboard />}
            {activeTab === 'nueva' && <TransactionForm onTransactionAdded={handleTransactionAdded} />}
            {activeTab === 'cajas' && <CajaList />}
            {activeTab === 'config' && <PantallaDiferida pantalla={PANTALLA_CONFIGURACION} />}
            {activeTab === 'reportes' && <PantallaDiferida pantalla={PANTALLA_REPORTES} />}
          </Suspense>
        </LimiteDeCarga>
      </Layout>
    </>
  );
}

export default App;
