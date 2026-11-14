import { describe, it, expect } from 'vitest';
import {
    aplicarAbono,
    buscarMovimientoDeAbono,
    buscarMovimientoDePrestamo,
    cajasDelMovimiento,
    clavePago,
    estadoDe,
    fraccionAbonada,
    interpretarMontoPegado,
    montoAbonado,
    movimientoInverso,
    ordenarRecientes,
    quitarDecimales,
    quitarUltimoAbono,
    resumirDeudas,
    validarAbono,
} from './reglasDeuda';
import { efectoDeBorrado, efectoEnSaldos } from '../../domain/rules/efectoEnSaldos';
import { parsearMiles } from '../../presentation/formato';

const deuda = (extra = {}) => ({
    id: 'd1',
    monto_original: 1000000,
    monto_pendiente: 1000000,
    estado: 'PENDIENTE',
    pagos: [],
    created_at: '2026-11-13T15:00:00.000Z',
    ...extra,
});

function netoPorCaja(ajustes) {
    const neto = {};
    for (const { cajaId, delta } of ajustes) neto[cajaId] = (neto[cajaId] ?? 0) + delta;
    return neto;
}

describe('estado y montos', () => {
    it('calcula el estado con los montos y no con la columna', () => {
        expect(estadoDe(deuda({ monto_pendiente: 1e-8, estado: 'PARCIAL' }))).toBe('PAGADA');
        expect(estadoDe(deuda())).toBe('PENDIENTE');
        expect(estadoDe(deuda({ monto_pendiente: 400000 }))).toBe('PARCIAL');
    });

    it('abonado y fracción', () => {
        const d = deuda({ monto_pendiente: 250000 });
        expect(montoAbonado(d)).toBe(750000);
        expect(fraccionAbonada(d)).toBe(0.75);
        expect(fraccionAbonada(deuda({ monto_original: 0, monto_pendiente: 0 }))).toBe(0);
        // Datos incoherentes: nunca negativo ni mayor que 1.
        expect(montoAbonado(deuda({ monto_pendiente: 2000000 }))).toBe(0);
    });
});

describe('validarAbono', () => {
    it('rechaza montos vacíos, cero o mayores a lo pendiente', () => {
        expect(validarAbono(deuda(), '')).toMatch(/mayor a 0/);
        expect(validarAbono(deuda(), 0)).toMatch(/mayor a 0/);
        expect(validarAbono(deuda(), 1000001)).toMatch(/no puede superar/);
        expect(validarAbono(deuda({ monto_pendiente: 0 }), 10)).toMatch(/ya está pagada/);
    });

    it('acepta abonar exactamente lo pendiente, aunque tenga residuo de coma flotante', () => {
        expect(validarAbono(deuda(), 1000000)).toBeNull();
        expect(validarAbono(deuda({ monto_pendiente: 100000.000000001 }), 100000)).toBeNull();
    });
});

