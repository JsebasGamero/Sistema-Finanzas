// DeudaCajasPanel - Manage inter-box debts/loans
import { useState, useEffect, useMemo } from 'react';
import {
    ArrowRightLeft,
    Plus,
    Wallet,
    AlertCircle,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    DollarSign,
    History,
    X
} from 'lucide-react';
import { db, generateUUID } from '../services/db';
import { addToSyncQueue, processSyncQueue } from '../services/syncService';

export default function DeudaCajasPanel({ onDebtChanged }) {
    const [deudas, setDeudas] = useState([]);
    const [cajas, setCajas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(null);
    const [expandedId, setExpandedId] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        cajaDeudoraId: '',
        cajaAcreedoraId: '',
        monto: '',
        descripcion: ''
    });

    // Payment form state
    const [paymentAmount, setPaymentAmount] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            // Get cajas first
            const cajasData = await db.cajas.toArray();
            setCajas(cajasData);

            // Try to get deudas_cajas if the table exists
            if (db.deudas_cajas) {
                try {
                    const deudasData = await db.deudas_cajas.toArray();
                    setDeudas(deudasData || []);
                } catch (e) {
                    console.log('Deudas table may not have data yet:', e);
                    setDeudas([]);
                }
            } else {
                setDeudas([]);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            setDeudas([]);
            setCajas([]);
        } finally {
            setLoading(false);
        }
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(amount || 0);
    }

    function getCajaName(id) {
        return cajas.find(c => c.id === id)?.nombre || 'Desconocida';
    }

    // Group debts by status
    const debtsSummary = useMemo(() => {
        const pending = deudas.filter(d => d.estado === 'PENDIENTE');
        const partial = deudas.filter(d => d.estado === 'PARCIAL');
        const paid = deudas.filter(d => d.estado === 'PAGADA');

        const totalPending = [...pending, ...partial].reduce((sum, d) => sum + d.monto_pendiente, 0);

        return { pending, partial, paid, totalPending };
    }, [deudas]);

    async function handleCreateDebt(e) {
        e.preventDefault();

        if (formData.cajaDeudoraId === formData.cajaAcreedoraId) {
            alert('La caja deudora y acreedora deben ser diferentes');
            return;
        }

        const monto = parseFloat(formData.monto);
        if (!monto || monto <= 0) {
            alert('El monto debe ser mayor a 0');
            return;
        }

        const newDeuda = {
            id: generateUUID(),
            caja_deudora_id: formData.cajaDeudoraId,
            caja_acreedora_id: formData.cajaAcreedoraId,
            monto_original: monto,
            monto_pendiente: monto,
            fecha_prestamo: new Date().toISOString().split('T')[0],
            estado: 'PENDIENTE',
            descripcion: formData.descripcion || `Préstamo de ${getCajaName(formData.cajaAcreedoraId)} a ${getCajaName(formData.cajaDeudoraId)}`,
            pagos: [],
            created_at: new Date().toISOString()
        };

        try {
            await db.deudas_cajas.add(newDeuda);
            setDeudas([...deudas, newDeuda]);
            setFormData({ cajaDeudoraId: '', cajaAcreedoraId: '', monto: '', descripcion: '' });
            setShowForm(false);
            onDebtChanged?.();
        } catch (error) {
            console.error('Error creating debt:', error);
        }
    }

    async function handlePayment(deudaId) {
        const amount = parseFloat(paymentAmount);
        if (!amount || amount <= 0) {
            alert('El monto debe ser mayor a 0');
            return;
        }

        const deuda = deudas.find(d => d.id === deudaId);
        if (!deuda) return;

        if (amount > deuda.monto_pendiente) {
            alert(`El pago no puede ser mayor al monto pendiente (${formatMoney(deuda.monto_pendiente)})`);
            return;
        }

        // Check if debtor caja has enough balance
        const cajaDeudora = cajas.find(c => c.id === deuda.caja_deudora_id);
        if (cajaDeudora && cajaDeudora.saldo_actual < amount) {
            const confirmar = confirm(
                `La caja deudora "${cajaDeudora.nombre}" solo tiene ${formatMoney(cajaDeudora.saldo_actual)}. ` +
                `¿Deseas continuar con el pago de ${formatMoney(amount)}? El saldo quedará negativo.`
            );
            if (!confirmar) return;
        }

        const newMontoPendiente = deuda.monto_pendiente - amount;
        const newEstado = newMontoPendiente === 0 ? 'PAGADA' : 'PARCIAL';
        const pagos = [...(deuda.pagos || []), {
            monto: amount,
            fecha: new Date().toISOString()
        }];

        try {
            // 1. Update the debt
            await db.deudas_cajas.update(deudaId, {
                monto_pendiente: newMontoPendiente,
                estado: newEstado,
                pagos
            });

            // 2. Create TRANSFERENCIA transaction (from debtor to creditor)
            const transaccion = {
                id: generateUUID(),
                fecha: new Date().toISOString().split('T')[0],
                descripcion: `Pago deuda: ${getCajaName(deuda.caja_deudora_id)} → ${getCajaName(deuda.caja_acreedora_id)}`,
                monto: amount,
                tipo_movimiento: 'TRANSFERENCIA',
                categoria: 'Pago Préstamo',
                proyecto_id: null,
                caja_origen_id: deuda.caja_deudora_id,
                caja_destino_id: deuda.caja_acreedora_id,
                tercero_id: null,
                sincronizado: false,
                created_at: new Date().toISOString()
            };

            await db.transacciones.add(transaccion);

            // Add to sync queue for Supabase
            await addToSyncQueue('transacciones', 'INSERT', transaccion);

            // Try to sync immediately if online, and WAIT for it to complete
            if (navigator.onLine) {
                try {
                    await processSyncQueue();
                    // Update local transaction to show as synced
                    await db.transacciones.update(transaccion.id, { sincronizado: true });
                } catch (err) {
                    console.log('Sync error (will retry later):', err);
                }
            }

            // 3. Update debtor caja balance (deduct) and sync
            if (deuda.caja_deudora_id) {
                const cajaOrigen = await db.cajas.get(deuda.caja_deudora_id);
                if (cajaOrigen) {
                    const nuevoSaldoOrigen = (cajaOrigen.saldo_actual || 0) - amount;
                    await db.cajas.update(deuda.caja_deudora_id, { saldo_actual: nuevoSaldoOrigen });
                    // Sync to Supabase
                    const updatedCajaOrigen = { ...cajaOrigen, saldo_actual: nuevoSaldoOrigen };
                    await addToSyncQueue('cajas', 'UPDATE', updatedCajaOrigen);
                }
            }

            // 4. Update creditor caja balance (add) and sync
            if (deuda.caja_acreedora_id) {
                const cajaDestino = await db.cajas.get(deuda.caja_acreedora_id);
                if (cajaDestino) {
                    const nuevoSaldoDestino = (cajaDestino.saldo_actual || 0) + amount;
                    await db.cajas.update(deuda.caja_acreedora_id, { saldo_actual: nuevoSaldoDestino });
                    // Sync to Supabase
                    const updatedCajaDestino = { ...cajaDestino, saldo_actual: nuevoSaldoDestino };
                    await addToSyncQueue('cajas', 'UPDATE', updatedCajaDestino);
                }
            }

            // 5. Sync caja updates immediately if online
            if (navigator.onLine) {
                await processSyncQueue();
            }

            // 6. Reload cajas to update local state
            const cajasActualizadas = await db.cajas.toArray();
            setCajas(cajasActualizadas);

            setDeudas(deudas.map(d =>
                d.id === deudaId
                    ? { ...d, monto_pendiente: newMontoPendiente, estado: newEstado, pagos }
                    : d
            ));
            setPaymentAmount('');
            setShowPaymentForm(null);
            onDebtChanged?.();
        } catch (error) {
            console.error('Error processing payment:', error);
            alert('Error al procesar el pago');
        }
    }

    async function handleDeleteDebt(deudaId) {
        if (!confirm('¿Eliminar esta deuda?')) return;

        try {
            await db.deudas_cajas.delete(deudaId);
            setDeudas(deudas.filter(d => d.id !== deudaId));
            onDebtChanged?.();
        } catch (error) {
            console.error('Error deleting debt:', error);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                    <ArrowRightLeft size={18} className="text-gold" />
                    Deudas Entre Cajas
                </h3>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-1 bg-gold text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                >
                    <Plus size={16} />
                    Nueva Deuda
                </button>
            </div>

            {/* Summary Cards */}
            {debtsSummary.totalPending > 0 && (
                <div className="card bg-amber-500/10 border-amber-500/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-amber-400">
                            <AlertCircle size={18} />
                            <span className="text-sm">Total Pendiente</span>
                        </div>
                        <span className="font-bold text-amber-400">{formatMoney(debtsSummary.totalPending)}</span>
                    </div>
                </div>
            )}

            {/* New Debt Form */}
            {showForm && (
                <form onSubmit={handleCreateDebt} className="card space-y-3">
                    <h4 className="font-medium text-sm text-gray-400">Registrar Nuevo Préstamo</h4>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Caja que Presta</label>
                            <select
                                value={formData.cajaAcreedoraId}
                                onChange={(e) => setFormData({ ...formData, cajaAcreedoraId: e.target.value })}
                                className="input-field"
                                required
                            >
                                <option value="">Seleccionar...</option>
                                {cajas.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Caja que Recibe</label>
                            <select
                                value={formData.cajaDeudoraId}
                                onChange={(e) => setFormData({ ...formData, cajaDeudoraId: e.target.value })}
                                className="input-field"
                                required
                            >
                                <option value="">Seleccionar...</option>
                                {cajas.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="label">Monto del Préstamo</label>
                        <div className="relative">
                            <DollarSign size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="number"
                                value={formData.monto}
                                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                                className="input-field"
                                style={{ paddingLeft: '40px' }}
                                placeholder="0"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="label">Descripción (opcional)</label>
                        <input
                            type="text"
                            value={formData.descripcion}
                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                            className="input-field"
                            placeholder="Ej: Préstamo para materiales"
                        />
                    </div>

                    <div className="flex gap-2">
                        <button type="submit" className="flex-1 bg-gold text-white py-2 rounded-lg font-medium">
                            Registrar Préstamo
                        </button>
                        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-card rounded-lg">
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {/* Pending/Partial Debts */}
            {[...debtsSummary.pending, ...debtsSummary.partial].length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm text-gray-500 font-medium">Pendientes</h4>
                    {[...debtsSummary.pending, ...debtsSummary.partial].map(deuda => (
                        <div key={deuda.id} className="card">
                            <button
                                onClick={() => setExpandedId(expandedId === deuda.id ? null : deuda.id)}
                                className="w-full flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${deuda.estado === 'PARCIAL' ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
                                        <Wallet size={18} className={deuda.estado === 'PARCIAL' ? 'text-blue-400' : 'text-red-400'} />
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-white text-sm">
                                            {getCajaName(deuda.caja_deudora_id)} → debe a → {getCajaName(deuda.caja_acreedora_id)}
                                        </p>
                                        <p className="text-xs text-gray-500">{deuda.fecha_prestamo}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        <p className="font-bold text-red-400">{formatMoney(deuda.monto_pendiente)}</p>
                                        {deuda.estado === 'PARCIAL' && (
                                            <p className="text-xs text-gray-500">de {formatMoney(deuda.monto_original)}</p>
                                        )}
                                    </div>
                                    {expandedId === deuda.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                </div>
                            </button>

                            {expandedId === deuda.id && (
                                <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                                    {deuda.descripcion && (
                                        <p className="text-sm text-gray-400">{deuda.descripcion}</p>
                                    )}

                                    {/* Payment History */}
                                    {deuda.pagos && deuda.pagos.length > 0 && (
                                        <div>
                                            <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                                <History size={12} /> Abonos realizados:
                                            </p>
                                            {deuda.pagos.map((pago, idx) => (
                                                <div key={idx} className="flex justify-between text-sm">
                                                    <span className="text-gray-400">{new Date(pago.fecha).toLocaleDateString()}</span>
                                                    <span className="text-green-400">+{formatMoney(pago.monto)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Payment Form */}
                                    {showPaymentForm === deuda.id ? (
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                value={paymentAmount}
                                                onChange={(e) => setPaymentAmount(e.target.value)}
                                                className="input-field flex-1"
                                                placeholder="Monto a abonar"
                                            />
                                            <button
                                                onClick={() => handlePayment(deuda.id)}
                                                className="bg-green-600 text-white px-3 py-2 rounded-lg text-sm"
                                            >
                                                Abonar
                                            </button>
                                            <button
                                                onClick={() => setShowPaymentForm(null)}
                                                className="bg-card px-3 py-2 rounded-lg"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowPaymentForm(deuda.id)}
                                                className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium"
                                            >
                                                Registrar Abono
                                            </button>
                                            <button
                                                onClick={() => handleDeleteDebt(deuda.id)}
                                                className="bg-red-600/20 text-red-400 px-3 py-2 rounded-lg text-sm"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Paid Debts */}
            {debtsSummary.paid.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-sm text-gray-500 font-medium">Pagadas</h4>
                    {debtsSummary.paid.slice(0, 5).map(deuda => (
                        <div key={deuda.id} className="card opacity-60">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-lg bg-green-500/20">
                                        <CheckCircle size={18} className="text-green-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm text-gray-300">
                                            {getCajaName(deuda.caja_deudora_id)} → {getCajaName(deuda.caja_acreedora_id)}
                                        </p>
                                    </div>
                                </div>
                                <span className="text-green-400 text-sm">{formatMoney(deuda.monto_original)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty State */}
            {deudas.length === 0 && !showForm && (
                <div className="card text-center py-8 text-gray-500">
                    <ArrowRightLeft size={32} className="mx-auto mb-2 opacity-50" />
                    <p>No hay deudas registradas entre cajas</p>
                </div>
            )}
        </div>
    );
}
