// Caso de uso: editar un movimiento existente.
import { validarMovimiento } from '../../domain/rules/validarMovimiento';
import { efectoDeEdicion } from '../../domain/rules/efectoEnSaldos';
import { MovimientoInvalidoError } from '../../domain/errores';

/**
 * @param {object} dependencias
 * @param {import('../../domain/ports/puertos').TransaccionRepository} dependencias.transacciones
 * @param {import('../../domain/ports/puertos').AplicadorDeAjustes} dependencias.aplicadorDeAjustes
 * @param {import('../../domain/ports/puertos').Outbox} dependencias.outbox
 * @param {import('../../domain/ports/puertos').Sincronizador} dependencias.sincronizador
 * @param {() => string} dependencias.ahora
 */
export function crearEditarMovimiento({
    transacciones,
    aplicadorDeAjustes,
    outbox,
    sincronizador,
    ahora,
}) {
    /**
     * @param {object} original fila Dexie tal como está guardada
     * @param {object} actualizado datos nuevos (sin id)
     * @returns {Promise<object>} `{ id, ...actualizado, updated_at }`
     */
    return async function editarMovimiento(original, actualizado) {
        const errores = validarMovimiento(actualizado);
        if (errores.length > 0) {
            throw new MovimientoInvalidoError(errores);
        }

        await aplicadorDeAjustes.aplicar(efectoDeEdicion(original, actualizado), {
            payload: 'parcial',
        });

        const cambios = { ...actualizado, updated_at: ahora() };
        await transacciones.actualizar(original.id, cambios);
        await outbox.encolar('transacciones', 'UPDATE', { id: original.id, ...cambios });

        // Sin `await`: hoy `ProjectDashboard` cierra el modal de edición de
        // inmediato y deja la sync corriendo en segundo plano. Un error de
        // red no debe bloquear al usuario, que ya vio su cambio reflejado en
        // Dexie; solo se registra para diagnóstico.
        sincronizador.sincronizarAhora().catch((err) => console.log('Sync error:', err));

        return { id: original.id, ...cambios };
    };
}
