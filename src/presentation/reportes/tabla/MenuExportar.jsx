import { createElement } from 'react';
import { Download, FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import Popover from './Popover';

const FORMATOS = [
    { id: 'excel', etiqueta: 'Excel (.xlsx)', detalle: 'Cifras y fechas reales, con totales y autofiltro.', icono: FileSpreadsheet },
    { id: 'csv', etiqueta: 'CSV', detalle: 'Separado por punto y coma, para Excel en español.', icono: Sheet },
    { id: 'pdf', etiqueta: 'PDF', detalle: 'Para imprimir o enviar, con periodo y filtros.', icono: FileText },
];

/** Exporta exactamente lo que se ve: columnas visibles, filas filtradas y totales. */
export default function MenuExportar({ exportando, onExportar }) {
    return (
        <Popover etiqueta="Exportar" icono={Download} alinear="derecha" ancho={320}>
            {({ cerrar }) => (
                <div>
                    <p className="explorador-popover-titulo">Exportar lo que se ve</p>
                    {FORMATOS.map(({ id, etiqueta, detalle, icono }) => (
                        <button
                            key={id}
                            type="button"
                            className="explorador-opcion"
                            disabled={Boolean(exportando)}
                            onClick={async () => {
                                await onExportar(id);
                                cerrar(false);
                            }}
                        >
                            {createElement(icono, { size: 18, 'aria-hidden': 'true', className: 'text-ink-3 mt-0.5' })}
                            <span>
                                <span className="font-semibold">
                                    {exportando === id ? 'Generando archivo…' : etiqueta}
                                </span>
                                <span className="explorador-opcion-detalle">{detalle}</span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </Popover>
    );
}
