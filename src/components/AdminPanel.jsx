// AdminPanel component - CRUD for master data
import { useState, useEffect } from 'react';
import {
    Building2,
    Wallet,
    FolderOpen,
    Users,
    Tag,
    Plus,
    Pencil,
    Trash2,
    X,
    Save,
    ChevronLeft,
    Settings
} from 'lucide-react';
import { db, generateUUID } from '../services/db';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import { addToSyncQueue, processSyncQueue } from '../services/syncService';
import ConfirmModal from './ConfirmModal';

// Entity configurations
const ENTITIES = {
    empresas: {
        name: 'Empresas',
        icon: Building2,
        fields: [
            { key: 'nombre', label: 'Nombre', type: 'text', required: true },
            { key: 'nit', label: 'NIT', type: 'text' }
        ]
    },
    cajas: {
        name: 'Cajas',
        icon: Wallet,
        fields: [
            { key: 'nombre', label: 'Nombre', type: 'text', required: true },
            { key: 'tipo', label: 'Tipo', type: 'select', options: ['Efectivo', 'Banco', 'Tarjeta'], required: true },
            { key: 'empresa_id', label: 'Empresa', type: 'relation', relation: 'empresas' },
            { key: 'saldo_actual', label: 'Saldo Inicial', type: 'number' }
        ]
    },
    proyectos: {
        name: 'Proyectos / Obras',
        icon: FolderOpen,
        fields: [
            { key: 'nombre', label: 'Nombre', type: 'text', required: true },
            { key: 'empresa_id', label: 'Empresa', type: 'relation', relation: 'empresas' },
            { key: 'estado', label: 'Estado', type: 'select', options: ['Activo', 'Pausado', 'Finalizado'] },
            { key: 'presupuesto_estimado', label: 'Presupuesto', type: 'number' }
        ]
    },
    terceros: {
        name: 'Proveedores / Beneficiarios',
        icon: Users,
        fields: [
            { key: 'nombre', label: 'Nombre', type: 'text', required: true },
            { key: 'tipo', label: 'Tipo', type: 'select', options: ['Proveedor', 'Empleado', 'Contratista'], required: true },
            { key: 'nit_cedula', label: 'NIT / Cédula', type: 'text' },
            { key: 'telefono', label: 'Teléfono', type: 'text' }
        ]
    }
};

