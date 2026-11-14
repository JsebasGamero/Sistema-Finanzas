// Cifras de la franja superior del explorador, por conjunto.
//
// Se calculan sobre las filas que el usuario está viendo (después del
// periodo, la búsqueda y los filtros de columna). Antes la tabla decía
// "1000 registros" aunque el filtro dejara 12 y no mostraba ninguna suma
// (REP-18).
//
// Puro: sin React ni Dexie. Se prueba en indicadores.test.js.
import { aMonto, redondearMonto, restarMontos, esCero } from '../../domain/value-objects/dinero';

function sumar(filas, campo) {
    let total = 0;
    for (const fila of filas) total += aMonto(fila?.[campo]);
    return redondearMonto(total);
}

function contar(filas, predicado) {
    let n = 0;
    for (const fila of filas) if (fila && predicado(fila)) n += 1;
    return n;
}

function tonoDeSigno(valor) {
    if (esCero(valor)) return null;
    return valor > 0 ? 'pos' : 'neg';
}

function plural(n, singular, pluralTexto) {
    return `${n} ${n === 1 ? singular : pluralTexto}`;
}

function indicadoresMovimientos(filas, { conSincronizacion = true } = {}) {
    const ingresos = sumar(filas, 'ingreso');
    const egresos = sumar(filas, 'egreso');
    const neto = restarMontos(ingresos, egresos);
    const cantidadEgresos = contar(filas, (f) => f.tipo === 'Egreso');
    // En el modo local nada se sincroniza nunca: "N pendientes" sería ruido.
    const pendientes = conSincronizacion ? contar(filas, (f) => f.sincronizado === 'Pendiente') : 0;
    return [
        {
            id: 'registros',
            etiqueta: 'Registros',
            valor: filas.length,
            formato: 'numero',
            tono: null,
            ...(pendientes ? { meta: `${plural(pendientes, 'pendiente', 'pendientes')} de sincronizar` } : {}),
        },
        { id: 'ingresos', etiqueta: 'Ingresos', valor: ingresos, formato: 'dinero', tono: 'pos' },
        { id: 'egresos', etiqueta: 'Egresos', valor: egresos, formato: 'dinero', tono: 'neg' },
        { id: 'neto', etiqueta: 'Neto', valor: neto, formato: 'dinero', tono: tonoDeSigno(neto), meta: 'Sin transferencias' },
        {
            id: 'promedio_egreso',
            etiqueta: 'Promedio por egreso',
            valor: cantidadEgresos ? egresos / cantidadEgresos : 0,
            formato: 'dinero',
            tono: null,
            meta: plural(cantidadEgresos, 'egreso', 'egresos'),
        },
    ];
}

function indicadoresCajas(filas) {
    const saldo = sumar(filas, 'saldo_actual');
    const negativas = contar(filas, (f) => aMonto(f.saldo_actual) < 0 && !esCero(f.saldo_actual));
    return [
        { id: 'saldo_total', etiqueta: 'Saldo total', valor: saldo, formato: 'dinero', tono: tonoDeSigno(saldo), meta: plural(filas.length, 'caja', 'cajas') },
        { id: 'ingresos', etiqueta: 'Ingresos', valor: sumar(filas, 'ingresos'), formato: 'dinero', tono: 'pos' },
        { id: 'egresos', etiqueta: 'Egresos', valor: sumar(filas, 'egresos'), formato: 'dinero', tono: 'neg' },
        {
            id: 'cajas_negativas',
            etiqueta: 'Cajas en negativo',
            valor: negativas,
            formato: 'numero',
            tono: negativas ? 'neg' : null,
            meta: `de ${plural(filas.length, 'caja', 'cajas')}`,
        },
    ];
}

function indicadoresObras(filas) {
    const presupuesto = sumar(filas, 'presupuesto');
    const gastado = sumar(filas, 'gastado');
    // La ejecución se mide solo con las obras que tienen presupuesto: una obra
    // sin presupuesto inflaría el porcentaje sin decir nada.
    const conPresupuesto = filas.filter((f) => aMonto(f.presupuesto) > 0);
    const gastadoConPresupuesto = sumar(conPresupuesto, 'gastado');
    const ejecucion = presupuesto > 0 ? gastadoConPresupuesto / presupuesto : null;
    let tono = null;
    if (ejecucion !== null) tono = ejecucion > 1 ? 'neg' : ejecucion >= 0.9 ? 'warn' : 'info';
    return [
        { id: 'presupuesto', etiqueta: 'Presupuesto', valor: presupuesto, formato: 'dinero', tono: null, meta: plural(filas.length, 'obra', 'obras') },
        { id: 'gastado', etiqueta: 'Gastado', valor: gastado, formato: 'dinero', tono: 'neg' },
        {
            id: 'ejecucion',
            etiqueta: 'Ejecución',
            valor: ejecucion,
            formato: 'porcentaje',
            tono,
            meta: `${plural(conPresupuesto.length, 'obra', 'obras')} con presupuesto`,
        },
        { id: 'disponible', etiqueta: 'Disponible', valor: sumar(conPresupuesto, 'disponible'), formato: 'dinero', tono: null },
    ];
}

