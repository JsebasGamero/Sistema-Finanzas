import { describe, it, expect } from 'vitest';
import { CONJUNTOS, conjuntoPorId, diasEntre, prepararIndices, TIPOS_COLUMNA } from './conjuntos';
import { datosDeEjemplo } from './datosDeEjemplo';

const datos = datosDeEjemplo();
const filasDe = (id, opciones) => conjuntoPorId(id).construirFilas(datos, datos, opciones);
const porId = (filas) => Object.fromEntries(filas.map((f) => [f.id, f]));

describe('definición de los conjuntos', () => {
    it('cada conjunto tiene id único, columnas con tipo válido y campos únicos', () => {
        const ids = new Set();
        for (const conjunto of CONJUNTOS) {
            expect(ids.has(conjunto.id)).toBe(false);
            ids.add(conjunto.id);
            const campos = new Set();
            for (const columna of conjunto.columnas) {
                expect(TIPOS_COLUMNA).toContain(columna.tipo);
                expect(campos.has(columna.campo)).toBe(false);
                campos.add(columna.campo);
            }
            if (conjunto.campoFecha) expect(campos.has(conjunto.campoFecha)).toBe(true);
            for (const campo of conjunto.camposSeleccion) expect(campos.has(campo)).toBe(true);
        }
    });

    it('cada fila trae todas las columnas de su conjunto y un id de texto', () => {
        for (const conjunto of CONJUNTOS) {
            const filas = conjunto.construirFilas(datos, datos);
            expect(filas.length).toBeGreaterThan(0);
            for (const fila of filas) {
                expect(typeof fila.id).toBe('string');
                for (const columna of conjunto.columnas) expect(fila).toHaveProperty(columna.campo);
            }
        }
    });

    it('un id desconocido cae en movimientos', () => {
        expect(conjuntoPorId('no-existe').id).toBe('movimientos');
    });

    it('no revienta con datos vacíos', () => {
        for (const conjunto of CONJUNTOS) expect(conjunto.construirFilas({}, {})).toEqual([]);
    });
});

describe('movimientos', () => {
    const filas = porId(filasDe('movimientos'));

    it('convierte montos guardados como string antes de sumar', () => {
        expect(filas.m2.monto).toBe(1200000);
        expect(filas.m2.egreso).toBe(1200000);
        expect(filas.m2.neto).toBe(-1200000);
    });

    it('ingreso y egreso quedan vacíos (no en 0) donde no aplican', () => {
        expect(filas.m2.ingreso).toBeNull();
        expect(filas.m1.egreso).toBeNull();
        expect(filas.m1.neto).toBe(3000000);
    });

    it('las transferencias no son ingreso ni egreso (todo vacío)', () => {
        expect(filas.m4.ingreso).toBeNull();
        expect(filas.m4.egreso).toBeNull();
        expect(filas.m4.neto).toBeNull();
        expect(filas.m4.caja).toBe('Bancolombia');
        expect(filas.m4.caja_destino).toBe('Caja menor');
    });

    it('resuelve la categoría guardada como UUID viejo y nunca pinta el crudo', () => {
        expect(filas.m3.categoria).toBe('Nómina');
        expect(filas.m7.categoria).toBe('Sin categoría');
    });

    it('resuelve nombres, empresa, tipo de tercero y usuario', () => {
        expect(filas.m2.obra).toBe('Edificio Norte');
        expect(filas.m2.proveedor).toBe('Ferretería El Clavo');
        expect(filas.m2.tipo_tercero).toBe('Proveedor');
        expect(filas.m2.empresa).toBe('Constructora Uno');
        expect(filas.m7.empresa).toBe('Inversiones Dos');
        expect(filas.m3.usuario).toBe('Luis');
        expect(filas.m1.tipo).toBe('Ingreso');
    });

    it('marca deudas, sincronización y soporte sin exponer la URL como columna', () => {
        expect(filas.m5.es_deuda).toBe(true);
        expect(filas.m6.es_deuda).toBe(true);
        expect(filas.m4.es_deuda).toBe(false);
        expect(filas.m3.sincronizado).toBe('Pendiente');
        expect(filas.m1.sincronizado).toBe('Sí');
        expect(filas.m2.soporte).toBe(true);
        expect(filas.m2._soporteUrl).toBe('https://ejemplo/soporte.jpg');
        const campos = conjuntoPorId('movimientos').columnas.map((c) => c.campo);
        expect(campos).not.toContain('_soporteUrl');
    });

    it('deja la fecha como clave de calendario', () => {
        expect(filas.m3.fecha).toBe('2026-03-31');
    });
});

describe('cajas', () => {
    const filas = porId(filasDe('cajas'));

    it('suma ingresos, egresos y transferencias de cada caja', () => {
        expect(filas.c2).toMatchObject({
            saldo_actual: 2000000,
            ingresos: 3000000,
            egresos: 1500000,
            transferencias_salida: 700000,
            transferencias_entrada: 0,
            movimientos: 5,
            ultimo_movimiento: '2026-04-15',
            saldo_movimientos: 800000,
            diferencia: 1200000,
        });
        expect(filas.c1).toMatchObject({ egresos: 800000, transferencias_entrada: 500000, movimientos: 2, saldo_movimientos: -300000 });
        expect(filas.c3.empresa).toBe('Inversiones Dos');
    });
});

