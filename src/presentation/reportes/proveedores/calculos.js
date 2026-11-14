// Relación con proveedores: cuánto se les pagó y cuánto se les debe.
// Puro (calculos.test.js).
import { aMonto, esCero } from '../../../domain/value-objects/dinero';
import { enRango } from '../../../domain/value-objects/fecha';
import { TIPO_MOVIMIENTO } from '../../../domain/value-objects/tipoMovimiento';
import { tipoDeMovimientoDeDeuda } from '../../../domain/rules/movimientoDeDeuda';
import { compararTexto, crearComparador, normalizarTexto } from '../comunes/calculosComunes';

const recientesPrimero = crearComparador('fecha_desc');

/**
 * Pagos y deudas por tercero.
 *
 * REP-11: TODO lo pagado sale de las transacciones (cada EGRESO con
 * tercero_id, una vez). Antes los pagos directos excluían la categoría
 * "Pago Deuda" y los abonos se calculaban aparte como
 * monto_original - monto_pendiente de la deuda. Si alguien recategorizaba el
 * egreso de un abono, se contaba dos veces; si lo borraba, seguía sumando
 * aunque la plata hubiera vuelto a la caja. `abonos` es solo el desglose de
 * cuánto de lo pagado fue abono a deudas.
 *
 * La deuda pendiente sí sale de deudas_terceros: es la foto de hoy.
 *
 * @param {{ transacciones: object[], deudasTerceros: object[], tercerosPorId: Map }} datos
 * @param {{ desde?: string, hasta?: string, tipo?: string, busqueda?: string, orden?: 'pagado'|'deuda' }} filtro
 */
export function resumenProveedores(datos, filtro = {}) {
    const { desde = '', hasta = '', tipo = '', busqueda = '', orden = 'pagado' } = filtro;
    const filas = new Map();

    const filaDe = (id) => {
        let fila = filas.get(id);
        if (!fila) {
            const tercero = datos.tercerosPorId?.get(id);
            fila = {
                id,
                nombre: tercero?.nombre || 'Tercero sin registro',
                tipo: tercero?.tipo || '',
                documento: tercero?.nit_cedula || '',
                pagado: 0,
                abonos: 0,
                cantidadPagos: 0,
                pagos: [],
                deudaPendiente: 0,
                deudaOriginal: 0,
                deudasAbiertas: [],
            };
            filas.set(id, fila);
        }
        return fila;
    };

    for (const tx of datos.transacciones) {
        if (tx.tipo_movimiento !== TIPO_MOVIMIENTO.EGRESO || !tx.tercero_id) continue;
        if (!enRango(tx.fecha, desde, hasta)) continue;
        const fila = filaDe(tx.tercero_id);
        const monto = aMonto(tx.monto);
        fila.pagado += monto;
        fila.cantidadPagos += 1;
        fila.pagos.push(tx);
        if (tipoDeMovimientoDeDeuda(tx) === 'abono_tercero') fila.abonos += monto;
    }

    for (const deuda of datos.deudasTerceros) {
        if (!deuda.tercero_id) continue;
        const pendiente = aMonto(deuda.monto_pendiente);
        if (pendiente <= 0 || esCero(pendiente)) continue;
        const fila = filaDe(deuda.tercero_id);
        fila.deudaPendiente += pendiente;
        fila.deudaOriginal += aMonto(deuda.monto_original);
        fila.deudasAbiertas.push(deuda);
    }

    const palabras = normalizarTexto(busqueda).trim().split(/\s+/).filter(Boolean);
    const resultado = [...filas.values()]
        .filter((f) => !tipo || f.tipo === tipo)
        .filter((f) => {
            if (palabras.length === 0) return true;
            const texto = normalizarTexto(`${f.nombre} ${f.documento}`);
            return palabras.every((p) => texto.includes(p));
        })
        .map(({ pagos, deudasAbiertas, ...f }) => ({
            ...f,
            ultimosPagos: pagos.sort(recientesPrimero).slice(0, 5),
            deudasAbiertas: deudasAbiertas.sort((a, b) =>
                String(a.fecha_deuda ?? '').localeCompare(String(b.fecha_deuda ?? ''))),
        }))
        .sort((a, b) => {
            const r = orden === 'deuda'
                ? b.deudaPendiente - a.deudaPendiente || b.pagado - a.pagado
                : b.pagado - a.pagado || b.deudaPendiente - a.deudaPendiente;
            return r || compararTexto(a.nombre, b.nombre);
        });

    const totales = { pagado: 0, abonos: 0, deudaPendiente: 0, conDeuda: 0, cantidad: resultado.length };
    for (const f of resultado) {
        totales.pagado += f.pagado;
        totales.abonos += f.abonos;
        totales.deudaPendiente += f.deudaPendiente;
        if (f.deudaPendiente > 0) totales.conDeuda += 1;
    }

    return { filas: resultado, totales };
}