export default function AdminPanel() {
    const [activeEntity, setActiveEntity] = useState(null);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [formData, setFormData] = useState({});
    const [relatedData, setRelatedData] = useState({});
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    useEffect(() => {
        if (activeEntity) {
            loadItems();
            loadRelatedData();
        }
    }, [activeEntity]);

    async function loadItems() {
        setLoading(true);
        try {
            const data = await db[activeEntity].toArray();
            setItems(data);
        } finally {
            setLoading(false);
        }
    }

    async function loadRelatedData() {
        const config = ENTITIES[activeEntity];
        const relations = {};

        for (const field of config.fields) {
            if (field.type === 'relation') {
                relations[field.relation] = await db[field.relation].toArray();
            }
        }

        setRelatedData(relations);
    }

    function handleAdd() {
        setEditingItem(null);
        setFormData({});
        setShowForm(true);
    }

    function handleEdit(item) {
        setEditingItem(item);
        setFormData({ ...item });
        setShowForm(true);
    }

    function handleDelete(item) {
        setDeleteConfirm(item);
    }

    async function confirmDelete() {
        if (!deleteConfirm) return;

        try {
            // Delete from local DB
            await db[activeEntity].delete(deleteConfirm.id);

            // Sync to Supabase if configured
            if (isSupabaseConfigured()) {
                await supabase.from(activeEntity).delete().eq('id', deleteConfirm.id);
            }

            await loadItems();
        } catch (error) {
            console.error('Error deleting:', error);
            alert('Error al eliminar');
        } finally {
            setDeleteConfirm(null);
        }
    }

    async function handleSave(e) {
        e.preventDefault();

        try {
            const now = new Date().toISOString();

            if (editingItem) {
                // Update existing
                const updated = { ...editingItem, ...formData, updated_at: now };
                await db[activeEntity].update(editingItem.id, formData);

                // Add to sync queue for Supabase
                await addToSyncQueue(activeEntity, 'UPDATE', updated);
                console.log(`📝 Updated ${activeEntity}:`, updated);
            } else {
                // Create new
                const newItem = {
                    id: generateUUID(),
                    ...formData,
                    created_at: now,
                    updated_at: now
                };

                // Set defaults
                if (activeEntity === 'cajas' && !newItem.saldo_actual) {
                    newItem.saldo_actual = 0;
                }
                if (activeEntity === 'proyectos' && !newItem.estado) {
                    newItem.estado = 'Activo';
                }
                if (activeEntity === 'proyectos' && !newItem.presupuesto_estimado) {
                    newItem.presupuesto_estimado = 0;
                }

                await db[activeEntity].add(newItem);

                // Add to sync queue for Supabase
                await addToSyncQueue(activeEntity, 'INSERT', newItem);
                console.log(`✨ Created ${activeEntity}:`, newItem);
            }

            // Try to sync immediately if online
            if (navigator.onLine) {
                processSyncQueue().catch(err => console.log('Sync error:', err));
            }

            setShowForm(false);
            setFormData({});
            setEditingItem(null);
            await loadItems();
        } catch (error) {
            console.error('Error saving:', error);
            alert('Error al guardar');
        }
    }

    function formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(amount || 0);
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

    // Main menu view
    if (!activeEntity) {
        return (
            <div className="space-y-6 animate-fade-in">
                <h2 className="section-title">
                    <Settings size={22} className="text-gold" />
                    Configuración
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)', marginTop: '-0.5rem' }}>Administra los datos del sistema</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {Object.entries(ENTITIES).map(([key, config]) => {
                        const Icon = config.icon;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveEntity(key)}
                                className="card text-left"
                                style={{ cursor: 'pointer' }}
                            >
                                <div className="flex flex-col sm:flex-row items-center gap-3">
                                    <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center flex-shrink-0">
                                        <Icon size={24} className="text-gold" />
                                    </div>
                                    <div className="text-center sm:text-left">
                                        <h3 className="font-semibold text-white text-sm">{config.name}</h3>
                                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Administrar</p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    }

    const config = ENTITIES[activeEntity];
    const Icon = config.icon;

    // Form view
    if (showForm) {
        return (
            <div className="space-y-6 animate-fade-in max-w-lg">
                <button
                    onClick={() => setShowForm(false)}
                    className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
                >
                    <ChevronLeft size={18} />
                    Volver
                </button>

                <h2 className="section-title">
                    {editingItem ? 'Editar' : 'Nuevo'} {config.name.slice(0, -1)}
                </h2>

                <form onSubmit={handleSave} className="space-y-5">
                    {config.fields.map((field) => (
                        <div key={field.key}>
                            <label className="label">
                                {field.label} {field.required && '*'}
                            </label>

                            {field.type === 'text' && (
                                <input
                                    type="text"
                                    value={formData[field.key] || ''}
                                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                                    className="input-field"
                                    required={field.required}
                                />
                            )}

                            {field.type === 'number' && (
                                <input
                                    type="text"
                                    value={formatDisplayNumber(formData[field.key])}
                                    onChange={(e) => setFormData({ ...formData, [field.key]: parseFormattedNumber(e.target.value) })}
                                    className="input-field"
                                    required={field.required}
                                    inputMode="numeric"
                                />
                            )}

                            {field.type === 'select' && (
                                <select
                                    value={formData[field.key] || ''}
                                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                                    className="input-field"
                                    required={field.required}
                                >
                                    <option value="">Seleccionar...</option>
                                    {field.options.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                </select>
                            )}

                            {field.type === 'relation' && (
                                <select
                                    value={formData[field.key] || ''}
                                    onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                                    className="input-field"
                                    required={field.required}
                                >
                                    <option value="">Seleccionar...</option>
                                    {(relatedData[field.relation] || []).map((item) => (
                                        <option key={item.id} value={item.id}>{item.nombre}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    ))}

                    <div className="flex gap-3 pt-5">
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="btn-secondary flex-1"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="btn-primary flex-1 flex items-center justify-center gap-2"
                        >
                            <Save size={18} />
                            Guardar
                        </button>
                    </div>
                </form>
            </div>
        );
    }

    // List view
    return (
        <div className="space-y-6 animate-fade-in">
            <button
                onClick={() => setActiveEntity(null)}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
            >
                <ChevronLeft size={18} />
                Volver
            </button>

            <div className="section-header">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center">
                        <Icon size={22} className="text-gold" />
                    </div>
                    <h2 className="text-lg font-bold">{config.name}</h2>
                </div>
                <button
                    onClick={handleAdd}
                    className="btn-primary flex items-center gap-2 text-sm"
                    style={{ padding: '10px 20px' }}
                >
                    <Plus size={17} />
                    Agregar
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
                </div>
            ) : items.length === 0 ? (
                <p className="empty-state">
                    No hay {config.name.toLowerCase()} registrados
                </p>
            ) : (
                <div className="space-y-2.5">
                    {items.map((item) => (
                        <div key={item.id} className="card flex items-center justify-between group" style={{ padding: '16px 20px' }}>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-white truncate text-[15px]">{item.nombre}</h3>
                                <div className="text-sm flex flex-wrap gap-2 mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                    {activeEntity === 'cajas' && (
                                        <>
                                            <span>{item.tipo}</span>
                                            <span>•</span>
                                            <span className={item.saldo_actual >= 0 ? 'text-green' : 'text-red'}>
                                                {formatMoney(item.saldo_actual)}
                                            </span>
                                        </>
                                    )}
                                    {activeEntity === 'proyectos' && item.estado && (
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${item.estado === 'Activo' ? 'bg-green-500/12 text-green-400' :
                                            item.estado === 'Pausado' ? 'bg-amber-500/12 text-amber-400' :
                                                'bg-gray-500/12 text-gray-400'
                                            }`}>
                                            {item.estado}
                                        </span>
                                    )}
                                    {activeEntity === 'terceros' && item.tipo && (
                                        <span>{item.tipo}</span>
                                    )}
                                    {activeEntity === 'empresas' && item.nit && (
                                        <span>NIT: {item.nit}</span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 ml-4 opacity-60 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleEdit(item)}
                                    className="p-2 text-gray-400 hover:text-gold transition-colors rounded-lg hover:bg-white/5"
                                >
                                    <Pencil size={16} />
                                </button>
                                <button
                                    onClick={() => handleDelete(item)}
                                    className="p-2 text-gray-400 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete confirmation modal */}
            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="Eliminar registro"
                message={`¿Estás seguro de eliminar "${deleteConfirm?.nombre}"? Esta acción no se puede deshacer.`}
                confirmText="Sí, eliminar"
                cancelText="Cancelar"
                type="danger"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteConfirm(null)}
            />
        </div>
    );
}
