// Regla única para atribuir un movimiento a una empresa (docs/REPORTES.md).
//
// `transacciones` no tiene columna empresa_id: se deduce de la obra (el gasto
// es de la obra, aunque lo pague una caja de otra empresa) y, si no hay obra,
// de la caja de origen. La tabla dinámica usaba primero la caja y el tablero
// Resumen la obra: con una obra de la empresa A pagada desde una caja de la
// empresa B, cada pestaña le daba el egreso a una empresa distinta.
//
// Vive en application para que la usen los conjuntos del explorador y las
// pestañas de presentation (que la reexportan) sin duplicarla.
//
// Puro: sin React ni Dexie. Se prueba en empresaDeMovimiento.test.js.

/**
 * @param {object} tx  transacción cruda
 * @param {{ proyectosPorId?: Map, cajasPorId?: Map }} indices
 * @returns {string|null} id de la empresa, o null si no se puede deducir
 */
export function empresaDeMovimiento(tx, { proyectosPorId, cajasPorId } = {}) {
    const deObra = tx?.proyecto_id ? proyectosPorId?.get(tx.proyecto_id)?.empresa_id : null;
    if (deObra) return deObra;
    return tx?.caja_origen_id ? cajasPorId?.get(tx.caja_origen_id)?.empresa_id ?? null : null;
}
