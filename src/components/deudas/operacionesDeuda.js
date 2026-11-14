// Operaciones de deudas sobre la base local (Dexie) y la cola de sync.
//
// Cada operación hace TODAS sus escrituras locales dentro de una sola
// transacción Dexie: la deuda, los ajustes de saldo (que encolan los UPDATE
// de caja), el movimiento y sus encolados. Antes se hacían por partes, con
// `await processSyncQueue()` en medio y los saldos al final (DEU-1, DEU-7): si
// la app se cerraba durante la subida, el abono quedaba registrado sin mover
// las cajas, y un segundo toque durante esa espera movía el dinero dos veces.
// Ahora o se guarda todo o no se guarda nada, y la validación se hace contra
// la fila guardada, no contra la copia de la pantalla.
//
// Dentro de la transacción solo se espera a Dexie (nunca a la red): por eso
// la sincronización se lanza al final, en segundo plano. Nadie aquí marca
// `sincronizado: true` (DEU-6): solo processSyncQueue, cuando la subida sale
// bien.
//
// Pendiente: mover a src/application/deudas como casos de uso con puertos y
// tests de dobles en memoria (porción 3 de la Fase 3). Las reglas puras ya
// están separadas en reglasDeuda.js.
import { db, generateUUID } from '../../services/db';
import { addToSyncQueue, processSyncQueue } from '../../services/syncService';
import { aplicarEfectoEnSaldos } from '../../app/contenedor';
import { validarMovimiento } from '../../domain/rules/validarMovimiento';
import { CATEGORIA_DEUDA } from '../../domain/rules/movimientoDeDeuda';
import { MovimientoInvalidoError } from '../../domain/errores';
import { TIPO_MOVIMIENTO } from '../../domain/value-objects/tipoMovimiento';
import { aMonto } from '../../domain/value-objects/dinero';
import { hoyLocal } from '../../domain/value-objects/fecha';
import {
    aplicarAbono,
    buscarMovimientoDeAbono,
    buscarMovimientoDePrestamo,
    cajasDelMovimiento,
    clavePago,
    movimientoInverso,
    pagosDe,
    quitarUltimoAbono,
    validarAbono,
} from './reglasDeuda';

/** Error con un mensaje pensado para mostrarse tal cual al usuario. */
export class OperacionDeudaError extends Error {
    constructor(mensaje) {
        super(mensaje);
        this.name = 'OperacionDeudaError';
    }
}

/** Mensaje para la interfaz a partir de cualquier error de estas operaciones. */
export function mensajeDeError(error, respaldo) {
    if (error instanceof OperacionDeudaError || error instanceof MovimientoInvalidoError) return error.message;
    return respaldo;
}

const ahora = () => new Date().toISOString();

const TABLAS = {
    cajas: () => ({ tabla: db.deudas_cajas, nombre: 'deudas_cajas' }),
    terceros: () => ({ tabla: db.deudas_terceros, nombre: 'deudas_terceros' }),
};

function tablaDe(tipoDeuda) {
    const crear = TABLAS[tipoDeuda];
    if (!crear) throw new Error(`Tipo de deuda desconocido: ${tipoDeuda}`);
    return crear();
}

/** Lanza la subida sin esperarla: el usuario ya ve su cambio en la base local. */
export function sincronizarEnSegundoPlano() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    processSyncQueue().catch((error) => console.error('No se pudo sincronizar:', error));
}

function validarOLanzar(movimiento) {
    const errores = validarMovimiento(movimiento);
    if (errores.length > 0) throw new MovimientoInvalidoError(errores);
}

/** Ids de las cajas que ya no existen en la base local. */
async function cajasFaltantes(ids) {
    const faltan = [];
    for (const id of ids) {
        if (!id || !(await db.cajas.get(id))) faltan.push(id ?? null);
    }
    return faltan;
}

async function candidatosDeAbono(tipoDeuda, deuda, pago) {
    if (pago?.transaccion_id) {
        const enlazado = await db.transacciones.get(pago.transaccion_id);
        return enlazado ? [enlazado] : [];
    }
    if (tipoDeuda === 'cajas') {
        return db.transacciones
            .where('tipo_movimiento').equals(TIPO_MOVIMIENTO.TRANSFERENCIA)
            .filter((t) => t.categoria === CATEGORIA_DEUDA.ABONO_PRESTAMO_CAJAS)
            .toArray();
    }
    if (!deuda?.tercero_id) return [];
    return db.transacciones
        .where('tercero_id').equals(deuda.tercero_id)
        .filter((t) => t.categoria === CATEGORIA_DEUDA.ABONO_DEUDA_TERCERO)
        .toArray();
}

