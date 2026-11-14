import { formatoNumero } from '../../formato';

/** "1 deuda", "3 deudas", "1.204 movimientos". */
export function plural(n, singular, pluralTexto = `${singular}s`) {
    return `${formatoNumero(n)} ${n === 1 ? singular : pluralTexto}`;
}
