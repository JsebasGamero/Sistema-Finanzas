// Caso de uso: editar un movimiento existente.
import { validarMovimiento } from '../../domain/rules/validarMovimiento';
import { efectoDeEdicion } from '../../domain/rules/efectoEnSaldos';
import { esMovimientoDeDeuda } from '../../domain/rules/movimientoDeDeuda';
import {
    MovimientoDeDeudaError,
    MovimientoInvalidoError,
    MovimientoNoEncontradoError,
} from '../../domain/errores';
import { ERROR_RESERVADO_PARA_DEUDAS } from './registrarMovimiento';
import { sincronizarEnSegundoPlano } from './sincronizarEnSegundoPlano';

/**
 * @param {object} dependencias
 * @param {import('../../domain/ports/puertos').TransaccionRepository} dependencias.transacciones
 * @param {import('../../domain/ports/puertos').AplicadorDeAjustes} dependencias.aplicadorDeAjustes
 * @param {import('../../domain/ports/puertos').Outbox} dependencias.outbox
 * @param {import('../../domain/ports/puertos').Sincronizador} dependencias.sincronizador
 * @param {import('../../domain/ports/puertos').UnidadDeTrabajo} dependencias.unidadDeTrabajo
 * @param {() => string} dependencias.ahora
 */
export function crearEditarMovimiento({
    transacciones,
    aplicadorDeAjustes,
    outbox,
    sincronizador,
    unidadDeTrabajo,
    ahora,
}) {
    if (!unidadDeTrabajo?.ejecutar) {
        throw new Error('crearEditarMovimiento necesita una unidadDeTrabajo (bug C22).');
    }

    /**
     * @param {object} original la fila como la tiene la pantalla (solo se usa su id)
     * @param {object} actualizado datos nuevos
     * @returns {Promise<object>} `{ id, ...actualizado, sincronizado: false, updated_at }`
     */
    return async function editarMovimiento(original, actualizado) {
        const errores = validarMovimiento(actualizado);
        if (errores.length > 0) {
            throw new MovimientoInvalidoError(errores);
        }

        const resultado = await unidadDeTrabajo.ejecutar(async () => {
            // Bug MOV-4: el efecto se calculaba con la copia de la pantalla,
            // que puede estar vieja (otro dispositivo lo editó y llegó con el
            // pull). Revertir un monto que ya no es el guardado descuadra la
            // caja; se relee dentro de la unidad de trabajo.
            const actual = await transacciones.obtener(original.id);
            if (!actual) throw new MovimientoNoEncontradoError();
            if (esMovimientoDeDeuda(actual)) throw new MovimientoDeDeudaError();
            if (esMovimientoDeDeuda(actualizado)) {
                throw new MovimientoInvalidoError([ERROR_RESERVADO_PARA_DEUDAS]);
            }

            await aplicadorDeAjustes.aplicar(efectoDeEdicion(actual, actualizado), {
                payload: 'parcial',
            });

            // Bug C21: `actualizado` trae el `sincronizado: true` de la fila
            // original, y la edición pendiente (o rechazada) no se veía como
            // "Pendiente". processSyncQueue lo vuelve a true cuando sube.
            const cambios = { ...actualizado, sincronizado: false, updated_at: ahora() };
            await transacciones.actualizar(actual.id, cambios);
            await outbox.encolar('transacciones', 'UPDATE', { id: actual.id, ...cambios });
            return { id: actual.id, ...cambios };
        });

        // Sin `await`: el cambio ya está en la base local (ver MOV-7).
        sincronizarEnSegundoPlano(sincronizador);
        return resultado;
    };
}
