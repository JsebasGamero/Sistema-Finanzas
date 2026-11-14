// Servicio de sincronización: cola de operaciones offline (push), bandeja de
// errores y replay. El pull está en db.js. Modelo completo en
// docs/SINCRONIZACION.md.
import { liveQuery } from 'dexie';
import { db, generateUUID, turnoDeSync, conCandadoDeSync } from './db';
import { supabase, isSupabaseConfigured, obtenerSesionActiva, conSesion } from './supabase';
import { crearOutboxDexie } from '../infrastructure/sync/outboxDexie';
import { crearAplicadorDeAjustesDexie } from '../infrastructure/dexie/aplicadorDeAjustesDexie';
import { ACCION, clasificarRespuesta, clasificarExcepcion, mensajeDeTipo } from '../infrastructure/sync/clasificarResultadoSync';
import { reaplicarPendientes } from '../infrastructure/sync/reaplicarPendientes';
import { efectoEnSaldos, efectoDeBorrado } from '../domain/rules/efectoEnSaldos';
import { esCero } from '../domain/value-objects/dinero';
import { claveDia } from '../domain/value-objects/fecha';

// Única implementación del registro que se encola: el resto de este archivo
// (y quien lo use) pasa por aquí para no duplicar la forma de la fila.
const outbox = crearOutboxDexie(db);
const aplicadorDeAjustes = crearAplicadorDeAjustesDexie({ db, outbox });

// Add operation to sync queue (for offline mode)
export async function addToSyncQueue(tabla, operacion, datos) {
    await outbox.encolar(tabla, operacion, datos);
}

// Re-aplica sobre la base local las operaciones que siguen pendientes en la
// cola (ver infrastructure/sync/reaplicarPendientes.js). syncFromSupabase()
// ya lo hace dentro de su transacción; esto queda para cuando el pull no
// corrió (sin señal) y para quien lo llame a mano.
export async function reapplyPendingOperations() {
    const pendientes = await db.sync_queue.orderBy('id').toArray();
    if (pendientes.length === 0) return 0;
    const { reaplicadas } = await reaplicarPendientes(db, pendientes);
    return reaplicadas;
}

// ============== PUSH: processSyncQueue ==============

// Tablas que existen en la nube. Una operación sobre otra tabla no se puede
// subir: antes caía en la whitelist de `transacciones` y se mandaba mal.
const TABLAS_SINCRONIZABLES = new Set([
    'empresas', 'cajas', 'proyectos', 'terceros', 'transacciones',
    'categorias', 'deudas_cajas', 'deudas_terceros',
]);
const OPERACIONES = new Set(['INSERT', 'UPDATE', 'DELETE']);

const MENSAJE_SIN_SESION = 'La sesión no es válida. Los cambios siguen guardados en este dispositivo y se subirán al volver a iniciar sesión.';

// `sesion` es la que ejecutarCola acaba de validar: su token va explícito en
// la petición (datos-2, ver conSesion en supabase.js).
async function enviarOperacion(tabla, operacion, datos, sesion) {
    const fila = prepareForSupabase(datos, tabla);

    switch (operacion) {
        case 'INSERT': {
            // ON CONFLICT DO NOTHING (SYNC-5): si el servidor guardó la fila
            // pero la respuesta se perdió, el reintento no pisa los cambios
            // posteriores (un abono, un saldo) con la versión original.
            // En categorías el nombre es el identificador real (ADR-001): una
            // categoría sembrada con el mismo nombre ya existe y no es error.
            const consulta = supabase
                .from(tabla)
                .upsert(fila, { onConflict: tabla === 'categorias' ? 'nombre' : 'id', ignoreDuplicates: true });
            // En categorías se pide la fila insertada: si vuelve vacía, la
            // nube ya tenía una con ese nombre y otro id (datos-9).
            return await conSesion(tabla === 'categorias' ? consulta.select('id') : consulta, sesion);
        }
        case 'UPDATE':
            // .select('id') para saber cuántas filas cambió: 0 filas no es éxito (SYNC-3).
            return await conSesion(supabase.from(tabla).update(fila).eq('id', fila.id).select('id'), sesion);
        case 'DELETE':
            return await conSesion(supabase.from(tabla).delete().eq('id', fila.id).select('id'), sesion);
        default:
            throw new Error(`Operación desconocida: ${operacion}`);
    }
}

