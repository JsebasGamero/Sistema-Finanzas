// Franja visible en cualquier entorno que no sea producción.
// Sin ella, una pestaña de desarrollo y una de producción se ven idénticas, y
// es fácil registrar un movimiento real en la base de pruebas (o al revés).
import { ETIQUETA_ENTORNO, ENTORNO_COHERENTE } from '../services/entorno';
import { isSupabaseConfigured } from '../services/supabase';

export default function EnvBanner() {
    if (!ETIQUETA_ENTORNO) return null;

    const detalle = !ENTORNO_COHERENTE
        ? 'sin conexión a Supabase: revisa .env'
        : !isSupabaseConfigured()
            ? 'sin credenciales: solo modo local'
            : 'base de datos de pruebas';

    return (
        <div
            role="status"
            className="flex-shrink-0 w-full text-center text-xs font-semibold tracking-wide py-1 px-3"
            style={{ background: 'var(--env-banner-bg)', color: 'var(--env-banner-text)' }}
        >
            {ETIQUETA_ENTORNO.toUpperCase()} · {detalle}
        </div>
    );
}
