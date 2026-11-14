// Botón con menú flotante para la barra del explorador. En escritorio se
// despliega bajo el botón; en móvil (< 640 px) sale como hoja inferior con
// fondo, para que quepa en 320 px sin salirse de la pantalla.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const ENFOCABLES = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {{ etiqueta: string, icono?: any, titulo?: string, alinear?: 'izquierda'|'derecha',
 *   ancho?: number, deshabilitado?: boolean, textoBoton?: string,
 *   children: React.ReactNode | ((api: { cerrar: () => void }) => React.ReactNode) }} props
 */
export default function Popover({
    etiqueta,
    icono: Icono,
    titulo,
    alinear = 'izquierda',
    ancho = 300,
    deshabilitado = false,
    textoBoton,
    siempreTexto = false,
    children,
}) {
    const [abierto, setAbierto] = useState(false);
    // Cada cierre "con foco" suma 1; un efecto devuelve el foco al botón.
    // (cerrar no toca refs: se pasa a los hijos durante el render.)
    const [devolverFoco, setDevolverFoco] = useState(0);
    const raiz = useRef(null);
    const boton = useRef(null);
    const panel = useRef(null);
    const id = useId();

    const cerrar = useCallback((enfocarBoton = true) => {
        setAbierto(false);
        if (enfocarBoton) setDevolverFoco((n) => n + 1);
    }, []);

    useEffect(() => {
        if (devolverFoco) boton.current?.focus();
    }, [devolverFoco]);

    useEffect(() => {
        if (!abierto) return undefined;
        const alPresionar = (evento) => {
            if (raiz.current && !raiz.current.contains(evento.target)) setAbierto(false);
        };
        // En captura y deteniendo la propagación: Escape cierra el menú sin
        // sacar además al usuario de la pantalla completa.
        const alTeclear = (evento) => {
            if (evento.key !== 'Escape') return;
            evento.stopPropagation();
            cerrar();
        };
        document.addEventListener('pointerdown', alPresionar);
        document.addEventListener('keydown', alTeclear, true);
        const marco = requestAnimationFrame(() => {
            panel.current?.querySelector(ENFOCABLES)?.focus();
        });
        return () => {
            document.removeEventListener('pointerdown', alPresionar);
            document.removeEventListener('keydown', alTeclear, true);
            cancelAnimationFrame(marco);
        };
    }, [abierto, cerrar]);

    return (
        <div className="explorador-popover-ancla" ref={raiz}>
            <button
                ref={boton}
                type="button"
                className="btn-secondary max-w-full"
                aria-label={etiqueta}
                title={etiqueta}
                aria-haspopup="dialog"
                aria-expanded={abierto}
                aria-controls={abierto ? id : undefined}
                disabled={deshabilitado}
                onClick={() => setAbierto((valor) => !valor)}
            >
                {Icono && <Icono size={16} aria-hidden="true" />}
                <span className={siempreTexto ? 'truncate' : 'explorador-texto-boton'}>{textoBoton ?? etiqueta}</span>
                <ChevronDown size={14} aria-hidden="true" className={`text-ink-3 ${siempreTexto ? '' : 'explorador-chevron'}`} />
            </button>
            {abierto && (
                <>
                    <div className="explorador-popover-fondo" aria-hidden="true" onClick={() => cerrar(false)} />
                    <div
                        id={id}
                        ref={panel}
                        role="dialog"
                        aria-label={titulo ?? etiqueta}
                        className="popover explorador-popover"
                        data-alinear={alinear}
                        style={{ '--ancho-popover': `${ancho}px` }}
                    >
                        {typeof children === 'function' ? children({ cerrar }) : children}
                    </div>
                </>
            )}
        </div>
    );
}