// datos-9: si la base local quedó sin categorías (pull fallido), el
// formulario siembra las de siempre con UUID nuevos. La nube ya las tiene
// con otro id y el upsert por nombre no inserta nada, pero la fila local
// conservaba su id: un DELETE posterior afectaba 0 filas y se daba por
// subido, y un UPDATE iba a la bandeja como "ya no existe".
function categoriaAbsorbidaPorNombre(operacion, respuesta) {
    return operacion.tabla === 'categorias'
        && operacion.operacion === 'INSERT'
        && Array.isArray(respuesta?.data)
        && respuesta.data.length === 0;
}

/**
 * Id que tiene en la nube la categoría con ese nombre.
 * @returns {Promise<{ id: string|null, decision?: object }>} `decision` si
 *   hay que detener la corrida (red, sesión, servidor): el INSERT se queda
 *   en la cola y se reintenta, sin riesgo porque es idempotente.
 */
async function buscarIdCategoria(nombre, sesion) {
    try {
        const { data, error, status } = await conSesion(
            supabase.from('categorias').select('id').eq('nombre', nombre).limit(1),
            sesion
        );
        if (error) {
            const decision = clasificarRespuesta({ operacion: 'INSERT', error, status });
            if (decision.accion === ACCION.DETENER) return { id: null, decision };
            console.warn('No se pudo leer el id de una categoría que ya existía en la nube:', decision.detalle);
            return { id: null };
        }
        return { id: data?.[0]?.id ?? null };
    } catch (excepcion) {
        return { id: null, decision: clasificarExcepcion(excepcion) };
    }
}

// Cambia el id local de una categoría por el que tiene en la nube, y el de
// sus operaciones pendientes o en la bandeja. `transacciones.categoria`
// guarda el nombre, así que ningún movimiento apunta al id viejo.
async function reasignarIdCategoria(idLocal, idNube) {
    const fila = await db.categorias.get(idLocal);
    if (fila) {
        await db.categorias.delete(idLocal);
        if (!(await db.categorias.get(idNube))) await db.categorias.put({ ...fila, id: idNube });
    }
    const cambiarId = (registro) => {
        const payload = leerPayload(registro.datos);
        if (payload?.id === idLocal) registro.datos = JSON.stringify({ ...payload, id: idNube });
    };
    await db.sync_queue.where('tabla').equals('categorias').modify(cambiarId);
    await db.sync_errores.where('tabla').equals('categorias').modify(cambiarId);
}

// datos-4: una transacción solo está sincronizada si no le queda ninguna
// operación en la cola. Antes el INSERT confirmado la marcaba aunque una
// edición posterior siguiera pendiente, e Inicio dejaba de mostrar
// "Pendiente" para una corrección que no había llegado a la nube.
async function marcarSincronizadaSiNadaPendiente(idTransaccion) {
    const pendientes = await db.sync_queue
        .where('tabla').equals('transacciones')
        .filter((registro) => leerPayload(registro.datos)?.id === idTransaccion)
        .count();
    if (pendientes === 0) await db.transacciones.update(idTransaccion, { sincronizado: true });
}

// datos-3: un `cajas UPDATE` lleva el saldo ABSOLUTO. Cuando sube uno, los
// de la misma caja que esperan en la bandeja con un puesto anterior quedan
// superados: reintentarlos tal cual pisaría el saldo nuevo con uno viejo.
async function marcarSaldosSuperados(cajaId, colaId) {
    await db.sync_errores
        .where('tabla').equals('cajas')
        .filter((fallo) => {
            if (fallo.operacion !== 'UPDATE' || fallo.cola_id == null || fallo.cola_id >= colaId) return false;
            const payload = leerPayload(fallo.datos);
            return payload?.id === cajaId && payload.saldo_actual !== undefined;
        })
        .modify({ saldo_superado: true });
}

async function confirmarOperacion(operacion, datos, { idNube = null } = {}) {
    // Antes de tocar Dexie: un pull que abra su transacción después de esta
    // ya ve el contador cambiado (datos-1).
    turnoDeSync.registrarSalidaDeCola();
    await db.transaction('rw', [db.sync_queue, db.sync_errores, db.transacciones, db.categorias], async () => {
        await db.sync_queue.delete(operacion.id);
        if (operacion.tabla === 'transacciones' && operacion.operacion !== 'DELETE' && datos?.id) {
            await marcarSincronizadaSiNadaPendiente(datos.id);
        }
        if (operacion.tabla === 'cajas' && operacion.operacion === 'UPDATE' && datos?.saldo_actual !== undefined) {
            await marcarSaldosSuperados(datos.id, operacion.id);
        }
        if (idNube && idNube !== datos?.id) {
            await reasignarIdCategoria(datos.id, idNube);
        }
    });
}

