// Descarga de lo que muestra el explorador en Excel, CSV o PDF.
//
// La tabla a exportar (columnas visibles en su orden, filas filtradas y
// ordenadas, totales) la arma src/application/reportes/exportacion.js; aquí
// solo se escribe el archivo. xlsx, jspdf y jspdf-autotable se cargan con
// import() al exportar: pesan cientos de kB y no deben ir en el paquete que
// abre la app en obra.
import { hojaExcel, textoCsv } from '../../../application/reportes/exportacion';
import { formatoFechaHora } from '../../formato';
import { formatearValor, esNumerico } from './formatoCeldas';

const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Dispara la descarga de un Blob con un nombre de archivo. */
export function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    enlace.rel = 'noopener';
    enlace.style.display = 'none';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    // Se revoca después: algunos navegadores leen la URL tras el click.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Excel limita el nombre de hoja a 31 caracteres y prohíbe : \ / ? * [ ] */
function nombreHoja(titulo) {
    return String(titulo || 'Datos').replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Datos';
}

/**
 * @param {{ tabla: import('../../../application/reportes/exportacion').TablaExportable,
 *   titulo: string, info: Array<[string, string]>, nombre: string }} opciones
 */
export async function exportarExcel({ tabla, titulo, info = [], nombre }) {
    const modulo = await import('xlsx');
    const XLSX = modulo.utils ? modulo : modulo.default;
    const { aoa, anchos, autofiltro } = hojaExcel(tabla);
    const hoja = XLSX.utils.aoa_to_sheet(aoa);
    hoja['!cols'] = anchos;
    if (autofiltro) hoja['!autofilter'] = { ref: autofiltro };
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, nombreHoja(titulo));
    if (info.length) {
        const hojaInfo = XLSX.utils.aoa_to_sheet(info.map(([clave, valor]) => [clave, valor]));
        hojaInfo['!cols'] = [{ wch: 18 }, { wch: 70 }];
        XLSX.utils.book_append_sheet(libro, hojaInfo, 'Información');
    }
    const contenido = XLSX.write(libro, { bookType: 'xlsx', type: 'array', compression: true });
    descargarBlob(new Blob([contenido], { type: TIPO_XLSX }), nombre);
}

export function exportarCsv({ tabla, nombre }) {
    descargarBlob(new Blob([textoCsv(tabla)], { type: 'text/csv;charset=utf-8' }), nombre);
}

// El PDF se imprime en papel blanco sea cual sea el tema de la pantalla, así
// que sus colores son grises fijos (no tokens del tema).
const PDF_TINTA = [26, 25, 22];
const PDF_TINTA_2 = [79, 75, 67];
const PDF_FILETE = [214, 210, 201];
const PDF_ENCABEZADO = [240, 238, 233];

// jsPDF con fuentes estándar no tiene los espacios finos que usa Intl.
const textoPdf = (texto) => String(texto ?? '').replace(/\s/g, ' ');

/**
 * @param {{ tabla, titulo: string, lineas: string[], nombre: string }} opciones
 *   lineas: periodo, filtros activos... (debajo del título)
 */
export async function exportarPdf({ tabla, titulo, lineas = [], nombre }) {
    const [moduloPdf, moduloTabla] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const JsPdf = moduloPdf.jsPDF ?? moduloPdf.default;
    const autoTable = moduloTabla.autoTable ?? moduloTabla.default;
    const { columnas, filas, totales, filasDestacadas = [] } = tabla;
    const horizontal = columnas.length > 6;
    const doc = new JsPdf({ orientation: horizontal ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const margen = 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...PDF_TINTA);
    doc.text(textoPdf(titulo), margen, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...PDF_TINTA_2);
    let y = 22;
    const anchoUtil = doc.internal.pageSize.getWidth() - margen * 2;
    for (const linea of [...lineas, `Generado el ${formatoFechaHora(new Date())}`]) {
        for (const parte of doc.splitTextToSize(textoPdf(linea), anchoUtil)) {
            doc.text(parte, margen, y);
            y += 4.5;
        }
    }

    const alineacion = {};
    columnas.forEach((c, i) => {
        if (esNumerico(c.tipo)) alineacion[i] = { halign: 'right' };
    });
    const celda = (valor, i) => textoPdf(typeof valor === 'string' && esNumerico(columnas[i].tipo) ? valor : formatearValor(valor, columnas[i].tipo));

    autoTable(doc, {
        startY: y + 2,
        margin: { left: margen, right: margen },
        head: [columnas.map((c) => textoPdf(c.etiqueta))],
        body: filas.map((fila) => fila.map(celda)),
        // El rótulo "Total (N)" puede caer en una columna de fecha o sí/no
        // (cuando no hay texto visible); por su tipo se borraba o salía "Sí".
        foot: totales ? [totales.map((v, i) => (typeof v === 'string' ? textoPdf(v) : celda(v, i)))] : undefined,
        showFoot: 'lastPage',
        styles: {
            font: 'helvetica',
            fontSize: horizontal ? 7.5 : 8.5,
            cellPadding: 1.6,
            textColor: PDF_TINTA,
            lineColor: PDF_FILETE,
            lineWidth: 0.1,
            overflow: 'linebreak',
        },
        headStyles: { fillColor: PDF_ENCABEZADO, textColor: PDF_TINTA, fontStyle: 'bold' },
        footStyles: { fillColor: PDF_ENCABEZADO, textColor: PDF_TINTA, fontStyle: 'bold' },
        bodyStyles: { fillColor: [255, 255, 255] },
        columnStyles: alineacion,
        didParseCell: (dato) => {
            if (dato.section === 'body' && filasDestacadas[dato.row.index]) dato.cell.styles.fontStyle = 'bold';
            if ((dato.section === 'head' || dato.section === 'foot') && alineacion[dato.column.index]) {
                dato.cell.styles.halign = 'right';
            }
        },
    });

    const paginas = doc.getNumberOfPages();
    for (let i = 1; i <= paginas; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(...PDF_TINTA_2);
        doc.text(
            textoPdf(`${titulo} · Página ${i} de ${paginas}`),
            doc.internal.pageSize.getWidth() / 2,
            doc.internal.pageSize.getHeight() - 8,
            { align: 'center' }
        );
    }

    descargarBlob(doc.output('blob'), nombre);
}
