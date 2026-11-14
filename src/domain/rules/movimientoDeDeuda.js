// Movimientos que pertenecen a una deuda (bug C15).
//
// Los paneles de deudas crean transacciones al prestar entre cajas y al
// abonar. Esas transacciones son la mitad de una operación compuesta: la otra
// mitad es `monto_pendiente`, `estado` y `pagos` de la deuda. Si se editan o
// borran sueltas (desde Inicio o Reportes), el saldo de las cajas se revierte
// pero la deuda queda igual: el préstamo sigue "pendiente" con un dinero que
// ya no se movió, o al revés.
//
// Hasta que las deudas tengan sus propios casos de uso (porción 3 de la
// Fase 3), la regla es: esos movimientos solo se administran desde Deudas. La
// UI los muestra sin editar/borrar y los casos de uso los rechazan.
//
// Se reconocen por la combinación tipo + categoría que escriben los paneles.
// "Pago Préstamo" también es una categoría elegible a mano, por eso no basta
// la categoría: un EGRESO "Pago Préstamo" (cuota a un banco) es un gasto
// normal; solo la TRANSFERENCIA "Pago Préstamo" es el abono entre cajas.
import { TIPO_MOVIMIENTO } from '../value-objects/tipoMovimiento';

export const CATEGORIA_DEUDA = Object.freeze({
    PRESTAMO_ENTRE_CAJAS: 'Préstamo entre Cajas',
    ABONO_PRESTAMO_CAJAS: 'Pago Préstamo',
    ABONO_DEUDA_TERCERO: 'Pago Deuda',
});

/**
 * ¿El movimiento lo creó un panel de deudas?
 * @param {object|null|undefined} tx fila de transacciones
 * @returns {'prestamo_cajas'|'abono_cajas'|'abono_tercero'|null}
 */
export function tipoDeMovimientoDeDeuda(tx) {
    if (!tx) return null;
    const { tipo_movimiento: tipo, categoria } = tx;
    if (tipo === TIPO_MOVIMIENTO.TRANSFERENCIA && categoria === CATEGORIA_DEUDA.PRESTAMO_ENTRE_CAJAS) return 'prestamo_cajas';
    if (tipo === TIPO_MOVIMIENTO.TRANSFERENCIA && categoria === CATEGORIA_DEUDA.ABONO_PRESTAMO_CAJAS) return 'abono_cajas';
    if (tipo === TIPO_MOVIMIENTO.EGRESO && categoria === CATEGORIA_DEUDA.ABONO_DEUDA_TERCERO) return 'abono_tercero';
    return null;
}

/** ¿El movimiento pertenece a una deuda y solo debe tocarse desde Deudas? */
export function esMovimientoDeDeuda(tx) {
    return tipoDeMovimientoDeDeuda(tx) !== null;
}
