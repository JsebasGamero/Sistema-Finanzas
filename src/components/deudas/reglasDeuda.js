// Reglas puras de las deudas: préstamos entre cajas (deudas_cajas) y cuentas
// por pagar a proveedores (deudas_terceros).
//
// Viven junto a los paneles hasta que las deudas tengan sus propios casos de
// uso en src/application (porción 3 de la Fase 3). No dependen de React ni de
// Dexie: se prueban en reglasDeuda.test.js.
import { aMonto, esCero, estadoDeuda, redondearMonto, restarMontos } from '../../domain/value-objects/dinero';
import { claveDia } from '../../domain/value-objects/fecha';
import { TIPO_MOVIMIENTO } from '../../domain/value-objects/tipoMovimiento';
import { CATEGORIA_DEUDA } from '../../domain/rules/movimientoDeDeuda';
import { formatoMoneda } from '../../presentation/formato';

export const ESTADO_DEUDA = Object.freeze({
    PENDIENTE: 'PENDIENTE',
    PARCIAL: 'PARCIAL',
    PAGADA: 'PAGADA',
});

/** Lista de abonos de una deuda (JSONB `pagos`), siempre como array. */
export function pagosDe(deuda) {
    return Array.isArray(deuda?.pagos) ? deuda.pagos : [];
}

/**
 * Estado calculado con los montos, no leído de la columna `estado`: en datos
 * viejos la columna quedó en PARCIAL por un residuo de coma flotante aunque
 * la deuda estuviera pagada del todo.
 */
export function estadoDe(deuda) {
    return estadoDeuda(aMonto(deuda?.monto_pendiente), aMonto(deuda?.monto_original));
}

/** Lo abonado hasta ahora (nunca negativo). */
export function montoAbonado(deuda) {
    const abonado = restarMontos(aMonto(deuda?.monto_original), aMonto(deuda?.monto_pendiente));
    return abonado > 0 ? abonado : 0;
}

/** Fracción abonada entre 0 y 1, para el medidor. */
export function fraccionAbonada(deuda) {
    const original = aMonto(deuda?.monto_original);
    if (!(original > 0)) return 0;
    return Math.min(1, Math.max(0, montoAbonado(deuda) / original));
}

/**
 * Valida un abono contra lo que queda pendiente.
 * @returns {string|null} mensaje para el usuario, o null si es válido
 */
export function validarAbono(deuda, monto) {
    const m = aMonto(monto);
    if (!(m > 0)) return 'Escribe un monto mayor a 0.';
    const pendiente = aMonto(deuda?.monto_pendiente);
    if (esCero(pendiente)) return 'Esta deuda ya está pagada.';
    if (restarMontos(m, pendiente) > 0) {
        return `El abono no puede superar lo pendiente (${formatoMoneda(pendiente)}).`;
    }
    return null;
}

/**
 * Cambios que produce un abono sobre la deuda. Solo los campos que cambian:
 * se encolan tal cual para no reescribir en la nube el resto de la fila con
 * la copia local (DEU-3).
 * @param {object} deuda fila tal como está guardada
 * @param {{ monto: number }} pago abono nuevo (con id, fecha, transaccion_id...)
 */
export function aplicarAbono(deuda, pago) {
    const pendiente = restarMontos(aMonto(deuda?.monto_pendiente), aMonto(pago?.monto));
    return {
        monto_pendiente: pendiente,
        estado: estadoDeuda(pendiente, aMonto(deuda?.monto_original)),
        pagos: [...pagosDe(deuda), pago],
    };
}

/**
 * Deshace el último abono: devuelve el pago quitado y los cambios de la deuda,
 * o null si no tiene abonos.
 */
export function quitarUltimoAbono(deuda) {
    const pagos = pagosDe(deuda);
    if (pagos.length === 0) return null;
    const pago = pagos[pagos.length - 1];
    const original = aMonto(deuda?.monto_original);
    const sumado = redondearMonto(aMonto(deuda?.monto_pendiente) + aMonto(pago?.monto));
    // Nunca más pendiente que el monto original, aunque los datos viejos no cuadren.
    const pendiente = original > 0 && restarMontos(sumado, original) > 0 ? original : sumado;
    return {
        pago,
        cambios: {
            monto_pendiente: pendiente,
            estado: estadoDeuda(pendiente, original),
            pagos: pagos.slice(0, -1),
        },
    };
}

/** Identificador estable de un abono (los abonos viejos no tienen id). */
export function clavePago(pago) {
    if (pago?.id) return String(pago.id);
    return `${pago?.fecha ?? ''}|${aMonto(pago?.monto)}`;
}

