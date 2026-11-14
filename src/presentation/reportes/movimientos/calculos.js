// Filtrado, orden y totales del reporte de movimientos. Puro (calculos.test.js).
import { aMonto } from '../../../domain/value-objects/dinero';
import { claveDia, enRango } from '../../../domain/value-objects/fecha';
import { TIPO_MOVIMIENTO } from '../../../domain/value-objects/tipoMovimiento';
import { terminosDeBusqueda } from '../../../application/reportes/filtros';
import {
    crearComparador, efectoEnCaja, normalizarTexto, totalesIngresosEgresos, valorConSigno,
} from '../comunes/calculosComunes';

export const FILTROS_VACIOS = Object.freeze({
    tipo: '',
    cajaId: '',
    proyectoId: '',
    terceroId: '',
    usuario: '',
    categoria: '',
});

export const ORDENES = [
    { id: 'fecha_desc', etiqueta: 'Recientes primero' },
    { id: 'fecha_asc', etiqueta: 'Antiguos primero' },
    { id: 'monto_desc', etiqueta: 'Mayor monto' },
    { id: 'monto_asc', etiqueta: 'Menor monto' },
];

export const TIPOS = [
    { id: TIPO_MOVIMIENTO.INGRESO, etiqueta: 'Ingresos', singular: 'Ingreso' },
    { id: TIPO_MOVIMIENTO.EGRESO, etiqueta: 'Egresos', singular: 'Egreso' },
    { id: TIPO_MOVIMIENTO.TRANSFERENCIA, etiqueta: 'Transferencias', singular: 'Transferencia' },
];

/**
 * Texto de búsqueda de cada movimiento, precalculado una vez por carga de
 * datos (REP-14: antes cada tecla hacía un `.find` de caja y de tercero por
 * fila). Incluye la categoría resuelta (REP-7: buscar "Materiales" no
 * encontraba los movimientos legacy que guardan el UUID) y el monto en
 * dígitos, para buscar "250000".
 * @returns {Map<string, string>}
 */
export function construirTextosBusqueda(transacciones, datos) {
    const textos = new Map();
    for (const tx of transacciones) {
        const partes = [
            tx.descripcion,
            datos.nombreCategoria(tx.categoria, ''),
            datos.nombreCaja(tx.caja_origen_id),
            datos.nombreCaja(tx.caja_destino_id),
            datos.nombreTercero(tx.tercero_id),
            datos.nombreProyecto(tx.proyecto_id),
            tx.usuario_nombre,
            String(Math.round(aMonto(tx.monto))),
        ];
        textos.set(tx.id, normalizarTexto(partes.filter(Boolean).join(' ')));
    }
    return textos;
}

/**
 * Aplica búsqueda y filtros. Con filtro de caja entran también las
 * transferencias en las que la caja es destino.
 * @param {object[]} transacciones
 * @param {object} filtros { desde, hasta, tipo, cajaId, proyectoId, terceroId, usuario, categoria, busqueda }
 * @param {{ textos?: Map<string,string>, nombreCategoria: Function }} apoyo
 */
export function filtrarMovimientos(transacciones, filtros, { textos, nombreCategoria }) {
    const {
        desde = '', hasta = '', tipo = '', cajaId = '', proyectoId = '',
        terceroId = '', usuario = '', categoria = '', busqueda = '',
    } = filtros;
    // Los montos se indexan solo con dígitos, pero el usuario los escribe
    // como la app los muestra ("1.500.000", "$250.000"): terminosDeBusqueda
    // reduce esos términos a dígitos, igual que en el explorador.
    const palabras = terminosDeBusqueda(busqueda);

    return transacciones.filter((tx) => {
        if (!enRango(tx.fecha, desde, hasta)) return false;
        if (tipo && tx.tipo_movimiento !== tipo) return false;
        if (cajaId && tx.caja_origen_id !== cajaId && tx.caja_destino_id !== cajaId) return false;
        if (proyectoId && tx.proyecto_id !== proyectoId) return false;
        if (terceroId && tx.tercero_id !== terceroId) return false;
        if (usuario && tx.usuario_nombre !== usuario) return false;
        if (categoria && nombreCategoria(tx.categoria) !== categoria) return false;
        if (palabras.length > 0) {
            const texto = textos?.get(tx.id) ?? '';
            if (!palabras.every((p) => texto.includes(p))) return false;
        }
        return true;
    });
}

