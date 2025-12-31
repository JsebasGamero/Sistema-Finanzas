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
    ChevronRight
} from 'lucide-react';
import { db } from '../services/db';
import syncService from '../services/syncService';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import ConfirmModal from './ConfirmModal';
import TransactionEditModal from './TransactionEditModal';

export default function ProjectDashboard() {
    const [stats, setStats] = useState({
        totalBalance: 0,
        totalIngresos: 0,
        totalEgresos: 0,
        empresasBalance: [],
        gastosProyecto: [],
        deudasCajas: [],
        recentTransactions: []
    });
    const [loading, setLoading] = useState(true);
    const [showAllTransactions, setShowAllTransactions] = useState(false);
    const [allTransactions, setAllTransactions] = useState([]);

    // Edit/Delete state
    const [editingTransaction, setEditingTransaction] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        loadStats();
    }, []);

    async function loadStats() {
        try {
            const [transacciones, cajas, empresas, proyectos] = await Promise.all([
                db.transacciones.toArray(),
                db.cajas.toArray(),
                db.empresas.toArray(),
                db.proyectos.toArray()
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

            // Inter-caja debts
            const deudasCajas = await syncService.getIntercajaDebts();

            // Recent transactions (top 5)
            const recentTransactions = sortedTransactions.slice(0, 5);

            setStats({
                totalBalance,
                totalIngresos,
                totalEgresos,
                empresasBalance,
                gastosProyecto,
                deudasCajas,
                recentTransactions
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

    // Transaction row component
    function TransactionRow({ t, showActions = false }) {
        return (
            <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.tipo_movimiento === 'INGRESO' ? 'bg-green-500' :
                        t.tipo_movimiento === 'EGRESO' ? 'bg-red-500' : 'bg-blue-500'
                        }`} />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">
                            {t.descripcion || t.categoria || t.tipo_movimiento}
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(t.fecha || t.created_at)}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <div className="text-right">
                        <p className={`font-medium ${t.tipo_movimiento === 'INGRESO' ? 'text-green' :
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
                        <div className="flex items-center gap-1 ml-2">
                            <button
                                onClick={() => setEditingTransaction(t)}
                                className="p-2 text-gray-400 hover:text-gold transition-colors"
                            >
                                <Pencil size={16} />
                            </button>
                            <button
                                onClick={() => setDeleteConfirm(t)}
                                className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
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
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => setShowAllTransactions(false)}
                        className="flex items-center gap-2 text-gray-400 hover:text-white"
                    >
                        ← Volver
                    </button>
                    <h2 className="text-xl font-bold">Historial Completo</h2>
                </div>

                <div className="card">
                    {allTransactions.length > 0 ? (
                        <div>
                            {allTransactions.map((t) => (
                                <TransactionRow key={t.id} t={t} showActions={true} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-center text-gray-500 py-8">
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
        <div className="space-y-6">
            <h2 className="text-xl font-bold">📊 Dashboard</h2>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                            <Building2 size={20} />
                        </div>
                        <span className="text-sm text-gray-400">Saldo Total</span>
                    </div>
                    <p className={`text-2xl font-bold ${stats.totalBalance >= 0 ? 'text-green' : 'text-red'}`}>
                        {formatMoney(stats.totalBalance)}
                    </p>
                </div>

                <div className="card">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-green-500/20 text-green-400">
                            <TrendingUp size={20} />
                        </div>
                        <span className="text-sm text-gray-400">Ingresos</span>
                    </div>
                    <p className="text-2xl font-bold text-green">
                        {formatMoney(stats.totalIngresos)}
                    </p>
                </div>

                <div className="card">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-lg bg-red-500/20 text-red-400">
                            <TrendingDown size={20} />
                        </div>
                        <span className="text-sm text-gray-400">Egresos</span>
                    </div>
                    <p className="text-2xl font-bold text-red">
                        {formatMoney(stats.totalEgresos)}
                    </p>
                </div>
            </div>

            {/* Balance by company */}
            {stats.empresasBalance.length > 0 && (
                <div className="card">
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <Building2 size={18} className="text-gold" />
                        Saldo por Empresa
                    </h3>
                    <div className="space-y-3">
                        {stats.empresasBalance.map((empresa) => (
                            <div key={empresa.id} className="flex items-center justify-between">
                                <span className="text-gray-300">{empresa.nombre}</span>
                                <span className={`font-bold ${empresa.balance >= 0 ? 'text-green' : 'text-red'}`}>
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
                    <h3 className="font-semibold mb-4 flex items-center gap-2">
                        <FolderOpen size={18} className="text-gold" />
                        Gastos por Proyecto
                    </h3>
                    <div className="space-y-3">
                        {stats.gastosProyecto.map((proyecto) => {
                            const maxGasto = stats.gastosProyecto[0]?.gastos || 1;
                            const percentage = (proyecto.gastos / maxGasto) * 100;

                            return (
                                <div key={proyecto.id}>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-gray-300 text-sm">{proyecto.nombre}</span>
                                        <span className="text-red font-medium text-sm">
                                            {formatMoney(proyecto.gastos)}
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-500"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Inter-caja debts */}
            {stats.deudasCajas.length > 0 && (
                <div className="card border-amber-500/30 bg-amber-500/5">
                    <h3 className="font-semibold mb-4 flex items-center gap-2 text-amber-400">
                        <ArrowRightLeft size={18} />
                        Préstamos Entre Cajas
                    </h3>
                    <div className="space-y-3">
                        {stats.deudasCajas.map((deuda, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-secondary/50 p-3 rounded-lg">
                                <div className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-300">{deuda.caja_origen}</span>
                                    <ArrowRightLeft size={14} className="text-gray-500" />
                                    <span className="text-gray-300">{deuda.caja_destino}</span>
                                </div>
                                <span className={`font-bold ${deuda.monto > 0 ? 'text-amber-400' : 'text-green'}`}>
                                    {formatMoney(Math.abs(deuda.monto))}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent transactions */}
            <div className="card">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold flex items-center gap-2">
                        <Clock size={18} className="text-gold" />
                        Movimientos Recientes
                    </h3>
                    {allTransactions.length > 5 && (
                        <button
                            onClick={() => setShowAllTransactions(true)}
                            className="text-sm text-gold flex items-center gap-1 hover:underline"
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
                    <p className="text-center text-gray-500 py-4">
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
