// Tipos de movimiento válidos. Deben coincidir con el CHECK de
// `transacciones.tipo_movimiento` en supabase_setup.sql.
export const TIPO_MOVIMIENTO = Object.freeze({
    INGRESO: 'INGRESO',
    EGRESO: 'EGRESO',
    TRANSFERENCIA: 'TRANSFERENCIA',
});

/** ¿El valor es uno de los tipos de movimiento válidos? */
export function esTipoMovimiento(valor) {
    return Object.values(TIPO_MOVIMIENTO).includes(valor);
}
