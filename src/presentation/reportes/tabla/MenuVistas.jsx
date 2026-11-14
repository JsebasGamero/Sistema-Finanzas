import { useId, useState } from 'react';
import { Bookmark, BookmarkPlus, Trash2 } from 'lucide-react';
import { VISTAS_PREDEFINIDAS } from '../../../application/reportes/vistas';
import { conjuntoPorId } from '../../../application/reportes/conjuntos';
import Popover from './Popover';
import IconoConjunto from './IconoConjunto';

function OpcionVista({ vista, onAplicar, onBorrar }) {
    const conjunto = conjuntoPorId(vista.conjuntoId);
    const modo = vista.modo === 'resumen' ? 'Resumen' : 'Detalle';
    return (
        <div className="flex items-center gap-1">
            <button type="button" className="explorador-opcion" onClick={() => onAplicar(vista)}>
                <IconoConjunto id={vista.conjuntoId} size={18} className="text-ink-3 mt-0.5" />
                <span className="min-w-0">
                    <span className="font-semibold">{vista.nombre}</span>
                    <span className="explorador-opcion-detalle">
                        {vista.descripcion || `${conjunto.etiqueta} · ${modo}`}
                    </span>
                </span>
            </button>
            {onBorrar && (
                <button
                    type="button"
                    className="explorador-icono-mini"
                    aria-label={`Borrar la vista ${vista.nombre}`}
                    onClick={() => onBorrar(vista)}
                >
                    <Trash2 size={16} aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

/**
 * Vistas: predefinidas, guardadas en este dispositivo y "Guardar vista actual".
 * onGuardar(nombre) devuelve { ok, mensaje }.
 */
export default function MenuVistas({ vistas, onAplicar, onGuardar, onBorrar }) {
    const [nombre, setNombre] = useState('');
    const [resultado, setResultado] = useState(null);
    const idNombre = useId();

    function guardar(evento) {
        evento.preventDefault();
        const respuesta = onGuardar(nombre);
        setResultado(respuesta);
        if (respuesta.ok) setNombre('');
    }

    return (
        <Popover etiqueta="Vistas" icono={Bookmark} alinear="derecha" ancho={360}>
            {({ cerrar }) => (
                <div>
                    <form onSubmit={guardar} className="p-2">
                        <label htmlFor={idNombre} className="label">Guardar la vista actual</label>
                        <div className="flex gap-2">
                            <input
                                id={idNombre}
                                className="input-field"
                                value={nombre}
                                maxLength={60}
                                placeholder="Ej.: Cierre de mes"
                                onChange={(e) => {
                                    setNombre(e.target.value);
                                    setResultado(null);
                                }}
                            />
                            <button type="submit" className="btn-primary shrink-0" aria-label="Guardar vista" disabled={!nombre.trim()}>
                                <BookmarkPlus size={16} aria-hidden="true" />
                            </button>
                        </div>
                        {resultado && (
                            <p className={`text-sm mt-2 ${resultado.ok ? 'text-pos' : 'text-neg'}`} role="status">
                                {resultado.mensaje}
                            </p>
                        )}
                    </form>

                    <div className="explorador-separador" />
                    <p className="explorador-popover-titulo">Guardadas en este dispositivo</p>
                    {vistas.length === 0 ? (
                        <p className="px-2 pb-2 text-sm text-ink-3">
                            Todavía no hay vistas guardadas. Arma la tabla a tu gusto y ponle un nombre arriba.
                        </p>
                    ) : (
                        vistas.map((vista) => (
                            <OpcionVista
                                key={vista.id}
                                vista={vista}
                                onAplicar={(v) => {
                                    onAplicar(v);
                                    cerrar(false);
                                }}
                                onBorrar={(v) => {
                                    cerrar(false);
                                    onBorrar(v);
                                }}
                            />
                        ))
                    )}

                    <div className="explorador-separador" />
                    <p className="explorador-popover-titulo">Predefinidas</p>
                    {VISTAS_PREDEFINIDAS.map((vista) => (
                        <OpcionVista
                            key={vista.id}
                            vista={vista}
                            onAplicar={(v) => {
                                onAplicar(v);
                                cerrar(false);
                            }}
                        />
                    ))}
                </div>
            )}
        </Popover>
    );
}
