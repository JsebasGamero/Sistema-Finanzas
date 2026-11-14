// Franja de entorno, siempre arriba de todo.
//
// Fuera de producción se ve siempre: sin ella, una pestaña de desarrollo y
// una de producción son idénticas, y es fácil registrar un movimiento real en
// la base de pruebas (o al revés). Dice además contra qué base se trabaja.
//
// En producción no se ve, SALVO que la build no tenga conexión configurada
// (ADM-16): antes, un .env viejo sin VITE_APP_ENV dejaba la app apuntando a
// un servidor inexistente y lo único visible era "Error al iniciar sesión".
import {
    CREDENCIALES_PRESENTES,
    ENTORNO_COHERENTE,
    ENTORNO_DECLARADO,
    ES_PRODUCCION,
    ETIQUETA_ENTORNO,
    MODO_LOCAL_DISPONIBLE,
    SUPABASE_HABILITADO,
    hostSupabase,
} from '../services/entorno';

// En pantallas con muesca la franja es lo primero que se pinta: reserva el
// alto de la barra de estado (la barra superior de Layout no lo repite
// cuando hay franja).
const ESTILO_SAFE_AREA = { paddingTop: 'env(safe-area-inset-top)' };

// Dos largos: en un celular de 320 px el texto completo ocupaba tres líneas
// (80 px de pantalla); ahí va la versión corta en una línea.
function detalleDelEntorno() {
    // Hay credenciales (o una declaración de entorno) pero no son de este
    // modo: entorno.js bloquea la conexión y explica el motivo en la consola.
    if (!ENTORNO_COHERENTE && (CREDENCIALES_PRESENTES || ENTORNO_DECLARADO)) {
        return {
            largo: 'conexión bloqueada: revisa el archivo .env (detalle en la consola)',
            corto: 'conexión bloqueada: revisa .env',
        };
    }
    if (SUPABASE_HABILITADO) {
        const host = hostSupabase();
        return {
            largo: host ? `base de pruebas · ${host}` : 'base de pruebas',
            corto: host || 'base de pruebas',
        };
    }
    if (MODO_LOCAL_DISPONIBLE) {
        return {
            largo: 'modo local sin Supabase: los datos solo viven en este navegador',
            corto: 'modo local, solo en este navegador',
        };
    }
    return { largo: 'sin conexión configurada', corto: 'sin conexión configurada' };
}

export default function EnvBanner() {
    if (ES_PRODUCCION) {
        if (SUPABASE_HABILITADO) return null;
        return (
            <div role="alert" className="flex-shrink-0 bg-neg text-paper" style={ESTILO_SAFE_AREA}>
                <p className="flex min-h-7 items-center justify-center px-3 py-1 text-center text-xs font-semibold leading-tight">
                    Esta instalación no tiene conexión configurada con la base de datos. Avisa al administrador.
                </p>
            </div>
        );
    }

    const detalle = detalleDelEntorno();
    const etiqueta = ETIQUETA_ENTORNO || 'Pruebas';

    return (
        <div
            role="status"
            className="flex-shrink-0"
            style={{ ...ESTILO_SAFE_AREA, background: 'var(--env-banner-bg)', color: 'var(--env-banner-text)' }}
        >
            <p
                className="flex h-7 items-center justify-center gap-x-1.5 overflow-hidden whitespace-nowrap px-3 text-xs leading-none"
                title={`${etiqueta} · ${detalle.largo}`}
            >
                <span className="flex-shrink-0 font-semibold uppercase tracking-[0.08em]">{etiqueta}</span>
                <span aria-hidden="true">·</span>
                <span className="min-w-0 truncate font-medium sm:hidden">{detalle.corto}</span>
                <span className="hidden min-w-0 truncate font-medium sm:inline">{detalle.largo}</span>
            </p>
        </div>
    );
}
