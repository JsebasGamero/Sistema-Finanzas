// Composición: aquí se instancian los adaptadores concretos (Dexie, cola de
// sync) y se inyectan en los casos de uso. Es el único archivo que conoce a
// la vez la aplicación y la infraestructura; los componentes importan los
// casos de uso ya armados desde aquí.
//
// Nada de src/services/ debe importar este archivo (crearía un ciclo:
// este archivo importa syncService).
import { db, generateUUID } from '../services/db';
import { processSyncQueue } from '../services/syncService';
import { crearOutboxDexie } from '../infrastructure/sync/outboxDexie';
import { crearSincronizador } from '../infrastructure/sync/sincronizador';
import { crearTransaccionRepositoryDexie } from '../infrastructure/dexie/transaccionRepositoryDexie';
import { crearAplicadorDeAjustesDexie } from '../infrastructure/dexie/aplicadorDeAjustesDexie';
import { crearRegistrarMovimiento } from '../application/movimientos/registrarMovimiento';
import { crearEditarMovimiento } from '../application/movimientos/editarMovimiento';
import { crearBorrarMovimiento } from '../application/movimientos/borrarMovimiento';
import { efectoEnSaldos } from '../domain/rules/efectoEnSaldos';

const ahora = () => new Date().toISOString();

const outbox = crearOutboxDexie(db);
const aplicadorDeAjustes = crearAplicadorDeAjustesDexie({ db, outbox });
const transacciones = crearTransaccionRepositoryDexie(db);
const sincronizador = crearSincronizador({
    procesarCola: processSyncQueue,
    estaEnLinea: () => navigator.onLine
});

export const registrarMovimiento = crearRegistrarMovimiento({
    transacciones, aplicadorDeAjustes, outbox, sincronizador, generarId: generateUUID, ahora
});

export const editarMovimiento = crearEditarMovimiento({
    transacciones, aplicadorDeAjustes, outbox, sincronizador, ahora
});

export const borrarMovimiento = crearBorrarMovimiento({
    transacciones, aplicadorDeAjustes, outbox, sincronizador
});

// Puente temporal para los paneles de deudas: todavía crean sus transacciones
// a mano, pero ya aplican los saldos con la misma regla que el resto. Se
// elimina cuando las deudas tengan sus propios casos de uso (porción 3).
export function aplicarEfectoEnSaldos(movimiento, opciones) {
    return aplicadorDeAjustes.aplicar(efectoEnSaldos(movimiento), opciones);
}
