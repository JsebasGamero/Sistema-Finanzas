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
// Además, vite.config.js se niega a arrancar si el archivo de desarrollo
// apunta al mismo proyecto que el de producción.

export const MODO = import.meta.env.MODE; // 'development' | 'production' | 'staging' | ...
export const ENTORNO_DECLARADO = import.meta.env.VITE_APP_ENV;

export const ES_PRODUCCION = MODO === 'production';

// Esquema de Postgres donde viven los datos (VITE_SUPABASE_SCHEMA).
//
// Producción usa siempre `public`. La cuenta de pruebas puede ser otro
// proyecto de Supabase o, si el plan gratuito no deja crear más proyectos, el
// esquema `pruebas` DENTRO del proyecto de producción
// (supabase/esquema_pruebas.sql): mismas tablas, vacías y separadas; la app
// de producción nunca las ve. Ver docs/ENTORNOS.md.
const ESQUEMA_DECLARADO = String(import.meta.env.VITE_SUPABASE_SCHEMA || 'public').trim();

/** Nombre de esquema válido de Postgres (sin comillas ni mayúsculas). */
export const ESQUEMA_VALIDO = /^[a-z_][a-z0-9_]{0,62}$/.test(ESQUEMA_DECLARADO);
export const ESQUEMA_SUPABASE = ESQUEMA_VALIDO ? ESQUEMA_DECLARADO : 'public';
/** ¿La app trabaja en un esquema aparte del de producción? */
export const USA_ESQUEMA_DE_PRUEBAS = ESQUEMA_SUPABASE !== 'public';

/**
 * ¿El archivo de variables cargado corresponde al modo actual? Además, la
 * build de producción nunca puede apuntar a un esquema de pruebas, y un
 * nombre de esquema inválido bloquea la conexión en vez de caer en `public`
 * (que sería producción).
 */
export const ENTORNO_COHERENTE = Boolean(ENTORNO_DECLARADO) && ENTORNO_DECLARADO === MODO &&
    ESQUEMA_VALIDO && !(ES_PRODUCCION && USA_ESQUEMA_DE_PRUEBAS);

// Placeholders conocidos de .env.example: si alguien no copió el archivo,
// queremos detectarlo en vez de arrancar contra un proyecto inexistente.
const PLACEHOLDERS = [
    'https://tu-proyecto.supabase.co',
    'https://your-project.supabase.co',
    'tu-anon-key',
    'your-anon-key'
];

const URL_SUPABASE = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY_SUPABASE = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** ¿Hay credenciales reales (no vacías ni de plantilla)? */
export const CREDENCIALES_PRESENTES = Boolean(URL_SUPABASE) && Boolean(ANON_KEY_SUPABASE) &&
    !PLACEHOLDERS.includes(URL_SUPABASE) && !PLACEHOLDERS.includes(ANON_KEY_SUPABASE);

/** Se conecta a Supabase solo si hay credenciales Y son de este entorno. */
export const SUPABASE_HABILITADO = CREDENCIALES_PRESENTES && ENTORNO_COHERENTE;

/**
 * Modo local de pruebas: la app funciona entera sin Supabase, con un usuario
 * de prueba y datos solo en este navegador. Existe para poder probar sin
 * crear todavía el proyecto de pruebas en Supabase.
 *
 * Solo fuera de producción y solo cuando no hay Supabase configurado: así es
 * imposible que una build de producción, o una sesión con base de datos real,
 * entre por esta puerta.
 */
export const MODO_LOCAL_DISPONIBLE = !ES_PRODUCCION && !SUPABASE_HABILITADO;

export function describirProblemaDeEntorno() {
    if (ENTORNO_COHERENTE) return null;
    if (!ESQUEMA_VALIDO) {
        return `VITE_SUPABASE_SCHEMA="${ESQUEMA_DECLARADO}" no es un nombre de esquema válido ` +
            `(solo minúsculas, números y _). Se bloquea la conexión para no caer en el esquema ` +
            `de producción. Ver docs/ENTORNOS.md.`;
    }
    if (ES_PRODUCCION && USA_ESQUEMA_DE_PRUEBAS) {
        return `La build de producción tiene VITE_SUPABASE_SCHEMA="${ESQUEMA_SUPABASE}". ` +
            `Producción solo usa el esquema public: quita esa variable de .env.production.local.`;
    }
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
 *
 * El modo local (sin Supabase) tiene además su propia base: si después se
 * configura el proyecto de pruebas, los datos inventados del modo local no se
 * mezclan con los del proyecto ni se suben a él.
 */
//
// Con el esquema de pruebas también va aparte (…-development-pruebas): si
// antes se usó otro proyecto de pruebas, su cola pendiente no debe subir a
// este esquema, ni al revés.
export const NOMBRE_BASE_LOCAL = ES_PRODUCCION
    ? 'FinanzasConstructora'
    : MODO_LOCAL_DISPONIBLE
        ? `FinanzasConstructora-${MODO}-local`
        : USA_ESQUEMA_DE_PRUEBAS
            ? `FinanzasConstructora-${MODO}-${ESQUEMA_SUPABASE}`
            : `FinanzasConstructora-${MODO}`;

/** Etiqueta visible para entornos que no son producción. */
export const ETIQUETA_ENTORNO = {
    development: 'Desarrollo',
    staging: 'Pruebas'
}[MODO] || (ES_PRODUCCION ? null : MODO);

/**
 * Descripción de la base remota a la que se conecta la app, para la franja de
 * entorno y la pantalla de acceso: 'abcd.supabase.co' o, con el esquema de
 * pruebas, 'abcd.supabase.co · esquema pruebas'. null si no hay conexión.
 * Siempre visible para saber contra qué datos se está trabajando.
 */
export function hostSupabase() {
    if (!SUPABASE_HABILITADO) return null;
    try {
        const host = new URL(URL_SUPABASE).host;
        return USA_ESQUEMA_DE_PRUEBAS ? `${host} · esquema ${ESQUEMA_SUPABASE}` : host;
    } catch {
        return null;
    }
}

/**
 * Carpeta del bucket `soportes` para las fotos de este entorno. Con el
 * esquema de pruebas, las fotos van bajo `pruebas/` para no mezclarse con
 * las de producción (el bucket es el mismo).
 */
export const PREFIJO_SOPORTES = USA_ESQUEMA_DE_PRUEBAS ? `${ESQUEMA_SUPABASE}/` : '';