describe('aplicarAbono / quitarUltimoAbono', () => {
    it('abonar todo deja la deuda PAGADA y en cero exacto', () => {
        const d = deuda({ monto_original: 100000.1, monto_pendiente: 100000.1 });
        const cambios = aplicarAbono(d, { id: 'p1', monto: 100000.1 });
        expect(cambios.monto_pendiente).toBe(0);
        expect(cambios.estado).toBe('PAGADA');
        expect(cambios.pagos).toHaveLength(1);
    });

    it('devuelve solo los campos que cambian', () => {
        const cambios = aplicarAbono(deuda({ descripcion: 'x', tercero_id: 't1' }), { id: 'p1', monto: 300000 });
        expect(Object.keys(cambios).sort()).toEqual(['estado', 'monto_pendiente', 'pagos']);
        expect(cambios.estado).toBe('PARCIAL');
        expect(cambios.monto_pendiente).toBe(700000);
    });

    it('no muta la deuda original', () => {
        const d = deuda();
        aplicarAbono(d, { id: 'p1', monto: 1 });
        expect(d.pagos).toEqual([]);
    });

    it('quitar el último abono restituye pendiente y estado', () => {
        const d = deuda({
            monto_pendiente: 0,
            estado: 'PAGADA',
            pagos: [{ id: 'p1', monto: 400000 }, { id: 'p2', monto: 600000 }],
        });
        const r = quitarUltimoAbono(d);
        expect(r.pago.id).toBe('p2');
        expect(r.cambios.monto_pendiente).toBe(600000);
        expect(r.cambios.estado).toBe('PARCIAL');
        expect(r.cambios.pagos).toEqual([{ id: 'p1', monto: 400000 }]);

        const r2 = quitarUltimoAbono({ ...d, ...r.cambios });
        expect(r2.cambios.estado).toBe('PENDIENTE');
        expect(r2.cambios.monto_pendiente).toBe(1000000);
    });

    it('nunca deja más pendiente que el original', () => {
        const r = quitarUltimoAbono(deuda({ monto_pendiente: 900000, pagos: [{ monto: 500000 }] }));
        expect(r.cambios.monto_pendiente).toBe(1000000);
        expect(quitarUltimoAbono(deuda())).toBeNull();
        expect(quitarUltimoAbono(deuda({ pagos: null }))).toBeNull();
    });

    it('clavePago usa el id o, en abonos viejos, fecha y monto', () => {
        expect(clavePago({ id: 'p1', monto: 5 })).toBe('p1');
        expect(clavePago({ fecha: '2026-01-01T00:00:00Z', monto: '5' })).toBe('2026-01-01T00:00:00Z|5');
    });
});

describe('buscarMovimientoDeAbono', () => {
    const prestamo = deuda({ caja_deudora_id: 'B', caja_acreedora_id: 'A' });
    const abonoCajas = (extra = {}) => ({
        id: 't1',
        tipo_movimiento: 'TRANSFERENCIA',
        categoria: 'Pago Préstamo',
        caja_origen_id: 'B',
        caja_destino_id: 'A',
        monto: 500000,
        created_at: '2026-11-13T15:00:02.000Z',
        ...extra,
    });

    it('usa transaccion_id cuando el abono lo tiene', () => {
        const pago = { id: 'p', monto: 500000, transaccion_id: 't9', fecha: '2026-11-13T15:00:00.000Z' };
        expect(buscarMovimientoDeAbono({ tipoDeuda: 'cajas', deuda: prestamo, pago, candidatos: [abonoCajas()] })).toBeNull();
        expect(buscarMovimientoDeAbono({
            tipoDeuda: 'cajas', deuda: prestamo, pago, candidatos: [abonoCajas({ id: 't9' })],
        }).id).toBe('t9');
    });

    it('reconoce el movimiento de un abono viejo por cajas, monto y hora', () => {
        const pago = { monto: 500000, fecha: '2026-11-13T15:00:00.000Z' };
        const candidatos = [
            abonoCajas({ id: 'lejos', created_at: '2026-11-13T18:00:00.000Z' }),
            abonoCajas({ id: 'otro-monto', monto: 400000 }),
            abonoCajas({ id: 'al-reves', caja_origen_id: 'A', caja_destino_id: 'B' }),
            abonoCajas({ id: 'cerca', created_at: '2026-11-13T15:00:01.000Z' }),
            abonoCajas({ id: 'un-poco-mas', created_at: '2026-11-13T15:00:05.000Z' }),
        ];
        expect(buscarMovimientoDeAbono({ tipoDeuda: 'cajas', deuda: prestamo, pago, candidatos }).id).toBe('cerca');
    });

    it('no adivina si nada coincide', () => {
        const pago = { monto: 500000, fecha: '2026-11-13T15:00:00.000Z' };
        expect(buscarMovimientoDeAbono({
            tipoDeuda: 'cajas', deuda: prestamo, pago, candidatos: [abonoCajas({ created_at: '2026-11-14T15:00:00.000Z' })],
        })).toBeNull();
        expect(buscarMovimientoDeAbono({ tipoDeuda: 'cajas', deuda: prestamo, pago: { monto: 1 }, candidatos: [] })).toBeNull();
    });

    it('en proveedores exige el mismo tercero y la caja del abono', () => {
        const cuenta = deuda({ tercero_id: 'T1' });
        const pago = { monto: 300000, caja_id: 'C1', fecha: '2026-11-13T15:00:00.000Z' };
        const egreso = (extra) => ({
            id: 'e', tipo_movimiento: 'EGRESO', categoria: 'Pago Deuda', tercero_id: 'T1',
            caja_origen_id: 'C1', monto: 300000, created_at: '2026-11-13T15:00:00.500Z', ...extra,
        });
        expect(buscarMovimientoDeAbono({ tipoDeuda: 'terceros', deuda: cuenta, pago, candidatos: [egreso()] }).id).toBe('e');
        expect(buscarMovimientoDeAbono({ tipoDeuda: 'terceros', deuda: cuenta, pago, candidatos: [egreso({ tercero_id: 'T2' })] })).toBeNull();
        expect(buscarMovimientoDeAbono({ tipoDeuda: 'terceros', deuda: cuenta, pago, candidatos: [egreso({ caja_origen_id: 'C2' })] })).toBeNull();
        // Un EGRESO "Pago Préstamo" (cuota a un banco) no es un abono a proveedor.
        expect(buscarMovimientoDeAbono({ tipoDeuda: 'terceros', deuda: cuenta, pago, candidatos: [egreso({ categoria: 'Pago Préstamo' })] })).toBeNull();
    });
});

