import { describe, it, expect } from 'vitest';
import { conCandadoEntrePestanas, crearEjecutorSerial, crearTurnoSerial } from './ejecutorSerial';

function diferido() {
    let resolver;
    let rechazar;
    const promesa = new Promise((res, rej) => { resolver = res; rechazar = rej; });
    return { promesa, resolver, rechazar };
}

const tic = () => new Promise((r) => setTimeout(r, 0));

describe('crearEjecutorSerial', () => {
    it('nunca corre dos tareas a la vez (SYNC-12)', async () => {
        let activas = 0;
        let maximo = 0;
        const pendientes = [];
        const ejecutar = crearEjecutorSerial(async () => {
            activas++;
            maximo = Math.max(maximo, activas);
            const d = diferido();
            pendientes.push(d);
            await d.promesa;
            activas--;
            return pendientes.length;
        });

        const primera = ejecutar();
        await tic(); // la primera ya empezó
        const segunda = ejecutar();
        await tic();
        expect(pendientes).toHaveLength(1);

        pendientes[0].resolver();
        await expect(primera).resolves.toBe(1);
        await tic();
        expect(pendientes).toHaveLength(2);
        pendientes[1].resolver();
        await expect(segunda).resolves.toBe(2);
        expect(maximo).toBe(1);
    });

    it('las llamadas que llegan mientras otra espera turno se unen a ella', async () => {
        let corridas = 0;
        const bloqueo = diferido();
        const ejecutar = crearEjecutorSerial(async () => {
            corridas++;
            if (corridas === 1) await bloqueo.promesa;
            return corridas;
        });

        const a = ejecutar();
        await tic(); // a está corriendo
        const b = ejecutar();
        const c = ejecutar();
        expect(b).toBe(c);

        bloqueo.resolver();
        await Promise.all([a, b, c]);
        expect(corridas).toBe(2);
    });

    it('dos llamadas seguidas sin esperar comparten la misma corrida', async () => {
        let corridas = 0;
        const ejecutar = crearEjecutorSerial(async () => ++corridas);
        const a = ejecutar();
        const b = ejecutar();
        expect(a).toBe(b);
        await a;
        expect(corridas).toBe(1);
    });

    it('un fallo no bloquea las corridas siguientes', async () => {
        let corridas = 0;
        const ejecutar = crearEjecutorSerial(async () => {
            corridas++;
            if (corridas === 1) throw new Error('fallo de red');
            return 'ok';
        });

        await expect(ejecutar()).rejects.toThrow('fallo de red');
        await expect(ejecutar()).resolves.toBe('ok');
    });
});

describe('crearTurnoSerial', () => {
    it('un pull nunca corre mientras un push está en vuelo (datos-1)', async () => {
        const turno = crearTurnoSerial();
        const eventos = [];
        const bloqueo = diferido();

        const push = turno.ejecutar('push', async () => {
            eventos.push('push:inicio');
            await bloqueo.promesa;
            eventos.push('push:fin');
            return 'push';
        });
        await tic();
        const pull = turno.ejecutar('pull', async () => {
            eventos.push('pull');
            return 'pull';
        });
        await tic();
        expect(eventos).toEqual(['push:inicio']);

        bloqueo.resolver();
        await expect(push).resolves.toBe('push');
        await expect(pull).resolves.toBe('pull');
        expect(eventos).toEqual(['push:inicio', 'push:fin', 'pull']);
    });

    it('un pull no se une a un push en espera: cada uno devuelve su propio resultado', async () => {
        const turno = crearTurnoSerial();
        const bloqueo = diferido();
        turno.ejecutar('push', () => bloqueo.promesa);
        await tic();

        const push = turno.ejecutar('push', async () => 'push');
        const pull = turno.ejecutar('pull', async () => 'pull');
        const otroPush = turno.ejecutar('push', async () => 'otro');
        expect(pull).not.toBe(push);
        // El segundo push se une al que espera turno (va antes que el pull).
        expect(otroPush).toBe(push);

        bloqueo.resolver();
        await expect(push).resolves.toBe('push');
        await expect(pull).resolves.toBe('pull');
    });

    it('un push que llega con un pull en espera corre después de ese pull', async () => {
        const turno = crearTurnoSerial();
        const orden = [];
        const bloqueo = diferido();
        turno.ejecutar('push', () => bloqueo.promesa);
        await tic();

        const pull = turno.ejecutar('pull', async () => { orden.push('pull'); });
        const push = turno.ejecutar('push', async () => { orden.push('push'); });

        bloqueo.resolver();
        await Promise.all([pull, push]);
        expect(orden).toEqual(['pull', 'push']);
    });

    it('cancelarPendientes marca lo que está en vuelo y en espera, no lo que llega después', async () => {
        const turno = crearTurnoSerial();
        const bloqueo = diferido();
        const vistas = {};

        const enVuelo = turno.ejecutar('push', async (senal) => {
            await bloqueo.promesa;
            vistas.enVuelo = senal.cancelada();
        });
        await tic();
        const enEspera = turno.ejecutar('pull', async (senal) => { vistas.enEspera = senal.cancelada(); });

        turno.cancelarPendientes();
        const exclusiva = turno.exclusivo(async (senal) => { vistas.exclusiva = senal.cancelada(); });
        // Tras cancelar, una llamada nueva no se une a la corrida cancelada.
        const nuevoPull = turno.ejecutar('pull', async (senal) => { vistas.nuevoPull = senal.cancelada(); });
        expect(nuevoPull).not.toBe(enEspera);

        bloqueo.resolver();
        await Promise.all([enVuelo, enEspera, exclusiva, nuevoPull]);
        expect(vistas).toEqual({ enVuelo: true, enEspera: true, exclusiva: false, nuevoPull: false });
    });

    it('exclusivo espera a lo anterior y no se une a nada', async () => {
        const turno = crearTurnoSerial();
        const orden = [];
        const bloqueo = diferido();
        turno.ejecutar('push', async () => { await bloqueo.promesa; orden.push('push'); });
        await tic();
        const a = turno.exclusivo(async () => { orden.push('a'); });
        const b = turno.exclusivo(async () => { orden.push('b'); });
        expect(a).not.toBe(b);

        bloqueo.resolver();
        await Promise.all([a, b]);
        expect(orden).toEqual(['push', 'a', 'b']);
    });

    it('cuenta las salidas de la cola', () => {
        const turno = crearTurnoSerial();
        expect(turno.salidasDeCola()).toBe(0);
        turno.registrarSalidaDeCola();
        turno.registrarSalidaDeCola();
        expect(turno.salidasDeCola()).toBe(2);
    });
});

describe('conCandadoEntrePestanas', () => {
    it('usa Web Locks con el nombre dado cuando existen', async () => {
        const pedidos = [];
        const entorno = { locks: { request: (nombre, fn) => { pedidos.push(nombre); return fn(); } } };
        await expect(conCandadoEntrePestanas('sync-cola-x', async () => 7, entorno)).resolves.toBe(7);
        expect(pedidos).toEqual(['sync-cola-x']);
    });

    it('sin Web Locks corre la tarea directamente', async () => {
        await expect(conCandadoEntrePestanas('sync-cola-x', async () => 7, {})).resolves.toBe(7);
    });
});
