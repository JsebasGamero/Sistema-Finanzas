import { describe, it, expect } from 'vitest';
import {
    generarDatosDePrueba,
    crearAleatorio,
    digitoVerificacionNit,
    minimosDeSaldo,
    ordenarCronologicamente,
    CATEGORIA_SALDO_INICIAL,
    USUARIO_DATOS_DE_PRUEBA,
} from './generarDatosDePrueba';
import { validarMovimiento } from '../../domain/rules/validarMovimiento';
import { efectoEnSaldos } from '../../domain/rules/efectoEnSaldos';
import { esMovimientoDeDeuda, tipoDeMovimientoDeDeuda } from '../../domain/rules/movimientoDeDeuda';
import { estadoDeuda, restarMontos, esCero } from '../../domain/value-objects/dinero';
import { enRango, sumarDias } from '../../domain/value-objects/fecha';
import { esUUID, CATEGORIAS_POR_DEFECTO } from '../../services/categorias';

// Valores permitidos por los CHECK de supabase_setup.sql (invariante 3).
const CHECK = {
    proyectoEstado: ['Activo', 'Pausado', 'Finalizado'],
    cajaTipo: ['Efectivo', 'Banco', 'Tarjeta'],
    terceroTipo: ['Proveedor', 'Empleado', 'Contratista'],
    categoriaTipo: ['INGRESO', 'EGRESO', 'AMBOS'],
    tipoMovimiento: ['INGRESO', 'EGRESO', 'TRANSFERENCIA'],
    estadoDeuda: ['PENDIENTE', 'PARCIAL', 'PAGADA'],
};

const HOY = '2026-11-13';
const generar = (opciones = {}) => generarDatosDePrueba({ hoy: HOY, semilla: 42, ...opciones });

