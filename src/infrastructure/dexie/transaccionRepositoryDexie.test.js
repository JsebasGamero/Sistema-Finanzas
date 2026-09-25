import { describe, it, expect, vi } from 'vitest';
import { crearTransaccionRepositoryDexie } from './transaccionRepositoryDexie';

function crearDbFalsa() {
    return {
        transacciones: {
            get: vi.fn().mockResolvedValue({ id: 't1' }),
            add: vi.fn().mockResolvedValue('t1'),
            update: vi.fn().mockResolvedValue(1),
            delete: vi.fn().mockResolvedValue(undefined)
        }
    };
}

describe('crearTransaccionRepositoryDexie', () => {
    it('obtener delega en db.transacciones.get con el id exacto', async () => {
        const db = crearDbFalsa();
        const repo = crearTransaccionRepositoryDexie(db);

        const resultado = await repo.obtener('t1');

        expect(db.transacciones.get).toHaveBeenCalledWith('t1');
        expect(resultado).toEqual({ id: 't1' });
    });

    it('agregar delega en db.transacciones.add con la transaccion exacta', async () => {
        const db = crearDbFalsa();
        const repo = crearTransaccionRepositoryDexie(db);
        const tx = { id: 't2', monto: 50 };

        await repo.agregar(tx);

        expect(db.transacciones.add).toHaveBeenCalledWith(tx);
    });

    it('actualizar delega en db.transacciones.update con id y cambios exactos', async () => {
        const db = crearDbFalsa();
        const repo = crearTransaccionRepositoryDexie(db);
        const cambios = { monto: 200 };

        await repo.actualizar('t3', cambios);

        expect(db.transacciones.update).toHaveBeenCalledWith('t3', cambios);
    });

    it('eliminar delega en db.transacciones.delete con el id exacto', async () => {
        const db = crearDbFalsa();
        const repo = crearTransaccionRepositoryDexie(db);

        await repo.eliminar('t4');

        expect(db.transacciones.delete).toHaveBeenCalledWith('t4');
    });
});
