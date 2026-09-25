import { describe, it, expect, beforeEach } from 'vitest';
import { crearEditarMovimiento } from './editarMovimiento';
import { MovimientoInvalidoError } from '../../domain/errores';

function crearDobles(log) {
    const transacciones = {
        async actualizar(id, cambios) {
            log.push({ metodo: 'transacciones.actualizar', args: { id, cambios } });
            return { id, ...cambios };
        },
    };

    const aplicadorDeAjustes = {
        async aplicar(ajustes, opciones) {
            log.push({ metodo: 'aplicadorDeAjustes.aplicar', args: { ajustes, opciones } });
            return [];
        },
    };

    const outbox = {
        async encolar(tabla, operacion, datos) {
            log.push({ metodo: 'outbox.encolar', args: { tabla, operacion, datos } });
        },
    };

    const sincronizador = {
        async sincronizarAhora() {
            log.push({ metodo: 'sincronizador.sincronizarAhora', args: undefined });
        },
    };

    return { transacciones, aplicadorDeAjustes, outbox, sincronizador };
}

describe('editarMovimiento', () => {
    let log;
    let dobles;
    let ahora;

    beforeEach(() => {
        log = [];
        dobles = crearDobles(log);
        ahora = () => '2026-09-25T00:00:00.000Z';
    });

    it('EGRESO editado: ajustes de efectoDeEdicion, UPDATE con updated_at', async () => {
        const editarMovimiento = crearEditarMovimiento({ ...dobles, ahora });

        const original = {
            id: 'tx-1',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };
        const actualizado = {
            tipo_movimiento: 'EGRESO',
            monto: 1500,
            caja_origen_id: 'A',
        };

        const resultado = await editarMovimiento(original, actualizado);

        expect(resultado).toEqual({
            id: 'tx-1',
            tipo_movimiento: 'EGRESO',
            monto: 1500,
            caja_origen_id: 'A',
            updated_at: '2026-09-25T00:00:00.000Z',
        });

        expect(log[0]).toEqual({
            metodo: 'aplicadorDeAjustes.aplicar',
            args: {
                ajustes: [
                    { cajaId: 'A', delta: 1000 },
                    { cajaId: 'A', delta: -1500 },
                ],
                opciones: { payload: 'parcial' },
            },
        });
        expect(log[1]).toEqual({
            metodo: 'transacciones.actualizar',
            args: {
                id: 'tx-1',
                cambios: {
                    tipo_movimiento: 'EGRESO',
                    monto: 1500,
                    caja_origen_id: 'A',
                    updated_at: '2026-09-25T00:00:00.000Z',
                },
            },
        });
        expect(log[2]).toEqual({
            metodo: 'outbox.encolar',
            args: {
                tabla: 'transacciones',
                operacion: 'UPDATE',
                datos: {
                    id: 'tx-1',
                    tipo_movimiento: 'EGRESO',
                    monto: 1500,
                    caja_origen_id: 'A',
                    updated_at: '2026-09-25T00:00:00.000Z',
                },
            },
        });
        expect(log[3].metodo).toBe('sincronizador.sincronizarAhora');
    });

    it('INGRESO editado: ajustes correctos', async () => {
        const editarMovimiento = crearEditarMovimiento({ ...dobles, ahora });

        const original = {
            id: 'tx-2',
            tipo_movimiento: 'INGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };
        const actualizado = { tipo_movimiento: 'INGRESO', monto: 800, caja_origen_id: 'A' };

        await editarMovimiento(original, actualizado);

        expect(log[0].args.ajustes).toEqual([
            { cajaId: 'A', delta: -1000 },
            { cajaId: 'A', delta: 800 },
        ]);
    });

    it('TRANSFERENCIA editada: efectoDeEdicion produce 4 entradas', async () => {
        const editarMovimiento = crearEditarMovimiento({ ...dobles, ahora });

        const original = {
            id: 'tx-3',
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };
        const actualizado = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 500,
            caja_origen_id: 'C',
            caja_destino_id: 'D',
        };

        await editarMovimiento(original, actualizado);

        expect(log[0].args.ajustes).toEqual([
            { cajaId: 'A', delta: 1000 },
            { cajaId: 'B', delta: -1000 },
            { cajaId: 'C', delta: -500 },
            { cajaId: 'D', delta: 500 },
        ]);
    });

    it('lleva editado_por en el UPDATE cuando viene en actualizado', async () => {
        const editarMovimiento = crearEditarMovimiento({ ...dobles, ahora });

        const original = {
            id: 'tx-4',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };
        const actualizado = {
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
            editado_por: 'juan',
        };

        const resultado = await editarMovimiento(original, actualizado);

        expect(resultado.editado_por).toBe('juan');
        expect(log[1].args.cambios.editado_por).toBe('juan');
        expect(log[2].args.datos.editado_por).toBe('juan');
    });

    it('monto 0 rechaza con MovimientoInvalidoError antes de escribir', async () => {
        const editarMovimiento = crearEditarMovimiento({ ...dobles, ahora });

        const original = {
            id: 'tx-5',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };
        const actualizado = { tipo_movimiento: 'EGRESO', monto: 0, caja_origen_id: 'A' };

        await expect(editarMovimiento(original, actualizado)).rejects.toBeInstanceOf(
            MovimientoInvalidoError,
        );
        expect(log).toEqual([]);
    });

    it('transferencia sin destino rechaza con MovimientoInvalidoError', async () => {
        const editarMovimiento = crearEditarMovimiento({ ...dobles, ahora });

        const original = {
            id: 'tx-6',
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };
        const actualizado = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
        };

        await expect(editarMovimiento(original, actualizado)).rejects.toBeInstanceOf(
            MovimientoInvalidoError,
        );
        expect(log).toEqual([]);
    });

    it('cajas iguales en transferencia rechaza con MovimientoInvalidoError', async () => {
        const editarMovimiento = crearEditarMovimiento({ ...dobles, ahora });

        const original = {
            id: 'tx-7',
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };
        const actualizado = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'A',
        };

        await expect(editarMovimiento(original, actualizado)).rejects.toBeInstanceOf(
            MovimientoInvalidoError,
        );
        expect(log).toEqual([]);
    });

    it('resuelve aunque sincronizarAhora nunca resuelva su promesa', async () => {
        const dobleColgado = crearDobles(log);
        dobleColgado.sincronizador = {
            sincronizarAhora: () => new Promise(() => {}),
        };
        const editarMovimiento = crearEditarMovimiento({ ...dobleColgado, ahora });

        const original = {
            id: 'tx-8',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };
        const actualizado = { tipo_movimiento: 'EGRESO', monto: 1200, caja_origen_id: 'A' };

        const resultado = await editarMovimiento(original, actualizado);
        expect(resultado.id).toBe('tx-8');
    });

    it('no propaga si sincronizarAhora rechaza (se captura)', async () => {
        const dobleFalla = crearDobles(log);
        dobleFalla.sincronizador = {
            async sincronizarAhora() {
                throw new Error('sin red');
            },
        };
        const editarMovimiento = crearEditarMovimiento({ ...dobleFalla, ahora });

        const original = {
            id: 'tx-9',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };
        const actualizado = { tipo_movimiento: 'EGRESO', monto: 1200, caja_origen_id: 'A' };

        await expect(editarMovimiento(original, actualizado)).resolves.toEqual(
            expect.objectContaining({ id: 'tx-9' }),
        );
    });
});
