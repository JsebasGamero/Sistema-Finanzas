/**
 * Lista de columnas en el orden de la grilla, con visible y fijada, a partir
 * del estado guardado (getColumnState() normalizado). Sin estado, el orden y
 * la visibilidad que define el conjunto.
 * @returns {Array<{ campo, etiqueta, tipo, visible: boolean, fijada: boolean }>}
 */
export function columnasParaMenu(conjunto, estadoColumnas) {
    const porCampo = new Map(conjunto.columnas.map((c) => [c.campo, c]));
    const estado = Array.isArray(estadoColumnas) ? estadoColumnas : [];
    const vistos = new Set();
    const lista = [];
    for (const item of estado) {
        const columna = porCampo.get(item.colId);
        if (!columna || vistos.has(item.colId)) continue;
        vistos.add(item.colId);
        lista.push({
            campo: columna.campo,
            etiqueta: columna.etiqueta,
            tipo: columna.tipo,
            visible: typeof item.hide === 'boolean' ? !item.hide : columna.visible,
            fijada: item.pinned === 'left' || item.pinned === 'right',
        });
    }
    for (const columna of conjunto.columnas) {
        if (vistos.has(columna.campo)) continue;
        lista.push({ campo: columna.campo, etiqueta: columna.etiqueta, tipo: columna.tipo, visible: columna.visible, fijada: false });
    }
    return lista;
}
