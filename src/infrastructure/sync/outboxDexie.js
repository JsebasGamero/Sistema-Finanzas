// Adaptador de infraestructura: encola operaciones pendientes de sincronizar en Dexie.
// Reproduce byte a byte el registro que hoy crea addToSyncQueue en
// src/services/syncService.js. Cuando esa función delegue aquí, no debe
// cambiar el formato de la fila (ver docs/SINCRONIZACION.md).
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
