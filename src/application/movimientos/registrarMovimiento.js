// Caso de uso: registrar un movimiento nuevo (INGRESO, EGRESO o TRANSFERENCIA).
import { validarMovimiento } from '../../domain/rules/validarMovimiento';
import { efectoEnSaldos } from '../../domain/rules/efectoEnSaldos';
import { MovimientoInvalidoError } from '../../domain/errores';

/**
 * @param {object} dependencias
 * @param {import('../../domain/ports/puertos').TransaccionRepository} dependencias.transacciones
 * @param {import('../../domain/ports/puertos').AplicadorDeAjustes} dependencias.aplicadorDeAjustes
 * @param {import('../../domain/ports/puertos').Outbox} dependencias.outbox
 * @param {import('../../domain/ports/puertos').Sincronizador} dependencias.sincronizador
 * @param {() => string} dependencias.generarId
 * @param {() => string} dependencias.ahora
 */
export function crearRegistrarMovimiento({
    transacciones,
    aplicadorDeAjustes,
    outbox,
    sincronizador,
    generarId,
    ahora,
}) {
    /**
     * @param {object} datos fila Dexie (snake_case), sin id
     * @returns {Promise<object>} la transacción creada
     */
    return async function registrarMovimiento(datos) {
        const errores = validarMovimiento(datos);
        if (errores.length > 0) {
            throw new MovimientoInvalidoError(errores);
        }

        const tx = {
            id: generarId(),
            ...datos,
            sincronizado: false,
            created_at: ahora(),
        };

        await transacciones.agregar(tx);
        await aplicadorDeAjustes.aplicar(efectoEnSaldos(tx), { payload: 'parcial' });
        await outbox.encolar('transacciones', 'INSERT', tx);

        // Se espera la sincronización (con `await`) porque hoy el botón de
        // alta muestra "Guardando..." hasta que la sync termina y, si falla,
        // el error debe llegarle al usuario en ese mismo formulario. Es el
        // comportamiento actual de `syncService.createTransaction`.
        await sincronizador.sincronizarAhora();

        return tx;
    };
}
