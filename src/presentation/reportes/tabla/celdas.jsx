// Celdas especiales de la grilla de detalle. Cada una respeta la fila de
// totales fija (rowPinned): ahí solo va el texto "Total (N)" o la suma.
import { Paperclip } from 'lucide-react';

const MARCA_TIPO = { Ingreso: 'ingreso', Egreso: 'egreso', Transferencia: 'transferencia' };

function TextoFijo({ props }) {
    return <span className="font-semibold">{props.valueFormatted ?? props.value ?? ''}</span>;
}

/** Tipo de movimiento con su marca I / E / T (no depende solo del color). */
export function CeldaTipoMovimiento(props) {
    if (props.node?.rowPinned) return <TextoFijo props={props} />;
    const tipo = props.value;
    const clase = MARCA_TIPO[tipo];
    if (!clase) return <span>{tipo ?? ''}</span>;
    return (
        <span className="inline-flex items-center gap-2">
            <span className={`tipo-mark ${clase}`} aria-hidden="true">{tipo[0]}</span>
            {tipo}
        </span>
    );
}

/**
 * Etiqueta de estado con color y texto. Los tonos llegan por
 * cellRendererParams: { tonos: { Pagada: 'pos', Parcial: 'warn', ... } }.
 */
export function CeldaChip(props) {
    if (props.node?.rowPinned) return <TextoFijo props={props} />;
    const valor = props.value;
    if (valor === null || valor === undefined || valor === '') return null;
    const tono = props.tonos?.[valor];
    if (!tono) return <span className="text-ink-2">{valor}</span>;
    return <span className={`chip chip-${tono}`}>{valor}</span>;
}

/** Soporte del movimiento: botón para ver la foto (sin exponer la URL). */
export function CeldaSoporte(props) {
    if (props.node?.rowPinned) return <TextoFijo props={props} />;
    const url = props.data?._soporteUrl;
    if (!url) return <span className="text-ink-3">No</span>;
    const descripcion = props.data?.descripcion || 'movimiento';
    return (
        <button
            type="button"
            className="celda-boton"
            onClick={() => props.context?.verSoporte?.(url, descripcion)}
            aria-label={`Ver soporte de ${descripcion}`}
        >
            <Paperclip size={14} aria-hidden="true" />
            Ver
        </button>
    );
}
