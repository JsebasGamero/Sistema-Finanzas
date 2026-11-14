// AuthProvider: sesión de Supabase Auth, o sesión del modo local de pruebas.
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../services/supabase';
import { conSincronizacionDetenida, db, detenerSincronizacion, vaciarTablasDeDatos } from '../services/db';
import { MODO_LOCAL_DISPONIBLE } from '../services/entorno';
import { AuthContext } from './authContextObjeto';
import { esContrasenaDebil, mensajeContrasenaDebil, MINIMO_CONTRASENA } from './reglasContrasena';
import {
    borrarUsuarioSesion,
    decidirSesionInicial,
    guardarUsuarioSesion,
    leerUsuarioSesion,
    mismoUsuario,
    usuarioDeSesionPersistida,
    usuarioDesdeSupabase,
} from './sesionSinConexion';

// Modo local de pruebas (ver services/entorno.js): un usuario ficticio que
// solo existe en este navegador. Nunca disponible en producción ni cuando
// hay un proyecto Supabase configurado.
const CLAVE_MODO_LOCAL = 'finanzasobra.modoLocal';
const USUARIO_LOCAL = Object.freeze({
    id: 'usuario-local-pruebas',
    email: 'pruebas@modo-local',
    nombre: 'Usuario de pruebas',
    modoLocal: true,
});

// Si getSession() tarda más que esto (señal que no pasa datos), se entra sin
// conexión con el usuario guardado en vez de dejar "Verificando sesión" hasta
// que venza el timeout de la petición.
const ESPERA_MAXIMA_SESION_MS = 6000;

function almacen() {
    try {
        return window.localStorage;
    } catch {
        return null;
    }
}

// Clave con la que supabase-js guarda la sesión ('sb-<ref>-auth-token').
const CLAVE_SESION_SUPABASE = supabase.auth?.storageKey || supabase.storageKey || '';

