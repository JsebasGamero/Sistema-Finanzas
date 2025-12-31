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
    ChevronLeft
} from 'lucide-react';
import { db, generateUUID } from '../services/db';
import { supabase, isSupabaseConfigured } from '../services/supabase';
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
                const updated = { ...formData, updated_at: now };
                await db[activeEntity].update(editingItem.id, updated);

                if (isSupabaseConfigured()) {
                    await supabase.from(activeEntity).update(updated).eq('id', editingItem.id);
                }
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

                if (isSupabaseConfigured()) {
                    await supabase.from(activeEntity).insert(newItem);
                }
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

    // Main menu view
    if (!activeEntity) {
        return (
            <div className="space-y-6">
                <h2 className="text-xl font-bold">⚙️ Configuración</h2>
                <p className="text-gray-400">Administra los datos del sistema</p>

                <div className="grid grid-cols-2 gap-4">
                    {Object.entries(ENTITIES).map(([key, config]) => {
                        const Icon = config.icon;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveEntity(key)}
                                className="card hover:border-gold/50 transition-colors text-left"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-3 rounded-lg bg-gold/10">
                                        <Icon size={24} className="text-gold" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-white">{config.name}</h3>
                                        <p className="text-sm text-gray-500">Administrar</p>
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
            <div className="space-y-6">
                <button
                    onClick={() => setShowForm(false)}
                    className="flex items-center gap-2 text-gray-400 hover:text-white"
                >
                    <ChevronLeft size={20} />
                    Volver
                </button>

                <h2 className="text-xl font-bold">
                    {editingItem ? 'Editar' : 'Nuevo'} {config.name.slice(0, -1)}
                </h2>

                <form onSubmit={handleSave} className="space-y-4">
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
                                    type="number"
                                    value={formData[field.key] || ''}
                                    onChange={(e) => setFormData({ ...formData, [field.key]: parseFloat(e.target.value) || 0 })}
                                    className="input-field"
                                    required={field.required}
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

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="flex-1 py-3 px-4 rounded-lg bg-card text-gray-300"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="flex-1 py-3 px-4 rounded-lg bg-gold text-white font-medium flex items-center justify-center gap-2"
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
        <div className="space-y-6">
            <button
                onClick={() => setActiveEntity(null)}
                className="flex items-center gap-2 text-gray-400 hover:text-white"
            >
                <ChevronLeft size={20} />
                Volver
            </button>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Icon size={24} className="text-gold" />
                    <h2 className="text-xl font-bold">{config.name}</h2>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-2 bg-gold text-white px-4 py-2 rounded-lg font-medium"
                >
                    <Plus size={18} />
                    Agregar
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
                </div>
            ) : items.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    No hay {config.name.toLowerCase()} registrados
                </div>
            ) : (
                <div className="space-y-2">
                    {items.map((item) => (
                        <div key={item.id} className="card flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-white truncate">{item.nombre}</h3>
                                <div className="text-sm text-gray-500 flex flex-wrap gap-2">
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
                                        <span className={`px-2 py-0.5 rounded text-xs ${item.estado === 'Activo' ? 'bg-green-500/20 text-green-400' :
                                            item.estado === 'Pausado' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-gray-500/20 text-gray-400'
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
                            <div className="flex items-center gap-2 ml-4">
                                <button
                                    onClick={() => handleEdit(item)}
                                    className="p-2 text-gray-400 hover:text-gold transition-colors"
                                >
                                    <Pencil size={18} />
                                </button>
                                <button
                                    onClick={() => handleDelete(item)}
                                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                                >
                                    <Trash2 size={18} />
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
