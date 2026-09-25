// Adaptador de infraestructura: encola operaciones pendientes de sincronizar en Dexie.
// Es la única implementación del registro de sync_queue: addToSyncQueue
// (src/services/syncService.js) delega aquí. No cambies el formato de la fila
// sin migrar las operaciones ya encoladas (ver docs/SINCRONIZACION.md).
export function crearOutboxDexie(db, { ahora = () => new Date().toISOString() } = {}) {
    return {
        encolar(tabla, operacion, datos) {
            return db.sync_queue.add({
                tabla,
                operacion,
                datos: JSON.stringify(datos),
                timestamp: ahora()
            });
        }
    };
}
