// ProjectDashboard component - Main dashboard with statistics and transaction management
import { useState, useEffect } from 'react';
import {
    TrendingUp,
    TrendingDown,
    Building2,
    FolderOpen,
    ArrowRightLeft,
    Clock,
    AlertCircle,
    Pencil,
    Trash2,
    ChevronRight,
    LayoutDashboard,
    DollarSign
} from 'lucide-react';
import { db } from '../services/db';
import syncService from '../services/syncService';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import ConfirmModal from './ConfirmModal';
import TransactionEditModal from './TransactionEditModal';
import ImagePreviewModal from './ImagePreviewModal';
import { Image as ImageIcon } from 'lucide-react';

export default function ProjectDashboard() {
    const [stats, setStats] = useState({
        totalBalance: 0,
        totalIngresos: 0,
        totalEgresos: 0,
        empresasBalance: [],
        gastosProyecto: [],
        deudasCajas: [],

        recentTransactions: [],
        categorias: []
    });
    const [loading, setLoading] = useState(true);
    const [showAllTransactions, setShowAllTransactions] = useState(false);
    const [allTransactions, setAllTransactions] = useState([]);

    // Edit/Delete state
    const [editingTransaction, setEditingTransaction] = useState(null);

    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);

    useEffect(() => {
        loadStats();
    }, []);

    async function loadStats() {
        try {
            const [transacciones, cajas, empresas, proyectos, categorias] = await Promise.all([
                db.transacciones.toArray(),
                db.cajas.toArray(),
                db.empresas.toArray(),
                db.proyectos.toArray(),
                db.categorias.toArray()
            ]);

            // Store all transactions for full view
            const sortedTransactions = transacciones
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            setAllTransactions(sortedTransactions);

            // Calculate totals
            const totalIngresos = transacciones
                .filter(t => t.tipo_movimiento === 'INGRESO')
                .reduce((sum, t) => sum + t.monto, 0);

            const totalEgresos = transacciones
                .filter(t => t.tipo_movimiento === 'EGRESO')
                .reduce((sum, t) => sum + t.monto, 0);

            const totalBalance = cajas.reduce((sum, c) => sum + (c.saldo_actual || 0), 0);

            // Balance by company
            const empresasMap = Object.fromEntries(empresas.map(e => [e.id, { ...e, balance: 0 }]));
            cajas.forEach(c => {
                if (empresasMap[c.empresa_id]) {
                    empresasMap[c.empresa_id].balance += c.saldo_actual || 0;
                }
            });
            const empresasBalance = Object.values(empresasMap)
                .filter(e => e.balance !== 0)
                .sort((a, b) => b.balance - a.balance);

            // Expenses by project
            const proyectosMap = Object.fromEntries(proyectos.map(p => [p.id, { ...p, gastos: 0 }]));
            transacciones
                .filter(t => t.tipo_movimiento === 'EGRESO' && t.proyecto_id)
                .forEach(t => {
                    if (proyectosMap[t.proyecto_id]) {
                        proyectosMap[t.proyecto_id].gastos += t.monto;
                    }
                });
            const gastosProyecto = Object.values(proyectosMap)
                .filter(p => p.gastos > 0)
                .sort((a, b) => b.gastos - a.gastos)
                .slice(0, 5);

            // Recent transactions (top 5)
            const recentTransactions = sortedTransactions.slice(0, 5);

            setStats({
                totalBalance,
                totalIngresos,
                totalEgresos,
                empresasBalance,
                gastosProyecto,
                deudasCajas: [], // Now handled by DeudaCajasPanel
                recentTransactions,
                categorias
            });
        } finally {
            setLoading(false);
        }
    }

    async function handleEditSave(updatedTransaction) {
        const original = editingTransaction;
        const now = new Date().toISOString();

        // Calculate balance adjustments
        // First, reverse the original transaction
        if (original.tipo_movimiento === 'INGRESO') {
            await updateCajaBalance(original.caja_origen_id, -original.monto);
        } else if (original.tipo_movimiento === 'EGRESO') {
            await updateCajaBalance(original.caja_origen_id, original.monto);
        } else if (original.tipo_movimiento === 'TRANSFERENCIA') {
            await updateCajaBalance(original.caja_origen_id, original.monto);
            await updateCajaBalance(original.caja_destino_id, -original.monto);
        }

        // Then apply the new transaction
        if (updatedTransaction.tipo_movimiento === 'INGRESO') {
            await updateCajaBalance(updatedTransaction.caja_origen_id, updatedTransaction.monto);
        } else if (updatedTransaction.tipo_movimiento === 'EGRESO') {
            await updateCajaBalance(updatedTransaction.caja_origen_id, -updatedTransaction.monto);
        } else if (updatedTransaction.tipo_movimiento === 'TRANSFERENCIA') {
            await updateCajaBalance(updatedTransaction.caja_origen_id, -updatedTransaction.monto);
            await updateCajaBalance(updatedTransaction.caja_destino_id, updatedTransaction.monto);
        }

        // Update the transaction
        const toUpdate = {
            ...updatedTransaction,
            updated_at: now
        };

        await db.transacciones.update(original.id, toUpdate);

        // Sync to Supabase
        if (isSupabaseConfigured()) {
            const { id, created_at, ...rest } = toUpdate;
            await supabase.from('transacciones').update(rest).eq('id', id);
        }

        setEditingTransaction(null);
        await loadStats();
    }

    async function handleDelete() {
        if (!deleteConfirm) return;

        const t = deleteConfirm;

        // Reverse the balance changes
        if (t.tipo_movimiento === 'INGRESO') {
            await updateCajaBalance(t.caja_origen_id, -t.monto);
        } else if (t.tipo_movimiento === 'EGRESO') {
            await updateCajaBalance(t.caja_origen_id, t.monto);
        } else if (t.tipo_movimiento === 'TRANSFERENCIA') {
            await updateCajaBalance(t.caja_origen_id, t.monto);
            await updateCajaBalance(t.caja_destino_id, -t.monto);
        }

        // Delete from local DB
        await db.transacciones.delete(t.id);

        // Delete from Supabase
        if (isSupabaseConfigured()) {
            await supabase.from('transacciones').delete().eq('id', t.id);
        }

        setDeleteConfirm(null);
        await loadStats();
    }

    async function updateCajaBalance(cajaId, amount) {
        if (!cajaId) return;
        const caja = await db.cajas.get(cajaId);
        if (caja) {
            const newBalance = (caja.saldo_actual || 0) + amount;
            await db.cajas.update(cajaId, { saldo_actual: newBalance });

            if (isSupabaseConfigured()) {
                await supabase.from('cajas').update({ saldo_actual: newBalance }).eq('id', cajaId);
            }
        }
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        // Parse as local date to avoid timezone offset
        const parts = dateStr.split('T')[0].split('-');
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short'
        });
    }

    function formatFullDate(dateStr) {
        if (!dateStr) return '';
        // Parse as local date to avoid timezone offset
        const parts = dateStr.split('T')[0].split('-');
        const date = new Date(parts[0], parts[1] - 1, parts[2]);
        return date.toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function getCategoryName(catId) {
        if (!catId) return '';
        // Check if it's a legacy string category
        if (!catId.includes('-')) return catId;
        const cat = stats.categorias.find(c => c.id === catId);
        return cat ? cat.nombre : catId;
    }

    // Transaction row component
    function TransactionRow({ t, showActions = false }) {
        return (
            <div className="flex items-center justify-between py-3.5 group"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${t.tipo_movimiento === 'INGRESO' ? 'bg-green-500/10 text-green-400' :
                        t.tipo_movimiento === 'EGRESO' ? 'bg-red-500/10 text-red-400' :
                            'bg-blue-500/10 text-blue-400'
                        }`}>
                        {t.tipo_movimiento === 'INGRESO' ? <TrendingUp size={16} /> :
                            t.tipo_movimiento === 'EGRESO' ? <TrendingDown size={16} /> :
                                <ArrowRightLeft size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white truncate">
                            {t.descripcion || getCategoryName(t.categoria) || t.tipo_movimiento}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(t.fecha || t.created_at)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-right">
                        <p className={`font-semibold text-sm ${t.tipo_movimiento === 'INGRESO' ? 'text-green' :
                            t.tipo_movimiento === 'EGRESO' ? 'text-red' : 'text-blue-400'
                            }`}>
                            {t.tipo_movimiento === 'INGRESO' ? '+' :
                                t.tipo_movimiento === 'EGRESO' ? '-' : '↔'}
                            {formatMoney(t.monto)}
                        </p>
                        {!t.sincronizado && (
                            <span className="text-xs text-amber-400 flex items-center gap-1 justify-end">
                                <AlertCircle size={10} />
                                Pendiente
                            </span>
                        )}
                    </div>
                    {showActions && (
                        <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => setEditingTransaction(t)}
                                className="p-2 text-gray-500 hover:text-gold transition-colors rounded-lg hover:bg-white/5"
                            >
                                <Pencil size={15} />
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(t)}
                                className="p-2 text-gray-500 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    )}
                    {t.soporte_url && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setPreviewImage({ url: t.soporte_url, title: t.descripcion }); }}
                            className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors rounded-lg hover:bg-white/5 ml-1"
                            title="Ver soporte"
                        >
                            <ImageIcon size={16} />
                        </button>
                    )}
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
            </div>
        );
    }

    // Full transactions view
    if (showAllTransactions) {
        return (
            <div className="space-y-5 animate-fade-in">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setShowAllTransactions(false)}
                        className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                    >
                        ← Volver
                    </button>
                    <h2 className="text-lg font-bold">Historial Completo</h2>
                </div>

                <div className="card">
                    {allTransactions.length > 0 ? (
                        <div>
                            {allTransactions.map((t) => (
                                <TransactionRow key={t.id} t={t} showActions={true} />
                            ))}
                        </div>
                    ) : (
                        <p className="empty-state">
                            No hay movimientos registrados
                        </p>
                    )}
                </div>

                {/* Edit Modal */}
                <TransactionEditModal
                    isOpen={!!editingTransaction}
                    transaction={editingTransaction}
                    onSave={handleEditSave}
                    onClose={() => setEditingTransaction(null)}
                />

                {/* Delete Confirmation */}
                <ConfirmModal
                    isOpen={!!deleteConfirm}
                    title="Eliminar movimiento"
                    message={`¿Estás seguro de eliminar este ${deleteConfirm?.tipo_movimiento?.toLowerCase() || 'movimiento'} de ${formatMoney(deleteConfirm?.monto)}? Esta acción revertirá los saldos afectados.`}
                    confirmText="Sí, eliminar"
                    cancelText="Cancelar"
                    type="danger"
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteConfirm(null)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <h2 className="section-title">
                <LayoutDashboard size={22} className="text-gold" />
                Dashboard
            </h2>

            {/* Summary stat cards */}
            <div className="dashboard-stats">
                <div className="card stat-card stat-blue">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-blue-500/12 flex items-center justify-center">
                            <DollarSign size={22} className="text-blue-400" />
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Saldo Total</span>
                    </div>
                    <p className={`text-2xl font-bold tracking-tight ${stats.totalBalance >= 0 ? 'text-green' : 'text-red'}`}>
                        {formatMoney(stats.totalBalance)}
                    </p>
                </div>

                <div className="card stat-card stat-green">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-green-500/12 flex items-center justify-center">
                            <TrendingUp size={22} className="text-green-400" />
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Ingresos</span>
                    </div>
                    <p className="text-2xl font-bold text-green tracking-tight">
                        {formatMoney(stats.totalIngresos)}
                    </p>
                </div>

                <div className="card stat-card stat-red">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-11 h-11 rounded-xl bg-red-500/12 flex items-center justify-center">
                            <TrendingDown size={22} className="text-red-400" />
                        </div>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Egresos</span>
                    </div>
                    <p className="text-2xl font-bold text-red tracking-tight">
                        {formatMoney(stats.totalEgresos)}
                    </p>
                </div>
            </div>

            {/* Two-panel layout for desktop */}
            <div className="two-panel-layout">
                {stats.empresasBalance.length > 0 && (
                    <div className="card">
                        <h3 className="font-semibold mb-5 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                                <Building2 size={17} className="text-gold" />
                            </div>
                            Saldo por Empresa
                        </h3>
                        <div className="space-y-3">
                            {stats.empresasBalance.map((empresa) => (
                                <div key={empresa.id} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-white/[0.03] transition-colors">
                                    <span className="text-sm text-gray-300">{empresa.nombre}</span>
                                    <span className={`font-bold text-sm ${empresa.balance >= 0 ? 'text-green' : 'text-red'}`}>
                                        {formatMoney(empresa.balance)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Expenses by project */}
                {stats.gastosProyecto.length > 0 && (
                    <div className="card">
                        <h3 className="font-semibold mb-5 flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                                <FolderOpen size={17} className="text-gold" />
                            </div>
                            Gastos por Proyecto
                        </h3>
                        <div className="space-y-4">
                            {stats.gastosProyecto.map((proyecto) => {
                                const maxGasto = stats.gastosProyecto[0]?.gastos || 1;
                                const percentage = (proyecto.gastos / maxGasto) * 100;

                                return (
                                    <div key={proyecto.id}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-gray-300 text-sm">{proyecto.nombre}</span>
                                            <span className="text-red font-semibold text-sm">
                                                {formatMoney(proyecto.gastos)}
                                            </span>
                                        </div>
                                        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-700 rounded-full"
                                                style={{ width: `${percentage}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Recent transactions */}
            <div className="card">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-semibold flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                            <Clock size={17} className="text-gold" />
                        </div>
                        Movimientos Recientes
                    </h3>
                    {allTransactions.length > 5 && (
                        <button
                            onClick={() => setShowAllTransactions(true)}
                            className="text-sm text-gold flex items-center gap-1 hover:underline font-medium"
                        >
                            Ver todos <ChevronRight size={16} />
                        </button>
                    )}
                </div>

                {stats.recentTransactions.length > 0 ? (
                    <div>
                        {stats.recentTransactions.map((t) => (
                            <TransactionRow key={t.id} t={t} showActions={true} />
                        ))}
                    </div>
                ) : (
                    <p className="empty-state">
                        No hay movimientos registrados
                    </p>
                )}
            </div>

            {/* Edit Modal */}
            <TransactionEditModal
                isOpen={!!editingTransaction}
                transaction={editingTransaction}
                onSave={handleEditSave}
                onClose={() => setEditingTransaction(null)}
            />

            {/* Delete Confirmation */}
            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="Eliminar movimiento"
                message={`¿Estás seguro de eliminar este ${deleteConfirm?.tipo_movimiento?.toLowerCase() || 'movimiento'} de ${formatMoney(deleteConfirm?.monto)}? Esta acción revertirá los saldos afectados.`}
                confirmText="Sí, eliminar"
                cancelText="Cancelar"
                type="danger"
                onConfirm={handleDelete}
                onCancel={() => setDeleteConfirm(null)}
            />

            {/* Image Preview Modal */}
            <ImagePreviewModal
                isOpen={!!previewImage}
                onClose={() => setPreviewImage(null)}
                imageUrl={previewImage?.url}
                title={previewImage?.title}
            />
        </div>
    );
}
