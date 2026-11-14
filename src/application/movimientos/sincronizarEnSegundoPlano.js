// Lanza la subida de la cola sin esperarla.
//
// Bug MOV-7: el alta hacía `await sincronizarAhora()`, que sube TODA la cola
// en serie y sin timeout. Con un día de cola acumulada y señal débil, el
// botón se quedaba en "Guardando..." durante minutos aunque el movimiento ya
// estaba en la base local; el usuario creía que no se había guardado y lo
// registraba otra vez. Además el resultado de la sync se ignoraba, así que
// esperar no servía para avisar de nada: los rechazos se ven en la bandeja de
// errores de sincronización (C14), no en el formulario.
//
// Se llama siempre DESPUÉS de que la unidad de trabajo hizo commit.

/**
 * @param {import('../../domain/ports/puertos').Sincronizador} sincronizador
 */
export function sincronizarEnSegundoPlano(sincronizador) {
    try {
        Promise.resolve(sincronizador.sincronizarAhora()).catch((error) => {
            console.warn('No se pudo sincronizar ahora; se reintentará:', error);
        });
    } catch (error) {
        // Un sincronizador que lanza en vez de rechazar no debe tumbar una
        // operación que ya quedó guardada.
        console.warn('No se pudo sincronizar ahora; se reintentará:', error);
    }
}
