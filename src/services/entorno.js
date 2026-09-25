// Entorno de ejecución (desarrollo / staging / producción).
//
// Vite elige el modo por el comando: `npm run dev` -> development,
// `npm run build` -> production, `vite build --mode staging` -> staging.
// Cada modo carga su propio `.env.<modo>.local` con las credenciales de SU
// proyecto de Supabase (ver docs/ENTORNOS.md).
//
// El riesgo que esto evita: probar en desarrollo contra la base de
// producción. Por eso cada archivo de entorno DECLARA a qué entorno pertenece
// (`VITE_APP_ENV`), y si esa declaración no coincide con el modo en que corre
// la app, no se conecta a Supabase. Un `.env` genérico con las credenciales de
// producción, que Vite carga en todos los modos, queda bloqueado en dev.

export const MODO = import.meta.env.MODE; // 'development' | 'production' | 'staging' | ...
export const ENTORNO_DECLARADO = import.meta.env.VITE_APP_ENV;

export const ES_PRODUCCION = MODO === 'production';

/** ¿El archivo de variables cargado corresponde al modo actual? */
export const ENTORNO_COHERENTE = Boolean(ENTORNO_DECLARADO) && ENTORNO_DECLARADO === MODO;

export function describirProblemaDeEntorno() {
    if (ENTORNO_COHERENTE) return null;
    if (!ENTORNO_DECLARADO) {
        return `Las variables cargadas no declaran VITE_APP_ENV. La app corre en modo ` +
            `"${MODO}" y no se conectará a Supabase hasta que exista .env.${MODO}.local ` +
            `con VITE_APP_ENV=${MODO}. Ver docs/ENTORNOS.md.`;
    }
    return `Las variables cargadas son de "${ENTORNO_DECLARADO}" pero la app corre en modo ` +
        `"${MODO}". Se bloquea la conexión a Supabase para no escribir en el entorno ` +
        `equivocado. Ver docs/ENTORNOS.md.`;
}

/**
 * Nombre de la base IndexedDB.
 *
 * Producción conserva el nombre histórico para no perder los datos locales de
 * los dispositivos ya instalados. Los demás entornos usan una base propia:
 * como sync_queue sobrevive al logout, compartir la base permitiría que datos
 * de prueba encolados en un navegador acabaran subiendo a producción.
 */
export const NOMBRE_BASE_LOCAL = ES_PRODUCCION
    ? 'FinanzasConstructora'
    : `FinanzasConstructora-${MODO}`;

/** Etiqueta visible para entornos que no son producción. */
export const ETIQUETA_ENTORNO = {
    development: 'Desarrollo',
    staging: 'Pruebas'
}[MODO] || (ES_PRODUCCION ? null : MODO);
