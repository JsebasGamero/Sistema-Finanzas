import { describe, it, expect, beforeEach } from 'vitest';
import { crearBorrarMovimiento } from './borrarMovimiento';

function crearDobles(log) {
    const transacciones = {
        async eliminar(id) {
            log.push({ metodo: 'transacciones.eliminar', args: { id } });
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

describe('borrarMovimiento', () => {
    let log;
    let dobles;

    beforeEach(() => {
        log = [];
        dobles = crearDobles(log);
    });

    it('EGRESO: secuencia y payloads exactos', async () => {
        const borrarMovimiento = crearBorrarMovimiento(dobles);

        const movimiento = {
            id: 'tx-1',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };

        await borrarMovimiento(movimiento);

        expect(log).toEqual([
            {
                metodo: 'aplicadorDeAjustes.aplicar',
                args: {
                    ajustes: [{ cajaId: 'A', delta: 1000 }],
                    opciones: { payload: 'parcial' },
                },
            },
            { metodo: 'transacciones.eliminar', args: { id: 'tx-1' } },
            {
                metodo: 'outbox.encolar',
                args: { tabla: 'transacciones', operacion: 'DELETE', datos: { id: 'tx-1' } },
            },
            { metodo: 'sincronizador.sincronizarAhora', args: undefined },
        ]);
    });

    it('INGRESO: revierte con delta negativo', async () => {
        const borrarMovimiento = crearBorrarMovimiento(dobles);

        const movimiento = {
            id: 'tx-2',
            tipo_movimiento: 'INGRESO',
            monto: 2000,
            caja_origen_id: 'B',
        };

        await borrarMovimiento(movimiento);

        expect(log[0].args.ajustes).toEqual([{ cajaId: 'B', delta: -2000 }]);
        expect(log[1]).toEqual({ metodo: 'transacciones.eliminar', args: { id: 'tx-2' } });
    });

    it('TRANSFERENCIA: revierte origen y destino', async () => {
        const borrarMovimiento = crearBorrarMovimiento(dobles);

        const movimiento = {
            id: 'tx-3',
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 500,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };

        await borrarMovimiento(movimiento);

        expect(log[0].args.ajustes).toEqual([
            { cajaId: 'A', delta: 500 },
            { cajaId: 'B', delta: -500 },
        ]);
    });

    it('TRANSFERENCIA legacy sin caja_destino_id revierte solo el origen', async () => {
        const borrarMovimiento = crearBorrarMovimiento(dobles);

        const movimiento = {
            id: 'tx-4',
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 500,
            caja_origen_id: 'A',
            // sin caja_destino_id: dato legacy
        };

        await borrarMovimiento(movimiento);

        expect(log[0].args.ajustes).toEqual([{ cajaId: 'A', delta: 500 }]);
        expect(log[1]).toEqual({ metodo: 'transacciones.eliminar', args: { id: 'tx-4' } });
    });

    it('no valida: borra un movimiento sin tipo_movimiento reconocido sin lanzar', async () => {
        const borrarMovimiento = crearBorrarMovimiento(dobles);

        const movimiento = { id: 'tx-5', monto: 0 };

        await expect(borrarMovimiento(movimiento)).resolves.toBeUndefined();
        expect(log[1]).toEqual({ metodo: 'transacciones.eliminar', args: { id: 'tx-5' } });
    });

    it('resuelve aunque sincronizarAhora nunca resuelva su promesa', async () => {
        const dobleColgado = crearDobles(log);
        dobleColgado.sincronizador = {
            sincronizarAhora: () => new Promise(() => {}),
        };
        const borrarMovimiento = crearBorrarMovimiento(dobleColgado);

        const movimiento = {
            id: 'tx-6',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };

        await expect(borrarMovimiento(movimiento)).resolves.toBeUndefined();
    });

    it('no propaga si sincronizarAhora rechaza (se captura)', async () => {
        const dobleFalla = crearDobles(log);
        dobleFalla.sincronizador = {
            async sincronizarAhora() {
                throw new Error('sin red');
            },
        };
        const borrarMovimiento = crearBorrarMovimiento(dobleFalla);

        const movimiento = {
            id: 'tx-7',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };

        await expect(borrarMovimiento(movimiento)).resolves.toBeUndefined();
    });
});
