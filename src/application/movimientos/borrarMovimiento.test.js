import { describe, it, expect } from 'vitest';
import { crearBorrarMovimiento } from './borrarMovimiento';
import { MovimientoDeDeudaError, MovimientoInvalidoError } from '../../domain/errores';
import { crearDobles } from './doblesEnMemoria';

const FECHA = '2026-09-20';

function preparar(filas, saldos = { A: 10000, B: 5000 }) {
    const dobles = crearDobles({ transacciones: filas, saldos });
    return { dobles, borrarMovimiento: crearBorrarMovimiento(dobles.dependencias) };
}

describe('borrarMovimiento', () => {
    it('EGRESO: relee, revierte, borra y encola el DELETE dentro de la unidad', async () => {
        const fila = { id: 'tx-1', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
        const { dobles, borrarMovimiento } = preparar([fila]);

        await expect(borrarMovimiento(fila)).resolves.toBeUndefined();

        expect(dobles.log).toEqual([
            { metodo: 'unidadDeTrabajo.inicio' },
            { metodo: 'transacciones.obtener', args: { id: 'tx-1' } },
            {
                metodo: 'aplicadorDeAjustes.aplicar',
                args: { ajustes: [{ cajaId: 'A', delta: 1000 }], opciones: { payload: 'parcial' } },
            },
            { metodo: 'transacciones.eliminar', args: { id: 'tx-1' } },
            {
                metodo: 'outbox.encolar',
                args: { tabla: 'transacciones', operacion: 'DELETE', datos: { id: 'tx-1' } },
            },
            { metodo: 'unidadDeTrabajo.commit' },
            { metodo: 'sincronizador.sincronizarAhora' },
        ]);
        expect(dobles.estado.saldos.A).toBe(11000);
    });

    it('INGRESO: revierte con delta negativo', async () => {
        const fila = { id: 'tx-2', tipo_movimiento: 'INGRESO', fecha: FECHA, monto: 2000, caja_origen_id: 'B' };
        const { dobles, borrarMovimiento } = preparar([fila]);

        await borrarMovimiento(fila);

        expect(dobles.estado.saldos.B).toBe(3000);
    });

    it('TRANSFERENCIA: revierte origen y destino', async () => {
        const fila = { id: 'tx-3', tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 500, caja_origen_id: 'A', caja_destino_id: 'B' };
        const { dobles, borrarMovimiento } = preparar([fila]);

        await borrarMovimiento(fila);

        expect(dobles.log[2].args.ajustes).toEqual([
            { cajaId: 'A', delta: 500 },
            { cajaId: 'B', delta: -500 },
        ]);
    });

    it('TRANSFERENCIA legacy sin caja_destino_id revierte solo el origen', async () => {
        const fila = { id: 'tx-4', tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 500, caja_origen_id: 'A' };
        const { dobles, borrarMovimiento } = preparar([fila]);

        await borrarMovimiento(fila);

        expect(dobles.log[2].args.ajustes).toEqual([{ cajaId: 'A', delta: 500 }]);
        expect(dobles.estado.transacciones).toEqual({});
    });

    it('no valida: borra un movimiento sin tipo reconocido ni fecha', async () => {
        const fila = { id: 'tx-5', monto: 0 };
        const { dobles, borrarMovimiento } = preparar([fila]);

        await expect(borrarMovimiento(fila)).resolves.toBeUndefined();
        expect(dobles.estado.transacciones).toEqual({});
    });

    it('usa la fila guardada, no la copia de la pantalla, para revertir', async () => {
        const guardada = { id: 'tx-6', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1500, caja_origen_id: 'A' };
        const { dobles, borrarMovimiento } = preparar([guardada]);

        await borrarMovimiento({ ...guardada, monto: 1000 });

        expect(dobles.estado.saldos.A).toBe(11500);
    });

    describe('idempotencia (MOV-4)', () => {
        it('un doble toque en "Sí, eliminar" revierte el saldo una sola vez', async () => {
            const fila = { id: 'tx-7', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 500000, caja_origen_id: 'A' };
            const { dobles, borrarMovimiento } = preparar([fila], { A: 1000000 });

            await Promise.all([borrarMovimiento(fila), borrarMovimiento(fila)]);

            expect(dobles.estado.saldos.A).toBe(1500000);
            expect(dobles.estado.cola.map((o) => `${o.tabla} ${o.operacion}`)).toEqual([
                'cajas UPDATE',
                'transacciones DELETE',
            ]);
            expect(dobles.metodos().filter((m) => m === 'sincronizador.sincronizarAhora')).toHaveLength(1);
        });

        it('si el movimiento ya no existe, no toca saldos ni encola nada', async () => {
            const { dobles, borrarMovimiento } = preparar([]);

            await expect(borrarMovimiento({ id: 'tx-x', tipo_movimiento: 'EGRESO', monto: 1000, caja_origen_id: 'A' }))
                .resolves.toBeUndefined();

            expect(dobles.estado.saldos.A).toBe(10000);
            expect(dobles.estado.cola).toEqual([]);
            expect(dobles.metodos()).not.toContain('sincronizador.sincronizarAhora');
        });
    });

    describe('movimientos de deuda (C15)', () => {
        const casos = [
            ['préstamo entre cajas', { tipo_movimiento: 'TRANSFERENCIA', caja_destino_id: 'B', categoria: 'Préstamo entre Cajas' }],
            ['abono de préstamo', { tipo_movimiento: 'TRANSFERENCIA', caja_destino_id: 'B', categoria: 'Pago Préstamo' }],
            ['abono a proveedor', { tipo_movimiento: 'EGRESO', categoria: 'Pago Deuda' }],
        ];

        for (const [nombre, extra] of casos) {
            it(`rechaza borrar un ${nombre} y no toca nada`, async () => {
                const fila = { id: 'tx-d', fecha: FECHA, monto: 300, caja_origen_id: 'A', ...extra };
                const { dobles, borrarMovimiento } = preparar([fila]);

                const error = await borrarMovimiento(fila).catch((e) => e);

                expect(error).toBeInstanceOf(MovimientoDeDeudaError);
                expect(error).toBeInstanceOf(MovimientoInvalidoError);
                expect(dobles.estado.transacciones['tx-d']).toBeDefined();
                expect(dobles.estado.saldos).toEqual({ A: 10000, B: 5000 });
                expect(dobles.estado.cola).toEqual([]);
            });
        }

        it('un EGRESO "Pago Préstamo" (cuota a un banco) sí se borra', async () => {
            const fila = { id: 'tx-e', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 300, caja_origen_id: 'A', categoria: 'Pago Préstamo' };
            const { dobles, borrarMovimiento } = preparar([fila]);

            await borrarMovimiento(fila);

            expect(dobles.estado.transacciones).toEqual({});
        });
    });

    it('atomicidad (C22): si falla el borrado, el saldo vuelve a como estaba', async () => {
        const fila = { id: 'tx-8', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
        const { dobles, borrarMovimiento } = preparar([fila]);
        dobles.fallarEn('transacciones.eliminar');

        await expect(borrarMovimiento(fila)).rejects.toThrow();

        expect(dobles.estado.saldos.A).toBe(10000);
        expect(dobles.estado.transacciones['tx-8']).toBeDefined();
        expect(dobles.estado.cola).toEqual([]);
    });

    it('resuelve aunque sincronizarAhora nunca resuelva su promesa', async () => {
        const fila = { id: 'tx-9', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
        const { dobles, borrarMovimiento } = preparar([fila]);
        dobles.dependencias.sincronizador.sincronizarAhora = () => new Promise(() => {});

        await expect(borrarMovimiento(fila)).resolves.toBeUndefined();
    });

    it('no propaga si sincronizarAhora rechaza', async () => {
        const fila = { id: 'tx-10', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
        const { dobles, borrarMovimiento } = preparar([fila]);
        dobles.dependencias.sincronizador.sincronizarAhora = async () => {
            throw new Error('sin red');
        };

        await expect(borrarMovimiento(fila)).resolves.toBeUndefined();
    });
});
