import { describe, it, expect } from 'vitest';
import {
    hoyLocal, claveDia, fechaLocal, claveMes, claveTrimestre, claveSemana,
    etiquetaMes, enRango, rangoDePreset, sumarDias, indiceDiaSemana, nombreDiaSemana
} from './fecha';

describe('hoyLocal', () => {
    it('usa la hora local, no UTC', () => {
        // 8 p. m. local del 5 de marzo: en UTC-5 ya sería 6 de marzo.
        const noche = new Date(2026, 2, 5, 20, 30);
        expect(hoyLocal(noche)).toBe('2026-03-05');
    });
});

describe('claveDia', () => {
    it('deja igual una fecha de calendario', () => {
        expect(claveDia('2026-03-01')).toBe('2026-03-01');
    });

    it('toma la parte de fecha de un timestamp sin zona', () => {
        expect(claveDia('2026-03-01T23:59:00')).toBe('2026-03-01');
    });

    it('convierte a fecha local un timestamp con zona', () => {
        const d = new Date(2026, 2, 1, 22, 0);
        expect(claveDia(d.toISOString())).toBe('2026-03-01');
    });

    it('acepta Date y rechaza basura', () => {
        expect(claveDia(new Date(2026, 0, 9))).toBe('2026-01-09');
        expect(claveDia('')).toBeNull();
        expect(claveDia(null)).toBeNull();
        expect(claveDia('no es fecha')).toBeNull();
        expect(claveDia(new Date('x'))).toBeNull();
    });
});

describe('fechaLocal', () => {
    it('crea la medianoche local, no UTC', () => {
        const d = fechaLocal('2026-03-01');
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(2);
        expect(d.getDate()).toBe(1);
        expect(d.getHours()).toBe(0);
    });
});

describe('claves de agrupación', () => {
    it('mes y trimestre', () => {
        expect(claveMes('2026-03-15')).toBe('2026-03');
        expect(claveTrimestre('2026-03-15')).toBe('2026-T1');
        expect(claveTrimestre('2026-10-01')).toBe('2026-T4');
    });

    it('semana ISO, incluido el cambio de año', () => {
        expect(claveSemana('2026-01-01')).toBe('2026-S01'); // jueves
        expect(claveSemana('2027-01-01')).toBe('2026-S53'); // viernes: semana 53 de 2026
        expect(claveSemana('2026-03-02')).toBe('2026-S10'); // lunes
        expect(claveSemana('2026-03-08')).toBe('2026-S10'); // domingo de esa semana
        expect(claveSemana('2026-12-31')).toBe('2026-S53');
    });

    it('semana ISO en años que empiezan en viernes, sábado o domingo', () => {
        expect(claveSemana('2027-01-04')).toBe('2027-S01'); // 2027 empieza en viernes
        expect(claveSemana('2027-12-31')).toBe('2027-S52');
        expect(claveSemana('2028-01-01')).toBe('2027-S52'); // sábado
        expect(claveSemana('2028-01-03')).toBe('2028-S01');
        expect(claveSemana('2023-01-01')).toBe('2022-S52'); // domingo
        expect(claveSemana('2023-01-02')).toBe('2023-S01');
        expect(claveSemana('2023-06-15')).toBe('2023-S24');
    });

    it('día de la semana con lunes = 1', () => {
        expect(indiceDiaSemana('2026-03-02')).toBe(1);
        expect(indiceDiaSemana('2026-03-08')).toBe(7);
        expect(nombreDiaSemana('2026-03-02')).toBe('lunes');
    });
});

describe('etiquetaMes', () => {
    it('rotula el mes correcto (antes salía el mes anterior por UTC)', () => {
        expect(etiquetaMes('2026-03')).toBe('mar 2026');
        expect(etiquetaMes('2026-03', { largo: true })).toBe('marzo de 2026');
        expect(etiquetaMes('2026-12', { conAnio: false })).toBe('dic');
    });
});

describe('enRango', () => {
    it('incluye el último día aunque la fecha traiga hora', () => {
        expect(enRango('2026-03-31T18:00:00', '2026-03-01', '2026-03-31')).toBe(true);
    });

    it('límites abiertos', () => {
        expect(enRango('2026-03-31', '', '')).toBe(true);
        expect(enRango('2026-02-28', '2026-03-01', '')).toBe(false);
        expect(enRango('2026-04-01', '', '2026-03-31')).toBe(false);
    });

    it('sin fecha solo pasa si no hay filtro', () => {
        expect(enRango(null, '', '')).toBe(true);
        expect(enRango(null, '2026-01-01', '')).toBe(false);
    });
});

describe('rangoDePreset', () => {
    const hoy = '2026-03-18'; // miércoles

    it('mes y mes anterior', () => {
        expect(rangoDePreset('mes', hoy)).toEqual({ desde: '2026-03-01', hasta: hoy });
        expect(rangoDePreset('mes_anterior', hoy)).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    });

    it('mes anterior en enero cruza de año', () => {
        expect(rangoDePreset('mes_anterior', '2026-01-10')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    });

    it('semana empieza el lunes', () => {
        expect(rangoDePreset('semana', hoy)).toEqual({ desde: '2026-03-16', hasta: hoy });
    });

    it('trimestre, año y últimos días', () => {
        expect(rangoDePreset('trimestre', hoy)).toEqual({ desde: '2026-01-01', hasta: hoy });
        expect(rangoDePreset('anio', hoy)).toEqual({ desde: '2026-01-01', hasta: hoy });
        expect(rangoDePreset('anio_anterior', hoy)).toEqual({ desde: '2025-01-01', hasta: '2025-12-31' });
        expect(rangoDePreset('ultimos_30', hoy)).toEqual({ desde: '2026-02-17', hasta: hoy });
    });

    it('todo o desconocido = sin límites', () => {
        expect(rangoDePreset('todo', hoy)).toEqual({ desde: '', hasta: '' });
        expect(rangoDePreset('xyz', hoy)).toEqual({ desde: '', hasta: '' });
    });
});

describe('sumarDias', () => {
    it('cruza meses', () => {
        expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
    });
});