// Invariante 2: lo que la nube rechaza no se borra; se mueve a la bandeja con
// el payload intacto para que el usuario lo vea y decida.
async function moverABandeja(operacion, { tipo, codigo, mensaje, detalle }) {
    // datos-4: una transacción cuyo cambio quedó en la bandeja no está en la
    // nube como se ve aquí; debe seguir marcada "Pendiente".
    const idTransaccion = operacion.tabla === 'transacciones' && operacion.operacion !== 'DELETE'
        ? leerPayload(operacion.datos)?.id
        : null;
    turnoDeSync.registrarSalidaDeCola();
    await db.transaction('rw', db.sync_queue, db.sync_errores, db.transacciones, async () => {
        await db.sync_errores.add({
            cola_id: operacion.id,
            tabla: operacion.tabla,
            operacion: operacion.operacion,
            datos: operacion.datos,
            timestamp: operacion.timestamp ?? null,
            tipo,
            codigo: codigo || '',
            mensaje,
            detalle: detalle || '',
            fecha: new Date().toISOString(),
        });
        await db.sync_queue.delete(operacion.id);
        if (idTransaccion) await db.transacciones.update(idTransaccion, { sincronizado: false });
    });
    console.warn(
        `La nube rechazó un cambio (${operacion.tabla} ${operacion.operacion}, ${codigo || tipo}). ` +
        'Queda en la bandeja de errores de sincronización.',
        detalle
    );
}

function validarRegistro(operacion) {
    if (!TABLAS_SINCRONIZABLES.has(operacion.tabla) || !OPERACIONES.has(operacion.operacion)) {
        return { datos: null, problema: `Tabla u operación desconocida: ${operacion.tabla} ${operacion.operacion}` };
    }
    let datos;
    try {
        datos = JSON.parse(operacion.datos);
    } catch (error) {
        return { datos: null, problema: `Payload ilegible: ${error.message}` };
    }
    if (!datos || typeof datos !== 'object' || !datos.id) {
        return { datos: null, problema: 'El payload no tiene id' };
    }
    return { datos, problema: null };
}