async function candidatosDePrestamo(deuda) {
    const enlazado = await db.transacciones.get(deuda.id);
    if (enlazado) return [enlazado];
    return db.transacciones
        .where('tipo_movimiento').equals(TIPO_MOVIMIENTO.TRANSFERENCIA)
        .filter((t) => t.categoria === CATEGORIA_DEUDA.PRESTAMO_ENTRE_CAJAS)
        .toArray();
}

// Revierte un movimiento con la regla única de saldos y lo borra, todo dentro
// de la transacción del llamador.
async function revertirYBorrarMovimiento(tx) {
    await aplicarEfectoEnSaldos(movimientoInverso(tx), { payload: 'parcial' });
    await db.transacciones.delete(tx.id);
    await addToSyncQueue('transacciones', 'DELETE', { id: tx.id });
}

// ------------------------------------------------------------------
// Préstamos entre cajas
// ------------------------------------------------------------------

/**
 * Registra un préstamo: la deuda y la TRANSFERENCIA de la caja que presta a
 * la que recibe. La TRANSFERENCIA usa el mismo id que la deuda: así queda
 * enlazada sin columna nueva y se puede revertir al eliminar el préstamo
 * (son tablas distintas, los ids no chocan).
 */
export async function crearPrestamoEntreCajas({ cajaAcreedoraId, cajaDeudoraId, monto, descripcion, usuarioNombre }) {
    const id = generateUUID();
    const momento = ahora();
    const fecha = hoyLocal();
    const valor = aMonto(monto);
    let deuda;

    await db.transaction('rw', db.deudas_cajas, db.transacciones, db.cajas, db.sync_queue, async () => {
        const acreedora = cajaAcreedoraId ? await db.cajas.get(cajaAcreedoraId) : null;
        const deudora = cajaDeudoraId ? await db.cajas.get(cajaDeudoraId) : null;
        if (!acreedora || !deudora) {
            throw new OperacionDeudaError('Una de las cajas ya no existe. Vuelve a elegirlas.');
        }

        const concepto = descripcion?.trim() || `Préstamo de ${acreedora.nombre} a ${deudora.nombre}`;
        const transaccion = {
            id,
            fecha,
            descripcion: concepto,
            monto: valor,
            tipo_movimiento: TIPO_MOVIMIENTO.TRANSFERENCIA,
            categoria: CATEGORIA_DEUDA.PRESTAMO_ENTRE_CAJAS,
            proyecto_id: null,
            caja_origen_id: acreedora.id,
            caja_destino_id: deudora.id,
            tercero_id: null,
            sincronizado: false,
            usuario_nombre: usuarioNombre,
            created_at: momento,
        };
        // Invariante 7: cajas distintas y monto > 0, antes de escribir nada.
        validarOLanzar(transaccion);

        deuda = {
            id,
            caja_deudora_id: deudora.id,
            caja_acreedora_id: acreedora.id,
            monto_original: valor,
            monto_pendiente: valor,
            fecha_prestamo: fecha,
            estado: 'PENDIENTE',
            descripcion: concepto,
            pagos: [],
            usuario_nombre: usuarioNombre,
            created_at: momento,
        };

        await db.deudas_cajas.add(deuda);
        await addToSyncQueue('deudas_cajas', 'INSERT', deuda);
        // Ajustes parciales ({ id, saldo_actual }): la fila completa reescribía
        // en la nube el nombre o la empresa de la caja con la copia local (DEU-16).
        await aplicarEfectoEnSaldos(transaccion, { payload: 'parcial' });
        await db.transacciones.add(transaccion);
        await addToSyncQueue('transacciones', 'INSERT', transaccion);
    });

    sincronizarEnSegundoPlano();
    return deuda;
}