describe('obras', () => {
    const filas = porId(filasDe('obras'));

    it('cruza presupuesto con lo gastado (abonos incluidos: es plata que salió)', () => {
        expect(filas.p1).toMatchObject({
            presupuesto: 10000000,
            gastado: 2300000,
            ingresos: 3000000,
            disponible: 7700000,
            movimientos: 4,
            por_pagar: 700000,
            fecha_inicio: '2026-01-15',
        });
        expect(filas.p1.ejecucion).toBeCloseTo(0.23);
    });

    it('sin presupuesto no hay porcentaje de ejecución ni disponible', () => {
        expect(filas.p2.ejecucion).toBeNull();
        expect(filas.p2.disponible).toBeNull();
        expect(filas.p2.gastado).toBe(0);
    });
});

describe('proveedores', () => {
    const filas = porId(filasDe('proveedores'));

    it('cuenta cada peso pagado una sola vez y separa abonos de pagos directos', () => {
        expect(filas.t1).toMatchObject({
            total_pagado: 1500000,
            abonos_deuda: 300000,
            pagos_directos: 1200000,
            deuda_original: 1500000,
            deuda_pendiente: 700000,
            deudas_abiertas: 1,
            compras: 2700000,
            ultimo_pago: '2026-04-10',
            movimientos: 2,
        });
        expect(filas.t2.total_pagado).toBe(800000);
        expect(filas.t2.deudas_abiertas).toBe(0);
    });
});

describe('deudas', () => {
    it('deudas a proveedores: abonado, avance, estado por montos y antigüedad', () => {
        const filas = porId(filasDe('deudas_terceros', { hoy: '2026-05-10' }));
        expect(filas.d1).toMatchObject({
            proveedor: 'Ferretería El Clavo',
            obra: 'Edificio Norte',
            empresa: 'Constructora Uno',
            fecha: '2026-03-10',
            monto_original: 1000000,
            abonado: 300000,
            monto_pendiente: 700000,
            estado: 'Parcial',
            antiguedad_dias: 61,
            abonos: 1,
            ultimo_abono: '2026-04-10',
            usuario: 'Ana',
        });
        expect(filas.d1.avance).toBeCloseTo(0.3);
        expect(filas.d2.estado).toBe('Pagada');
        expect(filas.d2.antiguedad_dias).toBeNull();
    });

    it('préstamos entre cajas: concepto, cajas y estado', () => {
        const filas = porId(filasDe('prestamos_cajas', { hoy: '2026-05-10' }));
        expect(filas.dc1).toMatchObject({
            caja_deudora: 'Tarjeta',
            caja_acreedora: 'Bancolombia',
            descripcion: 'Préstamo para combustible',
            estado: 'Pendiente',
            abonado: 0,
            antiguedad_dias: 25,
        });
    });
});

describe('empresa de un movimiento: primero la obra, después la caja', () => {
    // En datosDeEjemplo la obra y la caja de cada movimiento son de la misma
    // empresa, así que cualquier regla pasaba. Aquí la obra p2 es de e2 y el
    // egreso se paga desde c1, que es de e1: el gasto es de e2, como en el
    // tablero Resumen (docs/REPORTES.md).
    const cruzados = {
        ...datos,
        transacciones: [
            { id: 'x1', fecha: '2026-05-01', tipo_movimiento: 'EGRESO', monto: 500, categoria: 'Materiales', proyecto_id: 'p2', caja_origen_id: 'c1' },
            { id: 'x2', fecha: '2026-05-02', tipo_movimiento: 'INGRESO', monto: 200, categoria: 'Anticipo', caja_origen_id: 'c3' },
        ],
    };

    it('movimientos: la columna Empresa es la de la obra; sin obra, la de la caja', () => {
        const filas = porId(conjuntoPorId('movimientos').construirFilas(cruzados, cruzados));
        expect(filas.x1.empresa).toBe('Inversiones Dos');
        expect(filas.x2.empresa).toBe('Inversiones Dos');
    });

    it('empresas: el egreso se le suma a la empresa de la obra, no a la de la caja', () => {
        const filas = porId(conjuntoPorId('empresas').construirFilas(cruzados, cruzados));
        expect(filas.e1).toMatchObject({ ingresos: 0, egresos: 0 });
        expect(filas.e2).toMatchObject({ ingresos: 200, egresos: 500 });
    });
});

describe('empresas y categorías', () => {
    it('empresas: cajas, saldo y obras', () => {
        const filas = porId(filasDe('empresas'));
        expect(filas.e1).toMatchObject({ cajas: 2, saldo_total: 2500000, obras: 1, obras_activas: 1, ingresos: 3000000, egresos: 2300000 });
        expect(filas.e2).toMatchObject({ cajas: 1, saldo_total: -150000, obras: 1, egresos: 100000 });
    });

    it('categorías: las de la tabla más las que solo aparecen en movimientos', () => {
        const filas = filasDe('categorias');
        const porNombre = Object.fromEntries(filas.map((f) => [f.nombre, f]));
        expect(porNombre.Materiales.egresos).toBe(1200000);
        expect(porNombre['Nómina'].egresos).toBe(800000);
        expect(porNombre.Anticipo).toMatchObject({ ingresos: 3000000, tipo: 'Ingreso' });
        expect(porNombre['Pago Deuda'].egresos).toBe(300000);
        expect(porNombre['Sin categoría'].egresos).toBe(100000);
        expect(filas).toHaveLength(7);
    });
});

describe('utilidades', () => {
    it('diasEntre cuenta días de calendario', () => {
        expect(diasEntre('2026-03-10', '2026-05-10')).toBe(61);
        expect(diasEntre('2026-12-31', '2027-01-01')).toBe(1);
        expect(diasEntre(null, '2026-01-01')).toBeNull();
    });

    it('prepararIndices usa los índices del hook si vienen', () => {
        const idx = prepararIndices(datos, { nombreCaja: () => 'del hook' });
        expect(idx.nombreCaja('c1')).toBe('del hook');
        expect(idx.nombreProyecto('p1')).toBe('Edificio Norte');
    });
});
