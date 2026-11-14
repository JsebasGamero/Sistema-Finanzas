// Lógica pura del script configurar-pruebas.mjs (sin acceso a disco), para
// poder probarla.

/** Lee un archivo .env (texto) a un objeto. Ignora comentarios y líneas vacías. */
export function parsearEnv(texto) {
    const resultado = {};
    for (const linea of String(texto || '').split(/\r?\n/)) {
        const limpia = linea.trim();
        if (!limpia || limpia.startsWith('#')) continue;
        const igual = limpia.indexOf('=');
        if (igual === -1) continue;
        const clave = limpia.slice(0, igual).trim();
        let valor = limpia.slice(igual + 1).trim();
        if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
            valor = valor.slice(1, -1);
        }
        resultado[clave] = valor;
    }
    return resultado;
}

export function normalizarUrl(url) {
    return String(url || '').trim().replace(/\/+$/, '');
}

const ESQUEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Valida los datos de la cuenta de pruebas. Devuelve una lista de errores
 * (vacía si todo está bien).
 *
 * Dos formas válidas:
 * - Otro proyecto de Supabase: URL y key distintas de las de producción.
 * - El mismo proyecto de producción con un esquema aparte (`--esquema
 *   pruebas`, supabase/esquema_pruebas.sql): ahí la URL y la key SÍ son las
 *   de producción, y lo que separa los datos es el esquema, que nunca puede
 *   ser `public`.
 * @param {{ url: string, key: string, urlProduccion?: string, keyProduccion?: string, esquema?: string|boolean }} datos
 */
export function validarProyectoDePruebas({ url, key, urlProduccion, keyProduccion, esquema }) {
    const errores = [];
    const usaEsquema = typeof esquema === 'string' && esquema.trim() !== '';
    if (esquema !== undefined && esquema !== null && !usaEsquema) {
        errores.push('Falta el nombre en --esquema (por ejemplo: --esquema pruebas).');
    } else if (usaEsquema) {
        const e = esquema.trim();
        if (e === 'public') {
            errores.push('El esquema public es el de PRODUCCIÓN. Usa --esquema pruebas.');
        } else if (!ESQUEMA_RE.test(e)) {
            errores.push(`"${e}" no es un nombre de esquema válido (solo minúsculas, números y _).`);
        }
    }
    const u = normalizarUrl(url);
    if (!u) {
        errores.push('Falta --url (Supabase > Settings > API > Project URL).');
    } else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(u) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u)) {
        errores.push(`La URL "${u}" no parece de Supabase (https://<proyecto>.supabase.co).`);
    }
    if (!key || String(key).trim().length < 20) {
        errores.push('Falta --key o es demasiado corta (Supabase > Settings > API > anon public).');
    }
    if (!usaEsquema && u && urlProduccion && u === normalizarUrl(urlProduccion)) {
        errores.push('Esa URL es la del proyecto de PRODUCCIÓN. Usa otro proyecto de Supabase o, en el mismo proyecto, el esquema de pruebas: agrega --esquema pruebas.');
    }
    if (!usaEsquema && key && keyProduccion && String(key).trim() === String(keyProduccion).trim()) {
        errores.push('Esa anon key es la de PRODUCCIÓN. Usa la del proyecto de pruebas o agrega --esquema pruebas.');
    }
    return errores;
}

/** Contenido de .env.development.local */
export function contenidoEnvPruebas({ url, key, esquema }) {
    const cabecera = esquema
        ? [
            `# Cuenta de PRUEBAS: esquema "${esquema}" dentro del proyecto de producción.`,
            '# Generado por `npm run configurar:pruebas`. Los datos van SOLO a ese esquema;',
            '# la app de producción usa public y no los ve. No lo subas a git (está ignorado).',
        ]
        : [
            '# Proyecto Supabase de PRUEBAS. Generado por `npm run configurar:pruebas`.',
            '# No lo copies a producción ni lo subas a git (está ignorado).',
        ];
    return [
        ...cabecera,
        'VITE_APP_ENV=development',
        `VITE_SUPABASE_URL=${normalizarUrl(url)}`,
        `VITE_SUPABASE_ANON_KEY=${String(key).trim()}`,
        ...(esquema ? [`VITE_SUPABASE_SCHEMA=${esquema}`] : []),
        '',
    ].join('\n');
}

/** Lee --clave valor y --clave=valor de argv. */
export function leerArgumentos(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const actual = argv[i];
        if (!actual.startsWith('--')) {
            // Valores sueltos (sin --clave) quedan en args._
            (args._ ??= []).push(actual);
            continue;
        }
        const [clave, valorEnLinea] = actual.slice(2).split('=');
        if (valorEnLinea !== undefined) {
            args[clave] = valorEnLinea;
        } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
            args[clave] = argv[i + 1];
            i++;
        } else {
            args[clave] = true;
        }
    }
    return args;
}
