// Cálculos compartidos por las pestañas de reportes. Puro: sin React ni
// Dexie, se prueba en calculosComunes.test.js.
import { aMonto } from '../../../domain/value-objects/dinero';
import { claveDia } from '../../../domain/value-objects/fecha';
import { TIPO_MOVIMIENTO } from '../../../domain/value-objects/tipoMovimiento';
import { efectoEnSaldos } from '../../../domain/rules/efectoEnSaldos';

/** Suma montos pasando cada uno por aMonto (un monto guardado como string concatenaba). */
export function sumarMontos(filas, campo = 'monto') {
    let total = 0;
    for (const fila of filas) total += aMonto(fila?.[campo]);
    return total;
}

/**
 * Empresa a la que se le atribuye un movimiento. `transacciones` no tiene
 * columna empresa_id: se deduce de la obra (el gasto es de la obra, aunque lo
 * pague una caja de otra empresa) y, si no hay obra, de la caja de origen.
 */
// Una sola regla para el tablero y la tabla dinámica (primero la obra,
// después la caja): antes cada uno tenía su copia y asignaban empresas
// distintas al mismo movimiento.
export { empresaDeMovimiento } from '../../../application/reportes/empresaDeMovimiento';

/**
 * Ingresos, egresos y neto. Las transferencias no son ingreso ni egreso de la
 * empresa (solo mueven plata entre sus cajas): se cuentan aparte.
 */
export function totalesIngresosEgresos(movimientos) {
    let ingresos = 0;
    let egresos = 0;
    let transferencias = 0;
    for (const tx of movimientos) {
        const monto = aMonto(tx.monto);
        if (tx.tipo_movimiento === TIPO_MOVIMIENTO.INGRESO) ingresos += monto;
        else if (tx.tipo_movimiento === TIPO_MOVIMIENTO.EGRESO) egresos += monto;
        else if (tx.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA) transferencias += monto;
    }
    return { ingresos, egresos, neto: ingresos - egresos, transferencias, cantidad: movimientos.length };
}

/**
 * Efecto de un movimiento sobre una caja concreta (entradas positivas,
 * salidas negativas), con la regla única del dominio. Una transferencia sale
 * de origen y entra a destino.
 */
export function efectoEnCaja(tx, cajaId) {
    let delta = 0;
    for (const ajuste of efectoEnSaldos(tx)) {
        if (ajuste.cajaId === cajaId) delta += ajuste.delta;
    }
    return delta;
}

/**
 * Valor con signo de un movimiento para listas y subtotales:
 * - con caja: lo que entra o sale de esa caja (incluye transferencias);
 * - sin caja: + ingreso, - egreso, 0 transferencia.
 */
export function valorConSigno(tx, cajaId = '') {
    if (cajaId) return efectoEnCaja(tx, cajaId);
    const monto = aMonto(tx.monto);
    if (tx.tipo_movimiento === TIPO_MOVIMIENTO.INGRESO) return monto;
    if (tx.tipo_movimiento === TIPO_MOVIMIENTO.EGRESO) return -monto;
    return 0;
}

function comparar(a, b) {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

/**
 * Comparador de movimientos (REP-20). El anterior devolvía `a > b ? 1 : -1`
 * y nunca 0: para dos movimientos del mismo día el orden quedaba al azar del
 * UUID. Este desempata por hora de registro (created_at) y por id, así que el
 * último gasto del día queda arriba en orden descendente.
 * @param {'fecha_desc'|'fecha_asc'|'monto_desc'|'monto_asc'} orden
 */
export function crearComparador(orden = 'fecha_desc') {
    const descendente = orden.endsWith('_desc');
    const porMonto = orden.startsWith('monto');
    return (a, b) => {
        let r = porMonto
            ? comparar(aMonto(a.monto), aMonto(b.monto))
            : comparar(claveDia(a.fecha) ?? '', claveDia(b.fecha) ?? '');
        if (r === 0 && porMonto) r = comparar(claveDia(a.fecha) ?? '', claveDia(b.fecha) ?? '');
        if (r === 0) r = comparar(a.created_at ?? '', b.created_at ?? '');
        if (r === 0) r = comparar(String(a.id ?? ''), String(b.id ?? ''));
        return descendente && r !== 0 ? -r : r;
    };
}

/** Texto en minúsculas y sin tildes, para buscar "credito" y encontrar "Crédito". */
export function normalizarTexto(texto) {
    return String(texto ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

/** Ordena textos con las reglas del español (la ñ y las tildes en su sitio). */
export function compararTexto(a, b) {
    return String(a ?? '').localeCompare(String(b ?? ''), 'es', { sensitivity: 'base' });
}