describe('buscarMovimientoDePrestamo', () => {
    const prestamo = deuda({ id: 'd7', caja_deudora_id: 'B', caja_acreedora_id: 'A', monto_original: 2000000 });
    const transferencia = (extra = {}) => ({
        id: 'x', tipo_movimiento: 'TRANSFERENCIA', categoria: 'Préstamo entre Cajas',
        caja_origen_id: 'A', caja_destino_id: 'B', monto: 2000000, created_at: '2026-11-13T15:00:00.300Z', ...extra,
    });

    it('prefiere el movimiento enlazado por id', () => {
        expect(buscarMovimientoDePrestamo({ deuda: prestamo, candidatos: [transferencia(), transferencia({ id: 'd7', monto: 1 })] }).id).toBe('d7');
    });

    it('reconoce préstamos viejos por cajas, monto y hora', () => {
        expect(buscarMovimientoDePrestamo({ deuda: prestamo, candidatos: [transferencia()] }).id).toBe('x');
        expect(buscarMovimientoDePrestamo({ deuda: prestamo, candidatos: [transferencia({ caja_origen_id: 'B', caja_destino_id: 'A' })] })).toBeNull();
        expect(buscarMovimientoDePrestamo({ deuda: prestamo, candidatos: [transferencia({ monto: 200000 })] })).toBeNull();
    });
});

describe('movimientoInverso', () => {
    const casos = [
        { tipo_movimiento: 'INGRESO', monto: 100, caja_origen_id: 'A' },
        { tipo_movimiento: 'EGRESO', monto: 250, caja_origen_id: 'A' },
        { tipo_movimiento: 'TRANSFERENCIA', monto: 300, caja_origen_id: 'A', caja_destino_id: 'B' },
        { tipo_movimiento: 'TRANSFERENCIA', monto: 300, caja_origen_id: null, caja_destino_id: 'B' },
    ];

    it.each(casos)('tiene el mismo efecto por caja que borrar el movimiento ($tipo_movimiento)', (tx) => {
        expect(netoPorCaja(efectoEnSaldos(movimientoInverso(tx)))).toEqual(netoPorCaja(efectoDeBorrado(tx)));
    });

    it('cajasDelMovimiento', () => {
        expect(cajasDelMovimiento(casos[1])).toEqual(['A']);
        expect(cajasDelMovimiento(casos[2])).toEqual(['A', 'B']);
        expect(cajasDelMovimiento(null)).toEqual([]);
        expect(movimientoInverso({ tipo_movimiento: 'OTRO' })).toBeNull();
    });
});

