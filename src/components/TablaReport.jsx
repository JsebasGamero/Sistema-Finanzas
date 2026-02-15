// TablaReport - AG-Grid Excel-like table for reports
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { Download, FileSpreadsheet, Table2, ChevronDown, Filter, BarChart3, Wallet, Building2, FolderOpen, Users, FileText, ArrowLeftRight, Calendar, Tag, Landmark, User, FolderKanban, CheckCircle, Clock } from 'lucide-react';
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
    { id: 'transacciones', label: 'Transacciones', Icon: BarChart3 },
    { id: 'cajas', label: 'Cajas (Saldos)', Icon: Wallet },
    { id: 'empresas', label: 'Empresas', Icon: Building2 },
    { id: 'proyectos', label: 'Proyectos', Icon: FolderOpen },
    { id: 'terceros', label: 'Proveedores / Terceros', Icon: Users },
    { id: 'deudas_terceros', label: 'Deudas a Terceros', Icon: FileText },
    { id: 'deudas_cajas', label: 'Deudas entre Cajas', Icon: ArrowLeftRight },
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
    const [empresasMap, setEmpresasMap] = useState({});
    const [categoriasMap, setCategoriasMap] = useState({});

    // Load lookup data
    useEffect(() => {
        async function loadLookups() {
            const [cajas, proyectos, terceros, empresas, categorias] = await Promise.all([
                db.cajas.toArray(),
                db.proyectos.toArray(),
                db.terceros.toArray(),
                db.empresas.toArray(),
                db.categorias?.toArray().catch(() => []) || Promise.resolve([])
            ]);
            setCajasMap(Object.fromEntries(cajas.map(c => [c.id, c.nombre])));
            setProyectosMap(Object.fromEntries(proyectos.map(p => [p.id, p.nombre])));
            setTercerosMap(Object.fromEntries(terceros.map(t => [t.id, t.nombre])));
            setEmpresasMap(Object.fromEntries(empresas.map(e => [e.id, e.nombre])));
            setCategoriasMap(Object.fromEntries(categorias.map(c => [c.id, c.nombre])));
        }
        loadLookups();
    }, []);

    // Resolve category name (could be UUID or plain text)
    function getCategoryName(catId) {
        if (!catId) return '';
        if (categoriasMap[catId]) return categoriasMap[catId];
        if (!catId.includes('-')) return catId;
        return catId;
    }

    // Load data based on selected source
    useEffect(() => {
        async function loadData() {
            setLoading(true);
            try {
                let data = [];
                if (dataSource === 'transacciones') {
                    data = await db.transacciones.orderBy('created_at').reverse().toArray();
                    data = data.map(t => ({
                        ...t,
                        _caja_origen: cajasMap[t.caja_origen_id] || '',
                        _caja_destino: cajasMap[t.caja_destino_id] || '',
                        _proyecto: proyectosMap[t.proyecto_id] || '',
                        _tercero: tercerosMap[t.tercero_id] || '',
                        _categoria: getCategoryName(t.categoria),
                    }));
                } else if (dataSource === 'cajas') {
                    data = await db.cajas.toArray();
                    data = data.map(c => ({
                        ...c,
                        _empresa: empresasMap[c.empresa_id] || '',
                    }));
                } else if (dataSource === 'empresas') {
                    data = await db.empresas.toArray();
                } else if (dataSource === 'proyectos') {
                    data = await db.proyectos.toArray();
                    data = data.map(p => ({
                        ...p,
                        _empresa: empresasMap[p.empresa_id] || '',
                    }));
                } else if (dataSource === 'terceros') {
                    data = await db.terceros.toArray();
                } else if (dataSource === 'deudas_terceros') {
                    data = await db.deudas_terceros.toArray();
                    data = data.map(d => ({
                        ...d,
                        _tercero: tercerosMap[d.tercero_id] || '',
                        _proyecto: proyectosMap[d.proyecto_id] || '',
                        _empresa: empresasMap[d.empresa_id] || '',
                    }));
                } else if (dataSource === 'deudas_cajas') {
                    data = await db.deudas_cajas.toArray();
                    data = data.map(d => ({
                        ...d,
                        _caja_deudora: cajasMap[d.caja_deudora_id] || '',
                        _caja_acreedora: cajasMap[d.caja_acreedora_id] || '',
                    }));
                }
                setRowData(data);
            } catch (e) {
                console.error('Error loading data:', e);
                setRowData([]);
            }
            setLoading(false);
        }
        loadData();
    }, [dataSource, cajasMap, proyectosMap, tercerosMap, empresasMap, categoriasMap]);

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

    // Format date
    function formatDate(params) {
        if (!params.value) return '';
        const d = new Date(params.value);
        return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
                    valueFormatter: formatDate,
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
                    field: '_categoria',
                    width: 150,
                    filter: true
                },
                {
                    headerName: 'Proyecto',
                    field: '_proyecto',
                    width: 160,
                    filter: true,
                },
                {
                    headerName: 'Caja Origen',
                    field: '_caja_origen',
                    width: 150,
                    filter: true,
                },
                {
                    headerName: 'Caja Destino',
                    field: '_caja_destino',
                    width: 150,
                    filter: true,
                },
                {
                    headerName: 'Proveedor',
                    field: '_tercero',
                    width: 150,
                    filter: true,
                },
                {
                    headerName: 'Usuario',
                    field: 'usuario_nombre',
                    width: 130,
                    filter: true
                },
                {
                    headerName: 'Sync',
                    field: 'sincronizado',
                    width: 100,
                    filter: true,
                    valueFormatter: (params) => params.value ? 'Sí' : 'Pendiente'
                }
            ];
        } else if (dataSource === 'cajas') {
            return [
                { headerName: 'Nombre', field: 'nombre', flex: 1, minWidth: 160, filter: 'agTextColumnFilter' },
                { headerName: 'Tipo', field: 'tipo', width: 120, filter: true },
                { headerName: 'Empresa', field: '_empresa', width: 180, filter: true },
                {
                    headerName: 'Saldo Actual',
                    field: 'saldo_actual',
                    width: 160,
                    filter: 'agNumberColumnFilter',
                    valueFormatter: (params) => formatMoney(params.value),
                    cellStyle: (params) => ({
                        textAlign: 'right',
                        fontWeight: '600',
                        color: (params.value || 0) >= 0 ? '#4ade80' : '#f87171'
                    })
                },
                { headerName: 'Banco', field: 'banco_nombre', width: 150, filter: true },
                { headerName: 'Nro. Cuenta', field: 'numero_cuenta', width: 150, filter: 'agTextColumnFilter' },
                { headerName: 'Creado', field: 'created_at', width: 120, valueFormatter: formatDate },
            ];
        } else if (dataSource === 'empresas') {
            return [
                { headerName: 'Nombre', field: 'nombre', flex: 1, minWidth: 200, filter: 'agTextColumnFilter' },
                { headerName: 'NIT', field: 'nit', width: 150, filter: 'agTextColumnFilter' },
                { headerName: 'Dirección', field: 'direccion', width: 200, filter: 'agTextColumnFilter' },
                { headerName: 'Teléfono', field: 'telefono', width: 150, filter: 'agTextColumnFilter' },
                { headerName: 'Creado', field: 'created_at', width: 120, valueFormatter: formatDate },
            ];
        } else if (dataSource === 'proyectos') {
            return [
                { headerName: 'Nombre', field: 'nombre', flex: 1, minWidth: 200, filter: 'agTextColumnFilter' },
                { headerName: 'Empresa', field: '_empresa', width: 180, filter: true },
                {
                    headerName: 'Presupuesto',
                    field: 'presupuesto_estimado',
                    width: 160,
                    filter: 'agNumberColumnFilter',
                    valueFormatter: (params) => formatMoney(params.value),
                    cellStyle: { textAlign: 'right', fontWeight: '600' }
                },
                {
                    headerName: 'Estado',
                    field: 'estado',
                    width: 120,
                    filter: true,
                    cellStyle: (params) => ({
                        color: params.value === 'Activo' ? '#4ade80' : params.value === 'Finalizado' ? '#60a5fa' : '#fbbf24'
                    })
                },
                { headerName: 'Inicio', field: 'fecha_inicio', width: 120, valueFormatter: formatDate },
                { headerName: 'Fin', field: 'fecha_fin', width: 120, valueFormatter: formatDate },
                { headerName: 'Descripción', field: 'descripcion', width: 200, filter: 'agTextColumnFilter' },
            ];
        } else if (dataSource === 'terceros') {
            return [
                { headerName: 'Nombre', field: 'nombre', flex: 1, minWidth: 200, filter: 'agTextColumnFilter' },
                { headerName: 'Tipo', field: 'tipo', width: 130, filter: true },
                { headerName: 'NIT / Cédula', field: 'nit_cedula', width: 150, filter: 'agTextColumnFilter' },
                { headerName: 'Teléfono', field: 'telefono', width: 140, filter: 'agTextColumnFilter' },
                { headerName: 'Email', field: 'email', width: 180, filter: 'agTextColumnFilter' },
                { headerName: 'Dirección', field: 'direccion', width: 200, filter: 'agTextColumnFilter' },
            ];
        } else if (dataSource === 'deudas_terceros') {
            return [
                { headerName: 'Tercero', field: '_tercero', flex: 1, minWidth: 160, filter: true },
                { headerName: 'Descripción', field: 'descripcion', flex: 1, minWidth: 180, filter: 'agTextColumnFilter' },
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
                { headerName: 'Proyecto', field: '_proyecto', width: 160, filter: true },
                { headerName: 'Empresa', field: '_empresa', width: 160, filter: true },
                {
                    headerName: 'Fecha',
                    field: 'fecha_deuda',
                    width: 120,
                    valueFormatter: formatDate,
                    sort: 'desc'
                }
            ];
        } else if (dataSource === 'deudas_cajas') {
            return [
                { headerName: 'Caja Deudora', field: '_caja_deudora', flex: 1, minWidth: 160, filter: true },
                { headerName: 'Caja Acreedora', field: '_caja_acreedora', flex: 1, minWidth: 160, filter: true },
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
                    valueFormatter: formatDate,
                    sort: 'desc'
                }
            ];
        }
        return [];
    }, [dataSource, cajasMap, proyectosMap, tercerosMap, empresasMap, categoriasMap]);

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

        const columns = api.getAllDisplayedColumns();
        const rows = [];
        const header = columns.map(col => api.getDisplayNameForColumn(col));
        rows.push(header);

        api.forEachNodeAfterFilterAndSort((node) => {
            const row = columns.map(col => {
                const colDef = col.getColDef();
                const value = api.getValue(col, node);
                if (colDef.valueFormatter) {
                    return colDef.valueFormatter({ value, data: node.data, node });
                }
                return value;
            });
            rows.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
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
        XLSX.utils.book_append_sheet(wb, ws, sourceName.substring(0, 31));
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
    const CurrentIcon = currentSource?.Icon || Table2;

    return (
        <div>
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
                        <CurrentIcon size={14} className="text-gray-400" />
                        {currentSource?.label}
                        <ChevronDown size={14} className="text-gray-400" />
                    </button>
                    {showSourceDropdown && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowSourceDropdown(false)} />
                            <div className="absolute top-full left-0 mt-1 z-20 bg-secondary rounded-xl shadow-2xl overflow-hidden"
                                style={{ border: '1px solid rgba(255,255,255,0.1)', minWidth: '240px' }}>
                                {DATA_SOURCES.map(src => {
                                    const SrcIcon = src.Icon;
                                    return (
                                        <button
                                            key={src.id}
                                            onClick={() => { setDataSource(src.id); setShowSourceDropdown(false); }}
                                            className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center gap-3 ${src.id === dataSource
                                                ? 'text-gold bg-gold/10 font-medium'
                                                : 'text-gray-300 hover:bg-white/5'
                                                }`}
                                        >
                                            <SrcIcon size={16} />
                                            {src.label}
                                        </button>
                                    );
                                })}
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

            {/* Tip bar */}
            <div className="text-xs text-gray-500 mb-2 flex items-center gap-2">
                <Filter size={12} />
                Usa los filtros en cada columna para buscar. Combina filtros de fechas, montos, categorías, proyectos y cajas.
            </div>

            {/* AG-Grid Table - using autoHeight so it sizes based on rows */}
            <div style={{ width: '100%', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <AgGridReact
                    ref={gridRef}
                    theme={darkTheme}
                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={defaultColDef}
                    animateRows={true}
                    pagination={true}
                    paginationPageSize={25}
                    paginationPageSizeSelector={[25, 50, 100, 500]}
                    suppressCellFocus={true}
                    enableCellTextSelection={true}
                    loading={loading}
                    domLayout='autoHeight'
                    overlayNoRowsTemplate='<span style="color: #9ca3af; font-size: 14px;">No hay datos para mostrar</span>'
                    overlayLoadingTemplate='<span style="color: #f5a623; font-size: 14px;">Cargando datos...</span>'
                />
            </div>
        </div>
    );
}
