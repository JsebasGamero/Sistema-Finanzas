import { describe, it, expect, beforeEach } from 'vitest';
import { crearRegistrarMovimiento } from './registrarMovimiento';
import { MovimientoInvalidoError } from '../../domain/errores';

/**
 * Dobles de prueba que registran cada llamada en un log compartido, para
 * poder verificar la secuencia exacta 3-4-5-6 descrita en la tarea.
 */
function crearDobles(log) {
    const transacciones = {
        async agregar(tx) {
            log.push({ metodo: 'transacciones.agregar', args: tx });
            return tx;
        },
        async actualizar(id, cambios) {
            log.push({ metodo: 'transacciones.actualizar', args: { id, cambios } });
            return { id, ...cambios };
        },
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

describe('registrarMovimiento', () => {
    let log;
    let dobles;
    let generarId;
    let ahora;

    beforeEach(() => {
        log = [];
        dobles = crearDobles(log);
        generarId = () => 'id-generado';
        ahora = () => '2026-09-25T00:00:00.000Z';
    });

    it('EGRESO: secuencia y payloads exactos', async () => {
        const registrarMovimiento = crearRegistrarMovimiento({ ...dobles, generarId, ahora });

        const datos = {
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
        };

        const tx = await registrarMovimiento(datos);

        const txEsperada = {
            id: 'id-generado',
            tipo_movimiento: 'EGRESO',
            monto: 1000,
            caja_origen_id: 'A',
            sincronizado: false,
            created_at: '2026-09-25T00:00:00.000Z',
        };

        expect(tx).toEqual(txEsperada);
        expect(log).toEqual([
            { metodo: 'transacciones.agregar', args: txEsperada },
            {
                metodo: 'aplicadorDeAjustes.aplicar',
                args: {
                    ajustes: [{ cajaId: 'A', delta: -1000 }],
                    opciones: { payload: 'parcial' },
                },
            },
            {
                metodo: 'outbox.encolar',
                args: { tabla: 'transacciones', operacion: 'INSERT', datos: txEsperada },
            },
            { metodo: 'sincronizador.sincronizarAhora', args: undefined },
        ]);
    });

    it('INGRESO: secuencia y payloads exactos', async () => {
        const registrarMovimiento = crearRegistrarMovimiento({ ...dobles, generarId, ahora });

        const datos = {
            tipo_movimiento: 'INGRESO',
            monto: 2500,
            caja_origen_id: 'B',
        };

        const tx = await registrarMovimiento(datos);

        const txEsperada = {
            id: 'id-generado',
            tipo_movimiento: 'INGRESO',
            monto: 2500,
            caja_origen_id: 'B',
            sincronizado: false,
            created_at: '2026-09-25T00:00:00.000Z',
        };

        expect(tx).toEqual(txEsperada);
        expect(log[1].args.ajustes).toEqual([{ cajaId: 'B', delta: 2500 }]);
        expect(log[2].args).toEqual({
            tabla: 'transacciones',
            operacion: 'INSERT',
            datos: txEsperada,
        });
        expect(log[3].metodo).toBe('sincronizador.sincronizarAhora');
    });

    it('TRANSFERENCIA: secuencia y payloads exactos', async () => {
        const registrarMovimiento = crearRegistrarMovimiento({ ...dobles, generarId, ahora });

        const datos = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 500,
            caja_origen_id: 'A',
            caja_destino_id: 'B',
        };

        const tx = await registrarMovimiento(datos);

        expect(tx.id).toBe('id-generado');
        expect(log[1].args.ajustes).toEqual([
            { cajaId: 'A', delta: -500 },
            { cajaId: 'B', delta: 500 },
        ]);
        expect(log.map((l) => l.metodo)).toEqual([
            'transacciones.agregar',
            'aplicadorDeAjustes.aplicar',
            'outbox.encolar',
            'sincronizador.sincronizarAhora',
        ]);
    });

    it('monto 0 rechaza con MovimientoInvalidoError y no escribe nada', async () => {
        const registrarMovimiento = crearRegistrarMovimiento({ ...dobles, generarId, ahora });

        const datos = { tipo_movimiento: 'EGRESO', monto: 0, caja_origen_id: 'A' };

        await expect(registrarMovimiento(datos)).rejects.toBeInstanceOf(MovimientoInvalidoError);
        expect(log).toEqual([]);
    });

    it('transferencia sin destino rechaza con MovimientoInvalidoError y no escribe nada', async () => {
        const registrarMovimiento = crearRegistrarMovimiento({ ...dobles, generarId, ahora });

        const datos = { tipo_movimiento: 'TRANSFERENCIA', monto: 1000, caja_origen_id: 'A' };

        await expect(registrarMovimiento(datos)).rejects.toBeInstanceOf(MovimientoInvalidoError);
        expect(log).toEqual([]);
    });

    it('transferencia con cajas iguales rechaza con MovimientoInvalidoError y no escribe nada', async () => {
        const registrarMovimiento = crearRegistrarMovimiento({ ...dobles, generarId, ahora });

        const datos = {
            tipo_movimiento: 'TRANSFERENCIA',
            monto: 1000,
            caja_origen_id: 'A',
            caja_destino_id: 'A',
        };

        await expect(registrarMovimiento(datos)).rejects.toBeInstanceOf(MovimientoInvalidoError);
        expect(log).toEqual([]);
    });

    it('propaga un rechazo de sincronizarAhora (espera con await)', async () => {
        const dobleFalla = crearDobles(log);
        dobleFalla.sincronizador = {
            async sincronizarAhora() {
                log.push({ metodo: 'sincronizador.sincronizarAhora', args: undefined });
                throw new Error('sin red');
            },
        };
        const registrarMovimiento = crearRegistrarMovimiento({
            ...dobleFalla,
            generarId,
            ahora,
        });

        const datos = { tipo_movimiento: 'EGRESO', monto: 1000, caja_origen_id: 'A' };

        await expect(registrarMovimiento(datos)).rejects.toThrow('sin red');
        // Las escrituras previas sí ocurrieron; solo la sync falló y se propagó.
        expect(log.map((l) => l.metodo)).toEqual([
            'transacciones.agregar',
            'aplicadorDeAjustes.aplicar',
            'outbox.encolar',
            'sincronizador.sincronizarAhora',
        ]);
    });
});
