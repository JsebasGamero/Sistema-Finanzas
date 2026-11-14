// Saldo de cajas y lo que entró y salió de cada una en el periodo.
// Puro (calculos.test.js).
import { aMonto } from '../../../domain/value-objects/dinero';
import { enRango } from '../../../domain/value-objects/fecha';
import { efectoEnSaldos } from '../../../domain/rules/efectoEnSaldos';
import { compararTexto, crearComparador } from '../comunes/calculosComunes';

const SIN_EMPRESA = '';

/**
 * Cajas agrupadas por empresa con saldo actual (foto de hoy) y entradas y
 * salidas del periodo, con la regla única de efectoEnSaldos: una
 * transferencia sale de origen y entra a destino.
 * @param {{ cajas: object[], transacciones: object[], empresasPorId?: Map }} datos
 * @param {{ desde?: string, hasta?: string, empresaId?: string }} filtro
 */
export function resumenCajas(datos, filtro = {}) {
    const { desde = '', hasta = '', empresaId = '' } = filtro;
    const porCaja = new Map();

    for (const caja of datos.cajas) {
        if (empresaId && caja.empresa_id !== empresaId) continue;
        porCaja.set(caja.id, {
            id: caja.id,
            nombre: caja.nombre || 'Caja sin nombre',
            tipo: caja.tipo || '',
            empresaId: caja.empresa_id || SIN_EMPRESA,
            saldo: aMonto(caja.saldo_actual),
            entradas: 0,
            salidas: 0,
            cantidad: 0,
        });
    }

    for (const tx of datos.transacciones) {
        if (!enRango(tx.fecha, desde, hasta)) continue;
        for (const { cajaId, delta } of efectoEnSaldos(tx)) {
            const fila = porCaja.get(cajaId);
            if (!fila) continue;
            if (delta >= 0) fila.entradas += delta;
            else fila.salidas -= delta;
            fila.cantidad += 1;
        }
    }

    const grupos = new Map();
    for (const fila of porCaja.values()) {
        let grupo = grupos.get(fila.empresaId);
        if (!grupo) {
            grupo = {
                empresaId: fila.empresaId,
                nombre: fila.empresaId
                    ? datos.empresasPorId?.get(fila.empresaId)?.nombre || 'Empresa sin registro'
                    : 'Sin empresa',
                cajas: [],
                saldo: 0,
                entradas: 0,
                salidas: 0,
            };
            grupos.set(fila.empresaId, grupo);
        }
        grupo.cajas.push({ ...fila, neto: fila.entradas - fila.salidas });
        grupo.saldo += fila.saldo;
        grupo.entradas += fila.entradas;
        grupo.salidas += fila.salidas;
    }

    const lista = [...grupos.values()]
        .map((g) => ({ ...g, cajas: g.cajas.sort((a, b) => compararTexto(a.nombre, b.nombre)) }))
        .sort((a, b) => {
            if (!a.empresaId !== !b.empresaId) return a.empresaId ? -1 : 1;
            return compararTexto(a.nombre, b.nombre);
        });

    const totales = { saldo: 0, entradas: 0, salidas: 0, negativas: 0, saldoNegativo: 0, cantidad: porCaja.size };
    for (const fila of porCaja.values()) {
        totales.saldo += fila.saldo;
        totales.entradas += fila.entradas;
        totales.salidas += fila.salidas;
        if (fila.saldo < 0) {
            totales.negativas += 1;
            totales.saldoNegativo += fila.saldo;
        }
    }

    return { grupos: lista, totales };
}

/** Movimientos de una caja en el periodo (como origen o destino), recientes primero. */
export function movimientosDeCaja(transacciones, cajaId, { desde = '', hasta = '' } = {}) {
    return transacciones
        .filter((tx) => (tx.caja_origen_id === cajaId || tx.caja_destino_id === cajaId) && enRango(tx.fecha, desde, hasta))
        .sort(crearComparador('fecha_desc'));
}
