// Caso de uso: borrar un movimiento existente.
//
// No valida con `validarMovimiento`: tiene que poder borrar datos legacy que
// ya no cumplirían las reglas actuales (p. ej. una transferencia sin caja
// destino). Bloquear el borrado de un dato inválido dejaría al usuario sin
// forma de corregirlo.
import { efectoDeBorrado } from '../../domain/rules/efectoEnSaldos';
import { esMovimientoDeDeuda } from '../../domain/rules/movimientoDeDeuda';
import { MovimientoDeDeudaError } from '../../domain/errores';
import { sincronizarEnSegundoPlano } from './sincronizarEnSegundoPlano';

/**
 * @param {object} dependencias
 * @param {import('../../domain/ports/puertos').TransaccionRepository} dependencias.transacciones
 * @param {import('../../domain/ports/puertos').AplicadorDeAjustes} dependencias.aplicadorDeAjustes
 * @param {import('../../domain/ports/puertos').Outbox} dependencias.outbox
 * @param {import('../../domain/ports/puertos').Sincronizador} dependencias.sincronizador
 * @param {import('../../domain/ports/puertos').UnidadDeTrabajo} dependencias.unidadDeTrabajo
 */
export function crearBorrarMovimiento({
    transacciones,
    aplicadorDeAjustes,
    outbox,
    sincronizador,
    unidadDeTrabajo,
}) {
    if (!unidadDeTrabajo?.ejecutar) {
        throw new Error('crearBorrarMovimiento necesita una unidadDeTrabajo (bug C22).');
    }

    /**
     * Idempotente: si el movimiento ya no está, no hace nada.
     * @param {object} movimiento la fila como la tiene la pantalla (solo se usa su id)
     * @returns {Promise<void>}
     */
    return async function borrarMovimiento(movimiento) {
        const borrado = await unidadDeTrabajo.ejecutar(async () => {
            // Bug MOV-4: con un doble toque en "Sí, eliminar" la segunda
            // llamada volvía a revertir el monto con la copia de la pantalla:
            // un egreso de $500.000 devolvía $1.000.000 a la caja. Releer
            // dentro de la unidad de trabajo cierra la carrera, porque dos
            // unidades sobre las mismas tablas no se intercalan: la segunda
            // ya no encuentra la fila.
            const actual = await transacciones.obtener(movimiento.id);
            if (!actual) return false;
            if (esMovimientoDeDeuda(actual)) throw new MovimientoDeDeudaError();

            await aplicadorDeAjustes.aplicar(efectoDeBorrado(actual), { payload: 'parcial' });
            await transacciones.eliminar(actual.id);
            await outbox.encolar('transacciones', 'DELETE', { id: actual.id });
            return true;
        });

        // Sin `await`: la fila ya desapareció de la lista local (ver MOV-7).
        if (borrado) sincronizarEnSegundoPlano(sincronizador);
    };
}
