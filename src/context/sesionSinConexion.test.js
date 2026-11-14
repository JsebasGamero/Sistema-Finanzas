import { describe, it, expect } from 'vitest';
import {
    CLAVE_USUARIO_SESION,
    decidirSesionInicial,
    guardarUsuarioSesion,
    leerUsuarioSesion,
    borrarUsuarioSesion,
    usuarioDeSesionPersistida,
    mismoUsuario,
} from './sesionSinConexion';

function crearAlmacen(inicial = {}) {
    const datos = new Map(Object.entries(inicial));
    return {
        getItem: (k) => (datos.has(k) ? datos.get(k) : null),
        setItem: (k, v) => { datos.set(k, String(v)); },
        removeItem: (k) => { datos.delete(k); },
    };
}

const esErrorDeRed = (e) => e?.name === 'AuthRetryableFetchError';
const errorDeRed = { name: 'AuthRetryableFetchError', message: 'Failed to fetch' };
const usuarioGuardado = { id: 'u1', email: 'obra@ejemplo.co', nombre: 'Residente' };

describe('decidirSesionInicial', () => {
    it('con sesión válida entra normal', () => {
        const r = decidirSesionInicial({
            sesion: { user: { id: 'u1', email: 'obra@ejemplo.co', user_metadata: { nombre: 'Residente' } } },
            error: null, enLinea: true, usuarioGuardado: null, idSesionPersistida: 'u1', esErrorDeRed,
        });
        expect(r).toEqual({ usuario: usuarioGuardado, sinConexion: false });
    });

    it('sin señal y con el token vencido entra sin conexión con el usuario guardado (SYNC-6)', () => {
        const r = decidirSesionInicial({
            sesion: null, error: errorDeRed, enLinea: true, usuarioGuardado, idSesionPersistida: 'u1', esErrorDeRed,
        });
        expect(r.sinConexion).toBe(true);
        expect(r.usuario).toEqual({ ...usuarioGuardado, sinConexion: true });
    });

    it('navigator.onLine en false también cuenta como falla de red', () => {
        const r = decidirSesionInicial({
            sesion: null, error: null, enLinea: false, usuarioGuardado, idSesionPersistida: 'u1', esErrorDeRed,
        });
        expect(r.sinConexion).toBe(true);
    });

    it('si supabase-js ya no tiene la sesión guardada (logout o token revocado), va al login', () => {
        const r = decidirSesionInicial({
            sesion: null, error: errorDeRed, enLinea: false, usuarioGuardado, idSesionPersistida: null, esErrorDeRed,
        });
        expect(r.usuario).toBeNull();
    });

    it('un error que no es de red (refresh token inválido) va al login', () => {
        const r = decidirSesionInicial({
            sesion: null, error: { name: 'AuthApiError', status: 400 }, enLinea: true,
            usuarioGuardado, idSesionPersistida: 'u1', esErrorDeRed,
        });
        expect(r.usuario).toBeNull();
    });

    it('nunca entra como otra persona si la sesión guardada es de otro usuario', () => {
        const r = decidirSesionInicial({
            sesion: null, error: errorDeRed, enLinea: false, usuarioGuardado, idSesionPersistida: 'otro', esErrorDeRed,
        });
        expect(r.usuario).toBeNull();
    });

    it('sin usuario guardado no hay nada que restaurar', () => {
        const r = decidirSesionInicial({
            sesion: null, error: errorDeRed, enLinea: false, usuarioGuardado: null, idSesionPersistida: 'u1', esErrorDeRed,
        });
        expect(r.usuario).toBeNull();
    });
});

describe('almacenamiento del usuario de la sesión', () => {
    it('guarda, lee y borra solo id, email y nombre', () => {
        const almacen = crearAlmacen();
        guardarUsuarioSesion(almacen, { ...usuarioGuardado, token: 'no-debe-guardarse' });
        expect(JSON.parse(almacen.getItem(CLAVE_USUARIO_SESION))).toEqual(usuarioGuardado);
        expect(leerUsuarioSesion(almacen)).toEqual(usuarioGuardado);
        borrarUsuarioSesion(almacen);
        expect(leerUsuarioSesion(almacen)).toBeNull();
    });

    it('un valor dañado se ignora', () => {
        expect(leerUsuarioSesion(crearAlmacen({ [CLAVE_USUARIO_SESION]: '{roto' }))).toBeNull();
        expect(leerUsuarioSesion(crearAlmacen({ [CLAVE_USUARIO_SESION]: '{"email":"x"}' }))).toBeNull();
    });

    it('lee el id del usuario de la sesión persistida de supabase-js', () => {
        const almacen = crearAlmacen({ 'sb-x-auth-token': JSON.stringify({ access_token: 'a', user: { id: 'u1' } }) });
        expect(usuarioDeSesionPersistida(almacen, 'sb-x-auth-token')).toBe('u1');
        expect(usuarioDeSesionPersistida(almacen, 'sb-y-auth-token')).toBeNull();
        expect(usuarioDeSesionPersistida(crearAlmacen({ k: 'raro' }), 'k')).toBe('');
    });
});

describe('mismoUsuario', () => {
    it('ignora objetos nuevos con los mismos datos', () => {
        expect(mismoUsuario({ ...usuarioGuardado }, { ...usuarioGuardado })).toBe(true);
    });

    it('distingue el paso de sin conexión a sesión normal', () => {
        expect(mismoUsuario({ ...usuarioGuardado, sinConexion: true }, usuarioGuardado)).toBe(false);
    });
});