async function ejecutarCola(senal) {
    if (!isSupabaseConfigured()) {
        return { success: false, synced: 0, errors: [], enBandeja: 0, detenido: null, message: 'Supabase no está configurado' };
    }

    if ((await db.sync_queue.count()) === 0) {
        return { success: true, synced: 0, errors: [], enBandeja: 0, detenido: null, pendientes: 0 };
    }

    // SYNC-3: sin sesión, supabase-js usa la anon key y RLS hace que UPDATE y
    // DELETE "funcionen" afectando 0 filas. No se toca la cola.
    const sesion = await obtenerSesionActiva();
    if (!sesion) {
        const pendientes = await db.sync_queue.count();
        return {
            success: false, synced: 0, errors: [], enBandeja: 0, sinSesion: true, pendientes,
            detenido: { tipo: 'sesion', mensaje: MENSAJE_SIN_SESION },
        };
    }

    const operaciones = await db.sync_queue.orderBy('id').toArray();
    let synced = 0;
    let enBandeja = 0;
    let detenido = null;
    let sinSesion = false;
    const errors = [];

    for (const operacion of operaciones) {
        // Se está cerrando la sesión (detenerSincronizacion en el logout):
        // se para entre operaciones, nunca a mitad de una.
        if (senal?.cancelada()) {
            detenido = { tipo: 'sesion', mensaje: MENSAJE_SIN_SESION };
            break;
        }

        // Otra pestaña (o una corrida anterior) ya la resolvió.
        if (!(await db.sync_queue.get(operacion.id))) continue;

        const { datos, problema } = validarRegistro(operacion);
        if (problema) {
            const fallo = { tipo: 'corrupto', codigo: 'PAYLOAD', mensaje: mensajeDeTipo('corrupto'), detalle: problema };
            await moverABandeja(operacion, fallo);
            enBandeja++;
            errors.push({ operation: operacion, error: problema, ...fallo, permanent: true });
            continue;
        }

        // datos-2: la sesión se comprueba antes de CADA operación, no solo al
        // empezar. Si se perdía a mitad (logout, refresh fallido por la
        // señal), supabase-js mandaba la anon key: los DELETE con 0 filas se
        // daban por subidos y los UPDATE iban a la bandeja como "no existe".
        const sesionVigente = await obtenerSesionActiva();
        if (!sesionVigente) {
            sinSesion = true;
            detenido = { tipo: 'sesion', mensaje: MENSAJE_SIN_SESION };
            break;
        }

        let decision;
        let respuesta = null;
        try {
            respuesta = await enviarOperacion(operacion.tabla, operacion.operacion, datos, sesionVigente);
            decision = clasificarRespuesta({
                operacion: operacion.operacion,
                error: respuesta.error,
                status: respuesta.status,
                data: respuesta.data,
            });
        } catch (excepcion) {
            decision = clasificarExcepcion(excepcion);
        }

        if (decision.accion === ACCION.CONFIRMAR) {
            let idNube = null;
            if (categoriaAbsorbidaPorNombre(operacion, respuesta)) {
                const busqueda = await buscarIdCategoria(datos.nombre, sesionVigente);
                idNube = busqueda.id;
                if (busqueda.decision) decision = busqueda.decision;
            }
            if (decision.accion === ACCION.CONFIRMAR) {
                await confirmarOperacion(operacion, datos, { idNube });
                synced++;
                continue;
            }
        }

        errors.push({
            operation: operacion,
            error: decision.detalle,
            tipo: decision.tipo,
            codigo: decision.codigo,
            mensaje: decision.mensaje,
            permanent: decision.accion === ACCION.BANDEJA,
        });

        if (decision.accion === ACCION.BANDEJA) {
            await moverABandeja(operacion, decision);
            enBandeja++;
            continue;
        }

        // SYNC-4: un fallo pasajero detiene la corrida. Seguir con las
        // siguientes rompía el orden (el hijo subía antes que el padre, un
        // saldo viejo llegaba después de uno nuevo).
        detenido = { tipo: decision.tipo, mensaje: decision.mensaje };
        console.warn(`Sincronización detenida (${decision.tipo}): ${decision.detalle}`);
        break;
    }

    const pendientes = await db.sync_queue.count();
    const resultado = { success: errors.length === 0, synced, errors, enBandeja, detenido, pendientes };
    if (sinSesion) resultado.sinSesion = true;
    return resultado;
}

/**
 * Sube la cola a Supabase, en orden y sin corridas simultáneas (SYNC-12).
 * Comparte turno con el pull y el logout (db.js, `turnoDeSync`): nunca sube
 * mientras se descarga (datos-1). Las llamadas que llegan mientras otro push
 * espera turno se unen a él.
 *
 * Por cada operación: éxito -> sale de la cola; rechazo permanente o de
 * esquema -> pasa a la bandeja de errores; fallo pasajero (red, sesión,
 * servidor) -> se queda y la corrida se detiene para conservar el orden.
 *
 * @returns {Promise<{
 *   success: boolean, synced: number, enBandeja: number, pendientes?: number,
 *   sinSesion?: boolean, detenido: null | { tipo: string, mensaje: string },
 *   errors: Array<object>, message?: string
 * }>}
 */
export function processSyncQueue() {
    return turnoDeSync.ejecutar('push', (senal) => conCandadoDeSync(() => ejecutarCola(senal)));
}

