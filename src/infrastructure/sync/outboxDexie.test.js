import { describe, it, expect, vi } from 'vitest';
import { crearOutboxDexie } from './outboxDexie';

function crearDbFalsa() {
    return {
        sync_queue: {
            add: vi.fn().mockResolvedValue(1)
        }
    };
}

describe('crearOutboxDexie', () => {
    it('encola con la forma exacta: tabla, operacion, datos serializados y timestamp inyectado', async () => {
        const db = crearDbFalsa();
        const ahora = () => '2026-01-01T00:00:00.000Z';
        const outbox = crearOutboxDexie(db, { ahora });

        await outbox.encolar('transacciones', 'INSERT', { id: 'abc', monto: 100 });

        expect(db.sync_queue.add).toHaveBeenCalledTimes(1);
        expect(db.sync_queue.add).toHaveBeenCalledWith({
            tabla: 'transacciones',
            operacion: 'INSERT',
            datos: JSON.stringify({ id: 'abc', monto: 100 }),
            timestamp: '2026-01-01T00:00:00.000Z'
        });
    });

    it('serializa objetos anidados (p. ej. pagos: [...]) dentro de datos', async () => {
        const db = crearDbFalsa();
        const ahora = () => '2026-01-02T00:00:00.000Z';
        const outbox = crearOutboxDexie(db, { ahora });

        const deuda = { id: 'd1', pagos: [{ monto: 10 }, { monto: 20 }] };
        await outbox.encolar('deudas_cajas', 'INSERT', deuda);

        const registro = db.sync_queue.add.mock.calls[0][0];
        expect(registro.datos).toBe(JSON.stringify(deuda));
        expect(JSON.parse(registro.datos)).toEqual(deuda);
    });

    it('usa la funcion ahora() por defecto (timestamp ISO) cuando no se inyecta', async () => {
        const db = crearDbFalsa();
        const outbox = crearOutboxDexie(db);

        await outbox.encolar('cajas', 'UPDATE', { id: 'c1', saldo_actual: 5 });

        const registro = db.sync_queue.add.mock.calls[0][0];
        expect(typeof registro.timestamp).toBe('string');
        expect(new Date(registro.timestamp).toISOString()).toBe(registro.timestamp);
    });

    it('devuelve la promesa que retorna db.sync_queue.add', async () => {
        const db = crearDbFalsa();
        db.sync_queue.add.mockResolvedValue(42);
        const outbox = crearOutboxDexie(db, { ahora: () => 't' });

        const resultado = await outbox.encolar('cajas', 'DELETE', { id: 'c1' });

        expect(resultado).toBe(42);
    });
});
