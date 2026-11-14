// Errores de dominio de los movimientos.
//
// La UI (TransactionForm, TransactionEditModal) muestra tal cual el mensaje
// de cualquier `MovimientoInvalidoError` y, para el resto de errores, un
// genérico "intenta de nuevo". Por eso los rechazos que el usuario tiene que
// leer (movimiento de deuda, movimiento que ya no existe) heredan de
// `MovimientoInvalidoError`: reintentar no los arregla, y un "intenta de
// nuevo" invitaría a repetir la operación sin sentido.

/**
 * Movimiento que no pasa `validarMovimiento()` o que una regla de negocio
 * rechaza. Lleva la lista completa de errores para que la UI pueda mostrarlos
 * todos, no solo el primero.
 */
export class MovimientoInvalidoError extends Error {
    constructor(errores) {
        super(errores[0]?.mensaje ?? 'Movimiento inválido');
        this.name = 'MovimientoInvalidoError';
        this.errores = errores;
    }
}

export const MENSAJE_MOVIMIENTO_DE_DEUDA = 'Este movimiento pertenece a una deuda. Se administra desde Deudas.';

/**
 * Bug C15: un préstamo o abono creado por los paneles de deudas es la mitad
 * de una operación compuesta (la otra mitad es la deuda). Editarlo o borrarlo
 * suelto deja la deuda con un saldo que ya no corresponde, así que los casos
 * de uso lo rechazan. Ver `domain/rules/movimientoDeDeuda.js`.
 */
export class MovimientoDeDeudaError extends MovimientoInvalidoError {
    constructor(mensaje = MENSAJE_MOVIMIENTO_DE_DEUDA) {
        super([{ campo: 'categoria', codigo: 'MOVIMIENTO_DE_DEUDA', mensaje }]);
        this.name = 'MovimientoDeDeudaError';
    }
}

/**
 * El movimiento que se quiere editar ya no está en la base local (otro
 * dispositivo lo borró y llegó con el pull, o se borró en otra pestaña).
 * Editar a partir de la copia de pantalla revertiría un efecto que ya no
 * existe y descuadraría la caja.
 */
export class MovimientoNoEncontradoError extends MovimientoInvalidoError {
    constructor() {
        super([{
            campo: 'id',
            codigo: 'MOVIMIENTO_NO_ENCONTRADO',
            mensaje: 'Este movimiento ya no existe en este dispositivo. Cierra y revisa la lista.',
        }]);
        this.name = 'MovimientoNoEncontradoError';
    }
}
