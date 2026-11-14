import { describe, it, expect } from 'vitest';
import { conjuntoPorId } from './conjuntos';
import {
    construirResumen, normalizarConfigResumen, configResumenPorDefecto, CAMPO_CONTEO, CLAVE_OTROS,
    tipoDeValorResumen, etiquetaDeValor,
} from './resumen';
import { datosDeEjemplo } from './datosDeEjemplo';

const movimientos = conjuntoPorId('movimientos');
const datos = datosDeEjemplo();
const filas = movimientos.construirFilas(datos, datos);

const base = { columnas: null, valor: { campo: 'monto', agregacion: 'suma' }, mostrarComo: 'valor', orden: 'valor_desc', top: null };
const resumir = (config) => construirResumen(filas, { ...base, ...config }, movimientos);
const porEtiqueta = (resumen) => Object.fromEntries(resumen.filas.map((f) => [f.etiquetas.join(' / '), f]));

describe('una dimensión de fila', () => {
    const r = resumir({ filas: ['categoria'] });

    it('suma por grupo y ordena de mayor a menor', () => {
        expect(r.filas.map((f) => [f.etiquetas[0], f.total])).toEqual([
            ['Anticipo', 3000000],
            ['Materiales', 1200000],
            ['Nómina', 800000],
            ['Traslado', 500000],
            ['Pago Deuda', 300000],
            ['Préstamo entre Cajas', 200000],
            ['Sin categoría', 100000],
        ]);
        expect(r.granTotal).toBe(6100000);
        expect(r.columnas).toEqual([]);
        expect(r.filas.every((f) => f.nivel === 0 && !f.esSubtotal)).toBe(true);
        expect(r.registros).toBe(7);
        expect(r.tipoValor).toBe('dinero');
    });

    it('orden ascendente y por nombre', () => {
        expect(resumir({ filas: ['categoria'], orden: 'valor_asc' }).filas[0].etiquetas[0]).toBe('Sin categoría');
        expect(resumir({ filas: ['categoria'], orden: 'etiqueta' }).filas.map((f) => f.etiquetas[0]).slice(0, 3))
            .toEqual(['Anticipo', 'Materiales', 'Nómina']);
    });

    it('% del total', () => {
        const pct = resumir({ filas: ['categoria'], mostrarComo: 'pct_total' });
        expect(pct.filas[0].total).toBeCloseTo(3000000 / 6100000);
        expect(pct.granTotal).toBe(1);
        expect(pct.tipoValor).toBe('porcentaje');
    });
});

describe('columnas', () => {
    it('no cronológicas: de mayor a menor total', () => {
        const r = resumir({ filas: ['caja'], columnas: 'tipo' });
        expect(r.columnas.map((c) => c.clave)).toEqual(['Ingreso', 'Egreso', 'Transferencia']);
        const banco = porEtiqueta(r).Bancolombia;
        expect(banco.valores).toEqual({ Ingreso: 3000000, Egreso: 1500000, Transferencia: 700000 });
        expect(banco.total).toBe(5200000);
        expect(r.totalesColumna).toEqual({ Ingreso: 3000000, Egreso: 2400000, Transferencia: 700000 });
        // Una celda sin datos queda vacía, no en 0.
        expect(porEtiqueta(r)['Caja menor'].valores).not.toHaveProperty('Ingreso');
    });

    it('de fecha: en orden cronológico con rótulo del mes correcto', () => {
        const r = resumir({ filas: ['tipo'], columnas: 'fecha:mes', orden: 'etiqueta' });
        expect(r.columnas).toEqual([
            { clave: '2026-03', etiqueta: 'mar 2026' },
            { clave: '2026-04', etiqueta: 'abr 2026' },
        ]);
        expect(porEtiqueta(r).Egreso.valores).toEqual({ '2026-03': 2000000, '2026-04': 400000 });
    });

    it('% de la fila y % de la columna', () => {
        const fila = resumir({ filas: ['caja'], columnas: 'tipo', mostrarComo: 'pct_fila' });
        const banco = porEtiqueta(fila).Bancolombia;
        expect(banco.valores.Ingreso).toBeCloseTo(3000000 / 5200000);
        expect(banco.total).toBe(1);
        const columna = resumir({ filas: ['caja'], columnas: 'tipo', mostrarComo: 'pct_columna' });
        expect(porEtiqueta(columna).Bancolombia.valores.Egreso).toBeCloseTo(1500000 / 2400000);
        expect(columna.totalesColumna.Egreso).toBe(1);
    });
});

