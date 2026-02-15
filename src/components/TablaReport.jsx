// TablaReport - AG-Grid Excel-like table for reports
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { Download, FileSpreadsheet, Table2, ChevronDown } from 'lucide-react';
import { db } from '../services/db';
import * as XLSX from 'xlsx';

// Register AG-Grid modules
ModuleRegistry.registerModules([AllCommunityModule]);

// Custom dark theme based on Quartz
const darkTheme = themeQuartz.withParams({
    backgroundColor: '#1a1a2e',
    foregroundColor: '#e0e0e0',
    headerBackgroundColor: '#16213e',
    headerTextColor: '#f5a623',
    borderColor: 'rgba(255,255,255,0.08)',
    rowHoverColor: 'rgba(245,166,35,0.06)',
    selectedRowBackgroundColor: 'rgba(245,166,35,0.12)',
    oddRowBackgroundColor: 'rgba(255,255,255,0.02)',
    headerFontWeight: 600,
    cellHorizontalPadding: 12,
    fontSize: 13,
    headerFontSize: 13,
    rowHeight: 42,
    headerHeight: 46,
});

// Data source options
const DATA_SOURCES = [
    { id: 'transacciones', label: 'Transacciones' },
    { id: 'deudas_terceros', label: 'Deudas a Terceros' },
    { id: 'deudas_cajas', label: 'Deudas entre Cajas' },
];

