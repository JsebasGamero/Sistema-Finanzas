// PDF del reporte de movimientos: exactamente lo filtrado, con los filtros
// impresos en la cabecera (REP-9), categorías resueltas (REP-7), caja origen
// y destino de las transferencias y, si se filtró por caja, lo que entró y
// salió de ella (REP-10).
//
// jsPDF se importa al exportar: pesa ~350 KB y la mayoría de las visitas a
// Reportes no exportan nada.
import { hoyLocal } from '../../../domain/value-objects/fecha';
import { TIPO_MOVIMIENTO } from '../../../domain/value-objects/tipoMovimiento';
import { formatoFecha, formatoFechaHora, formatoMoneda, formatoNumero } from '../../formato';
import { valorConSigno } from '../comunes/calculosComunes';

// El PDF se imprime en papel blanco: siempre con la paleta del tema día
// (mismos valores que --ink, --ink-3, --pos, --neg, --info, --line y
// --surface-2 de index.css), aunque la app esté en tema noche.
const TINTA = [26, 25, 22];
const TINTA_3 = [126, 120, 109];
const POSITIVO = [21, 122, 60];
const NEGATIVO = [180, 35, 24];
const INFO = [31, 79, 209];
const FILETE = [226, 222, 213];
const FONDO_2 = [249, 248, 245];

const LETRA_TIPO = {
    [TIPO_MOVIMIENTO.INGRESO]: 'Ingreso',
    [TIPO_MOVIMIENTO.EGRESO]: 'Egreso',
    [TIPO_MOVIMIENTO.TRANSFERENCIA]: 'Transferencia',
};

// Las fuentes estándar de jsPDF solo traen Latin-1: el espacio fino que pone
// Intl en algunos formatos sale como un símbolo raro.
const limpiar = (texto) => String(texto ?? '').replace(/[\u00A0\u202F]/g, ' ');

function cajaDe(tx, datos) {
    const origen = datos.nombreCaja(tx.caja_origen_id, 'Sin caja');
    if (tx.tipo_movimiento !== TIPO_MOVIMIENTO.TRANSFERENCIA) return origen;
    return `De ${origen} a ${datos.nombreCaja(tx.caja_destino_id, 'Sin caja')}`;
}

function montoDe(tx, cajaId) {
    if (tx.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA && !cajaId) return formatoMoneda(tx.monto);
    return formatoMoneda(valorConSigno(tx, cajaId), { signo: true });
}

function colorDe(tx, cajaId) {
    const valor = valorConSigno(tx, cajaId);
    if (tx.tipo_movimiento === TIPO_MOVIMIENTO.TRANSFERENCIA && !cajaId) return INFO;
    return valor < 0 ? NEGATIVO : POSITIVO;
}

/**
 * @param {{
 *   filas: object[],            movimientos filtrados y ordenados
 *   resumen: object,            resultado de resumenFiltrado()
 *   periodoTexto: string,       describirPeriodo()
 *   filtrosTexto: string[],     describirFiltros() + búsqueda
 *   cajaId: string,
 *   datos: object,              useDatosReportes()
 * }} opciones
 */