// Prepare data for Supabase (remove/convert local-only fields)
function prepareForSupabase(data, tabla) {
    const prepared = { ...data };

    // Columnas DATE. claveDia() y no split('T'): un timestamp con zona
    // ('2026-03-05T01:00:00Z') es el 4 de marzo en Colombia, no el 5.
    // Una fecha vacía ('') la rechaza Postgres (22007) y la operación entera
    // iba a parar a errores: si es obligatoria se omite (el servidor conserva
    // la suya o usa su DEFAULT); si admite nulos, va como null.
    for (const campo of ['fecha', 'fecha_prestamo', 'fecha_deuda', 'fecha_inicio', 'fecha_fin']) {
        if (!(campo in prepared)) continue;
        const valor = prepared[campo];
        const clave = valor ? claveDia(valor) : null;
        if (clave) {
            prepared[campo] = clave;
        } else if (campo === 'fecha_inicio' || campo === 'fecha_fin') {
            prepared[campo] = null;
        } else {
            delete prepared[campo];
        }
    }

    // Llaves foráneas: un select en "Seleccionar..." dejaba '' (ADM-6), que
    // Postgres rechaza como UUID inválido (22P02) y descartaba la fila entera.
    for (const campo of Object.keys(prepared)) {
        if (campo.endsWith('_id') && prepared[campo] === '') {
            prepared[campo] = null;
        }
    }

    // Fields allowed per table
    const tableFields = {
        transacciones: [
            'id', 'fecha', 'descripcion', 'monto', 'tipo_movimiento', 'categoria',
            'proyecto_id', 'caja_origen_id', 'caja_destino_id', 'tercero_id',
            // 'editado_por' existe en la tabla y Reportes lo muestra, pero
            // faltaba en esta lista: se filtraba en cada sync y nunca persistía.
            'soporte_url', 'sincronizado', 'usuario_nombre', 'editado_por',
            'device_id', 'created_at'
        ],
        empresas: [
            'id', 'nombre', 'nit', 'direccion', 'telefono', 'created_at', 'updated_at'
        ],
        cajas: [
            'id', 'nombre', 'tipo', 'empresa_id', 'saldo_actual',
            'banco_nombre', 'numero_cuenta', 'created_at', 'updated_at'
        ],
        proyectos: [
            'id', 'nombre', 'empresa_id', 'presupuesto_estimado', 'estado',
            'fecha_inicio', 'fecha_fin', 'descripcion', 'created_at', 'updated_at'
        ],
        terceros: [
            'id', 'nombre', 'tipo', 'nit_cedula', 'telefono', 'email',
            'direccion', 'created_at', 'updated_at'
        ],
        deudas_cajas: [
            'id', 'caja_deudora_id', 'caja_acreedora_id', 'monto_original',
            // 'descripcion' no estaba aquí ni existía como columna: el concepto
            // del préstamo se perdía en el siguiente pull. Ver migración 002.
            'monto_pendiente', 'fecha_prestamo', 'estado', 'descripcion', 'pagos',
            'usuario_nombre', 'created_at'
        ],
        deudas_terceros: [
            'id', 'tercero_id', 'proyecto_id', 'empresa_id', 'monto_original',
            'monto_pendiente', 'fecha_deuda', 'estado', 'descripcion', 'pagos', 'usuario_nombre', 'created_at'
        ],
        categorias: [
            'id', 'nombre', 'tipo', 'created_at'
        ]
    };

    const allowedFields = tableFields[tabla];
    if (!allowedFields) {
        throw new Error(`Tabla sin whitelist de columnas: ${tabla}`);
    }

    const result = {};
    for (const field of allowedFields) {
        if (prepared[field] !== undefined) {
            result[field] = prepared[field];
        }
    }

    // Set sincronizado to true for transacciones
    if (tabla === 'transacciones') {
        result.sincronizado = true;
    }

    return result;
}

// ============== BANDEJA DE ERRORES (C7) ==============

function leerPayload(crudo) {
    try {
        return JSON.parse(crudo);
    } catch {
        return null;
    }
}

/**
 * Operaciones que la nube rechazó y esperan una decisión del usuario.
 * `datos` es el payload ya interpretado (objeto, o null si está dañado);
 * `mensaje` es para el usuario; `codigo` y `detalle`, para soporte.
 * @returns {Promise<Array<{ id: number, tabla: string, operacion: string, datos: object|null,
 *   codigo: string, mensaje: string, fecha: string, tipo: string, detalle: string }>>}
 */
export async function listarErroresSync() {
    const filas = await db.sync_errores.orderBy('id').toArray();
    return filas.map((fila) => ({
        id: fila.id,
        tabla: fila.tabla,
        operacion: fila.operacion,
        datos: leerPayload(fila.datos),
        codigo: fila.codigo,
        mensaje: fila.mensaje,
        fecha: fila.fecha,
        tipo: fila.tipo,
        detalle: fila.detalle,
    }));
}

export function contarErroresSync() {
    return db.sync_errores.count();
}

// datos-3: un `cajas UPDATE` superado (después subió otro de la misma caja,
// ver marcarSaldosSuperados) no puede volver con su saldo absoluto viejo:
// el reintento viaja solo, después de todo lo confirmado, y dejaba la nube
// con el saldo anterior. Se envía el saldo local vigente (nube + pendiente
// después del pull) o, si la caja ya no existe aquí, sin saldo.
async function payloadParaReintento(fallo) {
    if (fallo.tabla !== 'cajas' || fallo.operacion !== 'UPDATE' || !fallo.saldo_superado) return fallo.datos;
    const payload = leerPayload(fallo.datos);
    if (!payload?.id || payload.saldo_actual === undefined) return fallo.datos;
    const caja = await db.cajas.get(payload.id);
    if (caja) {
        payload.saldo_actual = caja.saldo_actual;
    } else {
        delete payload.saldo_actual;
    }
    return JSON.stringify(payload);
}

