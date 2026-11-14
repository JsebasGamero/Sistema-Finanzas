// Vista previa del soporte (foto del recibo) de un movimiento.
//
// La barra con Cerrar y Abrir original va DENTRO de la pantalla, arriba y
// fija (MOV-18): antes flotaba 48 px por encima de la imagen y, con un
// recibo alto en un celular de 568 px, la X quedaba medio fuera del borde.
import { useId, useRef, useState } from 'react';
import { ExternalLink, ImageOff, X } from 'lucide-react';
import useDialogo from '../hooks/useDialogo';

export default function ImagePreviewModal({ isOpen, onClose, imageUrl, title }) {
    const idTitulo = useId();
    const refCerrar = useRef(null);
    // Guarda la URL que falló (y no un booleano) para que, al abrir otro
    // soporte, el error anterior no se arrastre.
    const [urlConError, setUrlConError] = useState(null);
    const abierto = Boolean(isOpen && imageUrl);

    const { refDialogo, propsVelo } = useDialogo({
        abierto,
        onCerrar: onClose,
        refFocoInicial: refCerrar,
    });

    if (!abierto) return null;

    const fallo = urlConError === imageUrl;
    const titulo = title || 'Soporte del movimiento';

    return (
        <div
            ref={refDialogo}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTitulo}
            tabIndex={-1}
            className="fixed inset-0 z-50 flex flex-col bg-overlay outline-none animate-fade-in"
        >
            <div
                className="flex flex-shrink-0 items-center gap-2 border-b border-line bg-surface py-1.5 pl-4 pr-2"
                style={{ paddingTop: 'calc(6px + env(safe-area-inset-top))' }}
            >
                <h2 id={idTitulo} className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {titulo}
                </h2>
                <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-ghost"
                    aria-label="Abrir original en una pestaña nueva"
                >
                    <ExternalLink size={16} aria-hidden="true" />
                    <span className="hidden sm:inline">Abrir original</span>
                </a>
                <button
                    ref={refCerrar}
                    type="button"
                    onClick={onClose}
                    className="btn-icon"
                    aria-label="Cerrar vista previa"
                >
                    <X size={20} />
                </button>
            </div>

            {/* Tocar fuera de la imagen cierra; la imagen en sí no. El velo va
                doble (dos capas de --overlay) porque en el tema día una sola
                capa deja leer la pantalla de atrás y compite con el recibo. */}
            <div
                className="flex min-h-0 flex-1 items-center justify-center bg-overlay p-3 sm:p-6"
                style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
                {...propsVelo}
            >
                {fallo ? (
                    <div className="max-w-sm rounded-[10px] border border-line bg-surface p-5 text-center">
                        <ImageOff size={28} className="mx-auto text-ink-3" aria-hidden="true" />
                        <p className="mt-3 text-sm font-semibold text-ink">No se pudo mostrar el soporte aquí</p>
                        <p className="mt-1 text-sm text-ink-2">
                            Puede ser un PDF o no haber señal. Ábrelo en una pestaña nueva.
                        </p>
                        <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4">
                            <ExternalLink size={16} aria-hidden="true" />
                            Abrir original
                        </a>
                    </div>
                ) : (
                    <img
                        src={imageUrl}
                        alt={titulo}
                        onError={() => setUrlConError(imageUrl)}
                        className="max-h-full max-w-full rounded-md bg-surface object-contain"
                    />
                )}
            </div>
        </div>
    );
}