export default function TablaReport() {
    const gridRef = useRef(null);
    const [dataSource, setDataSource] = useState('transacciones');
    const [rowData, setRowData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showSourceDropdown, setShowSourceDropdown] = useState(false);

    // Lookup maps
    const [cajasMap, setCajasMap] = useState({});
    const [proyectosMap, setProyectosMap] = useState({});
    const [tercerosMap, setTercerosMap] = useState({});

    // Load lookup data
    useEffect(() => {
        async function loadLookups() {
            const [cajas, proyectos, terceros] = await Promise.all([
                db.cajas.toArray(),
                db.proyectos.toArray(),
                db.terceros.toArray()
            ]);
            setCajasMap(Object.fromEntries(cajas.map(c => [c.id, c.nombre])));
            setProyectosMap(Object.fromEntries(proyectos.map(p => [p.id, p.nombre])));
            setTercerosMap(Object.fromEntries(terceros.map(t => [t.id, t.nombre])));
        }
        loadLookups();
    }, []);

    // Load data based on selected source
    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                let data = [];
                if (dataSource === 'transacciones') {
                    data = await db.transacciones.orderBy('created_at').reverse().toArray();
                } else if (dataSource === 'deudas_terceros') {
                    data = await db.deudas_terceros.toArray();
                } else if (dataSource === 'deudas_cajas') {
                    data = await db.deudas_cajas.toArray();
                }
                setRowData(data);
            } catch (e) {
                console.error('Error loading data:', e);
                setRowData([]);
            }
            setLoading(false);
        }
        loadData();
    }, [dataSource]);

    // Format money
    function formatMoney(value) {
        if (value == null) return '';
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    // Column definitions per data source
    const columnDefs = useMemo(() => {
        if (dataSource === 'transacciones') {
            return [
                {
                    headerName: 'Fecha',
                    field: 'fecha',
                    width: 120,
                    filter: 'agDateColumnFilter',
                    valueFormatter: (params) => {
                        if (!params.value) return '';
                        const d = new Date(params.value);
                        return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    },
                    sort: 'desc'
                },
                {
                    headerName: 'Tipo',
                    field: 'tipo_movimiento',
                    width: 130,
                    filter: true,
                    cellStyle: (params) => {
                        if (params.value === 'INGRESO') return { color: '#4ade80' };
                        if (params.value === 'EGRESO') return { color: '#f87171' };
                        if (params.value === 'TRANSFERENCIA') return { color: '#60a5fa' };
                        return {};
                    }
                },
                {
                    headerName: 'Descripción',
                    field: 'descripcion',
                    flex: 1,
                    minWidth: 200,
                    filter: 'agTextColumnFilter'
                },
                {
                    headerName: 'Monto',
                    field: 'monto',
                    width: 150,
                    filter: 'agNumberColumnFilter',
                    valueFormatter: (params) => formatMoney(params.value),
                    cellStyle: { textAlign: 'right', fontWeight: '600' }
                },
                {
                    headerName: 'Categoría',
                    field: 'categoria',
                    width: 150,
                    filter: true
                },
                {
                    headerName: 'Proyecto',
                    field: 'proyecto_id',
                    width: 160,
                    filter: true,
                    valueFormatter: (params) => proyectosMap[params.value] || ''
                },
                {
                    headerName: 'Caja Origen',
                    field: 'caja_origen_id',
                    width: 150,
                    filter: true,
                    valueFormatter: (params) => cajasMap[params.value] || ''
                },
                {
                    headerName: 'Caja Destino',
                    field: 'caja_destino_id',
                    width: 150,
                    filter: true,
                    valueFormatter: (params) => cajasMap[params.value] || ''
                },
                {
                    headerName: 'Proveedor',
                    field: 'tercero_id',
                    width: 150,
                    filter: true,
                    valueFormatter: (params) => tercerosMap[params.value] || ''
                },
                {
                    headerName: 'Usuario',
                    field: 'usuario_nombre',
                    width: 130,
                    filter: true
                },
                {
                    headerName: 'Sincronizado',
                    field: 'sincronizado',
                    width: 120,
                    filter: true,
                    valueFormatter: (params) => params.value ? '✅ Sí' : '⏳ Pendiente'
                }
            ];
        } else if (dataSource === 'deudas_terceros') {
            return [
                {
                    headerName: 'Tercero',
                    field: 'tercero_id',
                    flex: 1,
                    minWidth: 160,
                    filter: true,
                    valueFormatter: (params) => tercerosMap[params.value] || params.value || ''
                },
                {
                    headerName: 'Descripción',
                    field: 'descripcion',
                    flex: 1,
                    minWidth: 180,
                    filter: 'agTextColumnFilter'
                },
                {
                    headerName: 'Monto Original',
                    field: 'monto_original',
                    width: 150,
                    filter: 'agNumberColumnFilter',
                    valueFormatter: (params) => formatMoney(params.value),
                    cellStyle: { textAlign: 'right' }
                },
                {
                    headerName: 'Monto Pendiente',
                    field: 'monto_pendiente',
                    width: 160,
                    filter: 'agNumberColumnFilter',
                    valueFormatter: (params) => formatMoney(params.value),
                    cellStyle: (params) => ({
                        textAlign: 'right',
                        fontWeight: '600',
                        color: params.value > 0 ? '#f87171' : '#4ade80'
                    })
                },
                {
                    headerName: 'Estado',
                    field: 'estado',
                    width: 120,
                    filter: true,
                    cellStyle: (params) => ({
                        color: params.value === 'pagada' ? '#4ade80' : '#fbbf24'
                    })
                },
                {
                    headerName: 'Proyecto',
                    field: 'proyecto_id',
                    width: 160,
                    filter: true,
                    valueFormatter: (params) => proyectosMap[params.value] || ''
                },
                {
                    headerName: 'Fecha',
                    field: 'fecha_deuda',
                    width: 120,
                    filter: 'agDateColumnFilter',
                    valueFormatter: (params) => {
                        if (!params.value) return '';
                        return new Date(params.value).toLocaleDateString('es-CO');
                    },
                    sort: 'desc'
                }
            ];
        } else if (dataSource === 'deudas_cajas') {
            return [
                {
                    headerName: 'Caja Deudora',
                    field: 'caja_deudora_id',
                    flex: 1,
                    minWidth: 160,
                    filter: true,
                    valueFormatter: (params) => cajasMap[params.value] || params.value || ''
                },
                {
                    headerName: 'Caja Acreedora',
                    field: 'caja_acreedora_id',
                    flex: 1,
                    minWidth: 160,
                    filter: true,
                    valueFormatter: (params) => cajasMap[params.value] || params.value || ''
                },
                {
                    headerName: 'Monto Original',
                    field: 'monto_original',
                    width: 150,
                    filter: 'agNumberColumnFilter',
                    valueFormatter: (params) => formatMoney(params.value),
                    cellStyle: { textAlign: 'right' }
                },
                {
                    headerName: 'Monto Pendiente',
                    field: 'monto_pendiente',
                    width: 160,
                    filter: 'agNumberColumnFilter',
                    valueFormatter: (params) => formatMoney(params.value),
                    cellStyle: (params) => ({
                        textAlign: 'right',
                        fontWeight: '600',
                        color: params.value > 0 ? '#f87171' : '#4ade80'
                    })
                },
                {
                    headerName: 'Estado',
                    field: 'estado',
                    width: 120,
                    filter: true,
                    cellStyle: (params) => ({
                        color: params.value === 'pagada' ? '#4ade80' : '#fbbf24'
                    })
                },
                {
                    headerName: 'Fecha Préstamo',
                    field: 'fecha_prestamo',
                    width: 140,
                    filter: 'agDateColumnFilter',
                    valueFormatter: (params) => {
                        if (!params.value) return '';
                        return new Date(params.value).toLocaleDateString('es-CO');
                    },
                    sort: 'desc'
                }
            ];
        }
        return [];
    }, [dataSource, cajasMap, proyectosMap, tercerosMap]);

    // Default column definitions
    const defaultColDef = useMemo(() => ({
        sortable: true,
        resizable: true,
        filter: true,
        floatingFilter: true,
    }), []);

    // Export to Excel
    const exportToExcel = useCallback(() => {
        const api = gridRef.current?.api;
        if (!api) return;

        // Get visible columns and displayed rows (respecting filters)
        const columns = api.getAllDisplayedColumns();
        const rows = [];

        // Header row
        const header = columns.map(col => api.getDisplayNameForColumn(col));
        rows.push(header);

        // Data rows
        api.forEachNodeAfterFilterAndSort((node) => {
            const row = columns.map(col => {
                const colDef = col.getColDef();
                const value = api.getValue(col, node);
                // Use formatted value for display
                if (colDef.valueFormatter) {
                    return colDef.valueFormatter({ value, data: node.data, node });
                }
                return value;
            });
            rows.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Auto-size columns
        const colWidths = header.map((h, i) => {
            let maxLen = h.length;
            rows.forEach(r => {
                const cellLen = String(r[i] || '').length;
                if (cellLen > maxLen) maxLen = cellLen;
            });
            return { wch: Math.min(maxLen + 2, 40) };
        });
        ws['!cols'] = colWidths;

        const wb = XLSX.utils.book_new();
        const sourceName = DATA_SOURCES.find(s => s.id === dataSource)?.label || 'Datos';
        XLSX.utils.book_append_sheet(wb, ws, sourceName);
        XLSX.writeFile(wb, `${sourceName}_${new Date().toISOString().split('T')[0]}.xlsx`);
    }, [dataSource]);

    // Export to CSV
    const exportToCSV = useCallback(() => {
        const api = gridRef.current?.api;
        if (!api) return;
        api.exportDataAsCsv({
            fileName: `${DATA_SOURCES.find(s => s.id === dataSource)?.label || 'Datos'}_${new Date().toISOString().split('T')[0]}.csv`,
            processCellCallback: (params) => {
                const colDef = params.column.getColDef();
                if (colDef.valueFormatter) {
                    return colDef.valueFormatter({ value: params.value, data: params.node?.data, node: params.node });
                }
                return params.value;
            }
        });
    }, [dataSource]);

    const currentSource = DATA_SOURCES.find(s => s.id === dataSource);

    return (
        <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
                {/* Data source selector */}
                <div className="relative">
                    <button
                        onClick={() => setShowSourceDropdown(!showSourceDropdown)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card text-white text-sm font-medium hover:bg-white/10 transition-colors"
                        style={{ border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        <Table2 size={16} className="text-gold" />
                        {currentSource?.label}
                        <ChevronDown size={14} className="text-gray-400" />
                    </button>
                    {showSourceDropdown && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowSourceDropdown(false)} />
                            <div className="absolute top-full left-0 mt-1 z-20 bg-secondary rounded-xl shadow-2xl overflow-hidden"
                                style={{ border: '1px solid rgba(255,255,255,0.1)', minWidth: '200px' }}>
                                {DATA_SOURCES.map(src => (
                                    <button
                                        key={src.id}
                                        onClick={() => { setDataSource(src.id); setShowSourceDropdown(false); }}
                                        className={`w-full text-left px-4 py-3 text-sm transition-colors ${src.id === dataSource
                                                ? 'text-gold bg-gold/10 font-medium'
                                                : 'text-gray-300 hover:bg-white/5'
                                            }`}
                                    >
                                        {src.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Row count */}
                <span className="text-sm text-gray-400">
                    {rowData.length} registros
                </span>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Export buttons */}
                <button
                    onClick={exportToExcel}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{
                        background: 'linear-gradient(135deg, rgba(34,139,34,0.2) 0%, rgba(34,139,34,0.08) 100%)',
                        border: '1px solid rgba(34,139,34,0.3)',
                        color: '#4ade80'
                    }}
                >
                    <FileSpreadsheet size={16} />
                    <span className="hidden sm:inline">Excel</span>
                </button>
                <button
                    onClick={exportToCSV}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
                    style={{
                        background: 'linear-gradient(135deg, rgba(96,165,250,0.2) 0%, rgba(96,165,250,0.08) 100%)',
                        border: '1px solid rgba(96,165,250,0.3)',
                        color: '#60a5fa'
                    }}
                >
                    <Download size={16} />
                    <span className="hidden sm:inline">CSV</span>
                </button>
            </div>

            {/* AG-Grid Table */}
            <div className="flex-1 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', minHeight: '400px' }}>
                <AgGridReact
                    ref={gridRef}
                    theme={darkTheme}
                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    animateRows={true}
                    pagination={true}
                    paginationPageSize={50}
                    paginationPageSizeSelector={[25, 50, 100, 500]}
                    suppressCellFocus={true}
                    enableCellTextSelection={true}
                    loading={loading}
                    overlayNoRowsTemplate='<span class="text-gray-400">No hay datos para mostrar</span>'
                    overlayLoadingTemplate='<span class="text-gold">Cargando datos...</span>'
                />
            </div>
        </div>
    );
}
