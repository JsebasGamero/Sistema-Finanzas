import { describe, it, expect, vi } from 'vitest';
import { crearSincronizador } from './sincronizador';

describe('crearSincronizador', () => {
    it('offline: no llama a procesarCola y devuelve null', async () => {
        const procesarCola = vi.fn();
        const estaEnLinea = () => false;
        const sync = crearSincronizador({ procesarCola, estaEnLinea });

        const resultado = await sync.sincronizarAhora();

        expect(resultado).toBeNull();
        expect(procesarCola).not.toHaveBeenCalled();
    });

    it('online: llama a procesarCola y devuelve su resultado', async () => {
        const procesarCola = vi.fn().mockResolvedValue({ synced: 3, failed: 0 });
        const estaEnLinea = () => true;
        const sync = crearSincronizador({ procesarCola, estaEnLinea });

        const resultado = await sync.sincronizarAhora();

        expect(procesarCola).toHaveBeenCalledTimes(1);
        expect(resultado).toEqual({ synced: 3, failed: 0 });
    });

    it('propaga el rechazo si procesarCola falla', async () => {
        const error = new Error('fallo de red');
        const procesarCola = vi.fn().mockRejectedValue(error);
        const estaEnLinea = () => true;
        const sync = crearSincronizador({ procesarCola, estaEnLinea });

        await expect(sync.sincronizarAhora()).rejects.toThrow('fallo de red');
    });
});