export function ordenarMovimientos(movimientos, orden = 'fecha_desc') {
    return [...movimientos].sort(crearComparador(orden));
}

/**
 * Totales de lo filtrado. Con filtro de caja (REP-10) se agrega lo que
 * entró y salió de ESA caja, transferencias incluidas: para una caja menor
 * que se fondea por transferencia, "ingresos - egresos" no se parece en nada
 * a lo que pasó con su saldo.
 */
export function resumenFiltrado(movimientos, cajaId = '') {
    const base = totalesIngresosEgresos(movimientos);
    if (!cajaId) return { ...base, caja: null };
    let entradas = 0;
    let salidas = 0;
    for (const tx of movimientos) {
        const delta = efectoEnCaja(tx, cajaId);
        if (delta > 0) entradas += delta;
        else salidas -= delta;
    }
    return { ...base, caja: { entradas, salidas, neto: entradas - salidas } };
}

/** Neto de cada día ('YYYY-MM-DD' -> monto con signo). Ver valorConSigno. */
export function subtotalesPorDia(movimientos, cajaId = '') {
    const subtotales = new Map();
    for (const tx of movimientos) {
        const dia = claveDia(tx.fecha) ?? '';
        subtotales.set(dia, (subtotales.get(dia) ?? 0) + valorConSigno(tx, cajaId));
    }
    return subtotales;
}

/** Agrupa una lista YA ordenada por fecha en bloques de días consecutivos. */
export function agruparPorDia(movimientos) {
    const grupos = [];
    for (const tx of movimientos) {
        const dia = claveDia(tx.fecha) ?? '';
        const ultimo = grupos[grupos.length - 1];
        if (ultimo?.dia === dia) ultimo.filas.push(tx);
        else grupos.push({ dia, filas: [tx] });
    }
    return grupos;
}

/** Valores distintos y ordenados (para las opciones de usuario y categoría). */
export function valoresDistintos(transacciones, obtener) {
    const valores = new Set();
    for (const tx of transacciones) {
        const v = obtener(tx);
        if (v) valores.add(v);
    }
    return [...valores].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

/**
 * Filtros activos en texto, para las etiquetas de la pantalla y la cabecera
 * del PDF (REP-9: el PDF no decía con qué filtros se generó).
 * @returns {Array<{ clave: string, texto: string }>}
 */
export function describirFiltros(filtros, datos) {
    const lista = [];
    const tipo = TIPOS.find((t) => t.id === filtros.tipo);
    if (tipo) lista.push({ clave: 'tipo', texto: `Tipo: ${tipo.etiqueta}` });
    if (filtros.cajaId) lista.push({ clave: 'cajaId', texto: `Caja: ${datos.nombreCaja(filtros.cajaId, 'Caja sin registro')}` });
    if (filtros.proyectoId) lista.push({ clave: 'proyectoId', texto: `Obra: ${datos.nombreProyecto(filtros.proyectoId, 'Obra sin registro')}` });
    if (filtros.terceroId) lista.push({ clave: 'terceroId', texto: `Proveedor: ${datos.nombreTercero(filtros.terceroId, 'Tercero sin registro')}` });
    if (filtros.usuario) lista.push({ clave: 'usuario', texto: `Registró: ${filtros.usuario}` });
    if (filtros.categoria) lista.push({ clave: 'categoria', texto: `Categoría: ${filtros.categoria}` });
    return lista;
}
