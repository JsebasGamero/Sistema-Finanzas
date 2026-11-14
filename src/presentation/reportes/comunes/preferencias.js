// Preferencias de este dispositivo (pestaña abierta, etc.). No son datos del
// negocio: si el almacenamiento está bloqueado (modo privado, WebView sin
// permisos) se usa el valor por defecto y la app sigue funcionando.

export function leerPreferencia(clave, porDefecto) {
    try {
        return localStorage.getItem(clave) ?? porDefecto;
    } catch {
        return porDefecto;
    }
}

export function guardarPreferencia(clave, valor) {
    try {
        localStorage.setItem(clave, valor);
    } catch {
        // Sin almacenamiento la preferencia dura lo que dure la sesión.
    }
}
