import { describe, it, expect, vi, afterEach } from 'vitest';
import { reaplicarPendientes, esFilaCompleta } from './reaplicarPendientes';

// Doble en memoria con la parte de la API de Dexie que usa el replay.
function crearBase(inicial = {}) {
    const tablas = new Map();
    for (const nombre of Object.keys(inicial)) {
        tablas.set(nombre, new Map(inicial[nombre].map((fila) => [fila.id, { ...fila }])));
    }
    const tabla = (nombre) => {
        if (!tablas.has(nombre)) tablas.set(nombre, new Map());
        const filas = tablas.get(nombre);
        return {
            put: async (fila) => { filas.set(fila.id, { ...fila }); },
            update: async (id, cambios) => {
                if (!filas.has(id)) return 0;
                filas.set(id, { ...filas.get(id), ...cambios });
                return 1;
            },
            delete: async (id) => { filas.delete(id); },
        };
    };
    return {
        table: tabla,
        filas: (nombre) => [...(tablas.get(nombre)?.values() ?? [])],
    };
}

const op = (id, tabla, operacion, datos) => ({ id, tabla, operacion, datos: JSON.stringify(datos) });

afterEach(() => vi.restoreAllMocks());

describe('reaplicarPendientes', () => {
    it('INSERT pendiente vuelve a aparecer después del pull', async () => {
        const db = crearBase({ transacciones: [] });
        await reaplicarPendientes(db, [op(1, 'transacciones', 'INSERT', { id: 't1', monto: 5000, tipo_movimiento: 'EGRESO' })]);
        expect(db.filas('transacciones')).toEqual([{ id: 't1', monto: 5000, tipo_movimiento: 'EGRESO' }]);
    });

    it('UPDATE parcial fusiona y no borra los demás campos', async () => {
        const db = crearBase({ cajas: [{ id: 'c1', nombre: 'Caja obra', tipo: 'Efectivo', saldo_actual: 100 }] });
        await reaplicarPendientes(db, [op(1, 'cajas', 'UPDATE', { id: 'c1', saldo_actual: 50 })]);
        expect(db.filas('cajas')).toEqual([{ id: 'c1', nombre: 'Caja obra', tipo: 'Efectivo', saldo_actual: 50 }]);
    });

    it('UPDATE parcial sobre una fila que ya no existe no crea una caja fantasma (SYNC-19)', async () => {
        const db = crearBase({ cajas: [] });
        const r = await reaplicarPendientes(db, [op(1, 'cajas', 'UPDATE', { id: 'borrada', saldo_actual: -120000 })]);
        expect(db.filas('cajas')).toEqual([]);
        expect(r.omitidas).toBe(1);
    });

    it('UPDATE con la fila completa sobre una fila inexistente sí la crea', async () => {
        const db = crearBase({ deudas_terceros: [] });
        const fila = { id: 'd1', monto_original: 1000, monto_pendiente: 600 };
        await reaplicarPendientes(db, [op(1, 'deudas_terceros', 'UPDATE', fila)]);
        expect(db.filas('deudas_terceros')).toEqual([fila]);
    });

    it('aplica en orden: cada fila queda con su último valor', async () => {
        const db = crearBase({ cajas: [{ id: 'c1', nombre: 'Banco', tipo: 'Banco', saldo_actual: 1000 }] });
        await reaplicarPendientes(db, [
            op(1, 'cajas', 'UPDATE', { id: 'c1', saldo_actual: 900 }),
            op(2, 'cajas', 'UPDATE', { id: 'c1', saldo_actual: 800 }),
        ]);
        expect(db.filas('cajas')[0].saldo_actual).toBe(800);
    });

    it('DELETE pendiente quita la fila que el pull trajo', async () => {
        const db = crearBase({ transacciones: [{ id: 't1', monto: 1, tipo_movimiento: 'INGRESO' }] });
        await reaplicarPendientes(db, [op(1, 'transacciones', 'DELETE', { id: 't1' })]);
        expect(db.filas('transacciones')).toEqual([]);
    });

    it('una operación dañada no impide re-aplicar las demás', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const db = crearBase({ transacciones: [] });
        const r = await reaplicarPendientes(db, [
            { id: 1, tabla: 'transacciones', operacion: 'INSERT', datos: '{no es json' },
            op(2, 'transacciones', 'INSERT', { id: 't2', monto: 1, tipo_movimiento: 'INGRESO' }),
        ]);
        expect(r.fallidas).toBe(1);
        expect(db.filas('transacciones')).toHaveLength(1);
    });

    it('omite tablas fuera del alcance de la transacción', async () => {
        const db = crearBase({});
        const r = await reaplicarPendientes(db, [op(1, 'otra_tabla', 'INSERT', { id: 'x' })], { tablasPermitidas: ['cajas'] });
        expect(r).toEqual({ reaplicadas: 0, omitidas: 1, fallidas: 0 });
    });
});

describe('esFilaCompleta', () => {
    it('una caja necesita nombre y tipo', () => {
        expect(esFilaCompleta('cajas', { id: 'c', saldo_actual: 0 })).toBe(false);
        expect(esFilaCompleta('cajas', { id: 'c', nombre: 'Caja', tipo: 'Efectivo' })).toBe(true);
    });

    it('tabla desconocida nunca es completa', () => {
        expect(esFilaCompleta('otra', { id: 'x', nombre: 'a' })).toBe(false);
    });
});
