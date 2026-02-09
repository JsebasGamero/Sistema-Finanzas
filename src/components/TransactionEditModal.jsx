// TransactionEditModal - Modal to edit existing transactions
import { useState, useEffect } from 'react';
import { X, Save, ArrowRight, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import { db, generateUUID } from '../services/db';
import { addToSyncQueue, processSyncQueue } from '../services/syncService';
import AutocompleteInput from './AutocompleteInput';
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

    const [categorias, setCategorias] = useState([]);

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

        // Load categories
        try {
            const categoriasData = await db.categorias.toArray();
            setCategorias(categoriasData);
        } catch (e) {
            console.log('Error loading categories:', e);
        }
    }

    // Format number with thousand separators (dots) for display in input
    function formatDisplayNumber(value) {
        if (!value && value !== 0) return '';
        const numStr = String(value).replace(/\D/g, '');
        if (!numStr) return '';
        return new Intl.NumberFormat('es-CO').format(parseInt(numStr, 10));
    }

    // Parse formatted number back to raw number string
    function parseFormattedNumber(formattedValue) {
        return formattedValue.replace(/\./g, '');
    }

    // Create a new tercero on the fly
    async function createNewTercero(nombre) {
        const newTercero = {
            id: generateUUID(),
            nombre: nombre,
            tipo: 'Proveedor',
            nit_cedula: '',
            telefono: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await db.terceros.add(newTercero);
        await addToSyncQueue('terceros', 'INSERT', newTercero);

        if (navigator.onLine) {
            processSyncQueue().catch(err => console.log('Sync error:', err));
        }

        setTerceros(prev => [...prev, newTercero]);
        return newTercero;
    }

    // Create a new category on the fly
    async function createNewCategoria(nombre) {
        const newCategoria = {
            id: generateUUID(),
            nombre: nombre,
            tipo: 'general',
            created_at: new Date().toISOString()
        };

        try {
            await db.categorias.add(newCategoria);
            await addToSyncQueue('categorias', 'INSERT', newCategoria);
            if (navigator.onLine) {
                processSyncQueue().catch(err => console.log('Sync error:', err));
            }
        } catch (e) {
            console.log('Categories table may not exist:', e);
        }

        setCategorias(prev => [...prev, newCategoria]);
        return newCategoria;
    }

    // Create a new caja on the fly
    async function createNewCaja(nombre) {
        const newCaja = {
            id: generateUUID(),
            nombre: nombre,
            tipo: 'Efectivo', // Default type
            empresa_id: null,
            saldo_actual: 0,
            created_at: new Date().toISOString()
        };

        await db.cajas.add(newCaja);
        await addToSyncQueue('cajas', 'INSERT', newCaja);

        if (navigator.onLine) {
            processSyncQueue().catch(err => console.log('Sync error:', err));
        }

        setCajas(prev => [...prev, newCaja]);
        return newCaja;
    }

    // Create a new project on the fly
    async function createNewProyecto(nombre) {
        const newProyecto = {
            id: generateUUID(),
            nombre: nombre,
            empresa_id: formData.empresa_id || null, // Link to current company if selected
            estado: 'ACTIVO',
            presupuesto_estimado: 0,
            created_at: new Date().toISOString()
        };

        await db.proyectos.add(newProyecto);
        await addToSyncQueue('proyectos', 'INSERT', newProyecto);

        if (navigator.onLine) {
            processSyncQueue().catch(err => console.log('Sync error:', err));
        }

        setProyectos(prev => [...prev, newProyecto]);
        return newProyecto;
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
                    <div className={`flex items-center justify-center gap-2 py-2 rounded-lg font-medium ${tipo === 'INGRESO' ? 'bg-green-500/20 text-green-400' :
                        tipo === 'EGRESO' ? 'bg-red-500/20 text-red-400' :
                            'bg-blue-500/20 text-blue-400'
                        }`}>
                        {tipo === 'INGRESO' && <><ArrowDownLeft size={18} /> Ingreso</>}
                        {tipo === 'EGRESO' && <><ArrowUpRight size={18} /> Egreso</>}
                        {tipo === 'TRANSFERENCIA' && <><ArrowLeftRight size={18} /> Transferencia</>}
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="label">Monto *</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">$</span>
                            <input
                                type="text"
                                value={formatDisplayNumber(formData.monto)}
                                onChange={(e) => setFormData({ ...formData, monto: parseFormattedNumber(e.target.value) })}
                                className="input-field text-xl font-bold"
                                style={{ paddingLeft: '48px' }}
                                required
                                inputMode="numeric"
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
                        <AutocompleteInput
                            items={cajas}
                            value={formData.caja_origen_id}
                            onChange={(val) => setFormData({ ...formData, caja_origen_id: val })}
                            onCreateNew={createNewCaja}
                            placeholder="Escribir o seleccionar caja..."
                            displayKey="nombre"
                            valueKey="id"
                            createLabel="Crear nueva caja:"
                            emptyMessage="Sin cajas disponibles"
                        />
                    </div>

                    {/* Caja Destino - Only for transfers */}
                    {tipo === 'TRANSFERENCIA' && (
                        <div className="relative">
                            <div className="absolute left-1/2 -translate-x-1/2 -top-4 bg-secondary p-1">
                                <ArrowRight className="text-gold" size={20} />
                            </div>
                            <label className="label">Caja Destino</label>
                            <AutocompleteInput
                                items={cajas.filter(c => c.id !== formData.caja_origen_id)}
                                value={formData.caja_destino_id}
                                onChange={(val) => setFormData({ ...formData, caja_destino_id: val })}
                                onCreateNew={createNewCaja}
                                placeholder="Escribir o seleccionar caja destino..."
                                displayKey="nombre"
                                valueKey="id"
                                createLabel="Crear nueva caja:"
                                emptyMessage="Sin cajas disponibles"
                            />
                        </div>
                    )}

                    {/* Category */}
                    <div>
                        <label className="label">Categoría</label>
                        <AutocompleteInput
                            items={categorias}
                            value={formData.categoria}
                            onChange={(val) => setFormData({ ...formData, categoria: val })}
                            onCreateNew={createNewCategoria}
                            placeholder="Escribir o seleccionar categoría..."
                            displayKey="nombre"
                            valueKey="id"
                            createLabel="Crear nueva categoría:"
                            emptyMessage="Sin categorías"
                        />
                    </div>

                    {/* Project */}
                    <div>
                        <label className="label">Proyecto / Obra</label>
                        <AutocompleteInput
                            items={proyectos}
                            value={formData.proyecto_id}
                            onChange={(val) => setFormData({ ...formData, proyecto_id: val })}
                            onCreateNew={createNewProyecto}
                            placeholder="Escribir o seleccionar proyecto..."
                            displayKey="nombre"
                            valueKey="id"
                            createLabel="Crear nuevo proyecto:"
                            emptyMessage="Sin proyectos"
                        />
                    </div>

                    {/* Third party */}
                    {tipo === 'EGRESO' && (
                        <div>
                            <label className="label">Proveedor / Beneficiario</label>
                            <AutocompleteInput
                                items={terceros}
                                value={formData.tercero_id || ''}
                                onChange={(val) => setFormData({ ...formData, tercero_id: val || null })}
                                onCreateNew={createNewTercero}
                                placeholder="Escribir o seleccionar..."
                                displayKey="nombre"
                                valueKey="id"
                                createLabel="Crear proveedor:"
                                emptyMessage="Sin proveedores"
                            />
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
