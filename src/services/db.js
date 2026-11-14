// Database configuration using Dexie.js (IndexedDB wrapper)
import Dexie from 'dexie';
import { supabase, isSupabaseConfigured, obtenerSesionActiva, conSesion } from './supabase';
import { NOMBRE_BASE_LOCAL } from './entorno';
import { efectoEnSaldos } from '../domain/rules/efectoEnSaldos';
import { descargarTodo } from '../infrastructure/sync/descargaPaginada';
import { esTablaInexistente } from '../infrastructure/sync/clasificarResultadoSync';
import { reaplicarPendientes } from '../infrastructure/sync/reaplicarPendientes';
import { conCandadoEntrePestanas, crearTurnoSerial } from '../infrastructure/sync/ejecutorSerial';

// Una base local por entorno (ver services/entorno.js). Producción conserva
// el nombre histórico para no perder datos de dispositivos ya instalados.
export const db = new Dexie(NOMBRE_BASE_LOCAL);

// Define the database schema matching the SQL structure
db.version(1).stores({
    // Empresas table
    empresas: 'id, nombre, nit, created_at',

    // Proyectos table (linked to empresas)
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',

    // Cajas table (Bancos, Caja Menor, Tarjetas)
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',

    // Terceros table (Proveedores y Empleados)
    terceros: 'id, nombre, tipo, created_at',

    // Transacciones table (main table)
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, created_at',

    // Sync queue for offline operations
    sync_queue: '++id, tabla, operacion, datos, timestamp'
});

// Version 2 - Add inter-box debts
db.version(2).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    // Deudas entre cajas
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, created_at'
});

// Version 3 - Add supplier/third-party debts
db.version(3).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, created_at',
    // Deudas a terceros (proveedores, empleados)
    deudas_terceros: 'id, tercero_id, proyecto_id, empresa_id, monto_original, monto_pendiente, fecha_deuda, estado, descripcion, created_at'
});

// Version 4 - Add categories table for dynamic category management
db.version(4).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, created_at',
    deudas_terceros: 'id, tercero_id, proyecto_id, empresa_id, monto_original, monto_pendiente, fecha_deuda, estado, descripcion, created_at',
    // Categorías dinámicas
    categorias: 'id, nombre, tipo, created_at'
});

// Version 5 - Add user tracking (usuario_nombre) to all operational tables
db.version(5).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, usuario_nombre, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, usuario_nombre, created_at',
    deudas_terceros: 'id, tercero_id, proyecto_id, empresa_id, monto_original, monto_pendiente, fecha_deuda, estado, descripcion, usuario_nombre, created_at',
    categorias: 'id, nombre, tipo, created_at'
});

// Version 6 - Bandeja de errores de sincronización (C14, invariante 2).
// Una operación que Supabase rechaza de forma permanente ya no se borra de la
// cola en silencio: se mueve aquí con el payload intacto y el motivo, y la
// interfaz la muestra con "Reintentar" y "Descartar" (ver syncService.js).
db.version(6).stores({
    empresas: 'id, nombre, nit, created_at',
    proyectos: 'id, nombre, empresa_id, presupuesto_estimado, estado, created_at',
    cajas: 'id, nombre, tipo, empresa_id, saldo_actual, created_at',
    terceros: 'id, nombre, tipo, created_at',
    transacciones: 'id, fecha, descripcion, monto, tipo_movimiento, categoria, proyecto_id, caja_origen_id, caja_destino_id, tercero_id, soporte_url, sincronizado, usuario_nombre, created_at',
    sync_queue: '++id, tabla, operacion, datos, timestamp',
    deudas_cajas: 'id, caja_deudora_id, caja_acreedora_id, monto_original, monto_pendiente, fecha_prestamo, estado, usuario_nombre, created_at',
    deudas_terceros: 'id, tercero_id, proyecto_id, empresa_id, monto_original, monto_pendiente, fecha_deuda, estado, descripcion, usuario_nombre, created_at',
    categorias: 'id, nombre, tipo, created_at',
    sync_errores: '++id, tabla, operacion, fecha'
});