/** Registra un abono de la caja deudora a la acreedora. */
export async function abonarPrestamoEntreCajas({ deudaId, monto, usuarioNombre }) {
    const valor = aMonto(monto);
    let resultado;

    await db.transaction('rw', db.deudas_cajas, db.transacciones, db.cajas, db.sync_queue, async () => {
        const deuda = await db.deudas_cajas.get(deudaId);
        if (!deuda) {
            throw new OperacionDeudaError('Este préstamo ya no existe. Puede que lo hayan eliminado desde otro dispositivo.');
        }
        const invalido = validarAbono(deuda, valor);
        if (invalido) throw new OperacionDeudaError(invalido);

        // Invariante 7: con una caja borrada, la TRANSFERENCIA solo sumaría al
        // destino y fabricaría dinero (DEU-12).
        const deudora = deuda.caja_deudora_id ? await db.cajas.get(deuda.caja_deudora_id) : null;
        const acreedora = deuda.caja_acreedora_id ? await db.cajas.get(deuda.caja_acreedora_id) : null;
        if (!deudora || !acreedora) {
            throw new OperacionDeudaError('Una de las cajas de este préstamo fue eliminada. No se puede abonar sin descuadrar los saldos.');
        }

        const momento = ahora();
        const transaccionId = generateUUID();
        const transaccion = {
            id: transaccionId,
            fecha: hoyLocal(),
            descripcion: `Abono de préstamo: ${deudora.nombre} a ${acreedora.nombre}`,
            monto: valor,
            tipo_movimiento: TIPO_MOVIMIENTO.TRANSFERENCIA,
            categoria: CATEGORIA_DEUDA.ABONO_PRESTAMO_CAJAS,
            proyecto_id: null,
            caja_origen_id: deudora.id,
            caja_destino_id: acreedora.id,
            tercero_id: null,
            sincronizado: false,
            usuario_nombre: usuarioNombre,
            created_at: momento,
        };
        validarOLanzar(transaccion);

        // `transaccion_id` enlaza el abono con su movimiento (JSONB, sin esquema
        // nuevo) para poder anularlo y, más adelante, deduplicarlo en el servidor.
        const pago = { id: generateUUID(), monto: valor, fecha: momento, transaccion_id: transaccionId, usuario_nombre: usuarioNombre };
        const cambios = { ...aplicarAbono(deuda, pago), updated_at: momento };

        await db.deudas_cajas.update(deudaId, cambios);
        // Solo los campos que cambian: la fila completa reescribía en la nube
        // descripción, cajas y fechas con la copia local (DEU-3).
        await addToSyncQueue('deudas_cajas', 'UPDATE', { id: deudaId, ...cambios });
        await aplicarEfectoEnSaldos(transaccion, { payload: 'parcial' });
        await db.transacciones.add(transaccion);
        await addToSyncQueue('transacciones', 'INSERT', transaccion);

        resultado = { deuda: { ...deuda, ...cambios }, transaccion };
    });

    sincronizarEnSegundoPlano();
    return resultado;
}

// ------------------------------------------------------------------
// Cuentas por pagar a proveedores
// ------------------------------------------------------------------

/** Crea un proveedor desde el formulario de deuda (sin salir del panel). */
export async function crearProveedor(nombre) {
    const limpio = String(nombre ?? '').trim();
    if (!limpio) throw new OperacionDeudaError('Escribe el nombre del proveedor.');
    const momento = ahora();
    const tercero = {
        id: generateUUID(),
        nombre: limpio,
        tipo: 'Proveedor', // CHECK de terceros.tipo: 'Proveedor' | 'Empleado' | 'Contratista'
        nit_cedula: '',
        telefono: '',
        created_at: momento,
        updated_at: momento,
    };
    await db.transaction('rw', db.terceros, db.sync_queue, async () => {
        await db.terceros.add(tercero);
        await addToSyncQueue('terceros', 'INSERT', tercero);
    });
    sincronizarEnSegundoPlano();
    return tercero;
}

/** Registra una deuda con un proveedor. No mueve dinero. */
export async function crearDeudaTercero({ terceroId, empresaId, proyectoId, monto, fechaDeuda, descripcion, usuarioNombre }) {
    const valor = aMonto(monto);
    if (!(valor > 0)) throw new OperacionDeudaError('Escribe un monto mayor a 0.');
    let deuda;

    await db.transaction('rw', db.deudas_terceros, db.terceros, db.sync_queue, async () => {
        const tercero = terceroId ? await db.terceros.get(terceroId) : null;
        if (!tercero) throw new OperacionDeudaError('Elige un proveedor de la lista o créalo.');

        deuda = {
            id: generateUUID(),
            tercero_id: tercero.id,
            empresa_id: empresaId || null,
            proyecto_id: proyectoId || null,
            monto_original: valor,
            monto_pendiente: valor,
            fecha_deuda: fechaDeuda || hoyLocal(),
            estado: 'PENDIENTE',
            descripcion: descripcion?.trim() || `Deuda con ${tercero.nombre}`,
            pagos: [],
            usuario_nombre: usuarioNombre,
            created_at: ahora(),
        };
        await db.deudas_terceros.add(deuda);
        await addToSyncQueue('deudas_terceros', 'INSERT', deuda);
    });

    sincronizarEnSegundoPlano();
    return deuda;
}

