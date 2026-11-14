import { createElement } from 'react';
import { iconoDeConjunto } from './iconosConjunto';

/** Icono de un conjunto de datos (movimientos, cajas, obras...). */
export default function IconoConjunto({ id, ...props }) {
    return createElement(iconoDeConjunto(id), { 'aria-hidden': 'true', ...props });
}
