import { describe, it, expect, vi } from 'vitest';
import { descargarTodo } from './descargaPaginada';

// Doble de una tabla de Supabase: filas ordenadas por id y un max-rows que
// recorta cada respuesta como hace PostgREST (sin error ni aviso).
function crearTablaRemota(cantidad, { maxRows = 1000 } = {}) {
    const filas = Array.from({ length: cantidad }, (_, i) => ({ id: String(i).padStart(6, '0'), monto: i + 1 }));
    const consultar = vi.fn(async (desde, hasta, conConteo) => {
        const limite = Math.min(hasta, desde + maxRows - 1);
        return {
            data: filas.slice(desde, limite + 1),
            error: null,
            count: conConteo ? filas.length : null,
            status: 200,
        };
    });
    return { filas, consultar };
}

describe('descargarTodo', () => {
    it('trae más de 1000 filas paginando (REP-1)', async () => {
        const { consultar } = crearTablaRemota(2350);
        const filas = await descargarTodo(consultar);
        expect(filas).toHaveLength(2350);
        expect(consultar).toHaveBeenCalledTimes(3);
        expect(consultar.mock.calls.map((c) => c[0])).toEqual([0, 1000, 2000]);
    });

    it('no se corta antes de tiempo si el max-rows del proyecto es menor que la página', async () => {
        const { consultar } = crearTablaRemota(1250, { maxRows: 500 });
        const filas = await descargarTodo(consultar, { tamanoPagina: 1000 });
        expect(filas).toHaveLength(1250);
        expect(consultar.mock.calls.map((c) => c[0])).toEqual([0, 500, 1000]);
    });

    it('pide el conteo exacto solo en la primera página', async () => {
        const { consultar } = crearTablaRemota(1500);
        await descargarTodo(consultar);
        expect(consultar.mock.calls.map((c) => c[2])).toEqual([true, false]);
    });

    it('tabla vacía: una sola consulta y arreglo vacío', async () => {
        const { consultar } = crearTablaRemota(0);
        await expect(descargarTodo(consultar)).resolves.toEqual([]);
        expect(consultar).toHaveBeenCalledTimes(1);
    });

    it('si una página falla, lanza (el pull no debe tocar la base local)', async () => {
        const { filas } = crearTablaRemota(2500);
        const consultar = vi.fn()
            .mockResolvedValueOnce({ data: filas.slice(0, 1000), error: null, count: 2500, status: 200 })
            .mockResolvedValueOnce({ data: null, error: { code: '', message: 'TypeError: Failed to fetch' }, status: 0 });
        await expect(descargarTodo(consultar)).rejects.toThrow(/Failed to fetch/);
    });

    it('si el servidor devuelve una página vacía antes de completar el total, lanza', async () => {
        const consultar = vi.fn().mockResolvedValueOnce({ data: [], error: null, count: 2500 });
        await expect(descargarTodo(consultar)).rejects.toThrow(/incompleta/);
    });

    it('propaga el código del error de la página que falló', async () => {
        const consultar = vi.fn()
            .mockResolvedValueOnce({ data: [{ id: 'a' }], error: null, count: 3 })
            .mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 });
        const error = await descargarTodo(consultar, { tamanoPagina: 1 }).catch((e) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error.code).toBe('PGRST301');
        expect(error.status).toBe(401);
    });

    it('si no llega el total, lanza en vez de adivinar', async () => {
        const consultar = vi.fn().mockResolvedValue({ data: [{ id: 'a' }], error: null, count: null });
        await expect(descargarTodo(consultar)).rejects.toThrow(/total/);
    });

    it('una fila repetida entre páginas (inserción concurrente) no se duplica', async () => {
        const consultar = vi.fn()
            .mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }], error: null, count: 3 })
            .mockResolvedValueOnce({ data: [{ id: 'b' }, { id: 'c' }], error: null });
        const filas = await descargarTodo(consultar, { tamanoPagina: 2 });
        expect(filas.map((f) => f.id)).toEqual(['a', 'b', 'c']);
    });

    it('si faltan filas al final (borrado concurrente que desplaza páginas), lanza', async () => {
        const consultar = vi.fn()
            .mockResolvedValueOnce({ data: [{ id: 'a' }, { id: 'b' }], error: null, count: 4 })
            .mockResolvedValueOnce({ data: [{ id: 'd' }], error: null })
            .mockResolvedValueOnce({ data: [], error: null });
        await expect(descargarTodo(consultar, { tamanoPagina: 2 })).rejects.toThrow(/3 de 4/);
    });
});