/** Tablas que no son datos de negocio: el logout y el pull nunca las vacían. */
export const TABLAS_DE_SINCRONIZACION = Object.freeze(['sync_queue', 'sync_errores']);

// ============== TURNO DE SINCRONIZACIÓN ==============
//
// Push (syncService.processSyncQueue), pull (syncFromSupabase) y el vaciado
// del logout comparten un solo turno en la pestaña y un solo Web Lock entre
// pestañas (ver infrastructure/sync/ejecutorSerial.js). Vive aquí porque
// syncService importa este módulo, no al revés.

/** Turno común de push, pull y logout. */
export const turnoDeSync = crearTurnoSerial();

const NOMBRE_CANDADO_SYNC = `sync-cola-${db.name}`;

/** Corre `tarea` con el candado de sincronización entre pestañas. */
export function conCandadoDeSync(tarea) {
    return conCandadoEntrePestanas(NOMBRE_CANDADO_SYNC, tarea);
}

/**
 * Cancela el push y el pull que estén en vuelo o esperando turno. El push
 * para entre operaciones y el pull entre páginas; lo que se encole después
 * corre normal.
 */
export function detenerSincronizacion() {
    turnoDeSync.cancelarPendientes();
}

/**
 * Cancela el push y el pull en curso y corre `tarea` cuando hayan parado
 * (como mucho una petición: 20 s con la peor señal). Lo usa el logout
 * (datos-1): antes vaciaba las tablas mientras un pull descargaba, y el pull
 * las volvía a llenar al terminar.
 * @template T
 * @param {() => Promise<T>} tarea
 * @returns {Promise<T>}
 */
export function conSincronizacionDetenida(tarea) {
    detenerSincronizacion();
    return turnoDeSync.exclusivo(() => tarea());
}

/**
 * Vacía las tablas de datos de negocio en una transacción. Nunca toca
 * sync_queue ni sync_errores (invariantes 1 y 2). Toma el candado entre
 * pestañas: un pull de otra pestaña termina antes de vaciar, no después.
 */
export function vaciarTablasDeDatos() {
    const tablas = db.tables.filter((tabla) => !TABLAS_DE_SINCRONIZACION.includes(tabla.name));
    return conCandadoDeSync(() =>
        db.transaction('rw', tablas, () => Promise.all(tablas.map((tabla) => tabla.clear())))
    );
}

