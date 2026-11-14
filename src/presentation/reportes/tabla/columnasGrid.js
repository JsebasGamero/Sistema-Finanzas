// Definiciones de columnas de AG-Grid a partir de un conjunto de
// src/application/reportes/conjuntos.js.
//
// Fechas (REP-3 y REP-6): los valores ya llegan como 'YYYY-MM-DD'; se
// muestran con formatoFecha() y el filtro compara claves de calendario con
// claveDia(), incluyendo los extremos del rango. Antes se formateaba con
// new Date(valor) (un día menos en Colombia) y el filtro «Entre» dejaba
// afuera el primer y el último día.
import { claveDia, claveDiaDeDate } from '../../../domain/value-objects/fecha';
import { normalizarTexto, textoParaFiltro, valorPorcentajeParaFiltro } from '../../../application/reportes/filtros';
import { formatearValor, esNumerico } from './formatoCeldas';
import { CeldaChip, CeldaSoporte, CeldaTipoMovimiento } from './celdas';

export const ID_COLUMNA_SELECCION = 'ag-Grid-SelectionColumn';

const OPCIONES_TEXTO = ['contains', 'notContains', 'equals', 'notEqual', 'startsWith', 'endsWith', 'blank', 'notBlank'];
const OPCIONES_NUMERO = ['equals', 'notEqual', 'lessThan', 'lessThanOrEqual', 'greaterThan', 'greaterThanOrEqual', 'inRange', 'blank', 'notBlank'];
const OPCIONES_FECHA = ['equals', 'notEqual', 'lessThan', 'greaterThan', 'inRange', 'blank', 'notBlank'];

// Mismos tonos que el resto de la app: verde a favor, ámbar a medias, rojo
// lo que se debe; azul para lo terminado sin juicio.
const TONOS_ESTADO_DEUDA = { Pagada: 'pos', Parcial: 'warn', Pendiente: 'neg' };
const TONOS_ESTADO_OBRA = { Activo: 'pos', Pausado: 'warn', Finalizado: 'info' };
const TONOS_SINCRONIZADO = { Pendiente: 'warn' };

// Orden de textos en español, igual que el motor de resumen (dimensiones.js).
// El comparador por defecto de AG-Grid compara códigos Unicode: "Álamos" y
// "Ñame" quedaban después de "Zuluaga" y las minúsculas al final, y así se
// exportaban. accentedSort usa el locale del navegador, no el español.
const COLLATOR = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function compararTexto(a, b) {
    return COLLATOR.compare(String(a ?? ''), String(b ?? ''));
}

/** Comparador del filtro de fecha: claves de calendario, sin UTC. */
export function compararFechaFiltro(fechaFiltro, valorCelda) {
    const celda = claveDia(valorCelda);
    if (!celda) return -1;
    const filtro = claveDiaDeDate(fechaFiltro);
    if (celda < filtro) return -1;
    if (celda > filtro) return 1;
    return 0;
}

function compararMomentos(a, b) {
    const ta = a ? new Date(a).getTime() : NaN;
    const tb = b ? new Date(b).getTime() : NaN;
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return -1;
    if (Number.isNaN(tb)) return 1;
    return ta - tb;
}

/** valueFormatter común: en la fila de totales, el rótulo va tal cual. */
function formateador(tipo) {
    return (params) => {
        if (params.node?.rowPinned && typeof params.value === 'string') return params.value;
        return formatearValor(params.value, tipo);
    };
}

function rendererDe(conjunto, columna) {
    if (columna.campo === 'soporte') return { cellRenderer: CeldaSoporte };
    if (conjunto.id === 'movimientos' && columna.campo === 'tipo') return { cellRenderer: CeldaTipoMovimiento };
    if (columna.campo === 'sincronizado') return { cellRenderer: CeldaChip, cellRendererParams: { tonos: TONOS_SINCRONIZADO } };
    if (columna.campo === 'estado' && conjunto.id === 'obras') return { cellRenderer: CeldaChip, cellRendererParams: { tonos: TONOS_ESTADO_OBRA } };
    if (columna.campo === 'estado') return { cellRenderer: CeldaChip, cellRendererParams: { tonos: TONOS_ESTADO_DEUDA } };
    return {};
}

