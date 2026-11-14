// Formato de cifras y fechas para la interfaz.
//
// Antes cada componente tenía su propia copia de formatMoney,
// formatDisplayNumber y parseFormattedNumber (bug Q2), con diferencias sutiles
// (unos mostraban decimales, otros no; unos parseaban fechas en UTC). Toda la
// presentación usa este módulo.
import { aMonto } from '../domain/value-objects/dinero';
import { fechaLocal, etiquetaMes } from '../domain/value-objects/fecha';

const moneda = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const numeroDecimal = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const porcentaje = new Intl.NumberFormat('es-CO', { style: 'percent', maximumFractionDigits: 1 });

/** $ 1.234.567 (pesos, sin centavos). Acepta números o strings. */
export function formatoMoneda(valor, { signo = false } = {}) {
    const n = aMonto(valor);
    const texto = moneda.format(Math.abs(n));
    if (n < 0) return `-${texto}`;
    if (signo && n > 0) return `+${texto}`;
    return texto;
}

/** 1.234.567 */
export function formatoNumero(valor) {
    return numero.format(aMonto(valor));
}

/** 12,5 % (recibe una fracción: 0.125). */
export function formatoPorcentaje(fraccion) {
    if (!Number.isFinite(fraccion)) return '–';
    return porcentaje.format(fraccion);
}

/**
 * Forma compacta para ejes de gráficas y celdas estrechas:
 * 1.250.000 -> "1,3 M", 350.000 -> "350 mil", 2.400.000.000 -> "2,4 mil M".
 */
export function formatoCompacto(valor) {
    const n = aMonto(valor);
    const abs = Math.abs(n);
    const signo = n < 0 ? '-' : '';
    if (abs >= 1e9) return `${signo}${numeroDecimal.format(abs / 1e9)} mil M`;
    if (abs >= 1e6) return `${signo}${numeroDecimal.format(abs / 1e6)} M`;
    if (abs >= 1e3) return `${signo}${numero.format(abs / 1e3)} mil`;
    return `${signo}${numero.format(abs)}`;
}

const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
const fechaNumerica = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fechaLarga = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fechaHora = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Fecha de calendario legible. Nunca usa new Date('YYYY-MM-DD') (que en
 * Colombia muestra el día anterior).
 * @param {'corta'|'numerica'|'larga'} estilo
 */
export function formatoFecha(valor, estilo = 'corta') {
    const fecha = fechaLocal(valor);
    if (!fecha) return '';
    if (estilo === 'numerica') return fechaNumerica.format(fecha);
    if (estilo === 'larga') return fechaLarga.format(fecha);
    return fechaCorta.format(fecha);
}

/** Momento exacto (created_at, updated_at): fecha y hora locales. */
export function formatoFechaHora(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    return Number.isNaN(d.getTime()) ? '' : fechaHora.format(d);
}

/** 'YYYY-MM' -> 'mar 2026' */
export { etiquetaMes as formatoMes };

/**
 * Para inputs de dinero: muestra separadores de miles mientras se escribe.
 * '1234567' -> '1.234.567'. Ignora todo lo que no sea dígito.
 */
export function formatoMiles(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    const digitos = String(valor).replace(/\D/g, '');
    if (!digitos) return '';
    return numero.format(Number(digitos));
}

/** Inverso de formatoMiles: '1.234.567' -> '1234567' (string de dígitos). */
export function parsearMiles(texto) {
    return String(texto ?? '').replace(/\D/g, '');
}
