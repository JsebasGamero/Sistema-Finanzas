import { describe, it, expect } from 'vitest';
import { ACCION, clasificarRespuesta, clasificarExcepcion, esTablaInexistente } from './clasificarResultadoSync';

const err = (code, extra = {}) => ({ code, message: `error ${code}`, details: null, hint: null, ...extra });

describe('clasificarRespuesta: éxitos', () => {
    it('INSERT sin error se confirma (incluido el ON CONFLICT DO NOTHING de un reintento)', () => {
        expect(clasificarRespuesta({ operacion: 'INSERT', error: null, status: 201, data: null }).accion)
            .toBe(ACCION.CONFIRMAR);
    });

    it('UPDATE que afecta filas se confirma', () => {
        expect(clasificarRespuesta({ operacion: 'UPDATE', error: null, status: 200, data: [{ id: 'a' }] }).accion)
            .toBe(ACCION.CONFIRMAR);
    });

    it('UPDATE sin filas afectadas va a la bandeja: la fila no existe en la nube (SYNC-3)', () => {
        const r = clasificarRespuesta({ operacion: 'UPDATE', error: null, status: 200, data: [] });
        expect(r.accion).toBe(ACCION.BANDEJA);
        expect(r.tipo).toBe('no_existe');
        expect(r.mensaje).toMatch(/ya no existe/);
    });

    it('DELETE sin filas afectadas se confirma: ya estaba borrada', () => {
        expect(clasificarRespuesta({ operacion: 'DELETE', error: null, status: 200, data: [] }).accion)
            .toBe(ACCION.CONFIRMAR);
    });
});

describe('clasificarRespuesta: un 409 ya no es "ya existe" (SYNC-1)', () => {
    it('23503 (FK) con HTTP 409 va a la bandeja como referencia, nunca se confirma', () => {
        const r = clasificarRespuesta({ operacion: 'INSERT', error: err('23503'), status: 409 });
        expect(r.accion).toBe(ACCION.BANDEJA);
        expect(r.tipo).toBe('referencia');
        expect(r.codigo).toBe('23503');
    });

    it('23505 (otra UNIQUE) con HTTP 409 va a la bandeja como duplicado', () => {
        const r = clasificarRespuesta({ operacion: 'INSERT', error: err('23505'), status: 409 });
        expect(r.accion).toBe(ACCION.BANDEJA);
        expect(r.tipo).toBe('duplicado');
    });

    it('un 409 sin código conocido tampoco se confirma', () => {
        expect(clasificarRespuesta({ operacion: 'INSERT', error: err(''), status: 409 }).accion)
            .not.toBe(ACCION.CONFIRMAR);
    });
});

describe('clasificarRespuesta: errores de esquema no se descartan (SYNC-7, DEU-4)', () => {
    it.each(['42703', '42P01', 'PGRST204', 'PGRST205', '42P10'])('%s va a la bandeja con el aviso de migración', (codigo) => {
        const r = clasificarRespuesta({ operacion: 'INSERT', error: err(codigo), status: 400 });
        expect(r.accion).toBe(ACCION.BANDEJA);
        expect(r.tipo).toBe('esquema');
        expect(r.mensaje).toMatch(/Falta aplicar una migración en la base/);
    });
});

describe('clasificarRespuesta: errores de datos van a la bandeja (SYNC-8)', () => {
    it.each([
        ['23514', 'regla'],
        ['23502', 'incompleto'],
        ['22P02', 'formato'],
        ['22003', 'formato'],
        ['PGRST102', 'formato'],
    ])('%s -> %s', (codigo, tipo) => {
        const r = clasificarRespuesta({ operacion: 'INSERT', error: err(codigo), status: 400 });
        expect(r.accion).toBe(ACCION.BANDEJA);
        expect(r.tipo).toBe(tipo);
    });

    it('un 400 sin código reconocido va a la bandeja, no se borra', () => {
        const r = clasificarRespuesta({ operacion: 'UPDATE', error: { message: 'Bad Request' }, status: 400 });
        expect(r.accion).toBe(ACCION.BANDEJA);
        expect(r.tipo).toBe('rechazado');
    });
});

describe('clasificarRespuesta: fallos pasajeros detienen la corrida (SYNC-4)', () => {
    it('sin respuesta (status 0, código vacío) es red', () => {
        const r = clasificarRespuesta({ operacion: 'INSERT', error: err('', { message: 'TypeError: Failed to fetch' }), status: 0 });
        expect(r.accion).toBe(ACCION.DETENER);
        expect(r.tipo).toBe('red');
    });

    it.each([
        [err('42501'), 403],
        [err('PGRST301'), 401],
        [{ message: 'JWT expired' }, 401],
    ])('sesión vencida o sin permiso detiene (%o, %i)', (error, status) => {
        const r = clasificarRespuesta({ operacion: 'UPDATE', error, status });
        expect(r.accion).toBe(ACCION.DETENER);
        expect(r.tipo).toBe('sesion');
    });

    it.each([
        [err(''), 500],
        [err(''), 503],
        [err('57014'), 500],
        [err('40001'), 500],
        [err('PGRST001'), 503],
        [{ message: '<html>Bad gateway</html>' }, 502],
        [err(''), 429],
    ])('servidor caído o saturado detiene (%o, %i)', (error, status) => {
        expect(clasificarRespuesta({ operacion: 'INSERT', error, status }).accion).toBe(ACCION.DETENER);
    });
});

describe('clasificarExcepcion', () => {
    it('un fetch rechazado se conserva como fallo de red', () => {
        const r = clasificarExcepcion(new TypeError('Failed to fetch'));
        expect(r.accion).toBe(ACCION.DETENER);
        expect(r.tipo).toBe('red');
    });

    it('cualquier otra excepción también conserva la operación', () => {
        expect(clasificarExcepcion(new Error('algo raro')).accion).toBe(ACCION.DETENER);
    });
});

describe('esTablaInexistente', () => {
    it('reconoce 42P01 y PGRST205', () => {
        expect(esTablaInexistente({ code: '42P01' })).toBe(true);
        expect(esTablaInexistente({ code: 'PGRST205' })).toBe(true);
    });

    it('un timeout o un 401 no son "tabla inexistente" (SYNC-11)', () => {
        expect(esTablaInexistente({ code: '', status: 0 })).toBe(false);
        expect(esTablaInexistente({ code: 'PGRST301', status: 401 })).toBe(false);
        expect(esTablaInexistente(null)).toBe(false);
    });
});

describe('clasificarRespuesta: esquema de pruebas no habilitado', () => {
    it('PGRST106 detiene la corrida y conserva todo en la cola (no llena la bandeja)', () => {
        const r = clasificarRespuesta({
            operacion: 'INSERT',
            error: { code: 'PGRST106', message: 'The schema must be one of the following: public' },
            status: 406,
        });
        expect(r.accion).toBe(ACCION.DETENER);
        expect(r.tipo).toBe('esquema_no_expuesto');
        expect(r.mensaje).toMatch(/Exposed schemas/);
    });
});