// El enlace de "recuperar contraseña" llega con `type=recovery` en el hash.
// supabase-js limpia el hash después de una petición de red, así que se lee
// al cargar el módulo: si el evento PASSWORD_RECOVERY se emitiera antes de
// que React se suscriba, igual se pide la contraseña nueva (SYNC-16).
//
// Se exige también access_token (seguridad-entornos-3): con solo
// `#type=recovery`, cualquiera con un celular prestado y la sesión abierta
// abría "Define tu nueva contraseña" y la cambiaba sin la actual. Un hash
// sin token lo ignora supabase-js; uno con token falso no valida y cierra
// la sesión, así que el truco deja de servir.
const LLEGO_POR_RECUPERACION = (() => {
    try {
        const hash = window.location.hash;
        return /(^|[#&])type=recovery(&|$)/.test(hash) && /(^|[#&])access_token=[^&]+/.test(hash);
    } catch {
        return false;
    }
})();

// La marca también se guarda en la pestaña: si el usuario recarga antes de
// definir la contraseña, el hash ya no está y entraba sin cambiarla.
const CLAVE_RECUPERACION = 'finanzasobra.recuperacionPendiente';

function leerMarcaRecuperacion() {
    try {
        return sessionStorage.getItem(CLAVE_RECUPERACION) === '1';
    } catch {
        return false;
    }
}

function guardarMarcaRecuperacion(activa) {
    try {
        if (activa) sessionStorage.setItem(CLAVE_RECUPERACION, '1');
        else sessionStorage.removeItem(CLAVE_RECUPERACION);
    } catch {
        // Sin almacenamiento: solo se pierde la marca al recargar.
    }
}

// URL a la que vuelve el enlace de "recuperar contraseña" del correo. En la
// APK, window.location.origin es https://localhost y el enlace no abre la
// app; VITE_URL_RECUPERACION permite apuntar a la web desplegada (y debe
// estar en Authentication > URL Configuration > Redirect URLs del proyecto).
const URL_RECUPERACION = import.meta.env.VITE_URL_RECUPERACION || window.location.origin;

function leerModoLocalGuardado() {
    if (!MODO_LOCAL_DISPONIBLE) return false;
    try {
        return localStorage.getItem(CLAVE_MODO_LOCAL) === '1';
    } catch {
        return false;
    }
}

function guardarModoLocal(activo) {
    try {
        if (activo) localStorage.setItem(CLAVE_MODO_LOCAL, '1');
        else localStorage.removeItem(CLAVE_MODO_LOCAL);
    } catch {
        // Sin almacenamiento: el modo local dura hasta recargar.
    }
}

// Las tres claves que borra supabase-js al cerrar sesión. Se borran a mano
// cuando signOut() no puede hacerlo (sin señal): si no, el siguiente que abra
// la app en un celular compartido entraba como el usuario anterior (SYNC-10).
function borrarSesionPersistida() {
    const a = almacen();
    if (!a || !CLAVE_SESION_SUPABASE) return;
    for (const clave of [CLAVE_SESION_SUPABASE, `${CLAVE_SESION_SUPABASE}-code-verifier`, `${CLAVE_SESION_SUPABASE}-user`]) {
        try {
            a.removeItem(clave);
        } catch {
            // Nada que hacer.
        }
    }
}

function limpiarUrlDeRecuperacion() {
    try {
        const { pathname, search, hash } = window.location;
        if (hash) window.history.replaceState(window.history.state, '', pathname + search);
    } catch {
        // Nada que hacer.
    }
}

function mensajeErrorContrasena(error) {
    const codigo = error?.code || '';
    const texto = error?.message || '';
    if (codigo === 'same_password' || /different from the old password/i.test(texto)) {
        return 'La nueva contraseña debe ser distinta de la anterior.';
    }
    // La cifra sale del servidor, no de aquí: si el mínimo de Supabase es
    // mayor que el del cliente, una cifra fija dejaba a la persona en un
    // bucle (seguridad-entornos-6).
    if (esContrasenaDebil(error)) {
        return mensajeContrasenaDebil(error);
    }
    if (isAuthRetryableFetchError(error) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
        return 'Sin conexión. Intenta de nuevo cuando tengas señal.';
    }
    if (/session|jwt|expired/i.test(texto)) {
        return 'El enlace de recuperación venció. Pide uno nuevo desde la pantalla de inicio.';
    }
    return 'No se pudo cambiar la contraseña. Intenta de nuevo.';
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(() => (leerModoLocalGuardado() ? USUARIO_LOCAL : null));
    // En modo local no hay sesión remota que esperar.
    const [loading, setLoading] = useState(() => !MODO_LOCAL_DISPONIBLE);
    const [recuperacionPendiente, setRecuperacionPendiente] = useState(
        () => !MODO_LOCAL_DISPONIBLE && (LLEGO_POR_RECUPERACION || leerMarcaRecuperacion())
    );
    // Cuenta los SIGNED_IN: el logout espera al push y al pull después de
    // cerrar la sesión, y no debe sacar a quien ya volvió a entrar.
    const iniciosDeSesion = useRef(0);

    const marcarRecuperacion = useCallback((activa) => {
        guardarMarcaRecuperacion(activa);
        setRecuperacionPendiente(activa);
    }, []);

    const aplicarSesion = useCallback((session) => {
        const usuario = usuarioDesdeSupabase(session.user);
        guardarUsuarioSesion(almacen(), usuario);
        // Mismo objeto si nada cambió: el token se refresca cada hora y no
        // debe re-renderizar toda la app.
        setCurrentUser((previo) => (mismoUsuario(previo, usuario) ? previo : usuario));
    }, []);

    const decidirSinSesion = useCallback((error) => {
        const decision = decidirSesionInicial({
            sesion: null,
            error,
            enLinea: navigator.onLine,
            usuarioGuardado: leerUsuarioSesion(almacen()),
            idSesionPersistida: usuarioDeSesionPersistida(almacen(), CLAVE_SESION_SUPABASE),
            esErrorDeRed: (e) => isAuthRetryableFetchError(e) || e?.name === 'TimeoutError',
        });
        return decision.usuario;
    }, []);

    useEffect(() => {
        // En modo local no hay Supabase al que preguntar.
        if (MODO_LOCAL_DISPONIBLE) return undefined;

        let activo = true;
        let resuelto = false;

        // Señal débil: no esperar indefinidamente para dejar trabajar offline.
        const temporizador = setTimeout(() => {
            if (!activo || resuelto) return;
            const usuario = decidirSinSesion({ name: 'TimeoutError' });
            if (usuario) {
                setCurrentUser((previo) => previo ?? usuario);
                setLoading(false);
            }
        }, ESPERA_MAXIMA_SESION_MS);

        supabase.auth.getSession()
            .then(({ data, error }) => {
                if (!activo) return;
                resuelto = true;
                if (data?.session?.user) {
                    aplicarSesion(data.session);
                    return;
                }
                // SYNC-6: sin red y con el token vencido, getSession devuelve
                // null aunque la sesión sigue guardada. No mandar al login.
                const usuario = decidirSinSesion(error);
                setCurrentUser((previo) => (mismoUsuario(previo, usuario) ? previo : usuario));
                if (!usuario) marcarRecuperacion(false);
            })
            .catch((error) => {
                console.error('Error al revisar la sesión:', error);
                if (activo) {
                    resuelto = true;
                    setCurrentUser(decidirSinSesion(error));
                }
            })
            .finally(() => {
                clearTimeout(temporizador);
                if (activo) setLoading(false);
            });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((evento, session) => {
            if (!activo) return;
            if (evento === 'SIGNED_IN') iniciosDeSesion.current++;
            switch (evento) {
                case 'INITIAL_SESSION':
                case 'SIGNED_IN':
                case 'TOKEN_REFRESHED':
                case 'USER_UPDATED':
                    // TOKEN_REFRESHED es lo que llega cuando vuelve la señal:
                    // quita la marca "sin conexión". INITIAL_SESSION sin
                    // sesión no significa logout (puede ser falta de red).
                    if (session?.user) aplicarSesion(session);
                    break;
                case 'PASSWORD_RECOVERY':
                    // El enlace del correo inicia sesión; hay que pedir la
                    // contraseña nueva antes de dejar entrar (SYNC-16, ADM-5).
                    if (session?.user) aplicarSesion(session);
                    marcarRecuperacion(true);
                    break;
                case 'SIGNED_OUT':
                    borrarUsuarioSesion(almacen());
                    marcarRecuperacion(false);
                    setCurrentUser((previo) => (previo?.modoLocal ? previo : null));
                    break;
                default:
                    break;
            }
        });

        return () => {
            activo = false;
            clearTimeout(temporizador);
            subscription.unsubscribe();
        };
    }, [aplicarSesion, decidirSinSesion, marcarRecuperacion]);

    // Al volver la señal en modo sin conexión, se intenta refrescar el token.
    // Si funciona llega TOKEN_REFRESHED; si el refresh token fue revocado,
    // supabase-js borra la sesión y emite SIGNED_OUT.
    const sinConexion = Boolean(currentUser?.sinConexion);
    useEffect(() => {
        if (!sinConexion) return undefined;
        let activo = true;
        function revalidar() {
            supabase.auth.getSession()
                .then(({ data }) => {
                    if (activo && data?.session?.user) aplicarSesion(data.session);
                })
                .catch(() => {});
        }
        window.addEventListener('online', revalidar);
        if (navigator.onLine) revalidar();
        return () => {
            activo = false;
            window.removeEventListener('online', revalidar);
        };
    }, [sinConexion, aplicarSesion]);

    const entrarModoLocal = useCallback(() => {
        if (!MODO_LOCAL_DISPONIBLE) {
            throw new Error('El modo local de pruebas no está disponible en este entorno.');
        }
        guardarModoLocal(true);
        setCurrentUser(USUARIO_LOCAL);
    }, []);

    async function login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    }

    // Cuenta cuántos cambios locales quedan sin subir a la nube.
    // La UI lo usa para avisar antes de cerrar sesión.
    async function getPendingChangesCount() {
        if (currentUser?.modoLocal) return 0;
        try {
            return await db.sync_queue.count();
        } catch {
            return 0;
        }
    }

    async function logout() {
        if (currentUser?.modoLocal) {
            // Los datos del modo local se quedan en su base propia
            // (FinanzasConstructora-<modo>-local) para seguir probando con
            // ellos al volver a entrar. Se borran desde Configuración.
            guardarModoLocal(false);
            setCurrentUser(null);
            return;
        }

        // datos-1, datos-2: el push y el pull en curso se cancelan antes de
        // cerrar la sesión. El push para entre operaciones (la que está en
        // vuelo lleva su token explícito y termina bien, o da 401 y se queda
        // en la cola) y la siguiente ve que no hay sesión: ya no sale nada con
        // la anon key. Se cierra la sesión ANTES de esperar a que paren: así
        // otra pestaña que esté subiendo también lo nota y suelta el candado.
        detenerSincronizacion();

        // scope 'local': cierra solo ESTE dispositivo. Con el 'global' por
        // defecto, cerrar sesión en el PC revocaba la del celular de obra, y
        // lo que este tenía en cola quedaba sin sesión para subir (SYNC-10).
        try {
            const { error } = await supabase.auth.signOut({ scope: 'local' });
            if (error) {
                console.warn('No se pudo cerrar la sesión en el servidor; se borra la de este dispositivo:', error.message);
                borrarSesionPersistida();
            }
        } catch (error) {
            console.warn('Error en signOut; se borra la sesión de este dispositivo:', error);
            borrarSesionPersistida();
        }
        borrarUsuarioSesion(almacen());
        // Desde aquí ya no hay sesión: un SIGNED_IN es alguien que volvió a entrar.
        const iniciosAlSalir = iniciosDeSesion.current;

        // Se limpian las tablas de datos para no dejar información del usuario
        // anterior en el dispositivo. Con la sincronización detenida: un pull
        // que estaba descargando volvía a llenar las tablas recién vaciadas.
        //
        // IMPORTANTE: sync_queue y sync_errores NO se tocan. Antes la cola se
        // borraba junto con todo lo demás, así que quien trabajaba sin señal
        // en obra y cerraba sesión perdía todo lo que había registrado. Los
        // payloads son autónomos: sobreviven al logout y se suben en el
        // próximo arranque con conexión (invariantes 1 y 2).
        await conSincronizacionDetenida(async () => {
            try {
                await vaciarTablasDeDatos();

                const pendientes = await db.sync_queue.count();
                if (pendientes > 0) {
                    console.warn(
                        `Logout con ${pendientes} cambio(s) sin sincronizar. ` +
                        'Se conservan en la cola y se subirán al volver a entrar con conexión.'
                    );
                }
            } catch (e) {
                console.error('No se pudo limpiar la base local en el logout:', e);
            }
        });

        // Si mientras se esperaba al push o al pull la persona ya volvió a
        // entrar (el SIGNED_OUT la llevó al login), no se la saca otra vez.
        if (iniciosDeSesion.current !== iniciosAlSalir) return;
        marcarRecuperacion(false);
        setCurrentUser(null);
    }

    async function resetPassword(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: URL_RECUPERACION
        });
        if (error) throw error;
    }

    async function updatePassword(newPassword) {
        const { error } = await supabase.auth.updateUser({
            password: newPassword
        });
        if (error) throw error;
    }

    // Termina el flujo de "recuperar contraseña": define la nueva sin pedir
    // la actual (que es justo la que el usuario olvidó).
    async function completarRecuperacion(nueva) {
        if (typeof nueva !== 'string' || nueva.length < MINIMO_CONTRASENA) {
            throw new Error(`La contraseña debe tener al menos ${MINIMO_CONTRASENA} caracteres.`);
        }
        let resultado;
        try {
            resultado = await supabase.auth.updateUser({ password: nueva });
        } catch (error) {
            throw new Error(mensajeErrorContrasena(error), { cause: error });
        }
        if (resultado?.error) {
            throw new Error(mensajeErrorContrasena(resultado.error), { cause: resultado.error });
        }
        limpiarUrlDeRecuperacion();
        marcarRecuperacion(false);
    }

    async function updateNombre(nombre) {
        const { error } = await supabase.auth.updateUser({
            data: { nombre }
        });
        if (error) throw error;
        // USER_UPDATED también llega y actualiza el usuario guardado para el
        // arranque sin conexión.
        setCurrentUser(prev => prev ? { ...prev, nombre } : null);
    }

    const value = {
        currentUser,
        loading,
        login,
        logout,
        resetPassword,
        updatePassword,
        updateNombre,
        getPendingChangesCount,
        modoLocalDisponible: MODO_LOCAL_DISPONIBLE,
        entrarModoLocal,
        recuperacionPendiente,
        completarRecuperacion,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export default AuthProvider;