// Generate UUID v4
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Tablas que baja el pull. Las opcionales se saltan (sin tocar la copia
// local) solo si la nube responde que la tabla no existe; cualquier otro
// error aborta el pull completo.
const TABLAS_DEL_PULL = Object.freeze([
    { nombre: 'empresas', obligatoria: true },
    { nombre: 'cajas', obligatoria: true },
    { nombre: 'proyectos', obligatoria: true },
    { nombre: 'terceros', obligatoria: true },
    { nombre: 'transacciones', obligatoria: true },
    { nombre: 'categorias', obligatoria: false },
    { nombre: 'deudas_cajas', obligatoria: false },
    { nombre: 'deudas_terceros', obligatoria: false },
]);

// Si una operación sale de la cola entre la descarga y el reemplazo, se
// vuelve a descargar; tras estos intentos se deja la base local como estaba.
const MAX_INTENTOS_PULL = 3;

function errorDePullInterrumpido(mensaje) {
    const error = new Error(mensaje);
    error.name = 'PullInterrumpido';
    return error;
}

async function descargarTabla(nombre, senal) {
    // Orden por id (único y estable): con un orden que empata, las filas del
    // borde de una página pueden saltarse o repetirse en la siguiente.
    return descargarTodo(async (desde, hasta, conConteo) => {
        // Entre páginas: un logout no espera a que termine toda la descarga.
        if (senal.cancelada()) throw errorDePullInterrumpido('Se cerró la sesión durante la descarga');
        // datos-2: la sesión se valida en cada página y su token va explícito.
        // Si no, supabase-js manda la anon key cuando la sesión se pierde a
        // mitad, y RLS devuelve páginas vacías como si la tabla lo estuviera.
        const sesion = await obtenerSesionActiva();
        if (!sesion) throw errorDePullInterrumpido('La sesión dejó de ser válida durante la descarga');
        return conSesion(
            supabase
                .from(nombre)
                .select('*', conConteo ? { count: 'exact' } : {})
                .order('id', { ascending: true })
                .range(desde, hasta),
            sesion
        );
    });
}

function descargarTablas(senal) {
    return Promise.all(TABLAS_DEL_PULL.map(async ({ nombre, obligatoria }) => {
        try {
            return { nombre, filas: await descargarTabla(nombre, senal) };
        } catch (error) {
            if (!obligatoria && esTablaInexistente(error)) {
                console.warn(`La tabla ${nombre} no existe en la nube; se conserva la copia local.`);
                return { nombre, filas: null };
            }
            error.message = `${nombre}: ${error.message}`;
            throw error;
        }
    }));
}

async function descargarYReemplazar(senal) {
    const sesion = await obtenerSesionActiva();
    if (!sesion) {
        console.warn('Sin sesión válida: no se descarga de la nube para no reemplazar la base local con tablas vacías.');
        return false;
    }

    const nombres = TABLAS_DEL_PULL.map((t) => t.nombre);

    for (let intento = 1; intento <= MAX_INTENTOS_PULL; intento++) {
        const salidasAlEmpezar = turnoDeSync.salidasDeCola();
        const descargas = await descargarTablas(senal);

        // Lo descargado no se escribe si la sesión se cerró mientras tanto:
        // el logout vacía las tablas y un pull tardío las volvía a llenar.
        if (senal.cancelada() || !(await obtenerSesionActiva())) {
            console.info('La sesión se cerró durante la descarga; no se reemplazan los datos locales.');
            return false;
        }

        const reemplazado = await db.transaction('rw', [...nombres.map((n) => db.table(n)), db.sync_queue], async () => {
            // Defensa extra (datos-1): si algo salió de la cola desde que
            // empezó la descarga, la foto puede no incluirlo y el replay ya
            // no lo trae. El push comparte turno con el pull, así que esto
            // solo pasa si alguien sube sin pasar por processSyncQueue.
            if (turnoDeSync.salidasDeCola() !== salidasAlEmpezar) return false;

            for (const { nombre, filas } of descargas) {
                if (filas === null) continue;
                const tabla = db.table(nombre);
                await tabla.clear();
                // bulkPut y no bulkAdd: un id repetido no lanza ConstraintError
                // a mitad del reemplazo.
                if (filas.length > 0) await tabla.bulkPut(filas);
            }

            const pendientes = await db.sync_queue.orderBy('id').toArray();
            const replay = await reaplicarPendientes(db, pendientes, { tablasPermitidas: nombres });
            if (pendientes.length > 0) {
                console.info(`Re-aplicadas ${replay.reaplicadas} de ${pendientes.length} operaciones pendientes sobre los datos descargados.`);
            }
            return true;
        });

        if (reemplazado) {
            const resumen = descargas
                .filter((d) => d.filas !== null)
                .map((d) => `${d.nombre} ${d.filas.length}`)
                .join(', ');
            console.info(`Datos descargados de la nube: ${resumen}.`);
            return true;
        }
        console.warn(`Una operación salió de la cola durante la descarga; se descarta lo descargado (intento ${intento} de ${MAX_INTENTOS_PULL}).`);
    }

    console.warn('La cola cambió en cada intento de descarga; se conservan los datos locales.');
    return false;
}

/**
 * Pull: reemplaza las tablas locales con lo que hay en Supabase (fuente de
 * verdad) y vuelve a aplicar encima lo que sigue en la cola.
 *
 * Reglas que evitan pérdidas que ya ocurrieron:
 * - Comparte turno con el push y el logout (datos-1): mientras descarga no
 *   sube nada, así que nada sale de la cola entre la foto y el replay.
 * - Exige sesión válida (SYNC-3) en cada página, con el token explícito
 *   (datos-2): con la anon key, RLS devuelve todo vacío.
 * - Descarga TODO antes de tocar Dexie, paginando (REP-1, SYNC-2). Si una
 *   página o una tabla falla, aborta y la base local queda como estaba
 *   (SYNC-11: antes un timeout en deudas vaciaba esa tabla).
 * - Reemplazo y replay en UNA transacción (SYNC-11): si la app muere a mitad
 *   no quedan tablas vacías, y las pantallas con liveQuery nunca ven la base
 *   sin lo pendiente.
 * - sync_queue y sync_errores no se tocan (invariantes 1 y 2).
 *
 * @returns {Promise<boolean>} true si se reemplazaron los datos locales
 */
export async function syncFromSupabase() {
    if (!isSupabaseConfigured()) {
        console.info('Supabase no está configurado: se usan solo los datos locales.');
        return false;
    }

    return turnoDeSync.ejecutar('pull', (senal) => conCandadoDeSync(async () => {
        try {
            return await descargarYReemplazar(senal);
        } catch (error) {
            if (error?.name === 'PullInterrumpido' || senal.cancelada()) {
                console.info(`Descarga interrumpida (${error.message}); se conservan los datos locales.`);
            } else {
                console.error('No se pudo descargar de la nube; se conservan los datos locales:', error);
            }
            return false;
        }
    }));
}

// Recalcula los saldos de todas las cajas a partir de las transacciones.
//
// Esta es la única fuente de verdad real de un saldo: la suma del histórico.
// Hoy `cajas.saldo_actual` se muta de forma incremental desde cinco sitios
// distintos, así que los saldos derivan. Esta función existía pero nunca se
// llamaba; se exporta para poder reconciliar a mano mientras la fase de
// arquitectura convierte el saldo en un valor derivado.
// ADVERTENCIA (bug C23): esta función pone en 0 cualquier saldo inicial que
// no venga de una transacción (p. ej. el saldo con el que AdminPanel crea una
// caja). Nadie debe empezar a llamarla; sigue sin uso a propósito hasta que
// se resuelva eso. No la conectes a ningún flujo sin revisar docs/BACKLOG.md.
export async function recalculateCajaBalances() {
    const transacciones = await db.transacciones.toArray();
    const cajas = await db.cajas.toArray();

    // Initialize balances to 0
    const balances = {};
    cajas.forEach(c => balances[c.id] = 0);

    // Calculate from transactions (misma regla de dominio que usa syncService)
    transacciones.forEach(t => {
        efectoEnSaldos(t).forEach(({ cajaId, delta }) => {
            balances[cajaId] = (balances[cajaId] || 0) + delta;
        });
    });

    // Update each caja with calculated balance
    for (const caja of cajas) {
        const newBalance = balances[caja.id] || 0;
        await db.cajas.update(caja.id, { saldo_actual: newBalance });

        // Also update Supabase
        if (isSupabaseConfigured()) {
            await supabase.from('cajas').update({ saldo_actual: newBalance }).eq('id', caja.id);
        }
    }

    console.info('Saldos de cajas recalculados.');
}

/** ¿Hay datos de negocio en la base local? (para no esperar la nube con la pantalla vacía) */
export async function hayDatosLocales() {
    try {
        const [cajas, transacciones] = await Promise.all([db.cajas.count(), db.transacciones.count()]);
        return cajas + transacciones > 0;
    } catch {
        return false;
    }
}

/**
 * Pull inicial desde Supabase (fuente de verdad), si hay conexión.
 * @returns {Promise<boolean>} true si los datos locales se reemplazaron con los de la nube
 */
export async function seedInitialData() {
    if (navigator.onLine && isSupabaseConfigured()) {
        const descargado = await syncFromSupabase();
        if (descargado) return true;
    }

    const empresasCount = await db.empresas.count();
    if (empresasCount === 0) {
        console.info('No hay datos locales. Conéctate para descargarlos de la nube o créalos a mano.');
    }
    return false;
}

export default db;
