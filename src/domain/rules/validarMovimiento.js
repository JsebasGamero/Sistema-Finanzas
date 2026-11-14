// Validación de un movimiento antes de persistirlo.
import { esTipoMovimiento, TIPO_MOVIMIENTO } from '../value-objects/tipoMovimiento';
import { claveDiaDeDate, fechaLocal } from '../value-objects/fecha';

/** @typedef {{ campo: string, codigo: string, mensaje: string }} ErrorValidacion */

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ¿Es un día real del calendario en formato 'YYYY-MM-DD'? '2026-02-30' tiene
 * el formato pero no existe: el Date lo desborda a marzo y deja de coincidir.
 */
function esFechaDeCalendario(valor) {
    if (typeof valor !== 'string' || !FORMATO_FECHA.test(valor)) return false;
    const fecha = fechaLocal(valor);
    return fecha !== null && claveDiaDeDate(fecha) === valor;
}

/**
 * Valida un movimiento contra las reglas de docs/DOMINIO.md.
 * @param {object} movimiento fila Dexie (snake_case)
 * @returns {ErrorValidacion[]} vacío si es válido
 */
export function validarMovimiento(movimiento) {
    const errores = [];

    if (!esTipoMovimiento(movimiento?.tipo_movimiento)) {
        errores.push({
            campo: 'tipo_movimiento',
            codigo: 'TIPO_INVALIDO',
            mensaje: 'Tipo de movimiento no válido.',
        });
    }

    // Bug C18: la UI dejaba pasar monto 0 y Supabase lo rechazaba en
    // silencio con `CHECK (monto > 0)`; el movimiento se perdía sin avisar
    // al usuario. Se valida aquí para que el error se muestre antes de
    // intentar persistir.
    if (!Number.isFinite(Number(movimiento?.monto)) || Number(movimiento?.monto) <= 0) {
        errores.push({
            campo: 'monto',
            codigo: 'MONTO_INVALIDO',
            mensaje: 'El monto debe ser mayor a 0.',
        });
    }

    // Bug MOV-2: con la fecha borrada en el selector llegaba `fecha: ''`.
    // Postgres la rechaza (22007, HTTP 400), la cola la descartaba como
    // permanente y el `cajas UPDATE` que se había encolado antes ya había
    // subido: la caja de la nube quedaba con el monto aplicado y sin el
    // movimiento que lo explica.
    if (!movimiento?.fecha) {
        errores.push({
            campo: 'fecha',
            codigo: 'FECHA_REQUERIDA',
            mensaje: 'Elige la fecha del movimiento.',
        });
    } else if (!esFechaDeCalendario(movimiento.fecha)) {
        errores.push({
            campo: 'fecha',
            codigo: 'FECHA_INVALIDA',
            mensaje: 'La fecha no es válida. Elige el día en el calendario.',
        });
    }

    if (!movimiento?.caja_origen_id) {
        errores.push({
            campo: 'caja_origen_id',
            codigo: 'CAJA_ORIGEN_REQUERIDA',
            mensaje: 'Elige la caja del movimiento.',
        });
    }

    if (movimiento?.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA) {
        if (!movimiento?.caja_destino_id) {
            errores.push({
                campo: 'caja_destino_id',
                codigo: 'CAJA_DESTINO_REQUERIDA',
                mensaje: 'Una transferencia necesita caja destino. Elige a dónde va el dinero.',
            });
        } else if (movimiento.caja_destino_id === movimiento.caja_origen_id) {
            errores.push({
                campo: 'caja_destino_id',
                codigo: 'CAJAS_IGUALES',
                mensaje: 'La caja origen y la caja destino deben ser diferentes.',
            });
        }
    }

    return errores;
}