// Vuelve a su puesto ORIGINAL en la cola (mismo id): así un padre y su hijo
// reintentados en cualquier orden se envían en el orden en que se crearon.
async function devolverACola(ids) {
    return db.transaction('rw', db.sync_queue, db.sync_errores, db.cajas, async () => {
        let devueltas = 0;
        for (const id of ids) {
            const fallo = await db.sync_errores.get(id);
            if (!fallo) continue;
            const registro = {
                tabla: fallo.tabla,
                operacion: fallo.operacion,
                datos: await payloadParaReintento(fallo),
                timestamp: fallo.timestamp ?? fallo.fecha,
            };
            const puestoLibre = fallo.cola_id != null && !(await db.sync_queue.get(fallo.cola_id));
            await db.sync_queue.add(puestoLibre ? { id: fallo.cola_id, ...registro } : registro);
            await db.sync_errores.delete(id);
            devueltas++;
        }
        return devueltas;
    });
}

async function sincronizarSiHayConexion() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return null;
    return processSyncQueue();
}

/**
 * Devuelve la operación a la cola y, si hay conexión, intenta subirla.
 * Si vuelve a fallar, reaparece en la bandeja (con otro id).
 * @returns {Promise<{ reencolada: boolean, resultado: object|null }>}
 */
export async function reintentarErrorSync(id) {
    const devueltas = await devolverACola([id]);
    if (devueltas === 0) return { reencolada: false, resultado: null };
    return { reencolada: true, resultado: await sincronizarSiHayConexion() };
}

/** Reintenta toda la bandeja (útil tras aplicar una migración que faltaba). */
export async function reintentarTodosErroresSync() {
    const ids = await db.sync_errores.toCollection().primaryKeys();
    const devueltas = await devolverACola(ids);
    if (devueltas === 0) return { reencolada: false, resultado: null };
    return { reencolada: true, resultado: await sincronizarSiHayConexion() };
}

/**
 * Descarta definitivamente un cambio rechazado. La interfaz debe pedir
 * confirmación antes: después del siguiente pull, el dispositivo queda como
 * la nube, sin ese cambio. Si es el alta de un movimiento, los ajustes de
 * saldo que lo precedían ya subieron y se quedan (ver
 * ajustesQueQuedanAlDescartar).
 */
export async function descartarErrorSync(id) {
    await db.sync_errores.delete(id);
}

/**
 * Ajustes de saldo que ya están en la nube y que NO se deshacen al descartar
 * el alta de un movimiento rechazado (datos-5).
 *
 * Los `cajas UPDATE` de un movimiento van en la cola justo antes de su
 * INSERT y suben aunque el INSERT falle después (una obra borrada en otro
 * dispositivo, 23503). Descartar el INSERT deja la caja con el ajuste y sin
 * movimiento que lo explique, así que el diálogo de descarte debe decirlo y
 * sugerir un movimiento de ajuste. No se compensa solo: si el ajuste también
 * quedó en la bandeja o lo pisó un saldo posterior, compensar descuadraría
 * la caja al revés.
 *
 * @param {number} id id de la fila en sync_errores
 * @returns {Promise<Array<{ cajaId: string, cajaNombre: string|null, delta: number }>>}
 *   vacío si no es el alta de un movimiento o si ningún ajuste subió
 */
export async function ajustesQueQuedanAlDescartar(id) {
    const fallo = await db.sync_errores.get(id);
    if (!fallo || fallo.tabla !== 'transacciones' || fallo.operacion !== 'INSERT') return [];

    const ajustes = efectoEnSaldos(leerPayload(fallo.datos)).filter(({ delta }) => !esCero(delta));
    if (ajustes.length === 0) return [];

    // Un ajuste que también está en la bandeja no subió: no queda nada que advertir de esa caja.
    const sinSubir = new Set();
    if (fallo.cola_id != null) {
        const desde = fallo.cola_id - ajustes.length;
        const vecinos = await db.sync_errores
            .where('tabla').equals('cajas')
            .filter((f) => f.operacion === 'UPDATE' && f.cola_id != null && f.cola_id >= desde && f.cola_id < fallo.cola_id)
            .toArray();
        for (const vecino of vecinos) {
            const cajaId = leerPayload(vecino.datos)?.id;
            if (cajaId) sinSubir.add(cajaId);
        }
    }

    const resultado = [];
    for (const { cajaId, delta } of ajustes) {
        if (sinSubir.has(cajaId)) continue;
        const caja = await db.cajas.get(cajaId);
        resultado.push({ cajaId, cajaNombre: caja?.nombre ?? null, delta });
    }
    return resultado;
}

