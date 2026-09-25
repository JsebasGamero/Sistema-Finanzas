// Validación de un movimiento antes de persistirlo.
import { esTipoMovimiento, TIPO_MOVIMIENTO } from '../value-objects/tipoMovimiento';

/** @typedef {{ campo: string, codigo: string, mensaje: string }} ErrorValidacion */

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