function indicadoresProveedores(filas) {
    const abiertas = filas.reduce((n, f) => n + (Number(f?.deudas_abiertas) || 0), 0);
    return [
        { id: 'pagado', etiqueta: 'Pagado', valor: sumar(filas, 'total_pagado'), formato: 'dinero', tono: null, meta: plural(filas.length, 'tercero', 'terceros') },
        { id: 'pendiente', etiqueta: 'Por pagar', valor: sumar(filas, 'deuda_pendiente'), formato: 'dinero', tono: 'neg' },
        { id: 'deudas_abiertas', etiqueta: 'Deudas abiertas', valor: abiertas, formato: 'numero', tono: abiertas ? 'warn' : null },
    ];
}

function indicadoresDeudas(filas) {
    const original = sumar(filas, 'monto_original');
    const abonado = sumar(filas, 'abonado');
    const pendiente = sumar(filas, 'monto_pendiente');
    const abiertas = contar(filas, (f) => f.estado !== 'Pagada');
    return [
        { id: 'original', etiqueta: 'Original', valor: original, formato: 'dinero', tono: null, meta: plural(filas.length, 'deuda', 'deudas') },
        {
            id: 'abonado',
            etiqueta: 'Abonado',
            valor: abonado,
            formato: 'dinero',
            tono: 'pos',
            ...(original > 0 ? { meta: `${Math.round((abonado / original) * 100)} % del original` } : {}),
        },
        { id: 'pendiente', etiqueta: 'Pendiente', valor: pendiente, formato: 'dinero', tono: pendiente > 0 ? 'neg' : null },
        { id: 'abiertas', etiqueta: 'Abiertas', valor: abiertas, formato: 'numero', tono: abiertas ? 'warn' : null },
    ];
}

function indicadoresEmpresas(filas) {
    const saldo = sumar(filas, 'saldo_total');
    return [
        { id: 'empresas', etiqueta: 'Empresas', valor: filas.length, formato: 'numero', tono: null },
        { id: 'saldo_total', etiqueta: 'Saldo en cajas', valor: saldo, formato: 'dinero', tono: tonoDeSigno(saldo) },
        { id: 'cajas', etiqueta: 'Cajas', valor: sumar(filas, 'cajas'), formato: 'numero', tono: null },
        { id: 'obras', etiqueta: 'Obras', valor: sumar(filas, 'obras'), formato: 'numero', tono: null },
    ];
}

function indicadoresCategorias(filas) {
    const enUso = contar(filas, (f) => Number(f.movimientos) > 0);
    return [
        { id: 'ingresos', etiqueta: 'Ingresos', valor: sumar(filas, 'ingresos'), formato: 'dinero', tono: 'pos' },
        { id: 'egresos', etiqueta: 'Egresos', valor: sumar(filas, 'egresos'), formato: 'dinero', tono: 'neg' },
        { id: 'en_uso', etiqueta: 'Categorías en uso', valor: enUso, formato: 'numero', tono: null, meta: `de ${filas.length}` },
    ];
}

const POR_CONJUNTO = {
    movimientos: indicadoresMovimientos,
    cajas: indicadoresCajas,
    obras: indicadoresObras,
    proveedores: indicadoresProveedores,
    deudas_terceros: indicadoresDeudas,
    prestamos_cajas: indicadoresDeudas,
    empresas: indicadoresEmpresas,
    categorias: indicadoresCategorias,
};

/**
 * @returns {Array<{ id: string, etiqueta: string, valor: number|null,
 *   formato: 'dinero'|'numero'|'porcentaje', tono: 'pos'|'neg'|'info'|'warn'|null, meta?: string }>}
 */
export function indicadoresDe(conjuntoId, filas, opciones = {}) {
    const calcular = POR_CONJUNTO[conjuntoId];
    const lista = Array.isArray(filas) ? filas.filter(Boolean) : [];
    if (!calcular) return [{ id: 'registros', etiqueta: 'Registros', valor: lista.length, formato: 'numero', tono: null }];
    return calcular(lista, opciones);
}
