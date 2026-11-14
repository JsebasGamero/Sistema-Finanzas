import { describe, it, expect } from 'vitest';
import { esMovimientoDeDeuda, tipoDeMovimientoDeDeuda } from './movimientoDeDeuda';

describe('movimientoDeDeuda', () => {
    it('reconoce préstamos y abonos entre cajas', () => {
        expect(tipoDeMovimientoDeDeuda({ tipo_movimiento: 'TRANSFERENCIA', categoria: 'Préstamo entre Cajas' })).toBe('prestamo_cajas');
        expect(tipoDeMovimientoDeDeuda({ tipo_movimiento: 'TRANSFERENCIA', categoria: 'Pago Préstamo' })).toBe('abono_cajas');
    });

    it('reconoce abonos a proveedores', () => {
        expect(tipoDeMovimientoDeDeuda({ tipo_movimiento: 'EGRESO', categoria: 'Pago Deuda' })).toBe('abono_tercero');
    });

    it('un EGRESO "Pago Préstamo" elegido a mano es un gasto normal', () => {
        expect(esMovimientoDeDeuda({ tipo_movimiento: 'EGRESO', categoria: 'Pago Préstamo' })).toBe(false);
    });

    it('movimientos normales y vacíos', () => {
        expect(esMovimientoDeDeuda({ tipo_movimiento: 'EGRESO', categoria: 'Materiales' })).toBe(false);
        expect(esMovimientoDeDeuda(null)).toBe(false);
    });
});
