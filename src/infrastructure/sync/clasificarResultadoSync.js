// Decide qué hacer con una operación de sync_queue según lo que respondió
// Supabase. Es lógica pura: no conoce Dexie ni el cliente de Supabase, para
// poder probarla sin red (ver docs/SINCRONIZACION.md, "Clasificación").
//
// Por qué se decide por `error.code` y no por el status HTTP: PostgREST
// responde 409 tanto a un duplicado (23505) como a una FK rota (23503). Antes
// cualquier 409 se tomaba como "ya existe" y la operación se borraba de la
// cola marcada como sincronizada (SYNC-1). El dato se perdía en el siguiente
// pull sin que nadie se enterara.

/** Qué hace processSyncQueue con la operación. */
export const ACCION = Object.freeze({
    /** Subió (o ya estaba): se borra de la cola. */
    CONFIRMAR: 'confirmar',
    /** La nube la rechaza y reintentarla igual no sirve: pasa a la bandeja de errores. */
    BANDEJA: 'bandeja',
    /** Fallo pasajero (red, sesión, servidor): se queda en la cola y la corrida se detiene para no romper el orden. */
    DETENER: 'detener',
});

// Errores que se arreglan en el servidor con una migración, no en el dato
// (SYNC-7, DEU-4). Antes se borraban como "permanentes".
const CODIGOS_ESQUEMA = new Set([
    '42703',    // columna inexistente
    '42P01',    // tabla inexistente
    '42883',    // función inexistente (p. ej. la de un trigger)
    '42P10',    // ON CONFLICT sin índice único que lo respalde
    'PGRST202', // función no encontrada en la caché de esquema
    'PGRST204', // columna no encontrada en la caché de esquema
    'PGRST205', // tabla no encontrada en la caché de esquema
]);

const CODIGOS_TABLA_INEXISTENTE = new Set(['42P01', 'PGRST205']);

// Clases de error de Postgres que son pasajeras: conexión, bloqueos,
// recursos, cancelación por timeout del servidor.
const CLASES_TRANSITORIAS = ['08', '40', '53', '57', '58', 'XX'];

const MENSAJES = Object.freeze({
    red: 'Sin conexión con la nube. Se reintentará al recuperar la señal.',
    sesion: 'La sesión no es válida. Se reintentará cuando vuelvas a iniciar sesión.',
    servidor: 'La nube no respondió. Se reintentará más tarde.',
    esquema: 'Falta aplicar una migración en la base. Avisa al administrador; podrás reintentar el cambio cuando la aplique.',
    esquema_no_expuesto: 'El esquema de datos de este entorno no está habilitado en Supabase (Project Settings > Data API > Exposed schemas). Los cambios siguen guardados en este dispositivo.',
    referencia: 'Hace referencia a una caja, proyecto, tercero o empresa que no existe en la nube (la borraron o no se pudo subir).',
    duplicado: 'Ya existe en la nube un registro con el mismo nombre o NIT.',
    regla: 'Un valor no cumple las reglas de la base (por ejemplo, un tipo o un estado no permitido).',
    incompleto: 'Falta un dato obligatorio.',
    formato: 'Un dato tiene un formato inválido (por ejemplo, un número o una fecha vacíos).',
    no_existe: 'El registro ya no existe en la nube: lo borraron desde otro dispositivo o nunca se pudo subir.',
    rechazado: 'La nube rechazó el cambio.',
    corrupto: 'El cambio guardado en este dispositivo está dañado y no se puede subir.',
});

/** Mensaje para el usuario de un tipo de fallo. */
export function mensajeDeTipo(tipo) {
    return MENSAJES[tipo] ?? MENSAJES.rechazado;
}

function decision(accion, tipo, { codigo = '', detalle = '' } = {}) {
    return { accion, tipo, codigo: String(codigo ?? ''), mensaje: mensajeDeTipo(tipo), detalle: String(detalle ?? '') };
}

function detalleDe(error) {
    if (!error) return '';
    return [error.message, error.details, error.hint].filter(Boolean).join(' | ');
}

/** ¿El error dice que la tabla no existe en la nube? (el pull la salta en vez de vaciarla) */
export function esTablaInexistente(error) {
    if (!error) return false;
    const codigo = String(error.code ?? error.codigo ?? '');
    if (CODIGOS_TABLA_INEXISTENTE.has(codigo)) return true;
    // PostgREST antiguo responde 404 sin código cuando la tabla no existe.
    return !codigo && (error.status === 404);
}

