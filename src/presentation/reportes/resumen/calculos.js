// Cálculos del tablero de resumen. Puro: sin React ni Dexie (calculos.test.js).
//
// Todo el tablero sale de UN filtro (periodo, empresa, obra). Antes los
// indicadores y las gráficas se calculaban sobre el histórico completo aunque
// el usuario pusiera fechas y obra (REP-5): creía ver las cifras de noviembre
// de una obra y veía las de todo el sistema.
import { aMonto, esCero } from '../../../domain/value-objects/dinero';
import {
    claveDia, claveMes, enRango, etiquetaMes, fechaLocal, sumarDias,
} from '../../../domain/value-objects/fecha';
import { TIPO_MOVIMIENTO } from '../../../domain/value-objects/tipoMovimiento';
import { formatoFecha } from '../../formato';
import {
    compararTexto, empresaDeMovimiento, sumarMontos, totalesIngresosEgresos,
} from '../comunes/calculosComunes';

const { INGRESO, EGRESO } = TIPO_MOVIMIENTO;

/**
 * Movimientos que entran al tablero.
 * @param {object[]} transacciones
 * @param {{ desde?: string, hasta?: string, empresaId?: string, proyectoId?: string }} filtro
 * @param {{ proyectosPorId: Map, cajasPorId: Map }} indices
 */
export function filtrarParaTablero(transacciones, filtro, indices) {
    const { desde = '', hasta = '', empresaId = '', proyectoId = '' } = filtro;
    return transacciones.filter((tx) => {
        if (!enRango(tx.fecha, desde, hasta)) return false;
        if (proyectoId && tx.proyecto_id !== proyectoId) return false;
        if (empresaId && empresaDeMovimiento(tx, indices) !== empresaId) return false;
        return true;
    });
}