/** Registra un abono a un proveedor: EGRESO de la caja elegida. */
export async function abonarDeudaTercero({ deudaId, monto, cajaId, descripcion, usuarioNombre }) {
    const valor = aMonto(monto);
    let resultado;

    await db.transaction('rw', db.deudas_terceros, db.terceros, db.transacciones, db.cajas, db.sync_queue, async () => {
        const deuda = await db.deudas_terceros.get(deudaId);
        if (!deuda) {
            throw new OperacionDeudaError('Esta deuda ya no existe. Puede que la hayan eliminado desde otro dispositivo.');
        }
        const invalido = validarAbono(deuda, valor);
        if (invalido) throw new OperacionDeudaError(invalido);

        const caja = cajaId ? await db.cajas.get(cajaId) : null;
        if (!caja) throw new OperacionDeudaError('Elige la caja de donde sale el abono.');
        const tercero = deuda.tercero_id ? await db.terceros.get(deuda.tercero_id) : null;
        const nombreTercero = tercero?.nombre || 'proveedor';
        const concepto = descripcion?.trim() || '';

        const momento = ahora();
        const transaccionId = generateUUID();
        const transaccion = {
            id: transaccionId,
            fecha: hoyLocal(),
            descripcion: concepto ? `Abono a ${nombreTercero}: ${concepto}` : `Abono a ${nombreTercero}`,
            monto: valor,
            tipo_movimiento: TIPO_MOVIMIENTO.EGRESO,
            categoria: CATEGORIA_DEUDA.ABONO_DEUDA_TERCERO,
            proyecto_id: deuda.proyecto_id || null,
            caja_origen_id: caja.id,
            caja_destino_id: null,
            tercero_id: deuda.tercero_id || null,
            // Sin empresa_id: `transacciones` no tiene esa columna y se perdía
            // en el primer pull. La empresa se deduce de la caja o de la obra.
            sincronizado: false,
            usuario_nombre: usuarioNombre,
            created_at: momento,
        };
        validarOLanzar(transaccion);

        const pago = {
            id: generateUUID(),
            monto: valor,
            fecha: momento,
            descripcion: concepto || 'Abono',
            caja_id: caja.id,
            transaccion_id: transaccionId,
            usuario_nombre: usuarioNombre,
        };
        const cambios = { ...aplicarAbono(deuda, pago), updated_at: momento };

        await db.deudas_terceros.update(deudaId, cambios);
        await addToSyncQueue('deudas_terceros', 'UPDATE', { id: deudaId, ...cambios });
        await aplicarEfectoEnSaldos(transaccion, { payload: 'parcial' });
        await db.transacciones.add(transaccion);
        await addToSyncQueue('transacciones', 'INSERT', transaccion);

        resultado = { deuda: { ...deuda, ...cambios }, transaccion };
    });

    sincronizarEnSegundoPlano();
    return resultado;
}

// ------------------------------------------------------------------
// Anular y eliminar
//
// Los movimientos de una deuda no se editan ni se borran desde Inicio (C8).
// Para corregir un error se anula aquí: el abono y su movimiento, o la deuda y
// la TRANSFERENCIA del préstamo, juntos. Una deuda con abonos no se elimina:
// sus EGRESOS quedarían sin deuda y el reporte de proveedores dejaría de
// contarlos como pagados (DEU-9).
// ------------------------------------------------------------------

/**
 * Qué pasaría al anular el último abono, para mostrarlo antes de confirmar.
 * @returns {Promise<{ deuda: object, pago: object, pendienteDespues: number, movimiento: object|null, cajasFaltantes: string[] }|null>}
 */
