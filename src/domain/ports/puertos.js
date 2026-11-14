// Puertos del dominio: contratos que implementa `infrastructure/`.
// Solo tipos (JSDoc). El dominio y los casos de uso dependen de estos
// nombres, nunca de Dexie ni de Supabase directamente.

/**
 * @typedef {Object} TransaccionRepository
 * @property {(id: string) => Promise<object|undefined>} obtener
 * @property {(tx: object) => Promise<object>} agregar
 * @property {(id: string, cambios: object) => Promise<object>} actualizar
 * @property {(id: string) => Promise<void>} eliminar
 */

/**
 * @typedef {Object} Outbox
 * @property {(tabla: string, operacion: string, datos: object) => Promise<void>} encolar
 */

/**
 * @typedef {Object} ResultadoAjuste
 * @property {string} cajaId
 * @property {number} saldoAnterior
 * @property {number} saldoNuevo
 */

/**
 * @typedef {Object} AplicadorDeAjustes
 * @property {(ajustes: import('../rules/efectoEnSaldos').AjusteSaldo[], opciones: { payload: 'parcial'|'filaCompleta' }) => Promise<ResultadoAjuste[]>} aplicar
 */

/**
 * Lanza la subida de la cola. Quien la llama desde un caso de uso no la
 * espera: el dato ya quedó en la base local (ver sincronizarEnSegundoPlano).
 * @typedef {Object} Sincronizador
 * @property {() => Promise<unknown>} sincronizarAhora
 */

/**
 * Ejecuta `trabajo` de forma atómica sobre la base local: o quedan todas sus
 * escrituras (transacción, ajustes de saldo y cola) o ninguna (bug C22). Si
 * `trabajo` lanza, se deshace todo y `ejecutar` rechaza con ese error.
 *
 * Dentro de `trabajo` solo puede haber operaciones de la base local: nada de
 * red ni temporizadores (la sincronización va después, fuera de la unidad).
 * @typedef {Object} UnidadDeTrabajo
 * @property {<T>(trabajo: () => Promise<T>) => Promise<T>} ejecutar
 */

export {};
