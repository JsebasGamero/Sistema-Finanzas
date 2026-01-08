// ReportsPanel - Comprehensive reports and analytics
import { useState, useEffect, useMemo } from 'react';
import {
    BarChart3,
    Search,
    Filter,
    Calendar,
    Download,
    Users,
    Building2,
    Wallet,
    FolderOpen,
    ArrowDownLeft,
    ArrowUpRight,
    ArrowLeftRight,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    FileSpreadsheet,
    PieChart,
    FileText
} from 'lucide-react';
import { db } from '../services/db';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart as RechartsPie, Pie, Cell, Legend,
    AreaChart, Area
} from 'recharts';

// Report types configuration
const REPORT_TYPES = [
    { id: 'movimientos', name: 'Movimientos', icon: FileSpreadsheet },
    { id: 'proveedores', name: 'Proveedores', icon: Users },
    { id: 'cajas', name: 'Saldo Cajas', icon: Wallet },
    { id: 'proyectos', name: 'Por Proyecto', icon: FolderOpen },
    { id: 'resumen', name: 'Resumen', icon: PieChart }
];

export default function ReportsPanel() {
    const [activeReport, setActiveReport] = useState('movimientos');
    const [loading, setLoading] = useState(true);

    // Data
    const [transacciones, setTransacciones] = useState([]);
    const [terceros, setTerceros] = useState([]);
    const [cajas, setCajas] = useState([]);
    const [proyectos, setProyectos] = useState([]);
    const [empresas, setEmpresas] = useState([]);

    // Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterCaja, setFilterCaja] = useState('');
    const [filterProyecto, setFilterProyecto] = useState('');
    const [filterTercero, setFilterTercero] = useState('');
    const [filterEmpresa, setFilterEmpresa] = useState('');
    const [showFilters, setShowFilters] = useState(false);

    // Sorting
    const [sortField, setSortField] = useState('fecha');
    const [sortDirection, setSortDirection] = useState('desc');

    useEffect(() => {
        loadAllData();
    }, []);

    async function loadAllData() {
        setLoading(true);
        try {
            const [trans, terc, caj, proy, emp] = await Promise.all([
                db.transacciones.toArray(),
                db.terceros.toArray(),
                db.cajas.toArray(),
                db.proyectos.toArray(),
                db.empresas.toArray()
            ]);
            setTransacciones(trans);
            setTerceros(terc);
            setCajas(caj);
            setProyectos(proy);
            setEmpresas(emp);
        } finally {
            setLoading(false);
        }
    }

    // Helper functions
    function formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(amount || 0);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('T')[0].split('-');
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function getCajaName(id) {
        return cajas.find(c => c.id === id)?.nombre || '-';
    }

    function getTerceroName(id) {
        return terceros.find(t => t.id === id)?.nombre || '-';
    }

    function getProyectoName(id) {
        return proyectos.find(p => p.id === id)?.nombre || '-';
    }

    function getEmpresaName(id) {
        return empresas.find(e => e.id === id)?.nombre || '-';
    }

    // Filter transactions
    const filteredTransactions = useMemo(() => {
        let filtered = [...transacciones];

        // Search
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(t =>
                t.descripcion?.toLowerCase().includes(term) ||
                t.categoria?.toLowerCase().includes(term) ||
                getCajaName(t.caja_origen_id).toLowerCase().includes(term) ||
                getTerceroName(t.tercero_id).toLowerCase().includes(term)
            );
        }

        // Date range
        if (dateFrom) {
            filtered = filtered.filter(t => t.fecha >= dateFrom);
        }
        if (dateTo) {
            filtered = filtered.filter(t => t.fecha <= dateTo);
        }

        // Type
        if (filterTipo) {
            filtered = filtered.filter(t => t.tipo_movimiento === filterTipo);
        }

        // Caja
        if (filterCaja) {
            filtered = filtered.filter(t =>
                t.caja_origen_id === filterCaja || t.caja_destino_id === filterCaja
            );
        }

        // Proyecto
        if (filterProyecto) {
            filtered = filtered.filter(t => t.proyecto_id === filterProyecto);
        }

        // Tercero
        if (filterTercero) {
            filtered = filtered.filter(t => t.tercero_id === filterTercero);
        }

        // Sort
        filtered.sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            if (sortField === 'monto') {
                aVal = parseFloat(aVal) || 0;
                bVal = parseFloat(bVal) || 0;
            }
            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            }
            return aVal < bVal ? 1 : -1;
        });

        return filtered;
    }, [transacciones, searchTerm, dateFrom, dateTo, filterTipo, filterCaja, filterProyecto, filterTercero, sortField, sortDirection]);

    // Calculate provider balances
    const providerBalances = useMemo(() => {
        const balances = {};

        transacciones
            .filter(t => t.tercero_id && t.tipo_movimiento === 'EGRESO')
            .forEach(t => {
                if (!balances[t.tercero_id]) {
                    balances[t.tercero_id] = {
                        id: t.tercero_id,
                        total: 0,
                        count: 0,
                        transactions: []
                    };
                }
                balances[t.tercero_id].total += t.monto;
                balances[t.tercero_id].count++;
                balances[t.tercero_id].transactions.push(t);
            });

        return Object.values(balances)
            .map(b => ({
                ...b,
                tercero: terceros.find(t => t.id === b.id)
            }))
            .filter(b => b.tercero)
            .sort((a, b) => b.total - a.total);
    }, [transacciones, terceros]);

    // Calculate project expenses
    const projectExpenses = useMemo(() => {
        const expenses = {};

        transacciones
            .filter(t => t.proyecto_id && t.tipo_movimiento === 'EGRESO')
            .forEach(t => {
                if (!expenses[t.proyecto_id]) {
                    expenses[t.proyecto_id] = {
                        id: t.proyecto_id,
                        total: 0,
                        count: 0,
                        byCategory: {}
                    };
                }
                expenses[t.proyecto_id].total += t.monto;
                expenses[t.proyecto_id].count++;

                const cat = t.categoria || 'Sin categoría';
                expenses[t.proyecto_id].byCategory[cat] =
                    (expenses[t.proyecto_id].byCategory[cat] || 0) + t.monto;
            });

        return Object.values(expenses)
            .map(e => ({
                ...e,
                proyecto: proyectos.find(p => p.id === e.id)
            }))
            .filter(e => e.proyecto)
            .sort((a, b) => b.total - a.total);
    }, [transacciones, proyectos]);

    // Calculate summary stats
    const summaryStats = useMemo(() => {
        const totalIngresos = transacciones
            .filter(t => t.tipo_movimiento === 'INGRESO')
            .reduce((sum, t) => sum + t.monto, 0);

        const totalEgresos = transacciones
            .filter(t => t.tipo_movimiento === 'EGRESO')
            .reduce((sum, t) => sum + t.monto, 0);

        const totalTransferencias = transacciones
            .filter(t => t.tipo_movimiento === 'TRANSFERENCIA')
            .reduce((sum, t) => sum + t.monto, 0);

        const saldoTotal = cajas.reduce((sum, c) => sum + (c.saldo_actual || 0), 0);

        const byCategory = {};
        transacciones
            .filter(t => t.tipo_movimiento === 'EGRESO')
            .forEach(t => {
                const cat = t.categoria || 'Sin categoría';
                byCategory[cat] = (byCategory[cat] || 0) + t.monto;
            });

        const topCategories = Object.entries(byCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return {
            totalIngresos,
            totalEgresos,
            totalTransferencias,
            saldoTotal,
            balance: totalIngresos - totalEgresos,
            transactionCount: transacciones.length,
            topCategories
        };
    }, [transacciones, cajas]);

    // Export to PDF
    function exportToPDF() {
        const doc = new jsPDF();
        const today = new Date().toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        // Header
        doc.setFontSize(20);
        doc.setTextColor(251, 191, 36); // Gold color
        doc.text('FinanzasObra', 14, 20);

        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text(`Reporte de Movimientos`, 14, 28);
        doc.text(`Generado: ${today}`, 14, 35);

        // Summary
        const totalIngresos = filteredTransactions
            .filter(t => t.tipo_movimiento === 'INGRESO')
            .reduce((sum, t) => sum + t.monto, 0);
        const totalEgresos = filteredTransactions
            .filter(t => t.tipo_movimiento === 'EGRESO')
            .reduce((sum, t) => sum + t.monto, 0);

        doc.setFontSize(10);
        doc.setTextColor(34, 197, 94); // Green
        doc.text(`Total Ingresos: ${formatMoney(totalIngresos)}`, 14, 45);
        doc.setTextColor(239, 68, 68); // Red
        doc.text(`Total Egresos: ${formatMoney(totalEgresos)}`, 14, 52);
        doc.setTextColor(59, 130, 246); // Blue
        doc.text(`Balance: ${formatMoney(totalIngresos - totalEgresos)}`, 14, 59);
        doc.text(`Movimientos: ${filteredTransactions.length}`, 120, 45);

        // Table
        const tableData = filteredTransactions.map(t => [
            t.fecha?.split('T')[0] || '',
            t.tipo_movimiento,
            formatMoney(t.monto),
            t.categoria || '-',
            getCajaName(t.caja_origen_id),
            getTerceroName(t.tercero_id)
        ]);

        autoTable(doc, {
            startY: 65,
            head: [['Fecha', 'Tipo', 'Monto', 'Categoría', 'Caja', 'Tercero']],
            body: tableData,
            headStyles: {
                fillColor: [251, 191, 36],
                textColor: [0, 0, 0],
                fontStyle: 'bold'
            },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            styles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 25 },
                1: { cellWidth: 28 },
                2: { cellWidth: 30, halign: 'right' },
                3: { cellWidth: 30 },
                4: { cellWidth: 35 },
                5: { cellWidth: 35 }
            }
        });

        // Footer
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `Página ${i} de ${pageCount} - FinanzasObra`,
                doc.internal.pageSize.width / 2,
                doc.internal.pageSize.height - 10,
                { align: 'center' }
            );
        }

        doc.save(`reporte_${new Date().toISOString().split('T')[0]}.pdf`);
    }

    function handleSort(field) {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    }

    function clearFilters() {
        setSearchTerm('');
        setDateFrom('');
        setDateTo('');
        setFilterTipo('');
        setFilterCaja('');
        setFilterProyecto('');
        setFilterTercero('');
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <BarChart3 size={22} className="text-gold" />
                    Reportes
                </h2>
                <button
                    onClick={exportToPDF}
                    className="flex items-center gap-2 bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium"
                >
                    <FileText size={16} />
                    Exportar PDF
                </button>
            </div>

            {/* Report Type Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {REPORT_TYPES.map(report => {
                    const Icon = report.icon;
                    const isActive = activeReport === report.id;
                    return (
                        <button
                            key={report.id}
                            onClick={() => setActiveReport(report.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap text-sm font-medium transition-colors ${isActive
                                ? 'bg-gold text-white'
                                : 'bg-card text-gray-400 hover:text-white'
                                }`}
                        >
                            <Icon size={16} />
                            {report.name}
                        </button>
                    );
                })}
            </div>

            {/* Search and Filters */}
            <div className="space-y-3">
                <div className="flex gap-2">
                    <div className="relative flex-1">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por descripción, categoría, caja..."
                            className="input-field"
                            style={{ paddingLeft: '40px' }}
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${showFilters ? 'bg-gold text-white' : 'bg-card text-gray-400'
                            }`}
                    >
                        <Filter size={18} />
                        Filtros
                    </button>
                </div>

                {showFilters && (
                    <div className="card space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {/* Date From */}
                            <div>
                                <label className="label">Desde</label>
                                <input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="input-field"
                                />
                            </div>

                            {/* Date To */}
                            <div>
                                <label className="label">Hasta</label>
                                <input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="input-field"
                                />
                            </div>

                            {/* Type */}
                            <div>
                                <label className="label">Tipo</label>
                                <select
                                    value={filterTipo}
                                    onChange={(e) => setFilterTipo(e.target.value)}
                                    className="input-field"
                                >
                                    <option value="">Todos</option>
                                    <option value="INGRESO">Ingresos</option>
                                    <option value="EGRESO">Egresos</option>
                                    <option value="TRANSFERENCIA">Transferencias</option>
                                </select>
                            </div>

                            {/* Caja */}
                            <div>
                                <label className="label">Caja</label>
                                <select
                                    value={filterCaja}
                                    onChange={(e) => setFilterCaja(e.target.value)}
                                    className="input-field"
                                >
                                    <option value="">Todas</option>
                                    {cajas.map(c => (
                                        <option key={c.id} value={c.id}>{c.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Proyecto */}
                            <div>
                                <label className="label">Proyecto</label>
                                <select
                                    value={filterProyecto}
                                    onChange={(e) => setFilterProyecto(e.target.value)}
                                    className="input-field"
                                >
                                    <option value="">Todos</option>
                                    {proyectos.map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Tercero */}
                            <div>
                                <label className="label">Proveedor</label>
                                <select
                                    value={filterTercero}
                                    onChange={(e) => setFilterTercero(e.target.value)}
                                    className="input-field"
                                >
                                    <option value="">Todos</option>
                                    {terceros.map(t => (
                                        <option key={t.id} value={t.id}>{t.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <button
                            onClick={clearFilters}
                            className="text-sm text-gold hover:underline"
                        >
                            Limpiar filtros
                        </button>
                    </div>
                )}
            </div>

            {/* Active Report Content */}
            {activeReport === 'movimientos' && (
                <MovimientosReport
                    transactions={filteredTransactions}
                    getCajaName={getCajaName}
                    getTerceroName={getTerceroName}
                    getProyectoName={getProyectoName}
                    formatMoney={formatMoney}
                    formatDate={formatDate}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                />
            )}

            {activeReport === 'proveedores' && (
                <ProveedoresReport
                    providerBalances={providerBalances}
                    formatMoney={formatMoney}
                />
            )}

            {activeReport === 'cajas' && (
                <CajasReport
                    cajas={cajas}
                    empresas={empresas}
                    formatMoney={formatMoney}
                    getEmpresaName={getEmpresaName}
                />
            )}

            {activeReport === 'proyectos' && (
                <ProyectosReport
                    projectExpenses={projectExpenses}
                    formatMoney={formatMoney}
                />
            )}

            {activeReport === 'resumen' && (
                <ResumenReport
                    stats={summaryStats}
                    formatMoney={formatMoney}
                    transacciones={transacciones}
                />
            )}
        </div>
    );
}

// Movimientos Report Component
function MovimientosReport({ transactions, getCajaName, getTerceroName, getProyectoName, formatMoney, formatDate, sortField, sortDirection, onSort }) {
    const SortIcon = sortDirection === 'asc' ? ChevronUp : ChevronDown;

    return (
        <div className="card overflow-hidden">
            <div className="text-sm text-gray-400 mb-3">
                {transactions.length} movimiento{transactions.length !== 1 ? 's' : ''} encontrado{transactions.length !== 1 ? 's' : ''}
            </div>

            {transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    No se encontraron movimientos con los filtros aplicados
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th
                                    className="text-left py-2 px-2 cursor-pointer hover:text-gold"
                                    onClick={() => onSort('fecha')}
                                >
                                    <span className="flex items-center gap-1">
                                        Fecha
                                        {sortField === 'fecha' && <SortIcon size={14} />}
                                    </span>
                                </th>
                                <th className="text-left py-2 px-2">Tipo</th>
                                <th
                                    className="text-right py-2 px-2 cursor-pointer hover:text-gold"
                                    onClick={() => onSort('monto')}
                                >
                                    <span className="flex items-center justify-end gap-1">
                                        Monto
                                        {sortField === 'monto' && <SortIcon size={14} />}
                                    </span>
                                </th>
                                <th className="text-left py-2 px-2 hidden sm:table-cell">Categoría</th>
                                <th className="text-left py-2 px-2 hidden md:table-cell">Caja</th>
                                <th className="text-left py-2 px-2 hidden lg:table-cell">Tercero</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((t) => (
                                <tr key={t.id} className="border-b border-white/5 hover:bg-white/5">
                                    <td className="py-2 px-2 text-gray-300">{formatDate(t.fecha)}</td>
                                    <td className="py-2 px-2">
                                        <span className={`flex items-center gap-1 ${t.tipo_movimiento === 'INGRESO' ? 'text-green-400' :
                                            t.tipo_movimiento === 'EGRESO' ? 'text-red-400' : 'text-blue-400'
                                            }`}>
                                            {t.tipo_movimiento === 'INGRESO' && <ArrowDownLeft size={14} />}
                                            {t.tipo_movimiento === 'EGRESO' && <ArrowUpRight size={14} />}
                                            {t.tipo_movimiento === 'TRANSFERENCIA' && <ArrowLeftRight size={14} />}
                                            <span className="hidden sm:inline">{t.tipo_movimiento}</span>
                                        </span>
                                    </td>
                                    <td className={`py-2 px-2 text-right font-medium ${t.tipo_movimiento === 'INGRESO' ? 'text-green-400' :
                                        t.tipo_movimiento === 'EGRESO' ? 'text-red-400' : 'text-blue-400'
                                        }`}>
                                        {formatMoney(t.monto)}
                                    </td>
                                    <td className="py-2 px-2 text-gray-400 hidden sm:table-cell">{t.categoria || '-'}</td>
                                    <td className="py-2 px-2 text-gray-400 hidden md:table-cell">{getCajaName(t.caja_origen_id)}</td>
                                    <td className="py-2 px-2 text-gray-400 hidden lg:table-cell">{getTerceroName(t.tercero_id)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// Proveedores Report Component
function ProveedoresReport({ providerBalances, formatMoney }) {
    const [expandedId, setExpandedId] = useState(null);

    return (
        <div className="space-y-4">
            <div className="card bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-amber-400">
                    <Users size={18} />
                    Pagos a Proveedores / Beneficiarios
                </h3>
                <p className="text-sm text-gray-400">
                    Total de pagos realizados a cada proveedor o beneficiario
                </p>
            </div>

            {providerBalances.length === 0 ? (
                <div className="card text-center py-8 text-gray-500">
                    No hay pagos registrados a proveedores
                </div>
            ) : (
                <div className="space-y-2">
                    {providerBalances.map((item) => (
                        <div key={item.id} className="card">
                            <button
                                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                className="w-full flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-amber-500/20">
                                        <Users size={18} className="text-amber-400" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="font-medium text-white">{item.tercero.nombre}</h4>
                                        <p className="text-sm text-gray-500">
                                            {item.tercero.tipo} • {item.count} pago{item.count !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-red-400">{formatMoney(item.total)}</span>
                                    {expandedId === item.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </div>
                            </button>

                            {expandedId === item.id && (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <p className="text-xs text-gray-500 mb-2">Últimos pagos:</p>
                                    <div className="space-y-1">
                                        {item.transactions.slice(0, 5).map((t, idx) => (
                                            <div key={idx} className="flex justify-between text-sm">
                                                <span className="text-gray-400">{t.categoria || 'Sin categoría'}</span>
                                                <span className="text-red-400">{formatMoney(t.monto)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Cajas Report Component
function CajasReport({ cajas, empresas, formatMoney, getEmpresaName }) {
    const totalPositivo = cajas.filter(c => c.saldo_actual > 0).reduce((s, c) => s + c.saldo_actual, 0);
    const totalNegativo = cajas.filter(c => c.saldo_actual < 0).reduce((s, c) => s + c.saldo_actual, 0);

    // Group by empresa
    const byEmpresa = {};
    cajas.forEach(c => {
        const empId = c.empresa_id || 'sin_empresa';
        if (!byEmpresa[empId]) {
            byEmpresa[empId] = { cajas: [], total: 0 };
        }
        byEmpresa[empId].cajas.push(c);
        byEmpresa[empId].total += c.saldo_actual || 0;
    });

    return (
        <div className="space-y-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-3">
                <div className="card bg-green-500/10 border-green-500/30">
                    <div className="flex items-center gap-2 text-green-400 mb-1">
                        <TrendingUp size={18} />
                        <span className="text-sm">Saldo Positivo</span>
                    </div>
                    <p className="text-xl font-bold text-green-400">{formatMoney(totalPositivo)}</p>
                </div>
                <div className="card bg-red-500/10 border-red-500/30">
                    <div className="flex items-center gap-2 text-red-400 mb-1">
                        <TrendingDown size={18} />
                        <span className="text-sm">Saldo Negativo</span>
                    </div>
                    <p className="text-xl font-bold text-red-400">{formatMoney(totalNegativo)}</p>
                </div>
            </div>

            {/* By Empresa */}
            {Object.entries(byEmpresa).map(([empId, data]) => (
                <div key={empId} className="card">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Building2 size={18} className="text-gold" />
                            <h4 className="font-semibold">
                                {empId === 'sin_empresa' ? 'Sin Empresa' : getEmpresaName(empId)}
                            </h4>
                        </div>
                        <span className={`font-bold ${data.total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatMoney(data.total)}
                        </span>
                    </div>
                    <div className="space-y-2">
                        {data.cajas.map(caja => (
                            <div key={caja.id} className="flex items-center justify-between py-2 border-t border-white/5">
                                <div className="flex items-center gap-2">
                                    <Wallet size={14} className="text-gray-500" />
                                    <span className="text-gray-300">{caja.nombre}</span>
                                    <span className="text-xs bg-card px-2 py-0.5 rounded text-gray-500">{caja.tipo}</span>
                                </div>
                                <span className={`font-medium ${caja.saldo_actual >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatMoney(caja.saldo_actual)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

// Proyectos Report Component
function ProyectosReport({ projectExpenses, formatMoney }) {
    const [expandedId, setExpandedId] = useState(null);

    return (
        <div className="space-y-4">
            <div className="card bg-gradient-to-r from-blue-500/10 to-purple-500/10 border-blue-500/30">
                <h3 className="font-semibold mb-2 flex items-center gap-2 text-blue-400">
                    <FolderOpen size={18} />
                    Gastos por Proyecto / Obra
                </h3>
                <p className="text-sm text-gray-400">
                    Desglose de egresos por cada proyecto con categorías
                </p>
            </div>

            {projectExpenses.length === 0 ? (
                <div className="card text-center py-8 text-gray-500">
                    No hay gastos registrados en proyectos
                </div>
            ) : (
                <div className="space-y-2">
                    {projectExpenses.map((item) => (
                        <div key={item.id} className="card">
                            <button
                                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                                className="w-full flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-blue-500/20">
                                        <FolderOpen size={18} className="text-blue-400" />
                                    </div>
                                    <div className="text-left">
                                        <h4 className="font-medium text-white">{item.proyecto.nombre}</h4>
                                        <p className="text-sm text-gray-500">
                                            {item.proyecto.estado} • {item.count} gasto{item.count !== 1 ? 's' : ''}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-red-400">{formatMoney(item.total)}</span>
                                    {expandedId === item.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </div>
                            </button>

                            {expandedId === item.id && (
                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <p className="text-xs text-gray-500 mb-2">Por categoría:</p>
                                    <div className="space-y-1">
                                        {Object.entries(item.byCategory)
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([cat, amount], idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-gray-400">{cat}</span>
                                                    <span className="text-red-400">{formatMoney(amount)}</span>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Resumen Report Component with Charts
function ResumenReport({ stats, formatMoney, transacciones }) {
    // Colors for pie chart
    const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];

    // Prepare data for pie chart (top categories)
    const pieData = stats.topCategories.map(([name, value]) => ({
        name: name.length > 12 ? name.substring(0, 12) + '...' : name,
        value
    }));

    // Prepare monthly data for bar chart
    const monthlyData = useMemo(() => {
        const months = {};
        transacciones.forEach(t => {
            const date = t.fecha?.split('T')[0];
            if (!date) return;
            const month = date.substring(0, 7); // YYYY-MM
            if (!months[month]) {
                months[month] = { month, ingresos: 0, egresos: 0 };
            }
            if (t.tipo_movimiento === 'INGRESO') {
                months[month].ingresos += t.monto;
            } else if (t.tipo_movimiento === 'EGRESO') {
                months[month].egresos += t.monto;
            }
        });

        return Object.values(months)
            .sort((a, b) => a.month.localeCompare(b.month))
            .slice(-6) // Last 6 months
            .map(m => ({
                ...m,
                name: new Date(m.month + '-01').toLocaleDateString('es-CO', { month: 'short' })
            }));
    }, [transacciones]);

    // Prepare trend data for area chart
    const trendData = useMemo(() => {
        let balance = 0;
        const sorted = [...transacciones]
            .filter(t => t.fecha)
            .sort((a, b) => a.fecha.localeCompare(b.fecha));

        const data = [];
        sorted.forEach(t => {
            if (t.tipo_movimiento === 'INGRESO') balance += t.monto;
            else if (t.tipo_movimiento === 'EGRESO') balance -= t.monto;

            const date = t.fecha.split('T')[0];
            const existing = data.find(d => d.date === date);
            if (existing) {
                existing.balance = balance;
            } else {
                data.push({ date, balance, name: date.substring(5) });
            }
        });

        return data.slice(-30); // Last 30 data points
    }, [transacciones]);

    const formatTooltip = (value) => formatMoney(value);

    return (
        <div className="space-y-4">
            {/* Main Stats */}
            <div className="grid grid-cols-2 gap-3">
                <div className="card">
                    <div className="flex items-center gap-2 text-gray-400 mb-1">
                        <ArrowDownLeft size={16} className="text-green-400" />
                        <span className="text-sm">Total Ingresos</span>
                    </div>
                    <p className="text-xl font-bold text-green-400">{formatMoney(stats.totalIngresos)}</p>
                </div>
                <div className="card">
                    <div className="flex items-center gap-2 text-gray-400 mb-1">
                        <ArrowUpRight size={16} className="text-red-400" />
                        <span className="text-sm">Total Egresos</span>
                    </div>
                    <p className="text-xl font-bold text-red-400">{formatMoney(stats.totalEgresos)}</p>
                </div>
            </div>

            {/* Balance Card */}
            <div className={`card ${stats.balance >= 0 ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="text-center">
                    <p className="text-sm text-gray-400 mb-1">Balance (Ingresos - Egresos)</p>
                    <p className={`text-3xl font-bold ${stats.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatMoney(stats.balance)}
                    </p>
                </div>
            </div>

            {/* Bar Chart - Ingresos vs Egresos */}
            {monthlyData.length > 0 && (
                <div className="card">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <BarChart3 size={18} className="text-gold" />
                        Ingresos vs Egresos por Mes
                    </h4>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000000).toFixed(0)}M`} />
                                <Tooltip
                                    formatter={formatTooltip}
                                    contentStyle={{ background: '#1e293b', border: '1px solid #374151', borderRadius: '8px' }}
                                    labelStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="ingresos" name="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="egresos" name="Egresos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Pie Chart - Categories */}
            {pieData.length > 0 && (
                <div className="card">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <PieChart size={18} className="text-gold" />
                        Egresos por Categoría
                    </h4>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <RechartsPie>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    labelLine={{ stroke: '#6b7280' }}
                                >
                                    {pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={formatTooltip} contentStyle={{ background: '#1e293b', border: '1px solid #374151', borderRadius: '8px' }} />
                            </RechartsPie>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Area Chart - Balance Trend */}
            {trendData.length > 0 && (
                <div className="card">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                        <TrendingUp size={18} className="text-gold" />
                        Tendencia del Balance
                    </h4>
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
                                <Tooltip formatter={formatTooltip} contentStyle={{ background: '#1e293b', border: '1px solid #374151', borderRadius: '8px' }} />
                                <defs>
                                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Area
                                    type="monotone"
                                    dataKey="balance"
                                    stroke="#fbbf24"
                                    fillOpacity={1}
                                    fill="url(#colorBalance)"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Stats Summary */}
            <div className="card">
                <div className="flex items-center justify-between">
                    <span className="text-gray-400">Total de movimientos</span>
                    <span className="text-xl font-bold text-white">{stats.transactionCount}</span>
                </div>
            </div>
        </div>
    );
}
