import { ArrowDown, ArrowUp, Columns3, Pin, RotateCcw } from 'lucide-react';
import Popover from './Popover';

/**
 * Panel de columnas: mostrar/ocultar, subir/bajar, fijar a la izquierda y
 * restablecer. AG-Grid Community no trae panel de columnas (es Enterprise).
 */
export default function MenuColumnas({ columnas, deshabilitado, onAlternar, onMover, onFijar, onRestablecer }) {
    const visibles = columnas.filter((c) => c.visible).length;
    return (
        <Popover etiqueta="Columnas" icono={Columns3} alinear="derecha" ancho={340} deshabilitado={deshabilitado}>
            <div>
                <p className="explorador-popover-titulo">
                    Columnas ({visibles} de {columnas.length} visibles)
                </p>
                <ul>
                    {columnas.map((columna, indice) => (
                        <li key={columna.campo} className="explorador-fila-columna">
                            <label>
                                <input
                                    type="checkbox"
                                    className="explorador-casilla"
                                    checked={columna.visible}
                                    // Siempre queda al menos una columna a la vista.
                                    disabled={columna.visible && visibles === 1}
                                    onChange={() => onAlternar(columna.campo, !columna.visible)}
                                />
                                <span>{columna.etiqueta}</span>
                            </label>
                            <button
                                type="button"
                                className="explorador-icono-mini"
                                aria-label={`Subir ${columna.etiqueta}`}
                                disabled={indice === 0}
                                onClick={() => onMover(columna.campo, -1)}
                            >
                                <ArrowUp size={16} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="explorador-icono-mini"
                                aria-label={`Bajar ${columna.etiqueta}`}
                                disabled={indice === columnas.length - 1}
                                onClick={() => onMover(columna.campo, 1)}
                            >
                                <ArrowDown size={16} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="explorador-icono-mini"
                                aria-label={columna.fijada ? `Soltar ${columna.etiqueta}` : `Fijar ${columna.etiqueta} a la izquierda`}
                                aria-pressed={columna.fijada}
                                onClick={() => onFijar(columna.campo, !columna.fijada)}
                            >
                                <Pin size={16} aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
                <div className="explorador-separador" />
                <button type="button" className="explorador-opcion" onClick={onRestablecer}>
                    <RotateCcw size={16} aria-hidden="true" className="text-ink-3 mt-0.5" />
                    <span>
                        <span className="font-semibold">Restablecer columnas</span>
                        <span className="explorador-opcion-detalle">Orden, anchos y visibilidad originales.</span>
                    </span>
                </button>
            </div>
        </Popover>
    );
}
