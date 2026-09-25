// Regla central del sistema (ver docs/DOMINIO.md, "Tipos de movimiento y su
// efecto en los saldos"). Único lugar donde vive esta lógica: hoy está
// copiada en cinco componentes distintos, cada uno con su variante.
import { aMonto } from '../value-objects/dinero';
import { TIPO_MOVIMIENTO } from '../value-objects/tipoMovimiento';

/** @typedef {{ cajaId: string, delta: number }} AjusteSaldo */

/**
 * Calcula los ajustes de saldo que produce un movimiento, en el orden en que
 * deben aplicarse. No valida el movimiento (usa `validarMovimiento` antes) y
 * no consolida varias entradas de la misma caja: eso es responsabilidad de
 * quien aplique los ajustes.
 * @param {object|null|undefined} movimiento fila Dexie (snake_case)
 * @returns {AjusteSaldo[]}
 */
export function efectoEnSaldos(movimiento) {
    if (!movimiento) return [];

    const m = aMonto(movimiento.monto);
    const origen = movimiento.caja_origen_id;
    const destino = movimiento.caja_destino_id;

    switch (movimiento.tipo_movimiento) {
        case TIPO_MOVIMIENTO.INGRESO:
            return origen ? [{ cajaId: origen, delta: m || 0 }] : [];

        case TIPO_MOVIMIENTO.EGRESO:
            return origen ? [{ cajaId: origen, delta: -m || 0 }] : [];

        case TIPO_MOVIMIENTO.TRANSFERENCIA: {
            const ajustes = [];
            if (origen) ajustes.push({ cajaId: origen, delta: -m || 0 });
            if (destino) ajustes.push({ cajaId: destino, delta: m || 0 });
            return ajustes;
        }

        default:
            return [];
    }
}

/**
 * Invierte una lista de ajustes, en el mismo orden, negando cada delta.
 * @param {AjusteSaldo[]} ajustes
 * @returns {AjusteSaldo[]}
 */
export function revertirAjustes(ajustes) {
    return ajustes.map((ajuste) => ({ cajaId: ajuste.cajaId, delta: -ajuste.delta || 0 }));
}

/**
 * Ajustes para deshacer el efecto de un movimiento borrado.
 * @param {object|null|undefined} movimiento
 * @returns {AjusteSaldo[]}
 */
export function efectoDeBorrado(movimiento) {
    return revertirAjustes(efectoEnSaldos(movimiento));
}

/**
 * Ajustes para pasar del efecto de `original` al de `actualizado`: primero
 * revierte el original, luego aplica el actualizado, en ese orden.
 * @param {object|null|undefined} original
 * @param {object|null|undefined} actualizado
 * @returns {AjusteSaldo[]}
 */
export function efectoDeEdicion(original, actualizado) {
    return [...efectoDeBorrado(original), ...efectoEnSaldos(actualizado)];
}