describe('dos dimensiones de fila', () => {
    const r = resumir({ filas: ['caja', 'tipo'] });

    it('fila de subtotal por grupo seguida de sus subgrupos', () => {
        const primera = r.filas[0];
        expect(primera).toMatchObject({ nivel: 0, esSubtotal: true, etiquetas: ['Bancolombia'], total: 5200000 });
        const hijos = [];
        for (const f of r.filas.slice(1)) {
            if (f.nivel === 0) break;
            hijos.push(f);
        }
        expect(hijos.map((h) => [h.etiquetas[1], h.total])).toEqual([
            ['Ingreso', 3000000],
            ['Egreso', 1500000],
            ['Transferencia', 700000],
        ]);
        expect(hijos.every((h) => h.claves[0] === 'Bancolombia' && !h.esSubtotal)).toBe(true);
    });

    it('los ids no se repiten', () => {
        const ids = r.filas.map((f) => f.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

describe('top N', () => {
    it('junta el resto en "Otros" y lo deja al final', () => {
        const r = resumir({ filas: ['categoria'], top: 2 });
        expect(r.filas.map((f) => [f.etiquetas[0], f.total])).toEqual([
            ['Anticipo', 3000000],
            ['Materiales', 1200000],
            ['Otros', 1900000],
        ]);
        expect(r.filas[2].claves[0]).toBe(CLAVE_OTROS);
        expect(r.granTotal).toBe(6100000);
    });

    it('el promedio de "Otros" sale de los datos crudos, no de promediar promedios', () => {
        const r = resumir({ filas: ['categoria'], top: 2, valor: { campo: 'monto', agregacion: 'promedio' } });
        const otros = r.filas.find((f) => f.claves[0] === CLAVE_OTROS);
        expect(otros.total).toBe((800000 + 500000 + 300000 + 200000 + 100000) / 5);
    });

    it('si hay menos grupos que N, no aparece "Otros"', () => {
        const r = resumir({ filas: ['tipo'], top: 10 });
        expect(r.filas.some((f) => f.claves[0] === CLAVE_OTROS)).toBe(false);
    });
});

describe('agregaciones', () => {
    it('cantidad de registros', () => {
        const r = resumir({ filas: ['usuario'], valor: { campo: CAMPO_CONTEO, agregacion: 'suma' } });
        expect(porEtiqueta(r).Ana.total).toBe(4);
        expect(porEtiqueta(r).Luis.total).toBe(3);
        expect(r.tipoValor).toBe('numero');
        expect(r.config.valor.agregacion).toBe('conteo');
    });

    it('promedio, mínimo y máximo por grupo', () => {
        const promedio = resumir({ filas: ['tipo'], valor: { campo: 'monto', agregacion: 'promedio' } });
        expect(porEtiqueta(promedio).Egreso.total).toBe(600000);
        const minimo = resumir({ filas: ['tipo'], valor: { campo: 'monto', agregacion: 'minimo' } });
        expect(porEtiqueta(minimo).Egreso.total).toBe(100000);
        const maximo = resumir({ filas: ['tipo'], valor: { campo: 'monto', agregacion: 'maximo' } });
        expect(porEtiqueta(maximo).Egreso.total).toBe(1200000);
        expect(maximo.granTotal).toBe(3000000);
    });

    it('promedio, mínimo y conteo de egreso no cuentan los ingresos ni las transferencias', () => {
        // Antes las filas traían egreso: 0 en ingresos y transferencias, y el
        // promedio y el mínimo de egreso bajaban con esos ceros.
        const promedio = resumir({ filas: ['obra'], valor: { campo: 'egreso', agregacion: 'promedio' } });
        // Edificio Norte: egresos 1.200.000, 800.000 y 300.000 más un ingreso.
        expect(porEtiqueta(promedio)['Edificio Norte'].total).toBe((1200000 + 800000 + 300000) / 3);
        const minimo = resumir({ filas: ['obra'], valor: { campo: 'egreso', agregacion: 'minimo' } });
        expect(porEtiqueta(minimo)['Edificio Norte'].total).toBe(300000);
        const conteo = resumir({ filas: ['obra'], valor: { campo: 'egreso', agregacion: 'conteo' } });
        expect(porEtiqueta(conteo)['Edificio Norte'].total).toBe(3);
        // La suma no cambia: el total de egresos sigue cuadrando.
        expect(resumir({ filas: ['tipo'], valor: { campo: 'egreso', agregacion: 'suma' } }).granTotal).toBe(2400000);
        const neto = resumir({ filas: ['tipo'], valor: { campo: 'neto', agregacion: 'promedio' } });
        expect(porEtiqueta(neto).Transferencia.total).toBeNull();
    });

    it('valores distintos', () => {
        const r = resumir({ filas: ['obra'], valor: { campo: 'proveedor', agregacion: 'distintos' } });
        expect(porEtiqueta(r)['Edificio Norte'].total).toBe(2);
    });

    it('los porcentajes no aplican a agregaciones que no se suman', () => {
        const r = resumir({ filas: ['tipo'], valor: { campo: 'monto', agregacion: 'promedio' }, mostrarComo: 'pct_total' });
        expect(r.config.mostrarComo).toBe('valor');
    });
});

describe('normalizarConfigResumen', () => {
    it('reemplaza lo inválido sin lanzar', () => {
        const config = normalizarConfigResumen({
            filas: ['no-existe', 'obra', 'obra', 'caja', 'tipo'],
            columnas: 'obra',
            valor: { campo: 'descripcion', agregacion: 'suma' },
            mostrarComo: 'raro',
            orden: 'x',
            top: -3,
        }, movimientos);
        expect(config.filas).toEqual(['obra', 'caja']);
        expect(config.columnas).toBeNull();
        expect(config.valor).toEqual({ campo: 'monto', agregacion: 'suma' });
        expect(config.mostrarComo).toBe('valor');
        expect(config.orden).toBe('valor_desc');
        expect(config.top).toBeNull();
    });

    it('al salir de "valores distintos" con un campo de texto cambia el campo pero respeta el cálculo', () => {
        const config = normalizarConfigResumen({ filas: ['tipo'], valor: { campo: 'proveedor', agregacion: 'promedio' } }, movimientos);
        expect(config.valor).toEqual({ campo: 'monto', agregacion: 'promedio' });
        const distintos = normalizarConfigResumen({ filas: ['tipo'], valor: { campo: 'proveedor', agregacion: 'distintos' } }, movimientos);
        expect(distintos.valor).toEqual({ campo: 'proveedor', agregacion: 'distintos' });
    });

    it('acepta basura total', () => {
        expect(() => normalizarConfigResumen('basura', movimientos)).not.toThrow();
        expect(normalizarConfigResumen(null, movimientos).filas.length).toBe(1);
    });

    it('sin columnas, "% de la fila" pasa a "% del total"', () => {
        expect(normalizarConfigResumen({ filas: ['tipo'], columnas: null, mostrarComo: 'pct_fila' }, movimientos).mostrarComo)
            .toBe('pct_total');
    });

    it('cada conjunto tiene un resumen por defecto válido', () => {
        for (const id of ['movimientos', 'cajas', 'obras', 'proveedores', 'deudas_terceros', 'prestamos_cajas', 'empresas', 'categorias']) {
            const conjunto = conjuntoPorId(id);
            const config = configResumenPorDefecto(conjunto);
            expect(config.filas.length).toBeGreaterThan(0);
            expect(config.valor.campo).toBe(conjunto.resumenPorDefecto.valor.campo);
        }
    });

    it('rótulos y tipo del valor', () => {
        const config = normalizarConfigResumen({ filas: ['tipo'], valor: { campo: 'monto', agregacion: 'promedio' } }, movimientos);
        expect(etiquetaDeValor(config, movimientos)).toBe('Promedio de monto');
        expect(tipoDeValorResumen(config, movimientos)).toBe('dinero');
    });
});

describe('sin filas', () => {
    it('devuelve una estructura vacía usable', () => {
        const r = construirResumen([], { filas: ['tipo'], columnas: 'fecha:mes' }, movimientos);
        expect(r.filas).toEqual([]);
        expect(r.columnas).toEqual([]);
        expect(r.granTotal).toBeNull();
    });
});
