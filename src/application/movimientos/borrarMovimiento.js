// Caso de uso: borrar un movimiento existente.
//
// No valida con `validarMovimiento`: tiene que poder borrar datos legacy que
// ya no cumplirían las reglas actuales (p. ej. una transferencia sin caja
// destino). Bloquear el borrado de un dato inválido dejaría al usuario sin
// forma de corregirlo.
import { efectoDeBorrado } from '../../domain/rules/efectoEnSaldos';

/**
 * @param {object} dependencias
 * @param {import('../../domain/ports/puertos').TransaccionRepository} dependencias.transacciones
 * @param {import('../../domain/ports/puertos').AplicadorDeAjustes} dependencias.aplicadorDeAjustes
 * @param {import('../../domain/ports/puertos').Outbox} dependencias.outbox
 * @param {import('../../domain/ports/puertos').Sincronizador} dependencias.sincronizador
 */
export function crearBorrarMovimiento({
    transacciones,
    aplicadorDeAjustes,
    outbox,
    sincronizador,
}) {
    /**
     * @param {object} movimiento fila Dexie a borrar
     * @returns {Promise<void>}
     */
    return async function borrarMovimiento(movimiento) {
        await aplicadorDeAjustes.aplicar(efectoDeBorrado(movimiento), { payload: 'parcial' });
        await transacciones.eliminar(movimiento.id);
        await outbox.encolar('transacciones', 'DELETE', { id: movimiento.id });

        // Sin `await`, igual que editarMovimiento: el usuario ya ve la fila
        // desaparecer de la lista local; la sync se reintenta sola.
        sincronizador.sincronizarAhora().catch((err) => console.log('Sync error:', err));
    };
}