/**
 * Avisa cada vez que cambian sync_queue o sync_errores, venga el cambio de
 * donde venga (outbox de los casos de uso, paneles, otra pestaña).
 * El callback recibe { pendientes, errores }; se llama una vez al suscribirse.
 * @param {(estado: { pendientes: number, errores: number }) => void} callback
 * @returns {() => void} desuscribir
 */
export function suscribirCambiosCola(callback) {
    const suscripcion = liveQuery(async () => ({
        pendientes: await db.sync_queue.count(),
        errores: await db.sync_errores.count(),
    })).subscribe({
        next: (estado) => {
            try {
                callback(estado);
            } catch (error) {
                console.error('Error en un suscriptor de la cola de sincronización:', error);
            }
        },
        error: (error) => console.error('No se pudo observar la cola de sincronización:', error),
    });
    return () => suscripcion.unsubscribe();
}

// ============== API heredada ==============

/**
 * @deprecated usar los casos de uso de src/application/movimientos vía src/app/contenedor.js
 */
export async function createTransaction(transactionData) {
    const id = generateUUID();
    const now = new Date().toISOString();

    const transaction = {
        id,
        ...transactionData,
        sincronizado: false,
        created_at: now
    };

    // Save to local IndexedDB
    await db.transacciones.add(transaction);

    // Update caja balances locally (regla única de dominio, ver
    // docs/DOMINIO.md); los UPDATE de caja quedan encolados antes del
    // INSERT de la transacción, como exige el orden de la cola.
    await aplicadorDeAjustes.aplicar(efectoEnSaldos(transaction), { payload: 'parcial' });

    // Add to sync queue
    await addToSyncQueue('transacciones', 'INSERT', transaction);

    // Try to sync immediately if online
    if (navigator.onLine) {
        await processSyncQueue();
    }

    return transaction;
}

// Get pending sync count
export async function getPendingSyncCount() {
    return await db.sync_queue.count();
}

// Get all transactions
export async function getTransactions(filters = {}) {
    let query = db.transacciones.orderBy('created_at').reverse();

    if (filters.proyecto_id) {
        query = query.filter(t => t.proyecto_id === filters.proyecto_id);
    }

    if (filters.caja_id) {
        query = query.filter(t =>
            t.caja_origen_id === filters.caja_id || t.caja_destino_id === filters.caja_id
        );
    }

    return await query.toArray();
}

// Get inter-caja debts (préstamos pendientes)
export async function getIntercajaDebts() {
    const transferencias = await db.transacciones
        .where('tipo_movimiento')
        .equals('TRANSFERENCIA')
        .toArray();

    const cajas = await db.cajas.toArray();
    const cajaMap = Object.fromEntries(cajas.map(c => [c.id, c]));

    // Group by caja pairs
    const debts = {};

    for (const t of transferencias) {
        if (t.categoria === 'Prestamo' && t.caja_origen_id && t.caja_destino_id) {
            const key = `${t.caja_origen_id}-${t.caja_destino_id}`;
            const reverseKey = `${t.caja_destino_id}-${t.caja_origen_id}`;

            if (debts[reverseKey]) {
                debts[reverseKey].monto -= t.monto;
            } else if (debts[key]) {
                debts[key].monto += t.monto;
            } else {
                debts[key] = {
                    caja_origen: cajaMap[t.caja_origen_id]?.nombre || 'Desconocida',
                    caja_destino: cajaMap[t.caja_destino_id]?.nombre || 'Desconocida',
                    monto: t.monto
                };
            }
        }
    }

    // Filter out settled debts
    return Object.values(debts).filter(d => d.monto !== 0);
}

// Force sync all pending operations
export async function forceSync() {
    return await processSyncQueue();
}