// ------------------------------------------------------------------
// Enlace abono / préstamo con su movimiento
//
// Los abonos nuevos guardan `transaccion_id` y la TRANSFERENCIA de un préstamo
// nuevo usa el mismo id que la deuda. Los datos viejos no tienen ese enlace:
// se reconoce el movimiento por tipo, categoría, cajas, monto y cercanía en el
// tiempo (el panel creaba la deuda o el abono y su movimiento en el mismo
// segundo). Si no hay coincidencia, no se adivina: la operación se bloquea.
// ------------------------------------------------------------------

const VENTANA_MS = 5 * 60 * 1000;

function instante(valor) {
    const n = Date.parse(valor ?? '');
    return Number.isFinite(n) ? n : null;
}

function mismoMonto(a, b) {
    return esCero(restarMontos(aMonto(a), aMonto(b)));
}

function masCercano(candidatos, referencia) {
    let mejor = null;
    let mejorDistancia = Infinity;
    for (const t of candidatos) {
        const momento = instante(t.created_at);
        if (momento === null) continue;
        const distancia = Math.abs(momento - referencia);
        if (distancia <= VENTANA_MS && distancia < mejorDistancia) {
            mejor = t;
            mejorDistancia = distancia;
        }
    }
    return mejor;
}

/**
 * Movimiento que creó un abono.
 * @param {{ tipoDeuda: 'cajas'|'terceros', deuda: object, pago: object, candidatos: object[] }} p
 * @returns {object|null}
 */
export function buscarMovimientoDeAbono({ tipoDeuda, deuda, pago, candidatos }) {
    const lista = (candidatos ?? []).filter(Boolean);
    if (pago?.transaccion_id) return lista.find((t) => t.id === pago.transaccion_id) ?? null;

    const referencia = instante(pago?.fecha);
    if (referencia === null || !deuda) return null;

    const coincide = tipoDeuda === 'cajas'
        ? (t) => t.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA
            && t.categoria === CATEGORIA_DEUDA.ABONO_PRESTAMO_CAJAS
            && t.caja_origen_id === deuda.caja_deudora_id
            && t.caja_destino_id === deuda.caja_acreedora_id
        : (t) => t.tipo_movimiento === TIPO_MOVIMIENTO.EGRESO
            && t.categoria === CATEGORIA_DEUDA.ABONO_DEUDA_TERCERO
            && t.tercero_id === deuda.tercero_id
            && (!pago.caja_id || t.caja_origen_id === pago.caja_id);

    return masCercano(lista.filter((t) => coincide(t) && mismoMonto(t.monto, pago.monto)), referencia);
}

/**
 * TRANSFERENCIA que creó un préstamo entre cajas.
 * @param {{ deuda: object, candidatos: object[] }} p
 * @returns {object|null}
 */
export function buscarMovimientoDePrestamo({ deuda, candidatos }) {
    if (!deuda) return null;
    const lista = (candidatos ?? []).filter(Boolean);
    const esPrestamo = (t) => t.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA
        && t.categoria === CATEGORIA_DEUDA.PRESTAMO_ENTRE_CAJAS;

    const enlazado = lista.find((t) => t.id === deuda.id);
    if (enlazado) return esPrestamo(enlazado) ? enlazado : null;

    const referencia = instante(deuda.created_at);
    if (referencia === null) return null;
    return masCercano(
        lista.filter((t) => esPrestamo(t)
            && t.caja_origen_id === deuda.caja_acreedora_id
            && t.caja_destino_id === deuda.caja_deudora_id
            && mismoMonto(t.monto, deuda.monto_original)),
        referencia
    );
}

/**
 * Movimiento contrario: aplicarlo con la regla de saldos deja las cajas como
 * si el original no hubiera existido (mismo efecto que efectoDeBorrado).
 * Así la anulación pasa por el único escritor de saldos sin una vía nueva.
 */
export function movimientoInverso(tx) {
    if (!tx) return null;
    const monto = aMonto(tx.monto);
    switch (tx.tipo_movimiento) {
        case TIPO_MOVIMIENTO.INGRESO:
            return { tipo_movimiento: TIPO_MOVIMIENTO.EGRESO, monto, caja_origen_id: tx.caja_origen_id ?? null, caja_destino_id: null };
        case TIPO_MOVIMIENTO.EGRESO:
            return { tipo_movimiento: TIPO_MOVIMIENTO.INGRESO, monto, caja_origen_id: tx.caja_origen_id ?? null, caja_destino_id: null };
        case TIPO_MOVIMIENTO.TRANSFERENCIA:
            return {
                tipo_movimiento: TIPO_MOVIMIENTO.TRANSFERENCIA,
                monto,
                caja_origen_id: tx.caja_destino_id ?? null,
                caja_destino_id: tx.caja_origen_id ?? null,
            };
        default:
            return null;
    }
}

