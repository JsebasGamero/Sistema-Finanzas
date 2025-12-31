// TransactionEditModal - Modal to edit existing transactions
import { useState, useEffect } from 'react';
import { X, Save, ArrowRight } from 'lucide-react';
import { db } from '../services/db';

export default function TransactionEditModal({
    isOpen,
    transaction,
    onSave,
    onClose
}) {
    const [formData, setFormData] = useState({});
    const [cajas, setCajas] = useState([]);
    const [proyectos, setProyectos] = useState([]);
    const [terceros, setTerceros] = useState([]);
    const [saving, setSaving] = useState(false);

    const categorias = [
        'Nómina',
        'Materiales',
        'Viáticos',
        'Combustible (ACPM)',
        'Transporte',
        'Alquiler Maquinaria',
        'Préstamo',
        'Pago Préstamo',
        'Servicios',
        'Seguridad Social',
        'Otros'
    ];

    useEffect(() => {
        if (isOpen && transaction) {
            setFormData({
                ...transaction,
                fecha: transaction.fecha?.split('T')[0] || new Date().toISOString().split('T')[0]
            });
            loadData();
        }
    }, [isOpen, transaction]);

    async function loadData() {
        const [cajasData, proyectosData, tercerosData] = await Promise.all([
            db.cajas.toArray(),
            db.proyectos.toArray(),
            db.terceros.toArray()
        ]);
        setCajas(cajasData);
        setProyectos(proyectosData);
        setTerceros(tercerosData);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!formData.monto || !formData.caja_origen_id) return;

        setSaving(true);
        try {
            await onSave({
                ...formData,
                monto: parseFloat(formData.monto)
            });
            onClose();
        } catch (error) {
            console.error('Error saving:', error);
            alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    const tipo = formData.tipo_movimiento || 'EGRESO';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-secondary rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10">
                {/* Header */}
                <div className="sticky top-0 bg-secondary border-b border-white/10 px-6 py-4 flex items-center justify-between">
                    <h3 className="text-xl font-bold">Editar Movimiento</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {/* Type indicator (read-only) */}
                    <div className={`text-center py-2 rounded-lg font-medium ${tipo === 'INGRESO' ? 'bg-green-500/20 text-green-400' :
                        tipo === 'EGRESO' ? 'bg-red-500/20 text-red-400' :
                            'bg-blue-500/20 text-blue-400'
                        }`}>
                        {tipo === 'INGRESO' && '💵 Ingreso'}
                        {tipo === 'EGRESO' && '💸 Egreso'}
                        {tipo === 'TRANSFERENCIA' && '🔄 Transferencia'}
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="label">Monto *</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">$</span>
                            <input
                                type="number"
                                value={formData.monto || ''}
                                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                                className="input-field text-xl font-bold"
                                style={{ paddingLeft: '48px' }}
                                required
                            />
                        </div>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="label">Fecha</label>
                        <input
                            type="date"
                            value={formData.fecha || ''}
                            onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
                            className="input-field"
                        />
                    </div>

                    {/* Caja Origen */}
                    <div>
                        <label className="label">
                            {tipo === 'TRANSFERENCIA' ? 'Caja Origen' : 'Caja'}
                        </label>
                        <select
                            value={formData.caja_origen_id || ''}
                            onChange={(e) => setFormData({ ...formData, caja_origen_id: e.target.value })}
                            className="input-field"
                            required
                        >
                            <option value="">Seleccionar...</option>
                            {cajas.map((caja) => (
                                <option key={caja.id} value={caja.id}>
                                    {caja.nombre} ({caja.tipo})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Caja Destino - Only for transfers */}
                    {tipo === 'TRANSFERENCIA' && (
                        <div className="relative">
                            <div className="absolute left-1/2 -translate-x-1/2 -top-4 bg-secondary p-1">
                                <ArrowRight className="text-gold" size={20} />
                            </div>
                            <label className="label">Caja Destino</label>
                            <select
                                value={formData.caja_destino_id || ''}
                                onChange={(e) => setFormData({ ...formData, caja_destino_id: e.target.value })}
                                className="input-field"
                                required
                            >
                                <option value="">Seleccionar...</option>
                                {cajas.filter(c => c.id !== formData.caja_origen_id).map((caja) => (
                                    <option key={caja.id} value={caja.id}>
                                        {caja.nombre} ({caja.tipo})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Category */}
                    <div>
                        <label className="label">Categoría</label>
                        <select
                            value={formData.categoria || ''}
                            onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                            className="input-field"
                        >
                            <option value="">Seleccionar...</option>
                            {categorias.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>

                    {/* Project */}
                    <div>
                        <label className="label">Proyecto / Obra</label>
                        <select
                            value={formData.proyecto_id || ''}
                            onChange={(e) => setFormData({ ...formData, proyecto_id: e.target.value || null })}
                            className="input-field"
                        >
                            <option value="">Sin proyecto</option>
                            {proyectos.map((p) => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                        </select>
                    </div>

                    {/* Third party */}
                    {tipo === 'EGRESO' && (
                        <div>
                            <label className="label">Proveedor / Beneficiario</label>
                            <select
                                value={formData.tercero_id || ''}
                                onChange={(e) => setFormData({ ...formData, tercero_id: e.target.value || null })}
                                className="input-field"
                            >
                                <option value="">Ninguno</option>
                                {terceros.map((t) => (
                                    <option key={t.id} value={t.id}>{t.nombre}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <label className="label">Descripción</label>
                        <textarea
                            value={formData.descripcion || ''}
                            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                            className="input-field min-h-[80px] resize-none"
                            placeholder="Detalle del movimiento..."
                        />
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 rounded-lg bg-card text-gray-300"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 py-3 px-4 rounded-lg bg-gold text-white font-medium flex items-center justify-center gap-2"
                        >
                            <Save size={18} />
                            {saving ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
