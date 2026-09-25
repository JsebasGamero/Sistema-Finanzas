// Error de dominio para movimientos que no pasan `validarMovimiento()`.
// Lleva la lista completa de errores para que la UI pueda mostrarlos todos,
// no solo el primero.
export class MovimientoInvalidoError extends Error {
    constructor(errores) {
        super(errores[0]?.mensaje ?? 'Movimiento inválido');
        this.name = 'MovimientoInvalidoError';
        this.errores = errores;
    }
}