/** Ids de las cajas que toca un movimiento. */
export function cajasDelMovimiento(tx) {
    if (!tx) return [];
    const ids = [tx.caja_origen_id];
    if (tx.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA) ids.push(tx.caja_destino_id);
    return ids.filter(Boolean);
}

/** Más recientes primero: por fecha de calendario y, a igual fecha, por creación. */
export function ordenarRecientes(deudas, campoFecha) {
    const clave = (d) => claveDia(d?.[campoFecha]) || claveDia(d?.created_at) || '';
    return [...(deudas ?? [])].sort((a, b) => {
        const fa = clave(a);
        const fb = clave(b);
        if (fa !== fb) return fa < fb ? 1 : -1;
        return (instante(b?.created_at) ?? 0) - (instante(a?.created_at) ?? 0);
    });
}

/**
 * Agrupa por estado y totaliza.
 * @returns {{ pendientes: object[], pagadas: object[], totalPendiente: number, totalAbonado: number, totalOriginal: number }}
 */
export function resumirDeudas(deudas) {
    const pendientes = [];
    const pagadas = [];
    let totalPendiente = 0;
    let totalAbonado = 0;
    let totalOriginal = 0;
    for (const deuda of deudas ?? []) {
        if (estadoDe(deuda) === ESTADO_DEUDA.PAGADA) {
            pagadas.push(deuda);
        } else {
            pendientes.push(deuda);
            totalPendiente += aMonto(deuda.monto_pendiente);
        }
        totalAbonado += montoAbonado(deuda);
        totalOriginal += aMonto(deuda.monto_original);
    }
    return {
        pendientes,
        pagadas,
        totalPendiente: redondearMonto(totalPendiente),
        totalAbonado: redondearMonto(totalAbonado),
        totalOriginal: redondearMonto(totalOriginal),
    };
}

/**
 * Quita un sufijo decimal (',5' o ',00') de un monto escrito o pegado antes
 * de quedarse con los dígitos. Sin esto, '1.500.000,00' pegado desde Excel se
 * guardaba como 150.000.000 (DEU-10). Solo la coma: el punto es el separador
 * de miles del propio campo, y '1.50' aparece al borrar un dígito de '1.500'.
 */
export function quitarDecimales(texto) {
    return String(texto ?? '').replace(/,\d{0,2}$/, '');
}

// Hasta billones de pesos. Lo mismo que acepta el formulario de movimientos.
const MAX_DIGITOS_MONTO = 13;

/**
 * Interpreta un monto pegado o insertado de golpe. quitarDecimales solo
 * entiende la coma, así que "1500000.00" (banca en línea, CSV) o
 * "$1,500,000.00" pegados se guardaban como 150.000.000, y el préstamo movía
 * esa cifra entre las cajas (DEU-10 reabierto).
 *
 * Es la misma regla que interpretarMontoPegado de TransactionForm (MOV-3):
 * acepta "$ 1.234.567", "1,234,567", "1 234 567" y una cola de centavos
 * (",50" o ".50"), que se redondea porque los montos van en pesos enteros.
 * Todo lo demás se rechaza con un mensaje, nunca se adivina. Si esa función
 * pasa a presentation/formato.js, este campo debe usar la de allá.
 * @returns {{ digitos: string, redondeado: boolean } | { error: string }}
 */
export function interpretarMontoPegado(texto) {
    const original = String(texto ?? '');
    const muestra = original.trim().slice(0, 24);
    const noSeReconoce = {
        error: `No se reconoce «${muestra}» como monto. Escribe solo el número, por ejemplo 1.250.000.`,
    };
    const limpio = original
        .replace(/[\s\u00a0\u202f]/g, '')
        .replace(/^COP|COP$/i, '')
        .replace(/\$/g, '');
    if (!limpio || !/^[\d.,]+$/.test(limpio)) return noSeReconoce;

    let entero = limpio;
    let centavos = 0;
    const cola = limpio.match(/^(.*\d)([.,])(\d{1,2})$/);
    if (cola) {
        // "1.500.50" no es un formato: el separador de centavos no puede ser
        // el mismo que el de miles.
        if (cola[1].includes(cola[2])) return noSeReconoce;
        entero = cola[1];
        centavos = Number(`0.${cola[3]}`);
    }
    const miles = /^\d{1,3}(\.\d{3})+$/.test(entero) || /^\d{1,3}(,\d{3})+$/.test(entero);
    if (!/^\d+$/.test(entero) && !miles) return noSeReconoce;

    const digitos = entero.replace(/[.,]/g, '').replace(/^0+(?=\d)/, '');
    if (digitos.length > MAX_DIGITOS_MONTO) {
        return { error: 'El monto es demasiado grande. Revisa la cifra.' };
    }
    return { digitos: String(Math.round(Number(digitos) + centavos)), redondeado: centavos > 0 };
}
