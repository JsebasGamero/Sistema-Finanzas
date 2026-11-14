// Resultado del modo resumen (tabla dinámica) en AG-Grid. El cálculo lo hace
// src/application/reportes/resumen.js; aquí solo se pinta: columnas de grupo
// fijas a la izquierda, una columna por clave, Total, subtotales en negrita,
// fila de total fija abajo y mapa de calor opcional.
import { useMemo } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { dimensionPorId } from '../../../application/reportes/dimensiones';
import { temaGrid, MEDIDAS_DENSIDAD } from './temaGrid';
import { TEXTOS_GRID } from './localeGrid';
import { formatearValor } from './formatoCeldas';
import { useAnchoMinimo } from './useAnchoMinimo';

const NIVELES_CALOR = 7;
const ALTO_MAXIMO = 640;

const obtenerId = (params) => params.data.id;

const CLASES_FILA = {
    'fila-subtotal': (p) => Boolean(p.data?.esSubtotal),
};

const COLUMNA_POR_DEFECTO = Object.freeze({
    sortable: false,
    resizable: true,
    suppressMovable: true,
    suppressHeaderMenuButton: true,
});

/** Máximo absoluto de las celdas de detalle (sin subtotales ni totales). */
function maximoAbsoluto(resumen) {
    let maximo = 0;
    for (const fila of resumen.filas) {
        if (fila.esSubtotal) continue;
        const valores = resumen.columnas.length ? Object.values(fila.valores) : [fila.total];
        for (const v of valores) {
            if (typeof v === 'number' && Math.abs(v) > maximo) maximo = Math.abs(v);
        }
    }
    return maximo;
}

function reglasCalor(maximo) {
    const nivel = (p) => {
        if (p.node?.rowPinned || p.data?.esSubtotal || typeof p.value !== 'number' || maximo <= 0) return 0;
        return Math.max(1, Math.ceil((Math.abs(p.value) / maximo) * NIVELES_CALOR));
    };
    const reglas = {};
    for (let i = 1; i <= NIVELES_CALOR; i += 1) reglas[`calor-${i}`] = (p) => nivel(p) === i;
    return reglas;
}

export default function GrillaResumen({ resumen, conjunto, densidad, mapaCalor }) {
    const ancho = useAnchoMinimo(640);
    const { tipoValor } = resumen;

    const columnDefs = useMemo(() => {
        const dims = resumen.config.filas.map((id) => dimensionPorId(conjunto, id)).filter(Boolean);
        const dosNiveles = dims.length === 2;
        const formatear = (p) => formatearValor(p.value, tipoValor);
        const calor = mapaCalor ? reglasCalor(maximoAbsoluto(resumen)) : undefined;

        const grupos = dims.map((dim, i) => ({
            colId: `grupo_${i}`,
            headerName: dim.etiqueta,
            headerTooltip: dim.etiqueta,
            // En 320 px dos columnas fijas no dejarían ver las cifras.
            pinned: ancho ? 'left' : null,
            width: i === 0 ? 200 : 180,
            minWidth: 110,
            tooltipValueGetter: (p) => p.value,
            valueGetter: (p) => {
                const fila = p.data;
                if (!fila) return '';
                if (fila.esTotal) return i === 0 ? 'Total' : '';
                if (!dosNiveles) return fila.etiquetas[i] ?? '';
                return fila.nivel === i ? fila.etiquetas[i] : '';
            },
            cellClass: i === 1 ? 'celda-subnivel' : undefined,
        }));

        const valores = resumen.columnas.map((columna) => ({
            colId: `col_${columna.clave}`,
            headerName: columna.etiqueta,
            headerTooltip: columna.etiqueta,
            type: 'rightAligned',
            width: 130,
            minWidth: 90,
            valueGetter: (p) => p.data?.valores?.[columna.clave] ?? null,
            valueFormatter: formatear,
            cellClass: 'celda-num',
            cellClassRules: calor,
        }));

        const total = {
            colId: 'total',
            headerName: 'Total',
            type: 'rightAligned',
            width: 150,
            minWidth: 110,
            field: 'total',
            valueFormatter: formatear,
            cellClass: 'celda-num celda-total',
            // Sin columnas, el mapa de calor se pinta sobre el total de cada grupo.
            cellClassRules: resumen.columnas.length ? undefined : calor,
        };
        return [...grupos, ...valores, total];
    }, [resumen, conjunto, tipoValor, mapaCalor, ancho]);

    const filaTotal = useMemo(() => [{
        id: '__total',
        esTotal: true,
        nivel: 0,
        etiquetas: ['Total'],
        valores: resumen.totalesColumna,
        total: resumen.granTotal,
    }], [resumen]);

    const medidas = MEDIDAS_DENSIDAD[densidad] ?? MEDIDAS_DENSIDAD.normal;
    // Alto según las filas (hasta un máximo): un resumen de 5 grupos no
    // necesita una grilla de pantalla completa.
    const alto = Math.min(
        ALTO_MAXIMO,
        Math.max(200, (resumen.filas.length + 1) * medidas.rowHeight + medidas.headerHeight + 18)
    );

    return (
        <div className="explorador-grilla-resumen" style={{ height: alto }}>
            <AgGridReact
                theme={temaGrid(densidad)}
                rowData={resumen.filas}
                columnDefs={columnDefs}
                defaultColDef={COLUMNA_POR_DEFECTO}
                getRowId={obtenerId}
                pinnedBottomRowData={filaTotal}
                rowClassRules={CLASES_FILA}
                localeText={TEXTOS_GRID}
                enableCellTextSelection
                ensureDomOrder
                animateRows={false}
                tooltipShowDelay={400}
            />
        </div>
    );
}
