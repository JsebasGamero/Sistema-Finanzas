// Utilidades de dinero.
//
// El sistema maneja pesos colombianos sin centavos, pero los montos viajan como
// `number` de JavaScript y se suman y restan en muchos sitios. Eso deja
// residuos de coma flotante: `100000.1 - 100000` no da 0, da 1.0000000146e-8.
//
// Dónde dolía: el estado de una deuda se decidía con `monto_pendiente === 0`.
// Un residuo de 1e-8 dejaba la deuda en PARCIAL para siempre, aunque el usuario
// la hubiera abonado por completo.
//
// (El arreglo de fondo es representar el dinero como enteros en toda la app.
// Está en el plan de la fase de arquitectura; esto cierra el bug hoy.)

/** Tolerancia por debajo de la cual dos montos se consideran iguales. */
const EPSILON = 0.005; // medio centavo

/** Redondea a 2 decimales, eliminando el ruido acumulado de coma flotante. */
export function redondearMonto(monto) {
    return Math.round((Number(monto) || 0) * 100) / 100;
}

/** ¿El monto es cero, salvo ruido de coma flotante? */
export function esCero(monto) {
    return Math.abs(Number(monto) || 0) < EPSILON;
}

/** Resta segura: redondea el resultado y colapsa a 0 los residuos. */
export function restarMontos(a, b) {
    const resultado = redondearMonto((Number(a) || 0) - (Number(b) || 0));
    return esCero(resultado) ? 0 : resultado;
}

/**
 * Estado de una deuda a partir de lo que queda pendiente.
 * @param {number} montoPendiente
 * @param {number} montoOriginal
 */
export function estadoDeuda(montoPendiente, montoOriginal) {
    if (esCero(montoPendiente)) return 'PAGADA';
    if (Math.abs(montoPendiente - montoOriginal) < EPSILON) return 'PENDIENTE';
    return 'PARCIAL';
}
