import { describe, it, expect, beforeEach } from 'vitest';
import { crearEditarMovimiento } from './editarMovimiento';
import {
    MovimientoDeDeudaError,
    MovimientoInvalidoError,
    MovimientoNoEncontradoError,
} from '../../domain/errores';
import { crearDobles } from './doblesEnMemoria';

const FECHA = '2026-09-20';
const AHORA = '2026-09-25T00:00:00.000Z';

const egreso = (id, monto, extra = {}) => ({
    id,
    tipo_movimiento: 'EGRESO',
    fecha: FECHA,
    monto,
    caja_origen_id: 'A',
    sincronizado: true,
    ...extra,
});

describe('editarMovimiento', () => {
    let dobles;
    let editarMovimiento;

    function preparar(filas, saldos = { A: 10000, B: 5000, C: 0, D: 0 }) {
        dobles = crearDobles({ transacciones: filas, saldos });
        editarMovimiento = crearEditarMovimiento({ ...dobles.dependencias, ahora: () => AHORA });
    }

    beforeEach(() => preparar([egreso('tx-1', 1000)]));

    it('EGRESO editado: relee, ajusta con efectoDeEdicion y encola el UPDATE, todo en la unidad', async () => {
        const actualizado = { ...egreso('tx-1', 1500) };

        const resultado = await editarMovimiento(egreso('tx-1', 1000), actualizado);

        const cambios = { ...actualizado, sincronizado: false, updated_at: AHORA };
        expect(resultado).toEqual(cambios);
        expect(dobles.log).toEqual([
            { metodo: 'unidadDeTrabajo.inicio' },
            { metodo: 'transacciones.obtener', args: { id: 'tx-1' } },
            {
                metodo: 'aplicadorDeAjustes.aplicar',
                args: {
                    ajustes: [{ cajaId: 'A', delta: 1000 }, { cajaId: 'A', delta: -1500 }],
                    opciones: { payload: 'parcial' },
                },
            },
            { metodo: 'transacciones.actualizar', args: { id: 'tx-1', cambios } },
            {
                metodo: 'outbox.encolar',
                args: { tabla: 'transacciones', operacion: 'UPDATE', datos: cambios },
            },
            { metodo: 'unidadDeTrabajo.commit' },
            { metodo: 'sincronizador.sincronizarAhora' },
        ]);
        expect(dobles.estado.saldos.A).toBe(9500);
    });

    it('marca sincronizado: false aunque la fila viniera sincronizada (C21)', async () => {
        const resultado = await editarMovimiento(egreso('tx-1', 1000), egreso('tx-1', 1200, { sincronizado: true }));

        expect(resultado.sincronizado).toBe(false);
        expect(dobles.estado.transacciones['tx-1'].sincronizado).toBe(false);
    });

    it('calcula el efecto con la fila guardada, no con la copia vieja de la pantalla (MOV-4)', async () => {
        // En la base ya está en 1000; la pantalla todavía muestra 800.
        const copiaVieja = egreso('tx-1', 800);

        await editarMovimiento(copiaVieja, egreso('tx-1', 1500));

        expect(dobles.log[2].args.ajustes).toEqual([
            { cajaId: 'A', delta: 1000 },
            { cajaId: 'A', delta: -1500 },
        ]);
        expect(dobles.estado.saldos.A).toBe(9500);
    });

    it('INGRESO editado: ajustes correctos', async () => {
        preparar([{ id: 'tx-2', tipo_movimiento: 'INGRESO', fecha: FECHA, monto: 1000, caja_origen_id: 'A' }]);

        await editarMovimiento({ id: 'tx-2' }, { tipo_movimiento: 'INGRESO', fecha: FECHA, monto: 800, caja_origen_id: 'A' });

        expect(dobles.log[2].args.ajustes).toEqual([
            { cajaId: 'A', delta: -1000 },
            { cajaId: 'A', delta: 800 },
        ]);
    });

    it('TRANSFERENCIA editada: efectoDeEdicion produce 4 entradas', async () => {
        preparar([{
            id: 'tx-3', tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 1000, caja_origen_id: 'A', caja_destino_id: 'B',
        }]);

        await editarMovimiento({ id: 'tx-3' }, {
            tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 500, caja_origen_id: 'C', caja_destino_id: 'D',
        });

        expect(dobles.log[2].args.ajustes).toEqual([
            { cajaId: 'A', delta: 1000 },
            { cajaId: 'B', delta: -1000 },
            { cajaId: 'C', delta: -500 },
            { cajaId: 'D', delta: 500 },
        ]);
        expect(dobles.estado.saldos).toEqual({ A: 11000, B: 4000, C: -500, D: 500 });
    });

    it('lleva editado_por en el UPDATE cuando viene en actualizado', async () => {
        const resultado = await editarMovimiento(egreso('tx-1', 1000), egreso('tx-1', 1000, { editado_por: 'juan' }));

        expect(resultado.editado_por).toBe('juan');
        expect(dobles.estado.cola.at(-1).datos.editado_por).toBe('juan');
    });

    describe('validación: rechaza sin escribir nada', () => {
        const casos = [
            ['monto 0', egreso('tx-1', 0)],
            ['transferencia sin destino', { tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 1000, caja_origen_id: 'A' }],
            ['cajas iguales', { tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 1000, caja_origen_id: 'A', caja_destino_id: 'A' }],
            ['fecha vacía (MOV-2)', egreso('tx-1', 1000, { fecha: '' })],
        ];

        for (const [nombre, actualizado] of casos) {
            it(nombre, async () => {
                await expect(editarMovimiento(egreso('tx-1', 1000), actualizado))
                    .rejects.toBeInstanceOf(MovimientoInvalidoError);
                expect(dobles.log).toEqual([]);
            });
        }
    });

    it('si el movimiento ya no existe, rechaza sin tocar saldos (MOV-4)', async () => {
        preparar([]);

        await expect(editarMovimiento(egreso('tx-1', 1000), egreso('tx-1', 1500)))
            .rejects.toBeInstanceOf(MovimientoNoEncontradoError);
        expect(dobles.estado.saldos.A).toBe(10000);
        expect(dobles.estado.cola).toEqual([]);
    });

    describe('movimientos de deuda (C15)', () => {
        it('rechaza editar un abono a proveedor', async () => {
            const abono = egreso('tx-9', 300, { categoria: 'Pago Deuda' });
            preparar([abono]);

            const error = await editarMovimiento(abono, { ...abono, monto: 400 }).catch((e) => e);

            expect(error).toBeInstanceOf(MovimientoDeDeudaError);
            expect(error).toBeInstanceOf(MovimientoInvalidoError);
            expect(error.errores[0].codigo).toBe('MOVIMIENTO_DE_DEUDA');
            expect(dobles.estado.saldos.A).toBe(10000);
            expect(dobles.estado.transacciones['tx-9'].monto).toBe(300);
        });

        it('decide con la fila guardada aunque la copia de la pantalla no lo parezca', async () => {
            preparar([{
                id: 'tx-8', tipo_movimiento: 'TRANSFERENCIA', fecha: FECHA, monto: 700,
                caja_origen_id: 'A', caja_destino_id: 'B', categoria: 'Préstamo entre Cajas',
            }]);

            await expect(editarMovimiento({ id: 'tx-8', categoria: 'Otros' }, egreso('tx-8', 700)))
                .rejects.toBeInstanceOf(MovimientoDeDeudaError);
        });

        it('no deja convertir un movimiento normal en un abono (quedaría sin deuda y bloqueado)', async () => {
            const error = await editarMovimiento(egreso('tx-1', 1000), egreso('tx-1', 1000, { categoria: 'Pago Deuda' }))
                .catch((e) => e);

            expect(error).toBeInstanceOf(MovimientoInvalidoError);
            expect(error.errores[0].codigo).toBe('RESERVADO_PARA_DEUDAS');
            expect(dobles.estado.transacciones['tx-1'].categoria).toBeUndefined();
        });
    });

    it('atomicidad (C22): si falla el UPDATE, los saldos vuelven a como estaban', async () => {
        dobles.fallarEn('transacciones.actualizar');

        await expect(editarMovimiento(egreso('tx-1', 1000), egreso('tx-1', 1500))).rejects.toThrow();

        expect(dobles.estado.saldos.A).toBe(10000);
        expect(dobles.estado.transacciones['tx-1'].monto).toBe(1000);
        expect(dobles.estado.cola).toEqual([]);
        expect(dobles.metodos()).not.toContain('sincronizador.sincronizarAhora');
    });

    it('dos ediciones seguidas con la misma copia no revierten dos veces el monto viejo', async () => {
        const copia = egreso('tx-1', 1000);
        await Promise.all([
            editarMovimiento(copia, egreso('tx-1', 1500)),
            editarMovimiento(copia, egreso('tx-1', 1500)),
        ]);

        // Con la copia, la segunda revertía 1000 en vez de 1500 y dejaba 9000.
        expect(dobles.estado.saldos.A).toBe(9500);
    });

    it('resuelve aunque sincronizarAhora nunca resuelva su promesa', async () => {
        dobles.dependencias.sincronizador.sincronizarAhora = () => new Promise(() => {});
        const resultado = await editarMovimiento(egreso('tx-1', 1000), egreso('tx-1', 1200));
        expect(resultado.id).toBe('tx-1');
    });

    it('no propaga si sincronizarAhora rechaza', async () => {
        dobles.dependencias.sincronizador.sincronizarAhora = async () => {
            throw new Error('sin red');
        };
        await expect(editarMovimiento(egreso('tx-1', 1000), egreso('tx-1', 1200)))
            .resolves.toEqual(expect.objectContaining({ id: 'tx-1' }));
    });
});