export async function exportarPdfMovimientos({ filas, resumen, periodoTexto, filtrosTexto, cajaId, datos }) {
    const [moduloPdf, moduloTabla] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const JsPDF = moduloPdf.jsPDF ?? moduloPdf.default;
    const autoTable = moduloTabla.default ?? moduloTabla.autoTable;

    const doc = new JsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const ancho = doc.internal.pageSize.getWidth();
    const margen = 12;
    let y = 16;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...TINTA);
    doc.text('Reporte de movimientos', margen, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...TINTA_3);
    doc.text(limpiar(`FinanzasObra · Generado el ${formatoFechaHora(new Date())}`), ancho - margen, y, { align: 'right' });

    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(...TINTA);
    doc.text(limpiar(`Periodo: ${periodoTexto}`), margen, y);

    const filtros = filtrosTexto.length ? filtrosTexto.join(' · ') : 'Sin otros filtros';
    const lineasFiltro = doc.splitTextToSize(limpiar(`Filtros: ${filtros}`), ancho - margen * 2);
    y += 5;
    doc.text(lineasFiltro, margen, y);
    y += lineasFiltro.length * 4.5 + 2;

    const cifras = resumen.caja
        ? [
            ['Entradas a la caja', resumen.caja.entradas, POSITIVO],
            ['Salidas de la caja', resumen.caja.salidas, NEGATIVO],
            ['Neto de la caja', resumen.caja.neto, resumen.caja.neto < 0 ? NEGATIVO : POSITIVO],
            ['Movimientos', null, TINTA],
        ]
        : [
            ['Ingresos', resumen.ingresos, POSITIVO],
            ['Egresos', resumen.egresos, NEGATIVO],
            ['Neto', resumen.neto, resumen.neto < 0 ? NEGATIVO : POSITIVO],
            ['Movimientos', null, TINTA],
        ];
    const anchoCifra = (ancho - margen * 2) / cifras.length;
    cifras.forEach(([rotulo, valor, color], i) => {
        const x = margen + i * anchoCifra;
        doc.setFontSize(8);
        doc.setTextColor(...TINTA_3);
        doc.text(rotulo.toUpperCase(), x, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(...color);
        const texto = valor === null
            ? formatoNumero(resumen.cantidad)
            : formatoMoneda(valor, { signo: rotulo.startsWith('Neto') });
        doc.text(limpiar(texto), x, y + 6);
        doc.setFont('helvetica', 'normal');
    });
    y += 12;
    if (resumen.caja) {
        doc.setFontSize(8);
        doc.setTextColor(...TINTA_3);
        doc.text('Con filtro de caja, entradas y salidas incluyen las transferencias desde y hacia esa caja.', margen, y);
        y += 4;
    }

    const cuerpo = filas.map((tx) => [
        limpiar(formatoFecha(tx.fecha, 'numerica')),
        LETRA_TIPO[tx.tipo_movimiento] ?? tx.tipo_movimiento ?? '',
        limpiar(tx.descripcion || ''),
        limpiar(datos.nombreCategoria(tx.categoria)),
        limpiar(cajaDe(tx, datos)),
        limpiar(datos.nombreProyecto(tx.proyecto_id, '')),
        limpiar(datos.nombreTercero(tx.tercero_id, '')),
        limpiar(montoDe(tx, cajaId)),
    ]);
    const neto = resumen.caja ? resumen.caja.neto : resumen.neto;

    autoTable(doc, {
        startY: y + 2,
        margin: { left: margen, right: margen },
        head: [['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Caja', 'Obra', 'Proveedor', 'Monto']],
        body: cuerpo,
        foot: [[
            { content: `Total (${formatoNumero(filas.length)} movimientos)`, colSpan: 7 },
            limpiar(formatoMoneda(neto, { signo: true })),
        ]],
        showFoot: 'lastPage',
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: TINTA, lineColor: FILETE, lineWidth: 0.1, overflow: 'linebreak' },
        headStyles: { fillColor: FONDO_2, textColor: TINTA_3, fontStyle: 'bold', fontSize: 7.5 },
        footStyles: { fillColor: FONDO_2, textColor: TINTA, fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 20 },
            1: { cellWidth: 22 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 32 },
            4: { cellWidth: 44 },
            5: { cellWidth: 32 },
            6: { cellWidth: 32 },
            7: { cellWidth: 30, halign: 'right' },
        },
        didParseCell: (celda) => {
            if (celda.section === 'body' && celda.column.index === 7) {
                celda.cell.styles.textColor = colorDe(filas[celda.row.index], cajaId);
            }
            if (celda.section === 'foot' && celda.column.index === 7) {
                celda.cell.styles.halign = 'right';
                celda.cell.styles.textColor = neto < 0 ? NEGATIVO : POSITIVO;
            }
        },
    });

    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...TINTA_3);
        doc.text(`Página ${i} de ${paginas}`, ancho / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
    }

    doc.save(`movimientos_${hoyLocal()}.pdf`);
}
