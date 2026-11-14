// Grilla de detalle del explorador: una fila por registro.
//
// - Totales (REP-18): fila fija abajo con la suma de las columnas de dinero
//   y número de las filas que quedan después de los filtros, y "Total (N)".
//   Antes la tabla decía "N registros" con el total cargado y no sumaba nada.
// - Estado (REP-19): orden, columnas y filtros se restauran al montar y se
//   guardan (con pausa) cada vez que cambian; antes se perdían al cambiar de
//   pestaña o de fuente.
// - Sin paginación ni autoHeight: altura fija y virtualización.
import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { aMonto, redondearMonto } from '../../../domain/value-objects/dinero';
import { normalizarEstadoColumnas } from '../../../application/reportes/vistas';
import { indiceRotuloTotal } from '../../../application/reportes/exportacion';
import { temaGrid } from './temaGrid';
import { TEXTOS_GRID } from './localeGrid';
import { columnasDetalle, COLUMNA_POR_DEFECTO, ID_COLUMNA_SELECCION } from './columnasGrid';

const PAUSA_GUARDADO_MS = 400;

const SELECCION = Object.freeze({
    mode: 'multiRow',
    checkboxes: true,
    headerCheckbox: true,
    // "Seleccionar todo" toma solo lo filtrado: es lo que el usuario ve.
    selectAll: 'filtered',
    enableClickSelection: false,
});

const COLUMNA_SELECCION = Object.freeze({ pinned: 'left', width: 48, minWidth: 48, maxWidth: 48, suppressMovable: true });

const obtenerId = (params) => params.data.id;

function mismasFilas(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
}

/**
 * Filas seleccionadas que se ven. AG-Grid deja seleccionadas las filas que un
 * filtro de columna esconde; la barra las seguía sumando ("3 seleccionadas"
 * con 1 a la vista). Igual que "Seleccionar todo", cuenta lo que se ve.
 */
function seleccionVisible(api) {
    return api.getSelectedNodes().filter((nodo) => nodo.displayed && nodo.data).map((nodo) => nodo.data);
}

/**
 * @param {{
 *   conjunto: object, filas: object[], densidad: string, version: number,
 *   estadoInicial: { estadoColumnas, filtrosGrid, ordenDetalle },
 *   onApi: (api|null) => void,
 *   onEstado: ({ conjuntoId, version, estadoColumnas, filtrosGrid }) => void,
 *   onVisibles: ({ conjuntoId, version, filas }) => void,
 *   onSeleccion: (filas: object[]) => void,
 *   onVerSoporte: (url: string, titulo: string) => void,
 * }} props
 */
