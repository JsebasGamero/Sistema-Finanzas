import { CONJUNTOS } from '../../../application/reportes/conjuntos';
import Popover from './Popover';
import { iconoDeConjunto } from './iconosConjunto';
import IconoConjunto from './IconoConjunto';

/** Elige el conjunto de datos (movimientos, cajas, obras...). */
export default function SelectorConjunto({ conjunto, onCambiar }) {
    const IconoActual = iconoDeConjunto(conjunto.id);
    return (
        <Popover
            etiqueta={`Datos: ${conjunto.etiqueta}`}
            textoBoton={conjunto.etiqueta}
            siempreTexto
            titulo="Elegir datos"
            icono={IconoActual}
            ancho={340}
        >
            {({ cerrar }) => (
                <div>
                    <p className="explorador-popover-titulo">Qué quieres ver</p>
                    {CONJUNTOS.map((c) => {
                        const actual = c.id === conjunto.id;
                        return (
                            <button
                                key={c.id}
                                type="button"
                                className="explorador-opcion"
                                aria-current={actual ? 'true' : undefined}
                                onClick={() => {
                                    onCambiar(c.id);
                                    cerrar();
                                }}
                            >
                                <IconoConjunto id={c.id} size={18} className={actual ? 'text-accent mt-0.5' : 'text-ink-3 mt-0.5'} />
                                <span>
                                    <span className="font-semibold">{c.etiqueta}</span>
                                    <span className="explorador-opcion-detalle">{c.descripcion}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </Popover>
    );
}