/** 'YYYY-MM' siguiente, sin pasar por Date. */
export function siguienteMes(mes) {
    const [a, m] = mes.split('-').map(Number);
    return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/**
 * Ingresos, egresos y neto por mes, con los meses sin movimientos en cero
 * (un hueco en el eje haría pensar que ese mes no existe).
 *
 * REP-4: la etiqueta sale de la clave 'YYYY-MM' con etiquetaMes. Antes se
 * hacía new Date('2026-11-01'), que en Colombia es el 31 de octubre a las
 * 7 p. m., y cada barra quedaba rotulada con el mes anterior.
 */
export function flujoMensual(movimientos, { desde = '', hasta = '' } = {}, maxMeses = 36) {
    const porMes = new Map();
    for (const tx of movimientos) {
        const tipo = tx.tipo_movimiento;
        if (tipo !== INGRESO && tipo !== EGRESO) continue;
        const mes = claveMes(tx.fecha);
        if (!mes) continue;
        const fila = porMes.get(mes) ?? { ingresos: 0, egresos: 0 };
        if (tipo === INGRESO) fila.ingresos += aMonto(tx.monto);
        else fila.egresos += aMonto(tx.monto);
        porMes.set(mes, fila);
    }
    if (porMes.size === 0) return [];

    const claves = [...porMes.keys()].sort();
    const inicio = (desde && claveMes(desde)) || claves[0];
    const fin = (hasta && claveMes(hasta)) || claves[claves.length - 1];

    const meses = [];
    for (let mes = inicio; mes <= fin; mes = siguienteMes(mes)) meses.push(mes);
    const visibles = meses.slice(-maxMeses);
    const variosAnios = new Set(visibles.map((m) => m.slice(0, 4))).size > 1;

    return visibles.map((mes) => {
        const { ingresos, egresos } = porMes.get(mes) ?? { ingresos: 0, egresos: 0 };
        const corta = etiquetaMes(mes, { conAnio: false });
        return {
            mes,
            etiqueta: etiquetaMes(mes),
            corta: variosAnios ? `${corta} ${mes.slice(2, 4)}` : corta,
            ingresos,
            egresos,
            neto: ingresos - egresos,
        };
    });
}

/**
 * Egresos por categoría: las `limite` mayores y el resto en "Otras".
 *
 * REP-8: el porcentaje es sobre el TOTAL de egresos. Antes la torta tenía solo
 * el top 5 y Recharts calculaba el % sobre esos cinco, así que siempre
 * sumaban 100 % aunque fueran la mitad del gasto.
 * REP-7: el nombre pasa por el resolutor; un UUID legacy de "Materiales" se
 * suma a "Materiales" en vez de salir como una barra aparte con el UUID.
 */
export function egresosPorCategoria(movimientos, nombreCategoria, limite = 8) {
    const mapa = new Map();
    let total = 0;
    for (const tx of movimientos) {
        if (tx.tipo_movimiento !== EGRESO) continue;
        const monto = aMonto(tx.monto);
        const nombre = nombreCategoria(tx.categoria);
        mapa.set(nombre, (mapa.get(nombre) ?? 0) + monto);
        total += monto;
    }

    let filas = [...mapa]
        .map(([nombre, monto]) => ({ nombre, monto, esOtras: false }))
        .sort((a, b) => b.monto - a.monto || compararTexto(a.nombre, b.nombre));

    // Con una sola categoría de sobra no vale la pena agruparla en "Otras".
    if (filas.length > limite + 1) {
        const resto = filas.slice(limite);
        filas = [
            ...filas.slice(0, limite),
            { nombre: `Otras (${resto.length})`, monto: sumarMontos(resto), esOtras: true },
        ];
    }

    return {
        total,
        cantidadCategorias: mapa.size,
        filas: filas.map((f) => ({ ...f, fraccion: total > 0 ? f.monto / total : 0 })),
    };
}

/** Saldo actual de cada caja (foto de hoy, no depende del periodo). */
export function saldosPorCaja(cajas, { empresaId = '' } = {}) {
    return cajas
        .filter((c) => !empresaId || c.empresa_id === empresaId)
        .map((c) => ({ id: c.id, nombre: c.nombre || 'Caja sin nombre', saldo: aMonto(c.saldo_actual) }))
        .sort((a, b) => b.saldo - a.saldo || compararTexto(a.nombre, b.nombre));
}

function diasEntre(desde, hasta) {
    const a = fechaLocal(desde);
    const b = fechaLocal(hasta);
    if (!a || !b) return 0;
    return Math.round((b - a) / 86400000);
}

/** Lunes de la semana de una clave 'YYYY-MM-DD'. */
export function lunesDe(dia) {
    const fecha = fechaLocal(dia);
    return sumarDias(dia, -((fecha.getDay() + 6) % 7));
}

function etiquetaDia(dia) {
    return `${Number(dia.slice(8, 10))} ${etiquetaMes(dia.slice(0, 7), { conAnio: false })}`;
}

/**
 * Neto acumulado (ingresos - egresos) a lo largo del periodo, por día; si el
 * periodo pasa de ~3 meses, por semana (más puntos no se leen en un celular).
 *
 * REP-14: los movimientos se recorren ordenados por día y cada punto se
 * compara solo con el último; antes era un `.find` por movimiento.
 */
export function netoAcumulado(movimientos, { desde = '', hasta = '' } = {}) {
    const porDia = new Map();
    for (const tx of movimientos) {
        const tipo = tx.tipo_movimiento;
        if (tipo !== INGRESO && tipo !== EGRESO) continue;
        const dia = claveDia(tx.fecha);
        if (!dia) continue;
        const delta = tipo === INGRESO ? aMonto(tx.monto) : -aMonto(tx.monto);
        porDia.set(dia, (porDia.get(dia) ?? 0) + delta);
    }
    if (porDia.size === 0) return { granularidad: 'dia', puntos: [] };

    const dias = [...porDia.keys()].sort();
    const granularidad = diasEntre(desde || dias[0], hasta || dias[dias.length - 1]) > 92 ? 'semana' : 'dia';

    const puntos = [];
    let acumulado = 0;
    for (const dia of dias) {
        acumulado += porDia.get(dia);
        const clave = granularidad === 'semana' ? lunesDe(dia) : dia;
        const ultimo = puntos[puntos.length - 1];
        if (ultimo?.clave === clave) {
            ultimo.acumulado = acumulado;
        } else {
            puntos.push({
                clave,
                corta: etiquetaDia(clave),
                etiqueta: granularidad === 'semana' ? `Semana del ${formatoFecha(clave)}` : formatoFecha(clave),
                acumulado,
            });
        }
    }
    return { granularidad, puntos };
}

/** Proveedores (terceros) a los que más se les pagó en el periodo. */
export function proveedoresMasPagados(movimientos, nombreTercero, limite = 8) {
    const mapa = new Map();
    let total = 0;
    for (const tx of movimientos) {
        if (tx.tipo_movimiento !== EGRESO || !tx.tercero_id) continue;
        const monto = aMonto(tx.monto);
        mapa.set(tx.tercero_id, (mapa.get(tx.tercero_id) ?? 0) + monto);
        total += monto;
    }
    const filas = [...mapa]
        .map(([id, monto]) => ({ id, nombre: nombreTercero(id, 'Tercero sin registro'), monto }))
        .sort((a, b) => b.monto - a.monto || compararTexto(a.nombre, b.nombre))
        .slice(0, limite)
        .map((f) => ({ ...f, fraccion: total > 0 ? f.monto / total : 0 }));
    return { total, cantidad: mapa.size, filas };
}

function pendienteDe(deuda) {
    const pendiente = aMonto(deuda.monto_pendiente);
    return pendiente > 0 && !esCero(pendiente) ? pendiente : 0;
}

/**
 * Cifras de la franja superior. Ingresos, egresos y neto son del periodo;
 * saldo en cajas y deudas son de hoy (no tienen historia por fecha).
 */
export function indicadoresTablero(datos, filtro, movimientos) {
    const { empresaId = '', proyectoId = '' } = filtro;
    const { proyectosPorId, cajasPorId } = datos;

    const cajas = datos.cajas.filter((c) => !empresaId || c.empresa_id === empresaId);

    const deudas = datos.deudasTerceros.filter((d) => {
        if (pendienteDe(d) === 0) return false;
        if (proyectoId && d.proyecto_id !== proyectoId) return false;
        if (empresaId) {
            const empresa = d.empresa_id || proyectosPorId?.get(d.proyecto_id)?.empresa_id || '';
            if (empresa !== empresaId) return false;
        }
        return true;
    });

    const prestamos = datos.deudasCajas.filter((d) => {
        if (pendienteDe(d) === 0) return false;
        if (!empresaId) return true;
        return cajasPorId?.get(d.caja_deudora_id)?.empresa_id === empresaId
            || cajasPorId?.get(d.caja_acreedora_id)?.empresa_id === empresaId;
    });

    return {
        ...totalesIngresosEgresos(movimientos),
        saldoCajas: sumarMontos(cajas, 'saldo_actual'),
        numCajas: cajas.length,
        porPagar: deudas.reduce((s, d) => s + pendienteDe(d), 0),
        numDeudas: deudas.length,
        prestamosPendientes: prestamos.reduce((s, d) => s + pendienteDe(d), 0),
        numPrestamos: prestamos.length,
    };
}
