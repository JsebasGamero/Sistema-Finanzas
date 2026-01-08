// DeudaTercerosPanel - Manage debts to suppliers and third parties
import { useState, useEffect, useMemo } from 'react';
import {
    Users,
    Plus,
    Wallet,
    AlertCircle,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    DollarSign,
    History,
    X,
    Building2,
    FolderOpen,
    Calendar,
    FileText
} from 'lucide-react';
import { db, generateUUID } from '../services/db';

export default function DeudaTercerosPanel({ onDebtChanged }) {
    const [deudas, setDeudas] = useState([]);
    const [terceros, setTerceros] = useState([]);
    const [proyectos, setProyectos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showPaymentForm, setShowPaymentForm] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    const [filterTercero, setFilterTercero] = useState('');
    const [filterEstado, setFilterEstado] = useState('');

    // Form state
    const [formData, setFormData] = useState({
        terceroId: '',
        empresaId: '',
        proyectoId: '',
        monto: '',
        descripcion: '',
        fechaDeuda: new Date().toISOString().split('T')[0]
    });

    // Payment form state
    const [paymentData, setPaymentData] = useState({
        monto: '',
        descripcion: '',
        cajaId: ''
    });
    const [cajas, setCajas] = useState([]);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const [tercerosData, proyectosData, empresasData, cajasData] = await Promise.all([
                db.terceros.toArray(),
                db.proyectos.toArray(),
                db.empresas.toArray(),
                db.cajas.toArray()
            ]);
            setTerceros(tercerosData);
            setProyectos(proyectosData);
            setEmpresas(empresasData);
            setCajas(cajasData);

            // Load deudas
            if (db.deudas_terceros) {
                try {
                    const deudasData = await db.deudas_terceros.toArray();
                    setDeudas(deudasData || []);
                } catch (e) {
                    console.log('Deudas terceros table may not have data yet');
                    setDeudas([]);
                }
            }
        } catch (error) {
            console.error('Error loading data:', error);
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

    function formatDate(dateStr) {
        if (!dateStr) return '';
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-CO', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    }

    function getTerceroName(id) {
        return terceros.find(t => t.id === id)?.nombre || 'Desconocido';
    }

    function getProyectoName(id) {
        return proyectos.find(p => p.id === id)?.nombre || '-';
    }

    function getEmpresaName(id) {
        return empresas.find(e => e.id === id)?.nombre || '-';
    }

    // Filter and group debts
    const filteredDeudas = useMemo(() => {
        return deudas.filter(d => {
            if (filterTercero && d.tercero_id !== filterTercero) return false;
            if (filterEstado && d.estado !== filterEstado) return false;
            return true;
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }, [deudas, filterTercero, filterEstado]);

    // Summary stats
    const stats = useMemo(() => {
        const pending = deudas.filter(d => d.estado !== 'PAGADA');
        const totalPending = pending.reduce((sum, d) => sum + d.monto_pendiente, 0);
        const totalOriginal = deudas.reduce((sum, d) => sum + d.monto_original, 0);
        const totalPaid = totalOriginal - totalPending;

        // Group by tercero
        const byTercero = {};
        pending.forEach(d => {
            if (!byTercero[d.tercero_id]) {
                byTercero[d.tercero_id] = { nombre: getTerceroName(d.tercero_id), total: 0 };
            }
            byTercero[d.tercero_id].total += d.monto_pendiente;
        });

        return {
            totalPending,
            totalPaid,
            pendingCount: pending.length,
            byTercero: Object.values(byTercero).sort((a, b) => b.total - a.total).slice(0, 5)
        };
    }, [deudas, terceros]);

    async function handleCreateDebt(e) {
        e.preventDefault();

        const monto = parseFloat(formData.monto);
        if (!monto || monto <= 0) {
            alert('El monto debe ser mayor a 0');
            return;
        }

        if (!formData.terceroId) {
            alert('Selecciona un proveedor/tercero');
            return;
        }

        const newDeuda = {
            id: generateUUID(),
            tercero_id: formData.terceroId,
            empresa_id: formData.empresaId || null,
            proyecto_id: formData.proyectoId || null,
            monto_original: monto,
            monto_pendiente: monto,
            fecha_deuda: formData.fechaDeuda,
            estado: 'PENDIENTE',
            descripcion: formData.descripcion || `Deuda a ${getTerceroName(formData.terceroId)}`,
            pagos: [],
            created_at: new Date().toISOString()
        };

        try {
            await db.deudas_terceros.add(newDeuda);
            setDeudas([...deudas, newDeuda]);
            setFormData({
                terceroId: '',
                empresaId: '',
                proyectoId: '',
                monto: '',
                descripcion: '',
                fechaDeuda: new Date().toISOString().split('T')[0]
            });
            setShowForm(false);
            onDebtChanged?.();
        } catch (error) {
            console.error('Error creating debt:', error);
            alert('Error al crear la deuda');
        }
    }

    async function handlePayment(deudaId) {
        const amount = parseFloat(paymentData.monto);
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

        const newMontoPendiente = deuda.monto_pendiente - amount;
        const newEstado = newMontoPendiente === 0 ? 'PAGADA' : 'PARCIAL';
        const pagos = [...(deuda.pagos || []), {
            monto: amount,
            fecha: new Date().toISOString(),
            descripcion: paymentData.descripcion || 'Abono',
            caja_id: paymentData.cajaId || null
        }];

        try {
            await db.deudas_terceros.update(deudaId, {
                monto_pendiente: newMontoPendiente,
                estado: newEstado,
                pagos
            });

            setDeudas(deudas.map(d =>
                d.id === deudaId
                    ? { ...d, monto_pendiente: newMontoPendiente, estado: newEstado, pagos }
                    : d
            ));
            setPaymentData({ monto: '', descripcion: '', cajaId: '' });
            setShowPaymentForm(null);
            onDebtChanged?.();
        } catch (error) {
            console.error('Error processing payment:', error);
            alert('Error al procesar el abono');
        }
    }

    async function handleDeleteDebt(deudaId) {
        if (!confirm('¿Eliminar esta deuda? Esta acción no se puede deshacer.')) return;

        try {
            await db.deudas_terceros.delete(deudaId);
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
                    <Users size={18} className="text-gold" />
                    Cuentas por Pagar
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
            {stats.totalPending > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="card bg-red-500/10 border-red-500/30">
                        <div className="flex items-center gap-2 text-red-400 mb-1">
                            <AlertCircle size={16} />
                            <span className="text-xs">Total Pendiente</span>
                        </div>
                        <p className="text-lg font-bold text-red-400">{formatMoney(stats.totalPending)}</p>
                        <p className="text-xs text-gray-500">{stats.pendingCount} deuda(s)</p>
                    </div>
                    <div className="card bg-green-500/10 border-green-500/30">
                        <div className="flex items-center gap-2 text-green-400 mb-1">
                            <CheckCircle size={16} />
                            <span className="text-xs">Total Abonado</span>
                        </div>
                        <p className="text-lg font-bold text-green-400">{formatMoney(stats.totalPaid)}</p>
                    </div>
                </div>
            )}

            {/* Top Debtors */}
            {stats.byTercero.length > 0 && (
                <div className="card">
                    <h4 className="text-sm text-gray-400 mb-2">Principales Acreedores</h4>
                    <div className="space-y-2">
                        {stats.byTercero.map((t, idx) => (
                            <div key={idx} className="flex justify-between items-center">
                                <span className="text-sm text-gray-300">{t.nombre}</span>
                                <span className="text-sm font-medium text-red-400">{formatMoney(t.total)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-2">
                <select
                    value={filterTercero}
                    onChange={(e) => setFilterTercero(e.target.value)}
                    className="input-field text-sm flex-1"
                >
                    <option value="">Todos los terceros</option>
                    {terceros.map(t => (
                        <option key={t.id} value={t.id}>{t.nombre}</option>
                    ))}
                </select>
                <select
                    value={filterEstado}
                    onChange={(e) => setFilterEstado(e.target.value)}
                    className="input-field text-sm"
                >
                    <option value="">Todos</option>
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="PARCIAL">Parcial</option>
                    <option value="PAGADA">Pagada</option>
                </select>
            </div>

            {/* New Debt Form */}
            {showForm && (
                <form onSubmit={handleCreateDebt} className="card space-y-3 border-gold/30">
                    <h4 className="font-medium text-sm text-gold flex items-center gap-2">
                        <FileText size={16} />
                        Registrar Nueva Deuda
                    </h4>

                    <div>
                        <label className="label">Proveedor / Tercero *</label>
                        <select
                            value={formData.terceroId}
                            onChange={(e) => setFormData({ ...formData, terceroId: e.target.value })}
                            className="input-field"
                            required
                        >
                            <option value="">Seleccionar...</option>
                            {terceros.map(t => (
                                <option key={t.id} value={t.id}>{t.nombre} ({t.tipo})</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Empresa</label>
                            <select
                                value={formData.empresaId}
                                onChange={(e) => setFormData({ ...formData, empresaId: e.target.value })}
                                className="input-field"
                            >
                                <option value="">Sin empresa</option>
                                {empresas.map(e => (
                                    <option key={e.id} value={e.id}>{e.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Proyecto</label>
                            <select
                                value={formData.proyectoId}
                                onChange={(e) => setFormData({ ...formData, proyectoId: e.target.value })}
                                className="input-field"
                            >
                                <option value="">Sin proyecto</option>
                                {proyectos.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Monto de la Deuda *</label>
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
                            <label className="label">Fecha de la Deuda</label>
                            <div className="relative">
                                <Calendar size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="date"
                                    value={formData.fechaDeuda}
                                    onChange={(e) => setFormData({ ...formData, fechaDeuda: e.target.value })}
                                    className="input-field"
                                    style={{ paddingLeft: '40px' }}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="label">Descripción / Concepto</label>
                        <input
                            type="text"
                            value={formData.descripcion}
                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                            className="input-field"
                            placeholder="Ej: Materiales de construcción, Servicios, etc."
                        />
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button type="submit" className="flex-1 bg-gold text-white py-2 rounded-lg font-medium">
                            Registrar Deuda
                        </button>
                        <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-card rounded-lg text-gray-400">
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {/* Debts List */}
            {filteredDeudas.length > 0 ? (
                <div className="space-y-2">
                    {filteredDeudas.map(deuda => (
                        <div key={deuda.id} className={`card ${deuda.estado === 'PAGADA' ? 'opacity-60' : ''}`}>
                            <button
                                onClick={() => setExpandedId(expandedId === deuda.id ? null : deuda.id)}
                                className="w-full flex items-center justify-between"
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg ${deuda.estado === 'PAGADA' ? 'bg-green-500/20' :
                                            deuda.estado === 'PARCIAL' ? 'bg-blue-500/20' : 'bg-red-500/20'
                                        }`}>
                                        {deuda.estado === 'PAGADA' ? (
                                            <CheckCircle size={18} className="text-green-400" />
                                        ) : (
                                            <Wallet size={18} className={deuda.estado === 'PARCIAL' ? 'text-blue-400' : 'text-red-400'} />
                                        )}
                                    </div>
                                    <div className="text-left">
                                        <p className="font-medium text-white text-sm">
                                            {getTerceroName(deuda.tercero_id)}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {formatDate(deuda.fecha_deuda)}
                                            {deuda.proyecto_id && ` • ${getProyectoName(deuda.proyecto_id)}`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right">
                                        <p className={`font-bold ${deuda.estado === 'PAGADA' ? 'text-green-400' : 'text-red-400'}`}>
                                            {formatMoney(deuda.monto_pendiente)}
                                        </p>
                                        {deuda.estado !== 'PENDIENTE' && (
                                            <p className="text-xs text-gray-500">de {formatMoney(deuda.monto_original)}</p>
                                        )}
                                    </div>
                                    {expandedId === deuda.id ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
                                </div>
                            </button>

                            {expandedId === deuda.id && (
                                <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                                    {deuda.descripcion && (
                                        <p className="text-sm text-gray-400 flex items-start gap-2">
                                            <FileText size={14} className="mt-0.5 flex-shrink-0" />
                                            {deuda.descripcion}
                                        </p>
                                    )}

                                    {deuda.empresa_id && (
                                        <p className="text-sm text-gray-500 flex items-center gap-2">
                                            <Building2 size={14} />
                                            {getEmpresaName(deuda.empresa_id)}
                                        </p>
                                    )}

                                    {/* Payment History */}
                                    {deuda.pagos && deuda.pagos.length > 0 && (
                                        <div className="bg-secondary/30 rounded-lg p-3">
                                            <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                                                <History size={12} /> Historial de Abonos
                                            </p>
                                            <div className="space-y-1">
                                                {deuda.pagos.map((pago, idx) => (
                                                    <div key={idx} className="flex justify-between text-sm">
                                                        <div>
                                                            <span className="text-gray-400">{new Date(pago.fecha).toLocaleDateString()}</span>
                                                            {pago.descripcion && (
                                                                <span className="text-gray-500 ml-2">- {pago.descripcion}</span>
                                                            )}
                                                        </div>
                                                        <span className="text-green-400 font-medium">+{formatMoney(pago.monto)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Payment Form */}
                                    {deuda.estado !== 'PAGADA' && (
                                        showPaymentForm === deuda.id ? (
                                            <div className="space-y-2 bg-green-500/10 p-3 rounded-lg">
                                                <div className="flex gap-2">
                                                    <div className="flex-1">
                                                        <input
                                                            type="number"
                                                            value={paymentData.monto}
                                                            onChange={(e) => setPaymentData({ ...paymentData, monto: e.target.value })}
                                                            className="input-field"
                                                            placeholder="Monto a abonar"
                                                        />
                                                    </div>
                                                    <select
                                                        value={paymentData.cajaId}
                                                        onChange={(e) => setPaymentData({ ...paymentData, cajaId: e.target.value })}
                                                        className="input-field flex-1"
                                                    >
                                                        <option value="">Caja (opcional)</option>
                                                        {cajas.map(c => (
                                                            <option key={c.id} value={c.id}>{c.nombre}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={paymentData.descripcion}
                                                    onChange={(e) => setPaymentData({ ...paymentData, descripcion: e.target.value })}
                                                    className="input-field"
                                                    placeholder="Descripción del abono (opcional)"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => handlePayment(deuda.id)}
                                                        className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-medium"
                                                    >
                                                        Confirmar Abono
                                                    </button>
                                                    <button
                                                        onClick={() => setShowPaymentForm(null)}
                                                        className="px-4 py-2 bg-card rounded-lg text-gray-400"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
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
                                        )
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                !showForm && (
                    <div className="card text-center py-8 text-gray-500">
                        <Users size={32} className="mx-auto mb-2 opacity-50" />
                        <p>No hay deudas registradas</p>
                        <p className="text-sm mt-1">Registra cuando un proveedor te dé crédito</p>
                    </div>
                )
            )}
        </div>
    );
}
