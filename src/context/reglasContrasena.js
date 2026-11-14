// Reglas de contraseña compartidas por "Definir contraseña nueva"
// (NuevaContrasenaScreen + completarRecuperacion) y "Cambiar contraseña"
// (Layout).
//
// Por qué existe (seguridad-entornos-6, integracion-3): el mínimo estaba
// repartido y no coincidía: 6 en los formularios, 8 en el mensaje de error y
// 10 o más en docs/SEGURIDAD.md. Con el mínimo de Supabase en 10, la pantalla
// aceptaba 8 caracteres, el servidor los rechazaba y el mensaje decía "usa al
// menos 8": la persona quedaba en un bucle sin saber el mínimo real.

/**
 * Longitud mínima que valida la app antes de llamar a Supabase. Debe ser la
 * misma que Authentication > Providers > Email > "Minimum password length"
 * en los dos proyectos (docs/SEGURIDAD.md). Si se cambia allá, se cambia
 * aquí. Si el servidor exige más, el mensaje muestra la cifra del servidor.
 */
export const MINIMO_CONTRASENA = 10;

/** ¿Supabase rechazó la contraseña por débil (corta, sin variedad o filtrada)? */
export function esContrasenaDebil(error) {
    if (!error) return false;
    if (error.code === 'weak_password' || error.name === 'AuthWeakPasswordError') return true;
    // Sin "password should" a secas: también lo dice el rechazo por repetir
    // la contraseña anterior ("should be different from the old password").
    return /at least \d+ characters|at least one character of each|weak/i.test(error.message || '');
}

/** Mínimo que dice el mensaje de Supabase ("at least 10 characters"), o null. */
export function minimoDelServidor(error) {
    const encontrado = /at least (\d+) characters/i.exec(error?.message || '');
    return encontrado ? Number(encontrado[1]) : null;
}

/**
 * Mensaje para una contraseña que Supabase rechazó por débil. Usa
 * `error.reasons` de AuthWeakPasswordError ('length' | 'characters' |
 * 'pwned') y la cifra que trae el mensaje del servidor, nunca una fija.
 * @param {{ reasons?: string[], message?: string } | null | undefined} error
 * @returns {string}
 */
export function mensajeContrasenaDebil(error) {
    const razones = Array.isArray(error?.reasons) ? error.reasons : [];
    const minimo = minimoDelServidor(error);

    if (razones.includes('length') || minimo !== null) {
        return minimo !== null
            ? `La contraseña es muy corta. Usa al menos ${minimo} caracteres.`
            : 'La contraseña es muy corta. Usa una más larga.';
    }
    if (razones.includes('characters')) {
        return 'La contraseña debe combinar letras y números, y mayúsculas o símbolos si la cuenta los exige.';
    }
    if (razones.includes('pwned')) {
        return 'Esa contraseña aparece en filtraciones conocidas. Elige otra.';
    }
    return 'La contraseña es muy débil. Elige una más larga y difícil de adivinar.';
}
