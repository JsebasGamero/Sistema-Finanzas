import { describe, it, expect, vi } from 'vitest';
import { crearUnidadDeTrabajoDexie, TABLAS_DE_MOVIMIENTOS } from './unidadDeTrabajoDexie';

function crearDbFalsa() {
    const db = {
        transacciones: { nombre: 'transacciones' },
        cajas: { nombre: 'cajas' },
        sync_queue: { nombre: 'sync_queue' },
        empresas: { nombre: 'empresas' },
        transaction: vi.fn((modo, tablas, trabajo) => Promise.resolve().then(trabajo)),
    };
    return db;
}

describe('crearUnidadDeTrabajoDexie', () => {
    it('abre una transacción rw sobre transacciones, cajas y sync_queue', async () => {
        const db = crearDbFalsa();
        const unidad = crearUnidadDeTrabajoDexie(db);
        const trabajo = vi.fn().mockResolvedValue('hecho');

        const resultado = await unidad.ejecutar(trabajo);

        expect(resultado).toBe('hecho');
        expect(db.transaction).toHaveBeenCalledWith(
            'rw',
            [db.transacciones, db.cajas, db.sync_queue],
            trabajo,
        );
        expect(TABLAS_DE_MOVIMIENTOS).toEqual(['transacciones', 'cajas', 'sync_queue']);
    });

    it('acepta otra lista de tablas', async () => {
        const db = crearDbFalsa();
        const unidad = crearUnidadDeTrabajoDexie(db, ['empresas', 'sync_queue']);

        await unidad.ejecutar(async () => {});

        expect(db.transaction.mock.calls[0][1]).toEqual([db.empresas, db.sync_queue]);
    });

    it('propaga el rechazo del trabajo (Dexie aborta y rechaza con el mismo error)', async () => {
        const db = crearDbFalsa();
        const unidad = crearUnidadDeTrabajoDexie(db);
        const error = new Error('QuotaExceededError');

        await expect(unidad.ejecutar(async () => { throw error; })).rejects.toBe(error);
    });
});