export async function analizarAnulacionDeAbono({ tipoDeuda, deudaId }) {
    const { tabla } = tablaDe(tipoDeuda);
    const deuda = await tabla.get(deudaId);
    const quitado = deuda ? quitarUltimoAbono(deuda) : null;
    if (!quitado) return null;
    const candidatos = await candidatosDeAbono(tipoDeuda, deuda, quitado.pago);
    const movimiento = buscarMovimientoDeAbono({ tipoDeuda, deuda, pago: quitado.pago, candidatos });
    const faltan = movimiento ? await cajasFaltantes(cajasDelMovimiento(movimiento)) : [];
    return {
        deuda,
        pago: quitado.pago,
        pendienteDespues: quitado.cambios.monto_pendiente,
        movimiento,
        cajasFaltantes: faltan,
    };
}

/** Anula el último abono: restituye la deuda, revierte saldos y borra su movimiento. */
export async function anularUltimoAbono({ tipoDeuda, deudaId, clave, movimientoId }) {
    const { tabla, nombre } = tablaDe(tipoDeuda);

    await db.transaction('rw', tabla, db.transacciones, db.cajas, db.sync_queue, async () => {
        const deuda = await tabla.get(deudaId);
        const quitado = deuda ? quitarUltimoAbono(deuda) : null;
        // Si el último abono ya no es el que se confirmó (otro toque, otro
        // dispositivo), no se anula nada: se le pide al usuario que revise.
        if (!quitado || clavePago(quitado.pago) !== clave) {
            throw new OperacionDeudaError('Los abonos de esta deuda cambiaron. Revisa el historial e intenta de nuevo.');
        }
        const movimiento = movimientoId ? await db.transacciones.get(movimientoId) : null;
        if (!movimiento) {
            throw new OperacionDeudaError('No se encontró el movimiento de este abono, así que no se puede anular sin descuadrar los saldos.');
        }
        const faltan = await cajasFaltantes(cajasDelMovimiento(movimiento));
        if (faltan.length > 0) {
            throw new OperacionDeudaError('Una de las cajas de este abono fue eliminada. No se puede anular sin descuadrar los saldos.');
        }

        const cambios = { ...quitado.cambios, updated_at: ahora() };
        await tabla.update(deudaId, cambios);
        await addToSyncQueue(nombre, 'UPDATE', { id: deudaId, ...cambios });
        await revertirYBorrarMovimiento(movimiento);
    });

    sincronizarEnSegundoPlano();
}

/**
 * Qué pasaría al eliminar la deuda, para mostrarlo antes de confirmar.
 * @returns {Promise<{ deuda: object, abonos: number, movimiento: object|null, cajasFaltantes: string[] }|null>}
 */
export async function analizarEliminacion({ tipoDeuda, deudaId }) {
    const { tabla } = tablaDe(tipoDeuda);
    const deuda = await tabla.get(deudaId);
    if (!deuda) return null;
    const abonos = pagosDe(deuda).length;
    if (tipoDeuda !== 'cajas' || abonos > 0) {
        return { deuda, abonos, movimiento: null, cajasFaltantes: [] };
    }
    const movimiento = buscarMovimientoDePrestamo({ deuda, candidatos: await candidatosDePrestamo(deuda) });
    const faltan = movimiento ? await cajasFaltantes(cajasDelMovimiento(movimiento)) : [];
    return { deuda, abonos, movimiento, cajasFaltantes: faltan };
}

/**
 * Elimina una deuda sin abonos. En préstamos entre cajas, si se encontró su
 * TRANSFERENCIA y las dos cajas existen, la revierte y la borra también.
 * @returns {Promise<{ movimientoRevertido: boolean }>}
 */
export async function eliminarDeuda({ tipoDeuda, deudaId, movimientoId = null }) {
    const { tabla, nombre } = tablaDe(tipoDeuda);
    let movimientoRevertido = false;

    await db.transaction('rw', tabla, db.transacciones, db.cajas, db.sync_queue, async () => {
        const deuda = await tabla.get(deudaId);
        if (!deuda) return; // ya se eliminó (otro toque u otro dispositivo)
        if (pagosDe(deuda).length > 0) {
            throw new OperacionDeudaError('Esta deuda tiene abonos. Anúlalos primero para no descuadrar saldos ni reportes.');
        }
        if (movimientoId) {
            const movimiento = await db.transacciones.get(movimientoId);
            if (movimiento && (await cajasFaltantes(cajasDelMovimiento(movimiento))).length === 0) {
                await revertirYBorrarMovimiento(movimiento);
                movimientoRevertido = true;
            }
        }
        await tabla.delete(deudaId);
        await addToSyncQueue(nombre, 'DELETE', { id: deudaId });
    });

    sincronizarEnSegundoPlano();
    return { movimientoRevertido };
}