describe('crearAleatorio', () => {
    it('es determinista y separa semillas vecinas', () => {
        const a = crearAleatorio(1000);
        const b = crearAleatorio(1000);
        const c = crearAleatorio(1001);
        const serieA = Array.from({ length: 5 }, a.numero);
        expect(Array.from({ length: 5 }, b.numero)).toEqual(serieA);
        // Con mulberry32 sin mezclar, la semilla 1001 es la 1000 corrida un
        // paso: compartirían casi toda la serie (y los ids).
        const serieC = Array.from({ length: 6 }, c.numero);
        expect(serieC.slice(0, 5)).not.toEqual(serieA);
        expect(serieC.slice(1)).not.toEqual(serieA.slice(0, 5));
    });

    it('acepta semillas de texto', () => {
        expect(crearAleatorio('obra').numero()).toBe(crearAleatorio('obra').numero());
        expect(crearAleatorio('obra').numero()).not.toBe(crearAleatorio('obras').numero());
    });

    it('genera UUID v4 válidos', () => {
        const rng = crearAleatorio(7);
        for (let i = 0; i < 50; i++) {
            expect(rng.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        }
    });
});

describe('digitoVerificacionNit', () => {
    it('calcula el DV de la DIAN', () => {
        expect(digitoVerificacionNit('800197268')).toBe(4); // NIT de ejemplo publicado por la DIAN
        expect(digitoVerificacionNit('900123456')).toBe(8);
    });
});

describe('generarDatosDePrueba', () => {
    it('exige hoy como fecha YYYY-MM-DD', () => {
        expect(() => generarDatosDePrueba({})).toThrow(/hoy/);
        expect(() => generarDatosDePrueba({ hoy: '2026-02-30' })).toThrow(/hoy/);
    });

    describe('determinismo', () => {
        it('misma semilla y mismo hoy: exactamente el mismo resultado', () => {
            expect(generar()).toEqual(generar());
        });

        it('otra semilla: otros datos', () => {
            const a = generar();
            const b = generar({ semilla: 43 });
            expect(b.transacciones.map((t) => t.monto)).not.toEqual(a.transacciones.map((t) => t.monto));
            expect(b.empresas[0].id).not.toBe(a.empresas[0].id);
        });

        it('con generarId inyectado, el contenido no cambia; solo los ids', () => {
            let n = 0;
            const conIds = generar({ generarId: () => `id-${++n}` });
            const sinIds = generar();
            const contenido = (filas) => filas.map((t) => [t.fecha, t.monto, t.tipo_movimiento, t.categoria, t.descripcion]);
            expect(contenido(conIds.transacciones)).toEqual(contenido(sinIds.transacciones));
            expect(conIds.empresas[0].id).toBe('id-1');
        });
    });

    describe('cantidades', () => {
        it('2 empresas, 6 cajas, 4 obras, 12 terceros y las categorías por defecto', () => {
            const d = generar();
            expect(d.empresas).toHaveLength(2);
            expect(d.cajas).toHaveLength(6);
            expect(d.proyectos).toHaveLength(4);
            expect(d.terceros).toHaveLength(12);
            const nombres = d.categorias.map((c) => c.nombre);
            for (const nombre of CATEGORIAS_POR_DEFECTO) expect(nombres).toContain(nombre);
        });

        it('meses x movimientosPorMes movimientos normales, ~70/20/10', () => {
            const d = generar({ meses: 6, movimientosPorMes: 40 });
            const normales = d.transacciones.filter((t) => !esMovimientoDeDeuda(t) && t.categoria !== CATEGORIA_SALDO_INICIAL);
            expect(normales).toHaveLength(240);
            const porTipo = (tipo) => normales.filter((t) => t.tipo_movimiento === tipo).length / normales.length;
            expect(porTipo('EGRESO')).toBeCloseTo(0.7, 1);
            expect(porTipo('INGRESO')).toBeCloseTo(0.2, 1);
            expect(porTipo('TRANSFERENCIA')).toBeCloseTo(0.1, 1);
        });

        it('un saldo inicial por caja', () => {
            const d = generar();
            const aperturas = d.transacciones.filter((t) => t.categoria === CATEGORIA_SALDO_INICIAL);
            expect(aperturas.map((t) => t.caja_origen_id).sort()).toEqual(d.cajas.map((c) => c.id).sort());
            expect(aperturas.every((t) => t.tipo_movimiento === 'INGRESO')).toBe(true);
        });

        it('funciona con un solo mes y sin movimientos normales', () => {
            const d = generarDatosDePrueba({ hoy: '2026-03-01', meses: 1, movimientosPorMes: 0, semilla: 3 });
            expect(d.transacciones.every((t) => t.fecha <= '2026-03-01')).toBe(true);
            expect(d.deudasTerceros.length).toBeGreaterThan(0);
        });
    });

    describe('CHECK de supabase_setup.sql (invariante 3)', () => {
        const d = generar();

        it('valores de estado y tipo permitidos', () => {
            expect(d.proyectos.every((p) => CHECK.proyectoEstado.includes(p.estado))).toBe(true);
            expect(new Set(d.proyectos.map((p) => p.estado))).toEqual(new Set(CHECK.proyectoEstado));
            expect(d.cajas.every((c) => CHECK.cajaTipo.includes(c.tipo))).toBe(true);
            expect(new Set(d.cajas.map((c) => c.tipo))).toEqual(new Set(CHECK.cajaTipo));
            expect(d.terceros.every((t) => CHECK.terceroTipo.includes(t.tipo))).toBe(true);
            expect(new Set(d.terceros.map((t) => t.tipo))).toEqual(new Set(CHECK.terceroTipo));
            expect(d.categorias.every((c) => CHECK.categoriaTipo.includes(c.tipo))).toBe(true);
            expect(d.transacciones.every((t) => CHECK.tipoMovimiento.includes(t.tipo_movimiento))).toBe(true);
            for (const deuda of [...d.deudasTerceros, ...d.deudasCajas]) {
                expect(CHECK.estadoDeuda).toContain(deuda.estado);
            }
        });

        it('montos > 0 y redondeados a miles', () => {
            for (const t of d.transacciones) {
                expect(t.monto).toBeGreaterThan(0);
                expect(t.monto % 1000).toBe(0);
            }
            for (const deuda of [...d.deudasTerceros, ...d.deudasCajas]) {
                expect(deuda.monto_original).toBeGreaterThan(0);
                expect(deuda.monto_original % 1000).toBe(0);
            }
        });

        it('UNIQUE: NIT de empresas y nombre de categorías', () => {
            expect(new Set(d.empresas.map((e) => e.nit)).size).toBe(d.empresas.length);
            expect(new Set(d.categorias.map((c) => c.nombre)).size).toBe(d.categorias.length);
            for (const e of d.empresas) {
                const [base, dv] = e.nit.split('-');
                expect(Number(dv)).toBe(digitoVerificacionNit(base));
            }
        });

        it('ids UUID únicos en todas las tablas', () => {
            const ids = Object.values(d).flat().map((fila) => fila.id);
            expect(ids.every(esUUID)).toBe(true);
            expect(new Set(ids).size).toBe(ids.length);
        });
    });

    describe('invariantes de movimientos', () => {
        const d = generar();
        const idsDe = (filas) => new Set(filas.map((f) => f.id));
        const cajas = idsDe(d.cajas);
        const proyectos = idsDe(d.proyectos);
        const terceros = idsDe(d.terceros);

        it('todos pasan validarMovimiento (incluida la fecha)', () => {
            for (const t of d.transacciones) expect(validarMovimiento(t)).toEqual([]);
        });

        it('las transferencias tienen origen y destino distintos (invariante 7)', () => {
            const transferencias = d.transacciones.filter((t) => t.tipo_movimiento === 'TRANSFERENCIA');
            expect(transferencias.length).toBeGreaterThan(0);
            for (const t of transferencias) {
                expect(cajas.has(t.caja_destino_id)).toBe(true);
                expect(t.caja_destino_id).not.toBe(t.caja_origen_id);
            }
            for (const t of d.transacciones.filter((x) => x.tipo_movimiento !== 'TRANSFERENCIA')) {
                expect(t.caja_destino_id).toBeNull();
            }
        });

        it('categoria guarda el nombre, nunca un UUID (invariante 5)', () => {
            const nombres = new Set(d.categorias.map((c) => c.nombre));
            for (const t of d.transacciones) {
                if (t.categoria === null) {
                    expect(t.tipo_movimiento).toBe('TRANSFERENCIA');
                    continue;
                }
                expect(esUUID(t.categoria)).toBe(false);
                expect(nombres.has(t.categoria) || esMovimientoDeDeuda(t)).toBe(true);
            }
        });

        it('las referencias apuntan a filas generadas', () => {
            for (const t of d.transacciones) {
                expect(cajas.has(t.caja_origen_id)).toBe(true);
                if (t.proyecto_id) expect(proyectos.has(t.proyecto_id)).toBe(true);
                if (t.tercero_id) expect(terceros.has(t.tercero_id)).toBe(true);
            }
            const empresas = idsDe(d.empresas);
            expect(d.cajas.every((c) => empresas.has(c.empresa_id))).toBe(true);
            expect(d.proyectos.every((p) => empresas.has(p.empresa_id))).toBe(true);
        });

        it('fechas dentro del periodo y nunca en el futuro', () => {
            const desde = '2026-06-01';
            for (const t of d.transacciones) {
                expect(enRango(t.fecha, desde, HOY)).toBe(true);
                expect(t.created_at.slice(0, 10)).toBe(t.fecha);
            }
        });

        it('egresos coherentes: categoría y tercero que corresponden', () => {
            const nombreTercero = new Map(d.terceros.map((t) => [t.id, t]));
            const nomina = d.transacciones.filter((t) => t.categoria === 'Nómina');
            expect(nomina.length).toBeGreaterThan(0);
            expect(nomina.every((t) => nombreTercero.get(t.tercero_id)?.tipo === 'Empleado')).toBe(true);
            const servicios = d.transacciones.filter((t) => t.categoria === 'Servicios');
            expect(servicios.every((t) => nombreTercero.get(t.tercero_id)?.tipo === 'Contratista')).toBe(true);
            const ingresos = d.transacciones.filter((t) => t.tipo_movimiento === 'INGRESO');
            expect(ingresos.every((t) => t.tercero_id === null)).toBe(true);
        });

        it('una obra finalizada no recibe movimientos después de su fecha de fin', () => {
            const finalizada = d.proyectos.find((p) => p.estado === 'Finalizado');
            const posteriores = d.transacciones.filter((t) => t.proyecto_id === finalizada.id && t.fecha > finalizada.fecha_fin);
            expect(posteriores).toEqual([]);
        });

        it('ningún movimiento normal cae en las categorías reservadas para deudas', () => {
            const normales = d.transacciones.filter((t) => t.usuario_nombre === USUARIO_DATOS_DE_PRUEBA);
            expect(normales).toHaveLength(d.transacciones.length);
            const deDeuda = d.transacciones.filter(esMovimientoDeDeuda);
            const enlazados = new Set([
                ...d.deudasTerceros.flatMap((x) => x.pagos.map((p) => p.transaccion_id)),
                ...d.deudasCajas.flatMap((x) => x.pagos.map((p) => p.transaccion_id)),
            ]);
            for (const t of deDeuda) {
                if (tipoDeMovimientoDeDeuda(t) === 'prestamo_cajas') continue;
                expect(enlazados.has(t.id)).toBe(true);
            }
        });
    });

    describe('deudas', () => {
        const d = generar();
        const porId = new Map(d.transacciones.map((t) => [t.id, t]));

        it('monto_pendiente y estado coherentes con los pagos', () => {
            for (const deuda of [...d.deudasTerceros, ...d.deudasCajas]) {
                const pagado = deuda.pagos.reduce((s, p) => s + p.monto, 0);
                expect(esCero(restarMontos(deuda.monto_pendiente, restarMontos(deuda.monto_original, pagado)))).toBe(true);
                expect(deuda.monto_pendiente).toBeGreaterThanOrEqual(0);
                expect(deuda.estado).toBe(estadoDeuda(deuda.monto_pendiente, deuda.monto_original));
            }
        });

        it('hay deudas en los tres estados', () => {
            const estados = new Set([...d.deudasTerceros, ...d.deudasCajas].map((x) => x.estado));
            expect(estados).toEqual(new Set(CHECK.estadoDeuda));
        });

        it('cada abono a proveedor es un EGRESO "Pago Deuda" del mismo tercero y monto', () => {
            for (const deuda of d.deudasTerceros) {
                for (const pago of deuda.pagos) {
                    const tx = porId.get(pago.transaccion_id);
                    expect(tipoDeMovimientoDeDeuda(tx)).toBe('abono_tercero');
                    expect(tx.tercero_id).toBe(deuda.tercero_id);
                    expect(tx.monto).toBe(pago.monto);
                    expect(tx.caja_origen_id).toBe(pago.caja_id);
                    expect(tx.fecha >= deuda.fecha_deuda).toBe(true);
                }
            }
        });

        it('cada préstamo entre cajas tiene su TRANSFERENCIA y sus abonos van en sentido contrario', () => {
            for (const deuda of d.deudasCajas) {
                expect(deuda.caja_deudora_id).not.toBe(deuda.caja_acreedora_id);
                const prestamo = d.transacciones.find((t) =>
                    tipoDeMovimientoDeDeuda(t) === 'prestamo_cajas'
                    && t.caja_origen_id === deuda.caja_acreedora_id
                    && t.caja_destino_id === deuda.caja_deudora_id
                    && t.monto === deuda.monto_original);
                expect(prestamo).toBeDefined();
                for (const pago of deuda.pagos) {
                    const tx = porId.get(pago.transaccion_id);
                    expect(tipoDeMovimientoDeDeuda(tx)).toBe('abono_cajas');
                    expect(tx.caja_origen_id).toBe(deuda.caja_deudora_id);
                    expect(tx.caja_destino_id).toBe(deuda.caja_acreedora_id);
                    expect(tx.monto).toBe(pago.monto);
                }
            }
        });
    });

    describe('saldos', () => {
        for (const semilla of [1, 42, 2026, 'obra']) {
            it(`ninguna caja queda en negativo en ningún momento (semilla ${semilla})`, () => {
                const d = generarDatosDePrueba({ hoy: HOY, semilla, meses: 12, movimientosPorMes: 60 });
                const minimos = minimosDeSaldo(ordenarCronologicamente([...d.transacciones]), d.cajas);
                for (const caja of d.cajas) expect(minimos.get(caja.id)).toBeGreaterThanOrEqual(0);
            });
        }

        it('las cajas salen en 0: el saldo es la suma de sus movimientos', () => {
            const d = generar();
            expect(d.cajas.every((c) => c.saldo_actual === 0)).toBe(true);
            const saldo = new Map();
            for (const t of d.transacciones) {
                for (const { cajaId, delta } of efectoEnSaldos(t)) saldo.set(cajaId, (saldo.get(cajaId) ?? 0) + delta);
            }
            for (const caja of d.cajas) expect(saldo.get(caja.id)).toBeGreaterThan(0);
        });

        it('el saldo inicial va el primer día, antes que todo lo demás', () => {
            const d = generar();
            const primeros = d.transacciones.slice(0, d.cajas.length);
            expect(primeros.every((t) => t.categoria === CATEGORIA_SALDO_INICIAL)).toBe(true);
            expect(primeros.every((t) => t.fecha === sumarDias('2026-06-01', 0))).toBe(true);
        });
    });
});
