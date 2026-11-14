// Configuración del explorador y vistas guardadas.
//
// Una "vista" es una foto de la configuración del explorador (conjunto, modo,
// periodo, búsqueda, resumen, columnas y filtros de la grilla) con un nombre.
// Se guardan en localStorage del dispositivo: son preferencias, no datos del
// negocio (docs/REPORTES.md).
//
// Todo lo que viene de localStorage puede ser de una versión vieja, estar a
// medias o corrupto. normalizarVista() nunca lanza: valida campo por campo y
// completa con valores por defecto, para que una vista rota no tumbe la
// pantalla de reportes.
//
// Puro: sin React ni Dexie. Se prueba en vistas.test.js.
import { claveDia, PRESETS_RANGO } from '../../domain/value-objects/fecha';
import { conjuntoPorId, existeConjunto, CONJUNTO_POR_DEFECTO } from './conjuntos';
import { normalizarConfigResumen, configResumenPorDefecto, CAMPO_CONTEO } from './resumen';

export const VERSION_VISTA = 1;
export const MODOS = Object.freeze(['detalle', 'resumen']);
export const DENSIDADES = Object.freeze(['compacta', 'normal', 'amplia']);
export const DENSIDAD_POR_DEFECTO = 'normal';
export const PRESET_PERSONALIZADO = 'personalizado';

const PRESETS_VALIDOS = new Set([...PRESETS_RANGO.map((p) => p.id), PRESET_PERSONALIZADO]);
const TIPOS_FILTRO = new Set(['text', 'number', 'date']);
const MAX_NOMBRE = 60;

function esObjeto(valor) {
    return valor !== null && typeof valor === 'object' && !Array.isArray(valor);
}

function esClaveDiaValida(valor) {
    return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && claveDia(valor) === valor;
}

/**
 * Estado de columnas de AG-Grid (getColumnState()) reducido a lo que se
 * restaura, y solo para columnas que el conjunto todavía tiene.
 */
export function normalizarEstadoColumnas(estado, conjunto) {
    if (!Array.isArray(estado)) return null;
    const campos = new Set(conjunto.columnas.map((c) => c.campo));
    const vistos = new Set();
    const limpio = [];
    for (const item of estado) {
        if (!esObjeto(item) || typeof item.colId !== 'string' || !campos.has(item.colId) || vistos.has(item.colId)) continue;
        vistos.add(item.colId);
        const columna = { colId: item.colId };
        if (typeof item.hide === 'boolean') columna.hide = item.hide;
        if (item.pinned === 'left' || item.pinned === 'right' || item.pinned === null) columna.pinned = item.pinned;
        if (item.sort === 'asc' || item.sort === 'desc' || item.sort === null) columna.sort = item.sort;
        if (Number.isInteger(item.sortIndex) || item.sortIndex === null) columna.sortIndex = item.sortIndex;
        if (Number.isFinite(item.width) && item.width > 20 && item.width < 2000) columna.width = Math.round(item.width);
        limpio.push(columna);
    }
    return limpio.length ? limpio : null;
}

/** Modelo de filtros de AG-Grid, solo con campos del conjunto y tipos conocidos. */
export function normalizarFiltrosGrid(modelo, conjunto) {
    if (!esObjeto(modelo)) return null;
    const campos = new Set(conjunto.columnas.map((c) => c.campo));
    const limpio = {};
    for (const [campo, filtro] of Object.entries(modelo)) {
        if (!campos.has(campo) || !esObjeto(filtro) || !TIPOS_FILTRO.has(filtro.filterType)) continue;
        limpio[campo] = filtro;
    }
    return Object.keys(limpio).length ? limpio : null;
}

function normalizarOrdenDetalle(orden, conjunto) {
    if (!esObjeto(orden)) return null;
    const existe = conjunto.columnas.some((c) => c.campo === orden.campo);
    if (!existe || (orden.direccion !== 'asc' && orden.direccion !== 'desc')) return null;
    return { campo: orden.campo, direccion: orden.direccion };
}

/** Configuración inicial del explorador para un conjunto. */
export function configPorDefecto(conjuntoId) {
    const conjunto = conjuntoPorId(conjuntoId);
    return {
        modo: 'detalle',
        preset: 'todo',
        desde: '',
        hasta: '',
        busqueda: '',
        configResumen: configResumenPorDefecto(conjunto),
        estadoColumnas: null,
        filtrosGrid: null,
        ordenDetalle: null,
        mapaCalor: false,
        mostrarGrafica: true,
    };
}