describe('orden y resumen', () => {
    it('ordena por fecha de calendario y luego por creación', () => {
        const lista = [
            { id: 'a', fecha_prestamo: '2026-10-01', created_at: '2026-10-01T10:00:00Z' },
            { id: 'b', fecha_prestamo: '2026-11-02', created_at: '2026-11-02T10:00:00Z' },
            { id: 'c', fecha_prestamo: '2026-11-02', created_at: '2026-11-02T12:00:00Z' },
            { id: 'd', created_at: '2026-10-15T12:00:00Z' },
        ];
        expect(ordenarRecientes(lista, 'fecha_prestamo').map((d) => d.id)).toEqual(['c', 'b', 'd', 'a']);
    });

    it('resume pendientes, pagadas y totales', () => {
        const r = resumirDeudas([
            deuda({ id: '1' }),
            deuda({ id: '2', monto_pendiente: 400000 }),
            deuda({ id: '3', monto_pendiente: 1e-9, estado: 'PARCIAL' }),
        ]);
        expect(r.pendientes.map((d) => d.id)).toEqual(['1', '2']);
        expect(r.pagadas.map((d) => d.id)).toEqual(['3']);
        expect(r.totalPendiente).toBe(1400000);
        expect(r.totalAbonado).toBe(1600000);
        expect(r.totalOriginal).toBe(3000000);
    });
});

describe('quitarDecimales (campo de monto)', () => {
    const aGuardar = (texto) => parsearMiles(quitarDecimales(texto));

    it('lo que se ve es lo que se guarda al pegar montos con comas', () => {
        expect(aGuardar('1.500.000,00')).toBe('1500000');
        expect(aGuardar('250000,5')).toBe('250000');
        expect(aGuardar('1,500,000')).toBe('1500000');
    });

    it('no rompe el borrado de un dígito', () => {
        // Borrar el último dígito de '1.500' deja '1.50' en el campo.
        expect(aGuardar('1.50')).toBe('150');
        expect(aGuardar('1.500')).toBe('1500');
    });
});

describe('interpretarMontoPegado (monto pegado de golpe)', () => {
    it('no multiplica por 100 los centavos con punto (DEU-10)', () => {
        expect(interpretarMontoPegado('1500000.00')).toEqual({ digitos: '1500000', redondeado: false });
        expect(interpretarMontoPegado('$1,500,000.00')).toEqual({ digitos: '1500000', redondeado: false });
        expect(interpretarMontoPegado('1.500.000,00')).toEqual({ digitos: '1500000', redondeado: false });
    });

    it('acepta separadores de miles, símbolo de pesos y espacios', () => {
        expect(interpretarMontoPegado('$ 1.234.567').digitos).toBe('1234567');
        expect(interpretarMontoPegado('1,234,567').digitos).toBe('1234567');
        expect(interpretarMontoPegado('1 234 567').digitos).toBe('1234567');
        expect(interpretarMontoPegado('COP 250.000').digitos).toBe('250000');
        expect(interpretarMontoPegado('1.500').digitos).toBe('1500');
    });

    it('redondea los centavos y lo avisa', () => {
        expect(interpretarMontoPegado('1.500.000,50')).toEqual({ digitos: '1500001', redondeado: true });
        expect(interpretarMontoPegado('250000.4')).toEqual({ digitos: '250000', redondeado: true });
    });

    it('rechaza lo que no entiende en vez de adivinar', () => {
        expect(interpretarMontoPegado('1.500.50').error).toMatch(/No se reconoce/);
        expect(interpretarMontoPegado('1.5000').error).toMatch(/No se reconoce/);
        expect(interpretarMontoPegado('doce mil').error).toMatch(/No se reconoce/);
        expect(interpretarMontoPegado('-50000').error).toMatch(/No se reconoce/);
        expect(interpretarMontoPegado('12345678901234').error).toMatch(/demasiado grande/);
    });
});
