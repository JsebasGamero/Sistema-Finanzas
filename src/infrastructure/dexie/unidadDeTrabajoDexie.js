// Adaptador de infraestructura: unidad de trabajo sobre una transacción de
// Dexie (bug C22).
//
// Los casos de uso de movimientos escriben en tres tablas: la transacción, el
// saldo de las cajas (aplicador) y la cola. Con escrituras sueltas, un fallo a
// mitad (QuotaExceededError en un teléfono lleno, o Android matando el
// WebView) dejaba el saldo aplicado sin el INSERT encolado: subía el saldo y
// el siguiente pull borraba la fila local.
//
// `db.transaction('rw', ...)` lo vuelve todo o nada. Dexie propaga la
// transacción a cualquier `db.<tabla>` que se use dentro del callback (aunque
// sea desde el aplicador o el outbox), así que no hace falta pasarla a mano.
// Si el callback lanza, Dexie aborta y rechaza con ese mismo error.
//
// Dentro solo puede haber operaciones de Dexie: un `fetch` o un `setTimeout`
// dejan la transacción sin trabajo pendiente, IndexedDB la cierra y la
// siguiente escritura falla con TransactionInactiveError. Por eso la
// sincronización se lanza después, fuera de la unidad.
//
// También serializa: dos transacciones 'rw' sobre las mismas tablas no se
// intercalan, que es lo que vuelve idempotente el borrado ante un doble toque.

export const TABLAS_DE_MOVIMIENTOS = Object.freeze(['transacciones', 'cajas', 'sync_queue']);

/**
 * @param {import('dexie').Dexie} db
 * @param {string[]} [tablas] nombres de las tablas que puede tocar el trabajo
 * @returns {import('../../domain/ports/puertos').UnidadDeTrabajo}
 */
export function crearUnidadDeTrabajoDexie(db, tablas = TABLAS_DE_MOVIMIENTOS) {
    return {
        ejecutar(trabajo) {
            return db.transaction('rw', tablas.map((nombre) => db[nombre]), trabajo);
        },
    };
}
