// Contenedor de avisos breves (ver hooks/useToast.js).
// Escritorio: arriba a la derecha. Móvil: arriba, a lo ancho, debajo de la
// barra superior, para no tapar la barra de navegación ni el botón de guardar.
import { X, CircleCheck, CircleAlert, TriangleAlert, Info } from 'lucide-react';
import { ES_PRODUCCION, SUPABASE_HABILITADO } from '../services/entorno';

const TONOS = {
    success: { icono: CircleCheck, color: 'text-pos', borde: 'border-l-pos' },
    error: { icono: CircleAlert, color: 'text-neg', borde: 'border-l-neg' },
    warning: { icono: TriangleAlert, color: 'text-warn', borde: 'border-l-warn' },
    info: { icono: Info, color: 'text-info', borde: 'border-l-info' },
};

// Misma condición que EnvBanner: la franja de entorno (28 px) se ve en todo
// lo que no sea una producción bien configurada, y los avisos van debajo.
const ALTO_FRANJA = ES_PRODUCCION && SUPABASE_HABILITADO ? 0 : 28;
const ALTO_BARRA_MOVIL = 56;

function ToastItem({ toast, onRemove }) {
    const tono = TONOS[toast.type] || TONOS.info;
    const Icono = tono.icono;
    const esError = toast.type === 'error';

    return (
        <div
            role={esError ? 'alert' : 'status'}
            aria-live={esError ? 'assertive' : 'polite'}
            aria-atomic="true"
            className={`pointer-events-auto flex items-start gap-3 rounded-md border border-l-[3px] border-line-strong ${tono.borde} bg-surface py-2 pl-3 pr-1 text-ink animate-slide-in`}
            style={{ boxShadow: 'var(--shadow-pop)' }}
        >
            <Icono size={18} strokeWidth={2.25} className={`mt-[11px] flex-shrink-0 ${tono.color}`} aria-hidden="true" />
            <p className="min-w-0 flex-1 py-2 text-sm font-medium leading-snug break-words">
                {toast.message}
            </p>
            <button
                type="button"
                onClick={() => onRemove(toast.id)}
                className="btn-icon flex-shrink-0"
                aria-label="Cerrar aviso"
            >
                <X size={16} />
            </button>
        </div>
    );
}

export default function ToastContainer({ toasts, onRemove }) {
    // Se monta aunque esté vacío y no intercepta toques (pointer-events-none):
    // solo los avisos en sí reciben clics.
    return (
        <div
            className="pointer-events-none fixed inset-x-3 top-[var(--toast-top-movil)] z-[100] flex flex-col gap-2 lg:inset-x-auto lg:right-4 lg:top-[var(--toast-top-escritorio)] lg:w-[380px]"
            style={{
                '--toast-top-movil': `calc(env(safe-area-inset-top) + ${ALTO_FRANJA + ALTO_BARRA_MOVIL + 8}px)`,
                '--toast-top-escritorio': `${ALTO_FRANJA + 16}px`,
            }}
        >
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    );
}