/**
 * Valida y completa la configuración del explorador para un conjunto.
 * @returns {{ modo, preset, desde, hasta, busqueda, configResumen, estadoColumnas,
 *   filtrosGrid, ordenDetalle, mapaCalor, mostrarGrafica }}
 */
export function normalizarConfigExplorador(entrada, conjuntoId) {
    const conjunto = conjuntoPorId(conjuntoId);
    const base = configPorDefecto(conjunto.id);
    if (!esObjeto(entrada)) return base;

    let preset = PRESETS_VALIDOS.has(entrada.preset) ? entrada.preset : base.preset;
    let desde = esClaveDiaValida(entrada.desde) ? entrada.desde : '';
    let hasta = esClaveDiaValida(entrada.hasta) ? entrada.hasta : '';
    if (desde && hasta && desde > hasta) [desde, hasta] = [hasta, desde];
    if (preset !== PRESET_PERSONALIZADO) {
        desde = '';
        hasta = '';
    }
    // Sin fecha en el conjunto no hay periodo que filtrar.
    if (!conjunto.campoFecha) preset = 'todo';

    return {
        modo: MODOS.includes(entrada.modo) ? entrada.modo : base.modo,
        preset,
        desde,
        hasta,
        busqueda: typeof entrada.busqueda === 'string' ? entrada.busqueda.slice(0, 200) : '',
        configResumen: normalizarConfigResumen(entrada.configResumen, conjunto),
        estadoColumnas: normalizarEstadoColumnas(entrada.estadoColumnas, conjunto),
        filtrosGrid: normalizarFiltrosGrid(entrada.filtrosGrid, conjunto),
        ordenDetalle: normalizarOrdenDetalle(entrada.ordenDetalle, conjunto),
        mapaCalor: typeof entrada.mapaCalor === 'boolean' ? entrada.mapaCalor : base.mapaCalor,
        mostrarGrafica: typeof entrada.mostrarGrafica === 'boolean' ? entrada.mostrarGrafica : base.mostrarGrafica,
    };
}

/**
 * Valida y completa una vista (versión 1). Devuelve null si no es un objeto.
 * Una vista sin nombre válido queda con nombre '' (quien la guarda lo exige).
 */
export function normalizarVista(objeto) {
    if (!esObjeto(objeto)) return null;
    const conjuntoId = existeConjunto(objeto.conjuntoId) ? objeto.conjuntoId : CONJUNTO_POR_DEFECTO;
    const nombre = typeof objeto.nombre === 'string' ? objeto.nombre.trim().slice(0, MAX_NOMBRE) : '';
    return {
        id: typeof objeto.id === 'string' && objeto.id ? objeto.id : '',
        nombre,
        descripcion: typeof objeto.descripcion === 'string' ? objeto.descripcion : '',
        version: VERSION_VISTA,
        creada: typeof objeto.creada === 'string' ? objeto.creada : '',
        conjuntoId,
        densidad: DENSIDADES.includes(objeto.densidad) ? objeto.densidad : null,
        ...normalizarConfigExplorador(objeto, conjuntoId),
    };
}

/** Lista de vistas guardadas leída de localStorage (texto JSON o arreglo). */
export function leerVistasGuardadas(entrada) {
    let lista = entrada;
    if (typeof entrada === 'string') {
        try {
            lista = JSON.parse(entrada);
        } catch {
            return [];
        }
    }
    if (!Array.isArray(lista)) return [];
    const vistas = [];
    const ids = new Set();
    for (const item of lista) {
        const vista = normalizarVista(item);
        if (!vista || !vista.nombre || !vista.id || ids.has(vista.id) || vista.id.startsWith('pre:')) continue;
        ids.add(vista.id);
        vistas.push(vista);
    }
    return vistas;
}

// ---------------------------------------------------------------------------
// Vistas predefinidas
// ---------------------------------------------------------------------------

const SOLO_EGRESOS = { tipo: { filterType: 'text', type: 'equals', filter: 'Egreso' } };

