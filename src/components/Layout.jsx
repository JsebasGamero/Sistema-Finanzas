// Armazón de la app.
// - Escritorio (>= 1024 px): riel izquierdo con la marca, la acción principal
//   (Nuevo movimiento), el índice de secciones y, al pie, conexión,
//   sincronización, errores de la nube y la cuenta.
// - Móvil y tableta: barra superior de 56 px (marca, conexión, pendientes,
//   cuenta) y barra inferior con 5 destinos. El contenido scrollea entre las
//   dos, así nunca queda tapado por la barra inferior.
//
// Antes el encabezado móvil cargaba seis controles en una fila sin poder
// encogerse y a 320 px "Cerrar sesión" quedaba fuera de pantalla (ADM-8).
// Ahora las acciones de cuenta viven en un solo menú.
import { useEffect, useId, useRef, useState } from 'react';
import {
    ChartColumn,
    ChevronRight,
    CircleAlert,
    CircleCheck,
    CloudOff,
    EllipsisVertical,
    FlaskConical,
    House,
    KeyRound,
    LoaderCircle,
    LogOut,
    Plus,
    RefreshCw,
    Settings,
    TriangleAlert,
    Wallet,
    WifiOff,
    X,
} from 'lucide-react';
import useOnlineStatus from '../hooks/useOnlineStatus';
import useDialogo from '../hooks/useDialogo';
import { useAuth } from '../context/useAuth';
import { useTema } from '../presentation/tema/useTema';
import { ES_PRODUCCION, SUPABASE_HABILITADO } from '../services/entorno';
import ConfirmModal from './ConfirmModal';
import ErroresSyncPanel from './ErroresSyncPanel';
import CampoContrasena from './CampoContrasena';
import Marca from './Marca';
import { MINIMO_CONTRASENA } from '../context/reglasContrasena';

// Misma condición que EnvBanner. Cuando la franja de entorno se ve, ella ya
// reserva la zona de la muesca; si no, la reserva la barra superior.
const FRANJA_ENTORNO_VISIBLE = !(ES_PRODUCCION && SUPABASE_HABILITADO);

const DESTINOS_RIEL = [
    { id: 'dashboard', etiqueta: 'Inicio', icono: House },
    { id: 'cajas', etiqueta: 'Cajas', icono: Wallet },
    { id: 'reportes', etiqueta: 'Reportes', icono: ChartColumn },
    { id: 'config', etiqueta: 'Configuración', icono: Settings },
];

const DESTINOS_BARRA = [
    { id: 'dashboard', etiqueta: 'Inicio', icono: House },
    { id: 'cajas', etiqueta: 'Cajas', icono: Wallet },
    { id: 'nueva', etiqueta: 'Nuevo', etiquetaAccesible: 'Nuevo movimiento', icono: Plus, central: true },
    { id: 'reportes', etiqueta: 'Reportes', icono: ChartColumn },
    { id: 'config', etiqueta: 'Config', etiquetaAccesible: 'Configuración', icono: Settings },
];

const OPCIONES_TEMA = [
    { id: 'dia', etiqueta: 'Día' },
    { id: 'noche', etiqueta: 'Noche' },
    { id: 'sistema', etiqueta: 'Sistema' },
];

const TEXTO_MODO_LOCAL = 'Modo local: los datos solo existen en este navegador';

const CLASE_ITEM_MENU =
    'flex w-full min-h-11 items-center gap-3 rounded-sm px-3 text-left text-sm font-medium text-ink-2 ' +
    'transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50 lg:min-h-10';

function iniciales(usuario) {
    const partes = (usuario?.nombre || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length > 0) return partes.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
    const correo = usuario?.email || '';
    return correo ? correo[0].toUpperCase() : '?';
}

function textoPendientes(n) {
    return n === 1 ? '1 cambio pendiente' : `${n} cambios pendientes`;
}

function textoErroresSync(n) {
    return n === 1
        ? '1 cambio no se pudo guardar en la nube'
        : `${n} cambios no se pudieron guardar en la nube`;
}

function CuadroIniciales({ usuario }) {
    return (
        <span
            aria-hidden="true"
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-ink text-xs font-bold tracking-wide text-paper"
        >
            {iniciales(usuario)}
        </span>
    );
}

/* ------------------------------------------------------------------ */
/* Menú de cuenta: tema, cambiar contraseña, cerrar sesión.            */
/* ------------------------------------------------------------------ */