/**
 * Clasifica la respuesta de supabase-js a una operación de la cola.
 * @param {object} r
 * @param {'INSERT'|'UPDATE'|'DELETE'} r.operacion
 * @param {{ code?: string, message?: string, details?: string, hint?: string } | null} r.error
 * @param {number} [r.status] status HTTP (0 = no hubo respuesta)
 * @param {Array|null} [r.data] filas devueltas por `.select('id')` (UPDATE y DELETE)
 * @returns {{ accion: string, tipo: string|null, codigo: string, mensaje: string, detalle: string }}
 */
export function clasificarRespuesta({ operacion, error, status, data }) {
    if (!error) {
        // Con sesión válida, un UPDATE que no toca ninguna fila significa que
        // la fila no existe en el servidor. Antes se daba por bueno y el
        // cambio se perdía (SYNC-3).
        if (operacion === 'UPDATE' && Array.isArray(data) && data.length === 0) {
            return decision(ACCION.BANDEJA, 'no_existe', { codigo: 'SIN_FILAS', detalle: 'UPDATE sin filas afectadas' });
        }
        // DELETE sin filas: ya estaba borrada (reintento tras perder la
        // respuesta, o la borró otro dispositivo). Es éxito idempotente;
        // dejarla en la cola la bloquearía para siempre.
        return decision(ACCION.CONFIRMAR, null);
    }

    const codigo = String(error.code ?? '');
    const detalle = detalleDe(error);
    const opciones = { codigo: codigo || (status ? `HTTP ${status}` : 'RED'), detalle };

    // Sin respuesta del servidor (fetch rechazado, timeout): postgrest-js lo
    // devuelve como status 0 y código vacío.
    if (!status && !codigo) return decision(ACCION.DETENER, 'red', opciones);

    // PGRST106: el esquema pedido (p. ej. `pruebas`) no está entre los
    // "Exposed schemas" del proyecto. Es configuración, no un dato malo: si
    // cayera en la regla general de PGRST1xx, CADA operación iría a la
    // bandeja. Se detiene la corrida y todo sigue en la cola hasta que se
    // habilite el esquema.
    if (codigo === 'PGRST106') return decision(ACCION.DETENER, 'esquema_no_expuesto', opciones);

    if (CODIGOS_ESQUEMA.has(codigo)) return decision(ACCION.BANDEJA, 'esquema', opciones);

    // Sesión vencida o sin permiso: con otra sesión puede subir.
    if (codigo === '42501' || codigo.startsWith('PGRST30') || status === 401 || status === 403) {
        return decision(ACCION.DETENER, 'sesion', opciones);
    }

    if (codigo === '23503') return decision(ACCION.BANDEJA, 'referencia', opciones);
    if (codigo === '23505') return decision(ACCION.BANDEJA, 'duplicado', opciones);
    if (codigo === '23502') return decision(ACCION.BANDEJA, 'incompleto', opciones);
    if (codigo.startsWith('23')) return decision(ACCION.BANDEJA, 'regla', opciones);
    if (codigo.startsWith('22')) return decision(ACCION.BANDEJA, 'formato', opciones);

    // Conexión del servidor con la base caída (PGRST000-003) y clases pasajeras de Postgres.
    if (/^PGRST00\d$/.test(codigo) || CLASES_TRANSITORIAS.some((clase) => codigo.startsWith(clase))) {
        return decision(ACCION.DETENER, 'servidor', opciones);
    }
    if (status === 408 || status === 425 || status === 429 || status >= 500) {
        return decision(ACCION.DETENER, 'servidor', opciones);
    }

    if (codigo.startsWith('PGRST1')) return decision(ACCION.BANDEJA, 'formato', opciones);
    if (status === 404) return decision(ACCION.BANDEJA, 'esquema', opciones);

    // Cualquier otro 4xx es un rechazo del dato: no se descarta, va a la bandeja.
    if (status >= 400) return decision(ACCION.BANDEJA, 'rechazado', opciones);

    // Respuesta rara sin status reconocible: mejor conservar que perder.
    return decision(ACCION.DETENER, 'servidor', opciones);
}

/**
 * Clasifica una excepción lanzada al enviar (no una respuesta de PostgREST).
 * Se conserva la operación: perderla por un fallo de red o de código es peor
 * que reintentarla.
 */
export function clasificarExcepcion(excepcion) {
    const nombre = excepcion?.name ?? '';
    const tipo = nombre === 'TypeError' || nombre === 'AbortError' || nombre === 'TimeoutError' ? 'red' : 'servidor';
    return decision(ACCION.DETENER, tipo, {
        codigo: nombre || 'EXCEPCION',
        detalle: excepcion?.message ?? String(excepcion),
    });
}