function clasesNumericas(columna) {
    if (columna.tipo === 'porcentaje' && (columna.campo === 'ejecucion')) {
        return {
            'celda-neg': (p) => !p.node?.rowPinned && Number(p.value) > 1,
            'celda-warn': (p) => !p.node?.rowPinned && Number(p.value) >= 0.9 && Number(p.value) <= 1,
        };
    }
    if (columna.tipo === 'dinero') return { 'celda-neg': (p) => typeof p.value === 'number' && p.value < 0 };
    return undefined;
}

/**
 * ColDefs de la grilla de detalle.
 * @param {object} conjunto
 */
export function columnasDetalle(conjunto) {
    return conjunto.columnas.map((columna) => {
        const base = {
            colId: columna.campo,
            field: columna.campo,
            headerName: columna.etiqueta,
            headerTooltip: columna.etiqueta,
            hide: !columna.visible,
            width: columna.ancho ?? 140,
            minWidth: 80,
            // Sin inferencia de tipos: con la primera fila vacía AG-Grid podía
            // elegir otro filtro, y con booleanos pintaba casillas.
            cellDataType: false,
            valueFormatter: formateador(columna.tipo),
            ...(columna.orden ? { sort: columna.orden } : {}),
        };

        if (esNumerico(columna.tipo)) {
            return {
                ...base,
                type: 'rightAligned',
                cellClass: 'celda-num',
                cellClassRules: clasesNumericas(columna),
                // Se filtra sobre lo que se ve ("90 %"), no sobre la fracción
                // guardada (0,9). El modo resumen hace lo mismo en filtros.js.
                ...(columna.tipo === 'porcentaje'
                    ? { filterValueGetter: (p) => valorPorcentajeParaFiltro(p.data?.[columna.campo]) }
                    : {}),
                filter: 'agNumberColumnFilter',
                filterParams: { filterOptions: OPCIONES_NUMERO, inRangeInclusive: true, buttons: ['reset'], maxNumConditions: 2 },
            };
        }
        if (columna.tipo === 'fecha' || columna.tipo === 'fechaHora') {
            return {
                ...base,
                cellClass: 'celda-num',
                ...(columna.tipo === 'fechaHora' ? { comparator: compararMomentos } : {}),
                filter: 'agDateColumnFilter',
                filterParams: {
                    comparator: compararFechaFiltro,
                    inRangeInclusive: true,
                    filterOptions: OPCIONES_FECHA,
                    buttons: ['reset'],
                    maxNumConditions: 2,
                },
            };
        }
        if (columna.tipo === 'booleano') {
            return {
                ...base,
                ...rendererDe(conjunto, columna),
                filter: 'agTextColumnFilter',
                filterValueGetter: (p) => textoParaFiltro(p.data?.[columna.campo], 'booleano'),
                filterParams: { filterOptions: ['equals', 'notEqual'], textFormatter: normalizarTexto, buttons: ['reset'], maxNumConditions: 1 },
            };
        }
        return {
            ...base,
            ...rendererDe(conjunto, columna),
            comparator: compararTexto,
            filter: 'agTextColumnFilter',
            // Sin tildes ni mayúsculas, igual que la búsqueda y que el modo resumen.
            filterParams: { filterOptions: OPCIONES_TEXTO, textFormatter: normalizarTexto, buttons: ['reset'], maxNumConditions: 2 },
        };
    });
}

export const COLUMNA_POR_DEFECTO = Object.freeze({
    sortable: true,
    resizable: true,
    floatingFilter: true,
    suppressHeaderMenuButton: true,
});
