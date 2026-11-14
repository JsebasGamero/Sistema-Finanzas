// Supabase client configuration
// Las credenciales se leen de .env.<modo>.local (ver docs/ENTORNOS.md).
// Nunca las escribas aquí.
import { createClient } from '@supabase/supabase-js';
import {
    CREDENCIALES_PRESENTES,
    ESQUEMA_SUPABASE,
    ENTORNO_COHERENTE,
    MODO_LOCAL_DISPONIBLE,
    SUPABASE_HABILITADO,
    describirProblemaDeEntorno
} from './entorno';

export { hostSupabase } from './entorno';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Solo se conecta si hay credenciales Y pertenecen al entorno en que corre la
// app. Esto es lo que impide que `npm run dev` escriba en producción.
const configured = SUPABASE_HABILITADO;

if (!CREDENCIALES_PRESENTES) {
    console.warn(
        'Supabase no está configurado para este entorno. Crea el archivo ' +
        `.env.${import.meta.env.MODE}.local a partir de .env.example. ` +
        (MODO_LOCAL_DISPONIBLE
            ? 'Mientras tanto puedes entrar en modo local de pruebas.'
            : 'La app funcionará solo con los datos locales.')
    );
} else if (!ENTORNO_COHERENTE) {
    console.error(describirProblemaDeEntorno());
}

// Tiempo máximo por petición (SYNC-14). En obra, con una barra de señal,
// navigator.onLine dice true pero fetch puede quedarse minutos esperando: el
// arranque se quedaba en "Cargando..." y el botón en "Guardando...". Al
// vencer, la petición falla como un error de red y la operación se queda en
// la cola (no se pierde). Las subidas de fotos a Storage tienen más margen.
export const TIEMPO_MAXIMO_PETICION_MS = 20000;
export const TIEMPO_MAXIMO_STORAGE_MS = 120000;

function urlDe(recurso) {
    if (typeof recurso === 'string') return recurso;
    return recurso?.url ?? String(recurso);
}

// AbortController + setTimeout en vez de AbortSignal.timeout/any: un WebView
// de Android viejo puede no tenerlos (AbortSignal.any es de Chromium 116).
export function fetchConTiempoMaximo(recurso, opciones = {}) {
    const limite = urlDe(recurso).includes('/storage/v1/') ? TIEMPO_MAXIMO_STORAGE_MS : TIEMPO_MAXIMO_PETICION_MS;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => {
        controlador.abort(new DOMException(`La petición superó ${limite / 1000} s`, 'TimeoutError'));
    }, limite);

    // Respeta la señal de quien llama (supabase-js la usa para cancelar).
    const senalExterna = opciones.signal;
    const reenviarAborto = () => controlador.abort(senalExterna.reason);
    if (senalExterna) {
        if (senalExterna.aborted) reenviarAborto();
        else senalExterna.addEventListener('abort', reenviarAborto, { once: true });
    }

    return fetch(recurso, { ...opciones, signal: controlador.signal }).finally(() => {
        clearTimeout(temporizador);
        senalExterna?.removeEventListener('abort', reenviarAborto);
    });
}

// Se crea el cliente igual (con valores inertes si falta config) para que los
// imports no exploten; isSupabaseConfigured() decide si se intenta sincronizar.
export const supabase = createClient(
    configured ? supabaseUrl : 'https://placeholder.supabase.co',
    configured ? supabaseAnonKey : 'placeholder',
    {
        global: { fetch: fetchConTiempoMaximo },
        // Todas las consultas (.from) van al esquema de este entorno: `public`
        // en producción, `pruebas` en la cuenta de pruebas dentro del mismo
        // proyecto. supabase-js manda el esquema en Accept-Profile /
        // Content-Profile; Auth y Storage no dependen de él.
        db: { schema: ESQUEMA_SUPABASE },
    }
);

// Check if Supabase is properly configured
export function isSupabaseConfigured() {
    return configured;
}

/**
 * Sesión de Supabase Auth vigente, o null.
 *
 * Por qué existe (SYNC-3): sin sesión, supabase-js manda la anon key. Con RLS
 * solo para `authenticated`, un UPDATE o un DELETE responde 204 con 0 filas y
 * SIN error, y la cola los daba por subidos; un pull devolvía todas las
 * tablas vacías y vaciaba la base local. Push y pull exigen esta sesión antes
 * de tocar nada.
 */
export async function obtenerSesionActiva() {
    if (!configured) return null;
    try {
        const { data, error } = await supabase.auth.getSession();
        if (error) return null;
        return data?.session ?? null;
    } catch {
        return null;
    }
}

/**
 * Manda una consulta de PostgREST con el token de `sesion`, ya validado por
 * quien llama, en vez de dejar que supabase-js lo busque por su cuenta.
 *
 * Por qué (datos-2): supabase-js vuelve a leer la sesión en cada petición y,
 * si en ese instante no hay (logout, refresh fallido por la señal), manda la
 * anon key. Con RLS solo para `authenticated`, un DELETE responde 200 con 0
 * filas y la cola lo daba por subido. Con el token explícito, un token
 * vencido responde 401 y la corrida se detiene (fetchWithAuth no pisa un
 * Authorization que ya viene puesto).
 * @template T
 * @param {T} consulta builder de postgrest-js (tiene setHeader)
 * @param {{ access_token: string }} sesion
 * @returns {T}
 */
export function conSesion(consulta, sesion) {
    return consulta.setHeader('Authorization', `Bearer ${sesion.access_token}`);
}

export default supabase;
