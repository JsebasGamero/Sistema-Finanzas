import { describe, it, expect, beforeEach } from 'vitest';
import { crearRegistrarMovimiento } from './registrarMovimiento';
import { MovimientoInvalidoError } from '../../domain/errores';
import { crearDobles } from './doblesEnMemoria';

const FECHA = '2026-09-25';
const AHORA = '2026-09-25T00:00:00.000Z';

describe('registrarMovimiento', () => {
    let dobles;
    let registrarMovimiento;
    let contador;

    beforeEach(() => {
        dobles = crearDobles({ saldos: { A: 10000, B: 0 } });
        contador = 0;
        registrarMovimiento = crearRegistrarMovimiento({
            ...dobles.dependencias,
            generarId: () => `id-${++contador}`,
            ahora: () => AHORA,
        });
    });

    it('EGRESO: todo dentro de la unidad de trabajo y la sync después del commit', async () => {
        const datos = { tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };

        const tx = await registrarMovimiento(datos);

        const txEsperada = {
            id: 'id-1',
            tipo_movimiento: 'EGRESO',
            fecha: FECHA,
            monto: 1000,
            caja_origen_id: 'A',
            sincronizado: false,
            created_at: AHORA,
        };
        expect(tx).toEqual(txEsperada);
        expect(dobles.log).toEqual([
            { metodo: 'unidadDeTrabajo.inicio' },
            { metodo: 'transacciones.agregar', args: txEsperada },
            {
                metodo: 'aplicadorDeAjustes.aplicar',
                args: { ajustes: [{ cajaId: 'A', delta: -1000 }], opciones: { payload: 'parcial' } },
            },
            {
                metodo: 'outbox.encolar',
                args: { tabla: 'transacciones', operacion: 'INSERT', datos: txEsperada },
            },
            { metodo: 'unidadDeTrabajo.commit' },
            { metodo: 'sincronizador.sincronizarAhora' },
        ]);
        expect(dobles.estado.saldos.A).toBe(9000);
    });

    it('INGRESO: suma a la caja', async () => {
        await registrarMovimiento({ tipo_movimiento: 'INGRESO', fecha: FECHA, monto: 2500, caja_origen_id: 'B' });

        expect(dobles.estado.saldos.B).toBe(2500);
        expect(dobles.estado.cola.map((o) => `${o.tabla} ${o.operacion}`)).toEqual([
            'cajas UPDATE',
            'transacciones INSERT',
        ]);
    });

    it('TRANSFERENCIA: mueve el dinero de origen a destino', async () => {
        const tx = await registrarMovimiento({
            tipo_movimiento: 'TRANSFERENCIA',
            fecha: FECHA,
            monto: 500,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        });

        expect(tx.id).toBe('id-1');
        expect(dobles.estado.saldos).toEqual({ A: 9500, B: 500 });
    });

    describe('validación: rechaza sin escribir nada', () => {
        const casos = [
            ['monto 0', { tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 0, caja_origen_id: 'A' }],
            ['transferencia sin destino', { tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 1000, caja_origen_id: 'A' }],
            ['cajas iguales', { tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 1000, caja_origen_id: 'A', caja_destino_id: 'A' }],
            ['fecha vacía (MOV-2)', { tipo_movimiento: 'EGRESO', fecha: '', monto: 1000, caja_origen_id: 'A' }],
            ['fecha inexistente (MOV-2)', { tipo_movimiento: 'EGRESO', fecha: '2026-02-30', monto: 1000, caja_origen_id: 'A' }],
        ];

        for (const [nombre, datos] of casos) {
            it(nombre, async () => {
                await expect(registrarMovimiento(datos)).rejects.toBeInstanceOf(MovimientoInvalidoError);
                expect(dobles.log).toEqual([]);
            });
        }
    });

    describe('categorías reservadas para Deudas (C15)', () => {
        it('rechaza una TRANSFERENCIA "Pago Préstamo" creada desde el formulario', async () => {
            const datos = {
                tipo_movimiento: 'TRANSFERENCIA',
                fecha: FECHA,
                monto: 1000,
                caja_origen_id: 'A',
                caja_destino_id: 'B',
                categoria: 'Pago Préstamo',
            };
            const error = await registrarMovimiento(datos).catch((e) => e);
            expect(error).toBeInstanceOf(MovimientoInvalidoError);
            expect(error.errores[0].codigo).toBe('RESERVADO_PARA_DEUDAS');
            expect(dobles.log).toEqual([]);
        });

        it('rechaza un EGRESO "Pago Deuda"', async () => {
            const datos = { tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A', categoria: 'Pago Deuda' };
            await expect(registrarMovimiento(datos)).rejects.toBeInstanceOf(MovimientoInvalidoError);
        });

        it('acepta un EGRESO "Pago Préstamo" (cuota a un banco: gasto normal)', async () => {
            const datos = { tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A', categoria: 'Pago Préstamo' };
            await expect(registrarMovimiento(datos)).resolves.toEqual(expect.objectContaining({ id: 'id-1' }));
        });
    });

    describe('sincronización en segundo plano (MOV-7)', () => {
        it('devuelve la transacción aunque la sync nunca termine', async () => {
            dobles.dependencias.sincronizador.sincronizarAhora = () => new Promise(() => {});
            const tx = await registrarMovimiento({ tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' });
            expect(tx.id).toBe('id-1');
        });

        it('no propaga un rechazo de la sync: el movimiento ya quedó guardado', async () => {
            dobles.dependencias.sincronizador.sincronizarAhora = async () => {
                throw new Error('sin red');
            };
            const tx = await registrarMovimiento({ tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' });
            expect(tx.id).toBe('id-1');
            expect(dobles.estado.transacciones['id-1']).toBeDefined();
        });

        it('no propaga un sincronizador que lanza de forma síncrona', async () => {
            dobles.dependencias.sincronizador.sincronizarAhora = () => {
                throw new Error('roto');
            };
            await expect(
                registrarMovimiento({ tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' }),
            ).resolves.toEqual(expect.objectContaining({ id: 'id-1' }));
        });
    });

    describe('atomicidad (C22, MOV-8)', () => {
        it('si falla el encolado, no queda la fila ni el saldo aplicado, y no se sincroniza', async () => {
            dobles.fallarEn('outbox.encolar');

            await expect(
                registrarMovimiento({ tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' }),
            ).rejects.toThrow('fallo simulado');

            expect(dobles.estado.transacciones).toEqual({});
            expect(dobles.estado.saldos.A).toBe(10000);
            expect(dobles.estado.cola).toEqual([]);
            expect(dobles.metodos()).not.toContain('sincronizador.sincronizarAhora');
        });

        it('una transferencia que falla a mitad del aplicador no deja el origen descontado', async () => {
            dobles.fallarEn('aplicadorDeAjustes.aplicar');

            await expect(registrarMovimiento({
                tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 500, caja_origen_id: 'A', caja_destino_id: 'B',
            })).rejects.toThrow();

            expect(dobles.estado.saldos).toEqual({ A: 10000, B: 0 });
        });

        it('reintentar después de un fallo aplica el efecto una sola vez', async () => {
            const datos = { tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };
            dobles.fallarEn('outbox.encolar');
            await expect(registrarMovimiento(datos)).rejects.toThrow();

            dobles.fallarEn('outbox.encolar', null);
            await registrarMovimiento(datos);

            expect(Object.keys(dobles.estado.transacciones)).toHaveLength(1);
            expect(dobles.estado.saldos.A).toBe(9000);
        });
    });

    describe('id de la UI como llave de idempotencia (MOV-8)', () => {
        it('con un id nuevo, lo usa', async () => {
            const tx = await registrarMovimiento({ id: 'form-1', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' });
            expect(tx.id).toBe('form-1');
        });

        it('un doble envío con el mismo id descuenta una sola vez y no vuelve a sincronizar', async () => {
            const datos = { id: 'form-1', tipo_movimiento: 'EGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' };

            const [primera, segunda] = await Promise.all([registrarMovimiento(datos), registrarMovimiento(datos)]);

            expect(primera.id).toBe('form-1');
            expect(segunda.id).toBe('form-1');
            expect(dobles.estado.saldos.A).toBe(9000);
            expect(dobles.estado.cola.filter((o) => o.tabla === 'transacciones')).toHaveLength(1);
            expect(dobles.metodos().filter((m) => m === 'sincronizador.sincronizarAhora')).toHaveLength(1);
        });
    });

    it('sin unidadDeTrabajo no se puede crear el caso de uso', () => {
        const { unidadDeTrabajo: _omitida, ...sinUnidad } = dobles.dependencias;
        expect(() => crearRegistrarMovimiento({ ...sinUnidad, generarId: () => 'x', ahora: () => AHORA }))
            .toThrow(/unidadDeTrabajo/);
    });
});
