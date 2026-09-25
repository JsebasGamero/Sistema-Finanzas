import { describe, it, expect, vi } from 'vitest';
import { crearAplicadorDeAjustesDexie } from './aplicadorDeAjustesDexie';

function crearDbFalsa(cajasIniciales = {}) {
    const cajas = { ...cajasIniciales };
    return {
        cajas: {
            get: vi.fn((id) => Promise.resolve(cajas[id])),
            update: vi.fn((id, cambios) => {
                if (!cajas[id]) return Promise.resolve(0);
                cajas[id] = { ...cajas[id], ...cambios };
                return Promise.resolve(1);
            })
        },
        _cajas: cajas
    };
}

function crearOutboxFalso() {
    return { encolar: vi.fn().mockResolvedValue(1) };
}

describe('crearAplicadorDeAjustesDexie', () => {
    it('payload parcial encola solo { id, saldo_actual }', async () => {
        const db = crearDbFalsa({ c1: { id: 'c1', nombre: 'Caja 1', saldo_actual: 100 } });
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        await aplicador.aplicar([{ cajaId: 'c1', delta: 50 }], { payload: 'parcial' });

        expect(outbox.encolar).toHaveBeenCalledWith('cajas', 'UPDATE', { id: 'c1', saldo_actual: 150 });
    });

    it('payload filaCompleta encola la fila entera con el saldo actualizado', async () => {
        const db = crearDbFalsa({ c1: { id: 'c1', nombre: 'Caja 1', saldo_actual: 100 } });
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        await aplicador.aplicar([{ cajaId: 'c1', delta: 50 }], { payload: 'filaCompleta' });

        expect(outbox.encolar).toHaveBeenCalledWith('cajas', 'UPDATE', {
            id: 'c1', nombre: 'Caja 1', saldo_actual: 150
        });
    });

    it('sin payload explícito, usa parcial por defecto', async () => {
        const db = crearDbFalsa({ c1: { id: 'c1', saldo_actual: 10 } });
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        await aplicador.aplicar([{ cajaId: 'c1', delta: 5 }]);

        expect(outbox.encolar).toHaveBeenCalledWith('cajas', 'UPDATE', { id: 'c1', saldo_actual: 15 });
    });

    it('salta ajustes sin cajaId, sin tocar db ni encolar', async () => {
        const db = crearDbFalsa();
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        const resultados = await aplicador.aplicar([{ cajaId: null, delta: 50 }, { delta: 10 }]);

        expect(db.cajas.get).not.toHaveBeenCalled();
        expect(db.cajas.update).not.toHaveBeenCalled();
        expect(outbox.encolar).not.toHaveBeenCalled();
        expect(resultados).toEqual([]);
    });

    it('salta cajaId inexistente, sin encolar', async () => {
        const db = crearDbFalsa({});
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        const resultados = await aplicador.aplicar([{ cajaId: 'no-existe', delta: 50 }]);

        expect(db.cajas.update).not.toHaveBeenCalled();
        expect(outbox.encolar).not.toHaveBeenCalled();
        expect(resultados).toEqual([]);
    });

    it('dos ajustes sobre la misma caja se encadenan (el segundo parte del saldo que dejo el primero)', async () => {
        const db = crearDbFalsa({ c1: { id: 'c1', saldo_actual: 100 } });
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        const resultados = await aplicador.aplicar([
            { cajaId: 'c1', delta: 50 },
            { cajaId: 'c1', delta: -20 }
        ]);

        expect(resultados).toEqual([
            { cajaId: 'c1', saldoAnterior: 100, saldoNuevo: 150 },
            { cajaId: 'c1', saldoAnterior: 150, saldoNuevo: 130 }
        ]);
        expect(outbox.encolar).toHaveBeenNthCalledWith(1, 'cajas', 'UPDATE', { id: 'c1', saldo_actual: 150 });
        expect(outbox.encolar).toHaveBeenNthCalledWith(2, 'cajas', 'UPDATE', { id: 'c1', saldo_actual: 130 });
    });

    it('saldo_actual guardado como string "100" + delta 5 da 105, no "1005"', async () => {
        const db = crearDbFalsa({ c1: { id: 'c1', saldo_actual: '100' } });
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        const resultados = await aplicador.aplicar([{ cajaId: 'c1', delta: 5 }]);

        expect(resultados[0].saldoNuevo).toBe(105);
        expect(outbox.encolar).toHaveBeenCalledWith('cajas', 'UPDATE', { id: 'c1', saldo_actual: 105 });
    });

    it('no llama a ninguna funcion de sincronizacion (solo db y outbox)', async () => {
        const db = crearDbFalsa({ c1: { id: 'c1', saldo_actual: 0 } });
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        await aplicador.aplicar([{ cajaId: 'c1', delta: 1 }]);

        expect(Object.keys(db)).toEqual(['cajas', '_cajas']);
        expect(Object.keys(outbox)).toEqual(['encolar']);
    });

    it('devuelve los resultados de cada ajuste aplicado', async () => {
        const db = crearDbFalsa({ c1: { id: 'c1', saldo_actual: 10 }, c2: { id: 'c2', saldo_actual: 20 } });
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        const resultados = await aplicador.aplicar([
            { cajaId: 'c1', delta: 5 },
            { cajaId: 'c2', delta: -5 }
        ]);

        expect(resultados).toEqual([
            { cajaId: 'c1', saldoAnterior: 10, saldoNuevo: 15 },
            { cajaId: 'c2', saldoAnterior: 20, saldoNuevo: 15 }
        ]);
    });

    it('el orden de encolado respeta el orden de los ajustes de entrada', async () => {
        const db = crearDbFalsa({ c1: { id: 'c1', saldo_actual: 0 }, c2: { id: 'c2', saldo_actual: 0 } });
        const outbox = crearOutboxFalso();
        const aplicador = crearAplicadorDeAjustesDexie({ db, outbox });

        await aplicador.aplicar([
            { cajaId: 'c2', delta: 1 },
            { cajaId: 'c1', delta: 2 }
        ]);

        expect(outbox.encolar).toHaveBeenNthCalledWith(1, 'cajas', 'UPDATE', { id: 'c2', saldo_actual: 1 });
        expect(outbox.encolar).toHaveBeenNthCalledWith(2, 'cajas', 'UPDATE', { id: 'c1', saldo_actual: 2 });
    });
});
