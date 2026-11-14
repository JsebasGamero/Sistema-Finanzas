// Sesión sin conexión (SYNC-6).
//
// Caso real: un residente usa la app a las 5 p. m. y la abre a las 7 a. m. en
// la obra, sin señal. El access token venció (dura 1 h); supabase-js intenta
// refrescarlo, falla por red y getSession() devuelve `session: null`, aunque
// la sesión sigue guardada. Antes eso mandaba al login, que necesita red: no
// se podía registrar nada en todo el día.
//
// Solución: al iniciar sesión se guarda { id, email, nombre }. Si al arrancar
// el refresh falla POR RED y la sesión de Supabase sigue guardada, se entra
// con ese usuario marcado `sinConexion`. La sincronización exige una sesión
// válida (syncService), así que en ese modo nada sube ni baja con la anon key.
//
// Lógica pura con el almacenamiento inyectado: se prueba sin navegador.

export const CLAVE_USUARIO_SESION = 'finanzasobra.usuarioSesion';

/** { id, email, nombre } a partir del usuario de Supabase Auth. */
export function usuarioDesdeSupabase(user) {
    return {
        id: user.id,
        email: user.email,
        nombre: user.user_metadata?.nombre || user.email?.split('@')[0] || 'Usuario',
    };
}

export function guardarUsuarioSesion(almacen, usuario) {
    try {
        almacen?.setItem(CLAVE_USUARIO_SESION, JSON.stringify({
            id: usuario.id,
            email: usuario.email,
            nombre: usuario.nombre,
        }));
    } catch {
        // Sin almacenamiento (modo privado lleno): solo se pierde el arranque sin señal.
    }
}

export function leerUsuarioSesion(almacen) {
    try {
        const crudo = almacen?.getItem(CLAVE_USUARIO_SESION);
        if (!crudo) return null;
        const usuario = JSON.parse(crudo);
        return typeof usuario?.id === 'string' && usuario.id ? usuario : null;
    } catch {
        return null;
    }
}

export function borrarUsuarioSesion(almacen) {
    try {
        almacen?.removeItem(CLAVE_USUARIO_SESION);
    } catch {
        // Nada que hacer.
    }
}

/**
 * Id del usuario de la sesión que supabase-js dejó guardada, o '' si la hay
 * pero no se puede leer, o null si no hay ninguna.
 */
export function usuarioDeSesionPersistida(almacen, claveSupabase) {
    try {
        const crudo = claveSupabase ? almacen?.getItem(claveSupabase) : null;
        if (!crudo) return null;
        const sesion = JSON.parse(crudo);
        return sesion?.user?.id ?? '';
    } catch {
        return '';
    }
}

/**
 * Decide con qué usuario arrancar.
 * @param {object} p
 * @param {object|null} p.sesion sesión que devolvió getSession()
 * @param {any} p.error error que devolvió getSession()
 * @param {boolean} p.enLinea navigator.onLine
 * @param {{ id: string, email: string, nombre: string } | null} p.usuarioGuardado
 * @param {string|null} p.idSesionPersistida resultado de usuarioDeSesionPersistida()
 * @param {(error: any) => boolean} p.esErrorDeRed
 * @returns {{ usuario: object|null, sinConexion: boolean }}
 */
export function decidirSesionInicial({ sesion, error, enLinea, usuarioGuardado, idSesionPersistida, esErrorDeRed }) {
    if (sesion?.user) {
        return { usuario: usuarioDesdeSupabase(sesion.user), sinConexion: false };
    }

    const fallaDeRed = !enLinea || Boolean(error && esErrorDeRed(error));
    // Sin sesión guardada no hay nada que restaurar: alguien cerró sesión o
    // el refresh token fue revocado (supabase-js la borra en ese caso).
    const haySesionGuardada = idSesionPersistida !== null && idSesionPersistida !== undefined;
    // Si se puede leer de quién es la sesión guardada, tiene que ser del
    // mismo usuario: nunca entrar como otra persona en un celular compartido.
    const esDelMismoUsuario = !idSesionPersistida || idSesionPersistida === usuarioGuardado?.id;

    if (fallaDeRed && usuarioGuardado && haySesionGuardada && esDelMismoUsuario) {
        return { usuario: { ...usuarioGuardado, sinConexion: true }, sinConexion: true };
    }
    return { usuario: null, sinConexion: false };
}

/** ¿Dos usuarios son el mismo para la interfaz? Evita re-renders en cada refresh del token. */
export function mismoUsuario(a, b) {
    if (!a || !b) return a === b;
    return a.id === b.id && a.email === b.email && a.nombre === b.nombre &&
        Boolean(a.sinConexion) === Boolean(b.sinConexion) && Boolean(a.modoLocal) === Boolean(b.modoLocal);
}