function MenuCuenta({ variante, usuario, enLinea, saliendo, onCambiarContrasena, onCerrarSesion, children }) {
    const { preferencia, cambiarPreferencia } = useTema();
    const [abierto, setAbierto] = useState(false);
    const idMenu = useId();
    const idTema = useId();
    const refContenedor = useRef(null);
    const refBoton = useRef(null);
    const modoLocal = Boolean(usuario?.modoLocal);
    const enRiel = variante === 'riel';

    useEffect(() => {
        if (!abierto) return undefined;
        function alTocarFuera(e) {
            if (!refContenedor.current?.contains(e.target)) setAbierto(false);
        }
        function alTeclear(e) {
            if (e.key !== 'Escape') return;
            setAbierto(false);
            refBoton.current?.focus();
        }
        document.addEventListener('pointerdown', alTocarFuera);
        document.addEventListener('keydown', alTeclear);
        return () => {
            document.removeEventListener('pointerdown', alTocarFuera);
            document.removeEventListener('keydown', alTeclear);
        };
    }, [abierto]);

    function elegir(accion) {
        setAbierto(false);
        accion();
    }

    // En el riel el menú sube desde el pie y es más ancho que el riel (240 px)
    // para que el selector de tema quepa sin desplazarse. En la barra móvil
    // baja desde la esquina y nunca pasa del ancho de la pantalla.
    const posicion = enRiel
        ? 'bottom-full left-0 mb-2 w-64'
        : 'right-0 top-full mt-1 w-[min(300px,calc(100vw-24px))]';

    return (
        <div ref={refContenedor} className={enRiel ? 'relative flex min-w-0 items-center gap-3' : 'relative'}>
            {children}

            <button
                ref={refBoton}
                type="button"
                onClick={() => setAbierto((v) => !v)}
                aria-label="Opciones de cuenta"
                aria-expanded={abierto}
                aria-controls={abierto ? idMenu : undefined}
                className="btn-icon flex-shrink-0"
            >
                {enRiel ? <EllipsisVertical size={18} /> : <CuadroIniciales usuario={usuario} />}
            </button>

            {abierto && (
                <div id={idMenu} className={`popover absolute z-40 p-1 ${posicion}`}>
                    {!enRiel && (
                        <div className="px-3 pb-2 pt-2">
                            <p className="truncate text-sm font-semibold text-ink">{usuario?.nombre}</p>
                            <p className="truncate text-xs text-ink-3">{usuario?.email}</p>
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-2">
                                {enLinea
                                    ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pos" />
                                    : <WifiOff size={12} className="text-neg" aria-hidden="true" />}
                                {enLinea ? 'Conectado' : 'Sin conexión'}
                                {usuario?.sinConexion && <span className="text-warn">· Sesión sin conexión</span>}
                            </p>
                        </div>
                    )}

                    {modoLocal && (
                        <p className="mx-2 mb-1 flex items-start gap-1.5 rounded-sm bg-warn-soft px-2.5 py-2 text-xs font-medium text-warn">
                            <FlaskConical size={13} className="mt-px flex-shrink-0" aria-hidden="true" />
                            {TEXTO_MODO_LOCAL}
                        </p>
                    )}

                    <div className="px-2 py-2">
                        <p id={idTema} className="eyebrow mb-1.5">Tema</p>
                        <div role="group" aria-labelledby={idTema} className="segmented w-full">
                            {OPCIONES_TEMA.map((opcion) => (
                                <button
                                    key={opcion.id}
                                    type="button"
                                    aria-pressed={preferencia === opcion.id}
                                    onClick={() => cambiarPreferencia(opcion.id)}
                                    className="flex-1 justify-center"
                                >
                                    {opcion.etiqueta}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-1 border-t border-line pt-1">
                        {!modoLocal && (
                            <button type="button" className={CLASE_ITEM_MENU} onClick={() => elegir(onCambiarContrasena)}>
                                <KeyRound size={16} aria-hidden="true" />
                                Cambiar contraseña
                            </button>
                        )}
                        <button
                            type="button"
                            className={CLASE_ITEM_MENU}
                            disabled={saliendo}
                            onClick={() => elegir(onCerrarSesion)}
                        >
                            <LogOut size={16} aria-hidden="true" />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Modal de cambiar contraseña                                         */
/* ------------------------------------------------------------------ */

function mensajeErrorContrasena(error) {
    const texto = error?.message || '';
    if (/invalid login/i.test(texto)) return 'La contraseña actual no es correcta.';
    if (/different from the old|same.*password/i.test(texto)) {
        return 'La contraseña nueva debe ser distinta de la actual.';
    }
    if (/at least|weak|short/i.test(texto)) {
        return `La contraseña nueva es muy corta o débil. Usa al menos ${MINIMO_CONTRASENA} caracteres.`;
    }
    if (error?.status === 429 || /rate limit|too many/i.test(texto)) {
        return 'Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.';
    }
    if (/failed to fetch|network/i.test(texto)) {
        return 'No se pudo conectar con el servidor. Revisa la conexión e intenta de nuevo.';
    }
    return 'No se pudo cambiar la contraseña. Intenta de nuevo.';
}

function ModalCambiarContrasena({ correo, login, updatePassword, onCerrar }) {
    const idTitulo = useId();
    const idActual = useId();
    const idNueva = useId();
    const idConfirmar = useId();
    const [actual, setActual] = useState('');
    const [nueva, setNueva] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [listo, setListo] = useState(false);
    const [error, setError] = useState('');
    const refGuardando = useRef(false);
    const refActual = useRef(null);
    const refListo = useRef(null);

    // Sin cierre al tocar el velo: un toque de más perdería lo escrito.
    const { refDialogo } = useDialogo({
        abierto: true,
        onCerrar,
        bloqueado: guardando,
        refFocoInicial: refActual,
    });

    useEffect(() => {
        if (listo) refListo.current?.focus();
    }, [listo]);

    function alEscribir(setter) {
        return (e) => {
            setter(e.target.value);
            setError('');
        };
    }

    async function guardar(e) {
        e.preventDefault();
        if (refGuardando.current) return;

        if (!actual) return setError('Escribe tu contraseña actual.');
        if (nueva.length < MINIMO_CONTRASENA) {
            return setError(`La contraseña nueva debe tener al menos ${MINIMO_CONTRASENA} caracteres.`);
        }
        if (nueva !== confirmar) return setError('Las dos contraseñas nuevas no coinciden.');
        if (nueva === actual) return setError('La contraseña nueva debe ser distinta de la actual.');
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            return setError('Necesitas conexión a internet para cambiar la contraseña.');
        }

        refGuardando.current = true;
        setGuardando(true);
        setError('');
        try {
            // Se confirma la actual volviendo a entrar: así un celular
            // prestado con la sesión abierta no basta para cambiarla.
            await login(correo, actual);
            await updatePassword(nueva);
            setListo(true);
        } catch (err) {
            console.error('Error al cambiar la contraseña:', err);
            setError(mensajeErrorContrasena(err));
        } finally {
            refGuardando.current = false;
            setGuardando(false);
        }
    }

    return (
        <div className="modal-backdrop">
            <div
                ref={refDialogo}
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                tabIndex={-1}
                className="modal-sheet outline-none animate-fade-in"
            >
                {/* La hoja tiene scroll propio (max-height 92dvh). Encabezado y
                    botones quedan pegados arriba y abajo para que, con el
                    celular en horizontal o el teclado abierto, siempre se
                    pueda llegar a "Cambiar contraseña" (ADM-9). */}
                <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface py-1.5 pl-4 pr-2 sm:pl-5">
                    <h2 id={idTitulo} className="min-w-0 flex-1 text-[17px] font-semibold text-ink">
                        Cambiar contraseña
                    </h2>
                    <button
                        type="button"
                        onClick={onCerrar}
                        disabled={guardando}
                        className="btn-icon disabled:opacity-50"
                        aria-label="Cerrar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {listo ? (
                    <div className="px-4 py-6 sm:px-5">
                        <p role="status" className="flex items-center gap-2 text-sm font-semibold text-pos">
                            <CircleCheck size={18} aria-hidden="true" />
                            Contraseña actualizada
                        </p>
                        <p className="mt-1 text-sm text-ink-2">
                            La próxima vez que entres, usa la contraseña nueva.
                        </p>
                        <button ref={refListo} type="button" onClick={onCerrar} className="btn-secondary mt-5 w-full sm:w-auto">
                            Listo
                        </button>
                    </div>
                ) : (
                    <form onSubmit={guardar} noValidate>
                        <div className="space-y-4 px-4 py-4 sm:px-5">
                            <CampoContrasena
                                id={idActual}
                                refInput={refActual}
                                etiqueta="Contraseña actual"
                                value={actual}
                                onChange={alEscribir(setActual)}
                                autoComplete="current-password"
                                disabled={guardando}
                            />
                            <CampoContrasena
                                id={idNueva}
                                etiqueta="Contraseña nueva"
                                value={nueva}
                                onChange={alEscribir(setNueva)}
                                autoComplete="new-password"
                                minLength={MINIMO_CONTRASENA}
                                ayuda={`Mínimo ${MINIMO_CONTRASENA} caracteres.`}
                                disabled={guardando}
                            />
                            <CampoContrasena
                                id={idConfirmar}
                                etiqueta="Repite la contraseña nueva"
                                value={confirmar}
                                onChange={alEscribir(setConfirmar)}
                                autoComplete="new-password"
                                disabled={guardando}
                            />

                            {error && (
                                <div role="alert" className="flex items-start gap-2 rounded-md bg-neg-soft px-3 py-2.5 text-sm font-medium text-neg">
                                    <CircleAlert size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                                    <span>{error}</span>
                                </div>
                            )}
                        </div>

                        <div className="sticky bottom-0 flex flex-col-reverse gap-2 border-t border-line bg-surface-2 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
                            <button type="button" onClick={onCerrar} disabled={guardando} className="btn-secondary w-full sm:w-auto">
                                Cancelar
                            </button>
                            <button type="submit" disabled={guardando} className="btn-primary w-full sm:w-auto">
                                {guardando ? (
                                    <>
                                        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
                                        Guardando...
                                    </>
                                ) : 'Cambiar contraseña'}
                            </button>
                        </div>
                    </form>
                )}
                <div aria-hidden="true" className="bg-surface-2" style={{ height: 'env(safe-area-inset-bottom)' }} />
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Armazón                                                             */
/* ------------------------------------------------------------------ */

export default function Layout({
    children,
    activeTab,
    setActiveTab,
    pendingSync = 0,
    onSync,
    onLogout,
    erroresSync = 0,
}) {
    const enLinea = useOnlineStatus();
    const { currentUser, updatePassword, login, getPendingChangesCount } = useAuth();
    const modoLocal = Boolean(currentUser?.modoLocal);
    const sesionSinConexion = Boolean(currentUser?.sinConexion);
    // En modo local no hay nube: ni pendientes ni errores que mostrar.
    const pendientes = modoLocal ? 0 : Math.max(0, Number(pendingSync) || 0);
    const errores = modoLocal ? 0 : Math.max(0, Number(erroresSync) || 0);

    const [modalContrasena, setModalContrasena] = useState(false);
    const [panelErrores, setPanelErrores] = useState(false);
    const [pendientesAlSalir, setPendientesAlSalir] = useState(null);
    const [saliendo, setSaliendo] = useState(false);
    const [sincronizando, setSincronizando] = useState(false);
    const refSaliendo = useRef(false);
    const refSincronizando = useRef(false);
    const refContenido = useRef(null);

    // Al cambiar de sección se empieza arriba: el área de contenido es un
    // solo contenedor con scroll y conservaba la posición de la anterior.
    useEffect(() => {
        refContenido.current?.scrollTo?.(0, 0);
    }, [activeTab]);

    async function sincronizar() {
        if (refSincronizando.current || !onSync) return;
        refSincronizando.current = true;
        setSincronizando(true);
        try {
            await onSync();
        } catch (error) {
            console.error('Error al sincronizar:', error);
        } finally {
            refSincronizando.current = false;
            setSincronizando(false);
        }
    }

    async function cerrarSesion() {
        refSaliendo.current = true;
        setSaliendo(true);
        try {
            await onLogout?.();
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
        } finally {
            refSaliendo.current = false;
            setSaliendo(false);
        }
    }

    async function pedirCerrarSesion() {
        if (refSaliendo.current) return;
        refSaliendo.current = true;
        let cuantos = 0;
        try {
            cuantos = await getPendingChangesCount();
        } catch {
            cuantos = 0;
        }
        refSaliendo.current = false;
        if (cuantos > 0) {
            setPendientesAlSalir(cuantos);
            return;
        }
        await cerrarSesion();
    }

    async function confirmarCerrarSesion() {
        if (refSaliendo.current) return;
        await cerrarSesion();
        setPendientesAlSalir(null);
    }

    const textoConexion = `${enLinea ? 'Conectado' : 'Sin conexión'}${sesionSinConexion ? '. Sesión sin conexión' : ''}`;

    const propsMenu = {
        usuario: currentUser,
        enLinea,
        saliendo,
        onCambiarContrasena: () => setModalContrasena(true),
        onCerrarSesion: pedirCerrarSesion,
    };

    return (
        <div className="flex h-full w-full flex-col overflow-hidden bg-paper lg:flex-row">
            <a
                href="#contenido-principal"
                className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[110] focus:rounded-md focus:border focus:border-line-strong focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink"
            >
                Saltar al contenido
            </a>

            {/* ---------- Riel de escritorio ---------- */}
            <aside className="hidden w-[240px] flex-shrink-0 flex-col border-r border-line bg-surface lg:flex">
                <div className="px-4 pb-4 pt-5">
                    <Marca />
                    <button
                        type="button"
                        onClick={() => setActiveTab('nueva')}
                        aria-current={activeTab === 'nueva' ? 'page' : undefined}
                        className="btn-primary mt-5 w-full"
                    >
                        <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
                        Nuevo movimiento
                    </button>
                </div>

                <nav aria-label="Secciones" className="min-h-0 flex-1 overflow-y-auto py-2">
                    <ul>
                        {DESTINOS_RIEL.map((destino) => {
                            const Icono = destino.icono;
                            const activo = activeTab === destino.id;
                            return (
                                <li key={destino.id}>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab(destino.id)}
                                        aria-current={activo ? 'page' : undefined}
                                        className={`relative flex h-10 w-full items-center gap-3 px-4 text-left text-sm font-medium transition-colors ${
                                            activo ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                                        }`}
                                    >
                                        {activo && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
                                        <Icono size={18} strokeWidth={activo ? 2.25 : 1.75} aria-hidden="true" />
                                        {destino.etiqueta}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="space-y-2 border-t border-line px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`sync-indicator ${enLinea ? 'online' : 'offline'}`}>
                            {enLinea
                                ? <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-pos" />
                                : <WifiOff size={13} aria-hidden="true" />}
                            {enLinea ? 'Conectado' : 'Sin conexión'}
                        </span>
                        {sesionSinConexion && (
                            <span className="chip chip-warn">
                                <CloudOff size={12} aria-hidden="true" />
                                Sesión sin conexión
                            </span>
                        )}
                    </div>

                    {pendientes > 0 && (
                        <button
                            type="button"
                            onClick={sincronizar}
                            disabled={sincronizando}
                            className="flex min-h-9 w-full items-center justify-center gap-2 rounded-md bg-warn-soft px-3 text-[13px] font-semibold text-warn transition-opacity hover:opacity-85 disabled:opacity-60"
                        >
                            <RefreshCw size={14} className={sincronizando ? 'animate-spin' : ''} aria-hidden="true" />
                            {sincronizando ? 'Sincronizando...' : `Sincronizar (${pendientes})`}
                        </button>
                    )}

                    {errores > 0 && (
                        <button
                            type="button"
                            onClick={() => setPanelErrores(true)}
                            className="flex w-full items-start gap-2 rounded-md bg-neg-soft px-3 py-2 text-left text-[13px] font-semibold leading-snug text-neg transition-opacity hover:opacity-85"
                        >
                            <TriangleAlert size={15} className="mt-px flex-shrink-0" aria-hidden="true" />
                            <span className="flex-1">{textoErroresSync(errores)}</span>
                        </button>
                    )}

                    {modoLocal && (
                        <p className="flex items-start gap-1.5 text-xs leading-snug text-ink-3">
                            <FlaskConical size={13} className="mt-px flex-shrink-0" aria-hidden="true" />
                            {TEXTO_MODO_LOCAL}
                        </p>
                    )}
                </div>

                <div className="border-t border-line px-3 py-3">
                    <MenuCuenta variante="riel" {...propsMenu}>
                        <CuadroIniciales usuario={currentUser} />
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-ink">{currentUser?.nombre}</p>
                            <p className="truncate text-xs text-ink-3">{currentUser?.email}</p>
                        </div>
                    </MenuCuenta>
                </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {/* ---------- Barra superior móvil ---------- */}
                <header
                    className="flex-shrink-0 border-b border-line bg-surface lg:hidden"
                    style={FRANJA_ENTORNO_VISIBLE ? undefined : { paddingTop: 'env(safe-area-inset-top)' }}
                >
                    <div className="flex h-14 items-center gap-1 pl-4 pr-2">
                        <div className="min-w-0 flex-1">
                            <Marca ocultarNombreBajo360 />
                        </div>

                        <span className="inline-flex h-11 flex-shrink-0 items-center gap-1.5 px-2" title={textoConexion}>
                            {enLinea
                                ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-pos" />
                                : <WifiOff size={16} className="text-neg" aria-hidden="true" />}
                            {sesionSinConexion && <CloudOff size={16} className="text-warn" aria-hidden="true" />}
                            <span className="sr-only text-xs font-semibold text-ink-2 sm:not-sr-only">
                                {textoConexion}
                            </span>
                        </span>

                        {pendientes > 0 && (
                            <button
                                type="button"
                                onClick={sincronizar}
                                disabled={sincronizando}
                                aria-label={`Sincronizar: ${textoPendientes(pendientes)}`}
                                className="num inline-flex h-11 min-w-11 flex-shrink-0 items-center justify-center gap-1.5 rounded-md bg-warn-soft px-2.5 text-sm font-semibold text-warn disabled:opacity-60"
                            >
                                <RefreshCw size={15} className={sincronizando ? 'animate-spin' : ''} aria-hidden="true" />
                                {pendientes}
                            </button>
                        )}

                        <MenuCuenta variante="barra" {...propsMenu} />
                    </div>

                    {errores > 0 && (
                        <button
                            type="button"
                            onClick={() => setPanelErrores(true)}
                            className="flex min-h-11 w-full items-center gap-2 border-t border-line bg-neg-soft px-4 py-2 text-left text-[13px] font-semibold leading-snug text-neg"
                        >
                            <TriangleAlert size={16} className="flex-shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1">{textoErroresSync(errores)}</span>
                            <ChevronRight size={16} className="flex-shrink-0" aria-hidden="true" />
                        </button>
                    )}
                </header>

                {/* ---------- Contenido ---------- */}
                <main
                    id="contenido-principal"
                    ref={refContenido}
                    tabIndex={-1}
                    className="mobile-scroll min-h-0 flex-1 overflow-y-auto outline-none"
                >
                    <div className="mx-auto w-full max-w-[1280px] p-4 md:p-6 lg:p-8">
                        {children}
                    </div>
                </main>

                {/* ---------- Barra inferior móvil ---------- */}
                <nav
                    aria-label="Secciones"
                    className="flex-shrink-0 border-t border-line bg-surface lg:hidden"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                    <ul className="grid grid-cols-5">
                        {DESTINOS_BARRA.map((destino) => {
                            const Icono = destino.icono;
                            const activo = activeTab === destino.id;
                            return (
                                <li key={destino.id} className="min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab(destino.id)}
                                        aria-current={activo ? 'page' : undefined}
                                        aria-label={destino.etiquetaAccesible}
                                        className={`relative flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                                            activo ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                                        }`}
                                    >
                                        {activo && <span aria-hidden="true" className="absolute inset-x-3 top-0 h-0.5 bg-accent" />}
                                        {destino.central ? (
                                            <span className="flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md bg-accent text-accent-ink">
                                                <Icono size={20} strokeWidth={2.5} aria-hidden="true" />
                                                <span className="text-[10px] font-bold leading-none">{destino.etiqueta}</span>
                                            </span>
                                        ) : (
                                            <>
                                                <Icono size={22} strokeWidth={activo ? 2.25 : 1.75} aria-hidden="true" />
                                                <span className="max-w-full truncate px-1 leading-none">{destino.etiqueta}</span>
                                            </>
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
            </div>

            {modalContrasena && !modoLocal && (
                <ModalCambiarContrasena
                    correo={currentUser?.email}
                    login={login}
                    updatePassword={updatePassword}
                    onCerrar={() => setModalContrasena(false)}
                />
            )}

            <ErroresSyncPanel abierto={panelErrores} onCerrar={() => setPanelErrores(false)} />

            <ConfirmModal
                isOpen={pendientesAlSalir !== null}
                title="Hay cambios sin guardar en la nube"
                message={
                    `${pendientesAlSalir === 1
                        ? 'Queda 1 cambio que todavía no se ha subido'
                        : `Quedan ${pendientesAlSalir} cambios que todavía no se han subido`}. ` +
                    'Se conservan en este dispositivo y se subirán la próxima vez que entres con conexión. ' +
                    'Si quieres asegurarlos ahora, cancela y toca Sincronizar.'
                }
                confirmText="Cerrar sesión igual"
                cancelText="Cancelar"
                type="default"
                procesando={saliendo}
                textoProcesando="Cerrando sesión..."
                onConfirm={confirmarCerrarSesion}
                onCancel={() => setPendientesAlSalir(null)}
            />
        </div>
    );
}
