// Adaptador de infraestructura: único sitio que escribe `saldo_actual` como
// efecto de un movimiento. Antes esta lógica estaba copiada (con variantes)
// en syncService.js, db.js y varios paneles de UI; consolidarla aquí evita
// que cada copia decida algo distinto sobre cómo encolar el UPDATE.
//
// No decide si se sincroniza: eso es responsabilidad de quien llame a
// `aplicar()` (ver docs/SINCRONIZACION.md, invariante 1: nunca vaciar ni
// descartar sync_queue).
import { aMonto } from '../../domain/value-objects/dinero';

/** @typedef {{ cajaId: string, saldoAnterior: number, saldoNuevo: number }} ResultadoAjuste */

/**
 * @param {object} deps
 * @param {import('dexie').Dexie} deps.db
 * @param {{ encolar: (tabla: string, operacion: string, datos: object) => Promise<any> }} deps.outbox
 */
export function crearAplicadorDeAjustesDexie({ db, outbox }) {
    /**
     * Aplica una lista de ajustes de saldo, en orden y de forma secuencial
     * (nunca en paralelo: dos ajustes sobre la misma caja deben encadenarse
     * leyendo el saldo que dejó el anterior).
     * @param {import('../../domain/rules/efectoEnSaldos').AjusteSaldo[]} ajustes
     * @param {{ payload?: 'parcial' | 'filaCompleta' }} [opciones]
     * @returns {Promise<ResultadoAjuste[]>}
     */
    async function aplicar(ajustes, { payload = 'parcial' } = {}) {
        const resultados = [];

        for (const ajuste of ajustes) {
            const cajaId = ajuste?.cajaId;
            if (!cajaId) continue;

            const caja = await db.cajas.get(cajaId);
            if (!caja) continue; // sin caja no hay dónde aplicar el ajuste; no se encola nada

            const saldoAnterior = aMonto(caja.saldo_actual);
            const saldoNuevo = saldoAnterior + ajuste.delta;

            await db.cajas.update(cajaId, { saldo_actual: saldoNuevo });

            const datos = payload === 'filaCompleta'
                ? { ...caja, saldo_actual: saldoNuevo }
                : { id: cajaId, saldo_actual: saldoNuevo };
            await outbox.encolar('cajas', 'UPDATE', datos);

            resultados.push({ cajaId, saldoAnterior, saldoNuevo });
        }

        return resultados;
    }

    return { aplicar };
}