const DEFINICIONES = [
    {
        id: 'pre:gasto_obra_mes',
        nombre: 'Gasto por obra y mes',
        descripcion: 'Egresos de cada obra, mes a mes, este año.',
        conjuntoId: 'movimientos',
        modo: 'resumen',
        preset: 'anio',
        filtrosGrid: SOLO_EGRESOS,
        configResumen: {
            filas: ['obra'],
            columnas: 'fecha:mes',
            valor: { campo: 'monto', agregacion: 'suma' },
            mostrarComo: 'valor',
            orden: 'valor_desc',
            top: null,
        },
        mapaCalor: true,
        mostrarGrafica: true,
    },
    {
        id: 'pre:gasto_categoria',
        nombre: 'Gasto por categoría',
        descripcion: 'Qué parte del gasto se va en cada categoría.',
        conjuntoId: 'movimientos',
        modo: 'resumen',
        preset: 'todo',
        filtrosGrid: SOLO_EGRESOS,
        configResumen: {
            filas: ['categoria'],
            columnas: null,
            valor: { campo: 'monto', agregacion: 'suma' },
            mostrarComo: 'pct_total',
            orden: 'valor_desc',
            top: null,
        },
        mapaCalor: false,
        mostrarGrafica: true,
    },
    {
        id: 'pre:flujo_caja_mes',
        nombre: 'Flujo mensual por caja',
        descripcion: 'Ingresos menos egresos de cada caja por mes (sin transferencias).',
        conjuntoId: 'movimientos',
        modo: 'resumen',
        preset: 'anio',
        configResumen: {
            filas: ['caja'],
            columnas: 'fecha:mes',
            valor: { campo: 'neto', agregacion: 'suma' },
            mostrarComo: 'valor',
            orden: 'etiqueta',
            top: null,
        },
        mapaCalor: false,
        mostrarGrafica: true,
    },
    {
        id: 'pre:pagos_proveedor_trimestre',
        nombre: 'Pagos por proveedor por trimestre',
        descripcion: 'Egresos a cada proveedor, por trimestre, este año.',
        conjuntoId: 'movimientos',
        modo: 'resumen',
        preset: 'anio',
        filtrosGrid: SOLO_EGRESOS,
        configResumen: {
            filas: ['proveedor'],
            columnas: 'fecha:trimestre',
            valor: { campo: 'monto', agregacion: 'suma' },
            mostrarComo: 'valor',
            orden: 'valor_desc',
            top: 20,
        },
        mapaCalor: true,
        mostrarGrafica: false,
    },
    {
        id: 'pre:movimientos_usuario_tipo',
        nombre: 'Movimientos por usuario y tipo',
        descripcion: 'Cuántos movimientos registró cada persona este mes.',
        conjuntoId: 'movimientos',
        modo: 'resumen',
        preset: 'mes',
        configResumen: {
            filas: ['usuario'],
            columnas: 'tipo',
            valor: { campo: CAMPO_CONTEO, agregacion: 'conteo' },
            mostrarComo: 'valor',
            orden: 'valor_desc',
            top: null,
        },
        mapaCalor: false,
        mostrarGrafica: true,
    },
    {
        id: 'pre:pendientes_sync',
        nombre: 'Pendientes de sincronizar',
        descripcion: 'Movimientos que todavía no subieron a la nube.',
        conjuntoId: 'movimientos',
        modo: 'detalle',
        preset: 'todo',
        filtrosGrid: { sincronizado: { filterType: 'text', type: 'equals', filter: 'Pendiente' } },
        ordenDetalle: { campo: 'fecha', direccion: 'desc' },
    },
    {
        id: 'pre:ejecucion_obras',
        nombre: 'Ejecución de obras',
        descripcion: 'Presupuesto, gastado y porcentaje ejecutado de cada obra.',
        conjuntoId: 'obras',
        modo: 'detalle',
        preset: 'todo',
        ordenDetalle: { campo: 'ejecucion', direccion: 'desc' },
    },
    {
        id: 'pre:deudas_abiertas',
        nombre: 'Deudas abiertas',
        descripcion: 'Cuentas por pagar que no están saldadas, de la más vieja a la más nueva.',
        conjuntoId: 'deudas_terceros',
        modo: 'detalle',
        preset: 'todo',
        filtrosGrid: { estado: { filterType: 'text', type: 'notEqual', filter: 'Pagada' } },
        ordenDetalle: { campo: 'antiguedad_dias', direccion: 'desc' },
    },
];

export const VISTAS_PREDEFINIDAS = Object.freeze(
    DEFINICIONES.map((definicion) => Object.freeze({ ...normalizarVista(definicion), predefinida: true }))
);