export default function GrillaDetalle({
    conjunto, filas, densidad, version, estadoInicial, onApi, onEstado, onVisibles, onSeleccion, onVerSoporte,
}) {
    const columnDefs = useMemo(() => columnasDetalle(conjunto), [conjunto]);
    const columnasPorCampo = useMemo(() => new Map(conjunto.columnas.map((c) => [c.campo, c])), [conjunto]);
    const [totales, setTotales] = useState([]);
    const inicial = useRef(estadoInicial);
    const temporizador = useRef(null);
    const ultimasVisibles = useRef(null);
    const ultimaSeleccion = useRef([]);
    const ultimaFirma = useRef('');
    const contexto = useMemo(() => ({ verSoporte: onVerSoporte }), [onVerSoporte]);

    const guardarAhora = useCallback((api) => {
        clearTimeout(temporizador.current);
        temporizador.current = null;
        if (!api || api.isDestroyed?.()) return;
        onEstado({
            conjuntoId: conjunto.id,
            version,
            estadoColumnas: normalizarEstadoColumnas(api.getColumnState(), conjunto),
            filtrosGrid: api.getFilterModel(),
        });
    }, [conjunto, version, onEstado]);

    const programarGuardado = useCallback((evento) => {
        clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => guardarAhora(evento.api), PAUSA_GUARDADO_MS);
    }, [guardarAhora]);

    const recalcular = useCallback((api) => {
        if (!api || api.isDestroyed?.()) return;
        const visibles = [];
        api.forEachNodeAfterFilterAndSort((nodo) => {
            if (nodo.data) visibles.push(nodo.data);
        });

        const fila = { id: '__total' };
        for (const columna of conjunto.columnas) {
            if (columna.total !== 'suma') continue;
            let suma = 0;
            for (const dato of visibles) suma += aMonto(dato[columna.campo]);
            fila[columna.campo] = columna.tipo === 'dinero' ? redondearMonto(suma) : suma;
        }
        // El rótulo va en la primera columna de texto que se ve, sea cual sea
        // el orden que el usuario haya elegido.
        const mostradas = api.getAllDisplayedColumns()
            .map((c) => columnasPorCampo.get(c.getColId()))
            .filter(Boolean);
        const indice = indiceRotuloTotal(mostradas);
        if (indice >= 0) fila[mostradas[indice].campo] = `Total (${visibles.length})`;

        const firma = JSON.stringify(fila);
        if (firma !== ultimaFirma.current) {
            ultimaFirma.current = firma;
            setTotales([fila]);
        }
        if (!mismasFilas(visibles, ultimasVisibles.current)) {
            ultimasVisibles.current = visibles;
            onVisibles({ conjuntoId: conjunto.id, version, filas: visibles });
        }

        // AG-Grid no dispara selectionChanged al filtrar ni cuando la
        // sincronización reemplaza una fila seleccionada (getRowId): la
        // selección se vuelve a leer en cada actualización del modelo para
        // no sumar filas ocultas ni montos viejos.
        const seleccion = seleccionVisible(api);
        if (!mismasFilas(seleccion, ultimaSeleccion.current)) {
            ultimaSeleccion.current = seleccion;
            onSeleccion(seleccion);
        }
    }, [conjunto, columnasPorCampo, version, onVisibles, onSeleccion]);

    const alEstarLista = useCallback((evento) => {
        const { api } = evento;
        const { estadoColumnas, filtrosGrid, ordenDetalle } = inicial.current ?? {};
        if (Array.isArray(estadoColumnas) && estadoColumnas.length) {
            // La casilla de selección va primero: si no está en el estado,
            // applyOrder la mandaría al final.
            api.applyColumnState({ state: [{ colId: ID_COLUMNA_SELECCION }, ...estadoColumnas], applyOrder: true });
        } else if (ordenDetalle) {
            api.applyColumnState({ state: [{ colId: ordenDetalle.campo, sort: ordenDetalle.direccion }], defaultState: { sort: null } });
        }
        if (filtrosGrid) api.setFilterModel(filtrosGrid);
        onApi(api);
        ultimaSeleccion.current = [];
        onSeleccion([]);
        recalcular(api);
    }, [onApi, onSeleccion, recalcular]);

    const alDestruirse = useCallback((evento) => {
        // Un cambio hecho justo antes de cambiar de conjunto o de modo no se
        // pierde: se guarda ya, sin esperar la pausa.
        if (temporizador.current) guardarAhora(evento.api);
        onApi(null);
    }, [guardarAhora, onApi]);

    const alCambiarColumnas = useCallback((evento) => {
        if (evento.finished === false) return;
        programarGuardado(evento);
        recalcular(evento.api);
    }, [programarGuardado, recalcular]);

    const alActualizarModelo = useCallback((evento) => recalcular(evento.api), [recalcular]);
    const alSeleccionar = useCallback((evento) => {
        const seleccion = seleccionVisible(evento.api);
        ultimaSeleccion.current = seleccion;
        onSeleccion(seleccion);
    }, [onSeleccion]);

    return (
        <div className="explorador-grilla">
            <AgGridReact
                theme={temaGrid(densidad)}
                rowData={filas}
                columnDefs={columnDefs}
                defaultColDef={COLUMNA_POR_DEFECTO}
                getRowId={obtenerId}
                rowSelection={SELECCION}
                selectionColumnDef={COLUMNA_SELECCION}
                pinnedBottomRowData={totales}
                localeText={TEXTOS_GRID}
                context={contexto}
                enableCellTextSelection
                ensureDomOrder
                suppressDragLeaveHidesColumns
                animateRows={false}
                tooltipShowDelay={400}
                onGridReady={alEstarLista}
                onGridPreDestroyed={alDestruirse}
                onModelUpdated={alActualizarModelo}
                onFilterChanged={programarGuardado}
                onSortChanged={programarGuardado}
                onColumnMoved={alCambiarColumnas}
                onColumnVisible={alCambiarColumnas}
                onColumnPinned={alCambiarColumnas}
                onColumnResized={alCambiarColumnas}
                onSelectionChanged={alSeleccionar}
            />
        </div>
    );
}
