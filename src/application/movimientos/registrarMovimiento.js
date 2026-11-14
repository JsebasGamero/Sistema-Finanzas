// Caso de uso: registrar un movimiento nuevo (INGRESO, EGRESO o TRANSFERENCIA).
import { validarMovimiento } from '../../domain/rules/validarMovimiento';
import { efectoEnSaldos } from '../../domain/rules/efectoEnSaldos';
import { esMovimientoDeDeuda } from '../../domain/rules/movimientoDeDeuda';
import { MovimientoInvalidoError } from '../../domain/errores';
import { sincronizarEnSegundoPlano } from './sincronizarEnSegundoPlano';

/**
 * Los préstamos y abonos (tipo + categoría de `movimientoDeDeuda.js`) solo los
 * crea el panel de Deudas, junto con su deuda. Uno creado desde el formulario
 * no tendría deuda y, por la regla C15, después no se podría editar ni borrar
 * en ningún lado.
 */
export const ERROR_RESERVADO_PARA_DEUDAS = Object.freeze({
    campo: 'categoria',
    codigo: 'RESERVADO_PARA_DEUDAS',
    mensaje: 'Los préstamos y abonos entre cajas o a proveedores se registran desde Deudas. Elige otra categoría.',
});

/**
 * @param {object} dependencias
 * @param {import('../../domain/ports/puertos').TransaccionRepository} dependencias.transacciones
 * @param {import('../../domain/ports/puertos').AplicadorDeAjustes} dependencias.aplicadorDeAjustes
 * @param {import('../../domain/ports/puertos').Outbox} dependencias.outbox
 * @param {import('../../domain/ports/puertos').Sincronizador} dependencias.sincronizador
 * @param {import('../../domain/ports/puertos').UnidadDeTrabajo} dependencias.unidadDeTrabajo
 * @param {() => string} dependencias.generarId
 * @param {() => string} dependencias.ahora
 */
export function crearRegistrarMovimiento({
    transacciones,
    aplicadorDeAjustes,
    outbox,
    sincronizador,
    unidadDeTrabajo,
    generarId,
    ahora,
}) {
    if (!unidadDeTrabajo?.ejecutar) {
        throw new Error('crearRegistrarMovimiento necesita una unidadDeTrabajo (bug C22).');
    }

    /**
     * Guarda el movimiento en la base local y devuelve sin esperar a la nube.
     *
     * Si `datos.id` viene (la UI puede generarlo una vez por formulario) y ese
     * movimiento ya existe, devuelve el existente sin volver a aplicar su
     * efecto: un reintento o un doble toque no descuenta dos veces.
     *
     * @param {object} datos fila Dexie (snake_case), con o sin id
     * @returns {Promise<object>} la transacción guardada
     */
    return async function registrarMovimiento(datos) {
        const errores = validarMovimiento(datos);
        if (errores.length > 0) {
            throw new MovimientoInvalidoError(errores);
        }
        if (esMovimientoDeDeuda(datos)) {
            throw new MovimientoInvalidoError([ERROR_RESERVADO_PARA_DEUDAS]);
        }

        // Bug C22: transacción, ajustes de saldo y encolado van juntos. Antes
        // eran escrituras sueltas: si una fallaba a mitad (teléfono lleno), la
        // fila quedaba sin su INSERT en la cola y con el saldo aplicado, y el
        // formulario invitaba a reintentar, lo que descontaba dos veces.
        const { tx, nueva } = await unidadDeTrabajo.ejecutar(async () => {
            if (datos.id) {
                const existente = await transacciones.obtener(datos.id);
                if (existente) return { tx: existente, nueva: false };
            }

            const nuevaTx = {
                id: generarId(),
                ...datos,
                sincronizado: false,
                created_at: ahora(),
            };

            await transacciones.agregar(nuevaTx);
            await aplicadorDeAjustes.aplicar(efectoEnSaldos(nuevaTx), { payload: 'parcial' });
            await outbox.encolar('transacciones', 'INSERT', nuevaTx);
            return { tx: nuevaTx, nueva: true };
        });

        if (nueva) sincronizarEnSegundoPlano(sincronizador);
        return tx;
    };
}
