import { describe, it, expect } from 'vitest';
import { contenidoEnvPruebas, leerArgumentos, parsearEnv, validarProyectoDePruebas } from './entornoPruebas.js';

const KEY = 'clave-anon-ficticia-de-pruebas-000';
const KEY_PROD = 'clave-anon-ficticia-de-produccion-000';

describe('validarProyectoDePruebas', () => {
    it('acepta un proyecto distinto al de producción', () => {
        expect(validarProyectoDePruebas({
            url: 'https://pruebas123.supabase.co/', key: KEY,
            urlProduccion: 'https://real456.supabase.co', keyProduccion: KEY_PROD,
        })).toEqual([]);
    });

    it('rechaza la URL de producción aunque cambie la barra final', () => {
        const errores = validarProyectoDePruebas({
            url: 'https://real456.supabase.co/', key: KEY,
            urlProduccion: 'https://real456.supabase.co', keyProduccion: KEY_PROD,
        });
        expect(errores.join(' ')).toMatch(/PRODUCCIÓN/);
    });

    it('rechaza la key de producción', () => {
        const errores = validarProyectoDePruebas({
            url: 'https://pruebas123.supabase.co', key: KEY_PROD,
            urlProduccion: 'https://real456.supabase.co', keyProduccion: KEY_PROD,
        });
        expect(errores.join(' ')).toMatch(/anon key es la de PRODUCCIÓN/);
    });

    it('pide url y key', () => {
        expect(validarProyectoDePruebas({ url: '', key: '' })).toHaveLength(2);
        expect(validarProyectoDePruebas({ url: 'http://evil.com', key: KEY })[0]).toMatch(/no parece de Supabase/);
    });
});

describe('utilidades', () => {
    it('parsearEnv ignora comentarios y comillas', () => {
        expect(parsearEnv('# x\nVITE_A=1\nVITE_B="dos"\n\nMAL\n')).toEqual({ VITE_A: '1', VITE_B: 'dos' });
    });

    it('contenidoEnvPruebas declara development', () => {
        const texto = contenidoEnvPruebas({ url: 'https://p.supabase.co/', key: KEY });
        expect(texto).toContain('VITE_APP_ENV=development');
        expect(texto).toContain('VITE_SUPABASE_URL=https://p.supabase.co\n');
    });

    it('leerArgumentos acepta las dos formas', () => {
        expect(leerArgumentos(['--url', 'u', '--key=k', '--forzar'])).toEqual({ url: 'u', key: 'k', forzar: true });
    });
});

describe('esquema de pruebas dentro del proyecto de producción', () => {
    const prod = { urlProduccion: 'https://real456.supabase.co', keyProduccion: KEY_PROD };

    it('acepta la URL y la key de producción si se usa un esquema aparte', () => {
        expect(validarProyectoDePruebas({ url: 'https://real456.supabase.co', key: KEY_PROD, esquema: 'pruebas', ...prod })).toEqual([]);
    });

    it('rechaza el esquema public y nombres inválidos', () => {
        expect(validarProyectoDePruebas({ url: 'https://real456.supabase.co', key: KEY_PROD, esquema: 'public', ...prod }).join(' ')).toMatch(/PRODUCCIÓN/);
        expect(validarProyectoDePruebas({ url: 'https://real456.supabase.co', key: KEY_PROD, esquema: 'Pruebas;drop', ...prod }).join(' ')).toMatch(/no es un nombre de esquema/);
        expect(validarProyectoDePruebas({ url: 'https://real456.supabase.co', key: KEY_PROD, esquema: true, ...prod }).join(' ')).toMatch(/Falta el nombre/);
    });

    it('sin esquema, la URL de producción sugiere --esquema pruebas', () => {
        expect(validarProyectoDePruebas({ url: 'https://real456.supabase.co', key: KEY, ...prod }).join(' ')).toMatch(/--esquema pruebas/);
    });

    it('el archivo generado declara el esquema', () => {
        const texto = contenidoEnvPruebas({ url: 'https://real456.supabase.co', key: KEY_PROD, esquema: 'pruebas' });
        expect(texto).toContain('VITE_APP_ENV=development');
        expect(texto).toContain('VITE_SUPABASE_SCHEMA=pruebas\n');
    });
});

describe('leerArgumentos con valores sueltos', () => {
    it('guarda en _ lo que no lleva --clave (PowerShell se come el --)', () => {
        expect(leerArgumentos(['pruebas'])).toEqual({ _: ['pruebas'] });
        expect(leerArgumentos(['--forzar', 'pruebas'])).toEqual({ forzar: 'pruebas' });
    });
});
