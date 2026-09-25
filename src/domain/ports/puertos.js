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
 * @typedef {Object} Sincronizador
 * @property {() => Promise<void>} sincronizarAhora
 */

export {};
