// Deudas a proveedores y préstamos entre cajas, por estado. Puro (calculos.test.js).
import { aMonto, estadoDeuda, restarMontos } from '../../../domain/value-objects/dinero';
import { normalizarTexto } from '../comunes/calculosComunes';

export const ESTADOS = Object.freeze([
    { id: 'PENDIENTE', etiqueta: 'Pendientes', chip: 'chip-neg' },
    { id: 'PARCIAL', etiqueta: 'Con abonos', chip: 'chip-warn' },
    { id: 'PAGADA', etiqueta: 'Pagadas', chip: 'chip-pos' },
]);

/**
 * Estado calculado con la regla de dinero, no el guardado: una deuda vieja
 * podía quedar en PARCIAL por un residuo de coma flotante (bug del === 0).
 */
export function estadoDe(deuda) {
    return estadoDeuda(Math.max(aMonto(deuda.monto_pendiente), 0), aMonto(deuda.monto_original));
}

/** Abonos de una deuda. `pagos` es JSONB; una fila vieja puede traerlo como texto. */
export function pagosDe(deuda) {
    const pagos = deuda?.pagos;
    if (Array.isArray(pagos)) return pagos;
    if (typeof pagos === 'string') {
        try {
            const lista = JSON.parse(pagos);
            return Array.isArray(lista) ? lista : [];
        } catch {
            return [];
        }
    }
    return [];
}

function fechaDe(deuda) {
    return String(deuda.fecha_deuda || deuda.fecha_prestamo || deuda.created_at || '');
}

/**
 * Agrupa por estado con totales de cada grupo.
 * @param {object[]} deudas
 * @param {{ estado?: 'abiertas'|'PAGADA'|'todas', busqueda?: string, textoDe?: (d: object) => string }} filtro
 */
export function resumenDeudas(deudas, filtro = {}) {
    const { estado = 'abiertas', busqueda = '', textoDe = () => '' } = filtro;
    const palabras = normalizarTexto(busqueda).trim().split(/\s+/).filter(Boolean);
    const grupos = new Map(ESTADOS.map((e) => [e.id, { ...e, filas: [], original: 0, pendiente: 0, abonado: 0 }]));
    const totales = { original: 0, pendiente: 0, abonado: 0, cantidad: 0 };

    for (const deuda of deudas) {
        const e = estadoDe(deuda);
        if (estado === 'abiertas' && e === 'PAGADA') continue;
        if (estado === 'PAGADA' && e !== 'PAGADA') continue;
        if (palabras.length > 0) {
            const texto = normalizarTexto(`${textoDe(deuda)} ${deuda.descripcion ?? ''}`);
            if (!palabras.every((p) => texto.includes(p))) continue;
        }
        const original = aMonto(deuda.monto_original);
        const pendiente = Math.max(aMonto(deuda.monto_pendiente), 0);
        const abonado = Math.max(restarMontos(original, pendiente), 0);
        const grupo = grupos.get(e);
        grupo.filas.push({
            deuda,
            estado: e,
            original,
            pendiente,
            abonado,
            fraccionAbonada: original > 0 ? Math.min(abonado / original, 1) : 0,
            pagos: pagosDe(deuda),
        });
        grupo.original += original;
        grupo.pendiente += pendiente;
        grupo.abonado += abonado;
        totales.original += original;
        totales.pendiente += pendiente;
        totales.abonado += abonado;
        totales.cantidad += 1;
    }

    const lista = [...grupos.values()]
        .filter((g) => g.filas.length > 0)
        .map((g) => ({ ...g, filas: g.filas.sort((a, b) => fechaDe(b.deuda).localeCompare(fechaDe(a.deuda))) }));

    return { grupos: lista, totales };
}