/**
 * @deprecated usar los casos de uso de src/application/movimientos vía src/app/contenedor.js
 */
export async function updateTransaction(id, updateData) {
    const original = await db.transacciones.get(id);
    if (!original) return null;

    const updatedTransaction = { ...original, ...updateData, updated_at: new Date().toISOString() };
    await db.transacciones.update(id, updateData);

    // Add to sync queue
    await addToSyncQueue('transacciones', 'UPDATE', updatedTransaction);

    // Try to sync immediately if online
    if (navigator.onLine) {
        await processSyncQueue();
    }

    return updatedTransaction;
}

/**
 * @deprecated usar los casos de uso de src/application/movimientos vía src/app/contenedor.js
 */
export async function deleteTransaction(transactionData) {
    const t = transactionData;

    // Reverse the balance changes locally (regla única de dominio)
    await aplicadorDeAjustes.aplicar(efectoDeBorrado(t), { payload: 'parcial' });

    // Delete from local DB
    await db.transacciones.delete(t.id);

    // Add to sync queue
    await addToSyncQueue('transacciones', 'DELETE', { id: t.id });

    // Try to sync immediately if online
    if (navigator.onLine) {
        await processSyncQueue();
    }
}

// Delete any entity with offline support (for AdminPanel)
export async function deleteEntity(tabla, id) {
    // Delete from local DB
    await db[tabla].delete(id);

    // Add to sync queue
    await addToSyncQueue(tabla, 'DELETE', { id });

    // Try to sync immediately if online
    if (navigator.onLine) {
        await processSyncQueue();
    }
}

// ============== DEUDAS CAJAS (Inter-box debts) ==============

// Create inter-box debt with sync support
export async function createDeudaCajas(deudaData) {
    const id = generateUUID();
    const now = new Date().toISOString();

    const deuda = {
        id,
        ...deudaData,
        pagos: deudaData.pagos || [],
        created_at: now
    };

    // Save locally
    await db.deudas_cajas.add(deuda);

    // Add to sync queue
    await addToSyncQueue('deudas_cajas', 'INSERT', deuda);

    // Try to sync immediately if online
    if (navigator.onLine) {
        await processSyncQueue();
    }

    return deuda;
}

// Update inter-box debt with sync support
export async function updateDeudaCajas(id, updateData) {
    const deuda = await db.deudas_cajas.get(id);
    if (!deuda) return null;

    const updatedDeuda = { ...deuda, ...updateData };
    await db.deudas_cajas.update(id, updateData);

    // Add to sync queue
    await addToSyncQueue('deudas_cajas', 'UPDATE', updatedDeuda);

    if (navigator.onLine) {
        await processSyncQueue();
    }

    return updatedDeuda;
}

// ============== DEUDAS TERCEROS (Supplier debts) ==============

// Create supplier debt with sync support
export async function createDeudaTerceros(deudaData) {
    const id = generateUUID();
    const now = new Date().toISOString();

    const deuda = {
        id,
        ...deudaData,
        pagos: deudaData.pagos || [],
        created_at: now
    };

    // Save locally
    await db.deudas_terceros.add(deuda);

    // Add to sync queue
    await addToSyncQueue('deudas_terceros', 'INSERT', deuda);

    // Try to sync immediately if online
    if (navigator.onLine) {
        await processSyncQueue();
    }

    return deuda;
}

// Update supplier debt with sync support
export async function updateDeudaTerceros(id, updateData) {
    const deuda = await db.deudas_terceros.get(id);
    if (!deuda) return null;

    const updatedDeuda = { ...deuda, ...updateData };
    await db.deudas_terceros.update(id, updateData);

    // Add to sync queue
    await addToSyncQueue('deudas_terceros', 'UPDATE', updatedDeuda);

    if (navigator.onLine) {
        await processSyncQueue();
    }

    return updatedDeuda;
}

export default {
    createTransaction,
    updateTransaction,
    deleteTransaction,
    deleteEntity,
    getTransactions,
    getPendingSyncCount,
    processSyncQueue,
    reapplyPendingOperations,
    getIntercajaDebts,
    forceSync,
    createDeudaCajas,
    updateDeudaCajas,
    createDeudaTerceros,
    updateDeudaTerceros,
    listarErroresSync,
    contarErroresSync,
    reintentarErrorSync,
    reintentarTodosErroresSync,
    descartarErrorSync,
    ajustesQueQuedanAlDescartar,
    suscribirCambiosCola
};
