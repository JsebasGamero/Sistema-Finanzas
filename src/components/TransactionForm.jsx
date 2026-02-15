// TransactionForm component - Form for income/expense/transfers with confirmation
import { useState, useEffect } from 'react';
import { Save, Camera, ArrowRight, Check, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, CreditCard, Receipt, RefreshCw } from 'lucide-react';
import { db, generateUUID } from '../services/db';
import syncService, { addToSyncQueue, processSyncQueue } from '../services/syncService';
import ConfirmModal from './ConfirmModal';
import DeudaCajasPanel from './DeudaCajasPanel';
import DeudaTercerosPanel from './DeudaTercerosPanel';
import AutocompleteInput from './AutocompleteInput';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';
import { XCircle } from 'lucide-react';

export default function TransactionForm({ onTransactionAdded }) {
    const { currentUser } = useAuth();
    // Section selector: 'transaccion' or 'deudas'
    const [activeSection, setActiveSection] = useState('transaccion');

    const [tipo, setTipo] = useState('EGRESO');
    const [monto, setMonto] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [categoria, setCategoria] = useState('');
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
    const [proyectoId, setProyectoId] = useState('');
    const [empresaId, setEmpresaId] = useState('');
    const [cajaOrigenId, setCajaOrigenId] = useState('');
    const [cajaDestinoId, setCajaDestinoId] = useState('');
    const [terceroId, setTerceroId] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [soporteUrl, setSoporteUrl] = useState(null);

    // Confirmation modal state
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingTransaction, setPendingTransaction] = useState(null);

    // Data lists
    const [empresas, setEmpresas] = useState([]);
    const [proyectos, setProyectos] = useState([]);
    const [cajas, setCajas] = useState([]);
    const [terceros, setTerceros] = useState([]);
    const [categorias, setCategorias] = useState([]);

    // Default categories to seed if none exist
    const defaultCategorias = [
        'Nómina', 'Materiales', 'Viáticos', 'Combustible (ACPM)', 'Transporte',
        'Alquiler Maquinaria', 'Préstamo', 'Pago Préstamo', 'Servicios', 'Seguridad Social', 'Otros'
    ];

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        const [empresasData, proyectosData, cajasData, tercerosData] = await Promise.all([
            db.empresas.toArray(),
            db.proyectos.toArray(),
            db.cajas.toArray(),
            db.terceros.toArray()
        ]);
        setEmpresas(empresasData);
        setProyectos(proyectosData);
        setCajas(cajasData);
        setTerceros(tercerosData);

        // Load categories from DB, seed if empty
        let categoriasData = [];
        try {
            categoriasData = await db.categorias.toArray();
            if (categoriasData.length === 0) {
                // Seed default categories
                const newCats = defaultCategorias.map(nombre => ({
                    id: generateUUID(),
                    nombre,
                    tipo: 'general',
                    created_at: new Date().toISOString()
                }));
                await db.categorias.bulkAdd(newCats);
                categoriasData = newCats;
            }
        } catch (e) {
            // If table doesn't exist yet, use defaults as objects
            categoriasData = defaultCategorias.map((nombre, i) => ({
                id: `default-${i}`,
                nombre,
                tipo: 'general'
            }));
        }
        setCategorias(categoriasData);
    }

    // Filter cajas by selected empresa
    const cajasFiltradas = empresaId
        ? cajas.filter(c => c.empresa_id === empresaId)
        : cajas;

    function formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
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

    // Create a new tercero on the fly
    async function createNewTercero(nombre) {
        const newTercero = {
            id: generateUUID(),
            nombre: nombre,
            tipo: 'Proveedor', // Default type
            nit_cedula: '',
            telefono: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        await db.terceros.add(newTercero);

        // Add to sync queue for Supabase
        await addToSyncQueue('terceros', 'INSERT', newTercero);

        // Try to sync immediately if online
        if (navigator.onLine) {
            processSyncQueue().catch(err => console.log('Sync error:', err));
        }

        // Update local state
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
            empresa_id: empresaId || null,
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
            empresa_id: empresaId || null, // Link to current company if selected
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

    function handleSubmit(e) {
        e.preventDefault();
        if (!monto || !cajaOrigenId) return;

        // Get names for confirmation display
        const cajaOrigen = cajas.find(c => c.id === cajaOrigenId);
        const cajaDestino = cajas.find(c => c.id === cajaDestinoId);
        const proyecto = proyectos.find(p => p.id === proyectoId);
        const tercero = terceros.find(t => t.id === terceroId);

        const transactionData = {
            fecha,
            descripcion,
            monto: parseFloat(monto),
            tipo_movimiento: tipo,
            categoria,
            proyecto_id: proyectoId || null,
            caja_origen_id: cajaOrigenId,
            caja_destino_id: tipo === 'TRANSFERENCIA' ? cajaDestinoId : null,
            tercero_id: terceroId || null,
            soporte_url: soporteUrl,
            sincronizado: false,
            usuario_nombre: currentUser?.nombre || 'Desconocido',
            // For display in confirmation
            _cajaOrigenNombre: cajaOrigen?.nombre,
            _cajaDestinoNombre: cajaDestino?.nombre,
            _proyectoNombre: proyecto?.nombre,
            _terceroNombre: tercero?.nombre
        };

        setPendingTransaction(transactionData);
        setShowConfirm(true);
    }

    async function handleConfirm() {
        if (!pendingTransaction) return;

        setShowConfirm(false);
        setSaving(true);

        try {
            // Remove display-only fields before saving
            const { _cajaOrigenNombre, _cajaDestinoNombre, _proyectoNombre, _terceroNombre, ...dataToSave } = pendingTransaction;

            await syncService.createTransaction(dataToSave);

            // Reset form
            setMonto('');
            setDescripcion('');
            setCategoria('');
            setProyectoId('');
            setCajaDestinoId('');
            setSoporteUrl(null);
            setUploading(false);
            if (tipo !== 'TRANSFERENCIA') {
                setCajaDestinoId('');
            }

            setSaved(true);
            setTimeout(() => setSaved(false), 2000);

            if (onTransactionAdded) {
                onTransactionAdded();
            }
        } catch (error) {
            console.error('Error saving transaction:', error);
            alert('Error al guardar. Los datos se guardarán localmente.');
        } finally {
            setSaving(false);
            setPendingTransaction(null);
        }
    }

    function handleCancelConfirm() {
        setShowConfirm(false);
        setPendingTransaction(null);
    }

    // Build confirmation details
    function getConfirmDetails() {
        if (!pendingTransaction) return [];

        const details = [
            { label: 'Tipo', value: pendingTransaction.tipo_movimiento, highlight: true },
            { label: 'Monto', value: formatMoney(pendingTransaction.monto), highlight: true },
            { label: 'Fecha', value: pendingTransaction.fecha },
        ];

        if (pendingTransaction._cajaOrigenNombre) {
            details.push({
                label: pendingTransaction.tipo_movimiento === 'TRANSFERENCIA' ? 'De' : 'Caja',
                value: pendingTransaction._cajaOrigenNombre
            });
        }

        if (pendingTransaction._cajaDestinoNombre) {
            details.push({ label: 'A', value: pendingTransaction._cajaDestinoNombre });
        }

        if (pendingTransaction.categoria) {
            details.push({ label: 'Categoría', value: pendingTransaction.categoria });
        }

        if (pendingTransaction._proyectoNombre) {
            details.push({ label: 'Proyecto', value: pendingTransaction._proyectoNombre });
        }

        if (pendingTransaction._terceroNombre) {
            details.push({ label: 'Beneficiario', value: pendingTransaction._terceroNombre });
        }

        if (pendingTransaction.descripcion) {
            details.push({ label: 'Descripción', value: pendingTransaction.descripcion });
        }

        return details;
    }

    function getConfirmType() {
        switch (tipo) {
            case 'INGRESO': return 'success';
            case 'EGRESO': return 'danger';
            default: return 'default';
        }
    }

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            {/* Main Section Selector */}
            <div className="grid grid-cols-2 gap-3 mb-8">
                <button
                    type="button"
                    onClick={() => setActiveSection('transaccion')}
                    className={`tab-pill text-center py-3.5 px-4 text-sm flex items-center justify-center gap-2
                        ${activeSection === 'transaccion' ? 'active' : ''}`}
                    style={{ borderRadius: 'var(--radius-md)' }}
                >
                    <Receipt size={18} />
                    Transacción
                </button>
                <button
                    type="button"
                    onClick={() => setActiveSection('deudas')}
                    className={`tab-pill text-center py-3.5 px-4 text-sm flex items-center justify-center gap-2
                        ${activeSection === 'deudas' ? 'active' : ''}`}
                    style={{ borderRadius: 'var(--radius-md)' }}
                >
                    <CreditCard size={18} />
                    Deudas
                </button>
            </div>

            {/* DEUDAS SECTION */}
            {activeSection === 'deudas' && (
                <div className="space-y-4">
                    {/* Inter-caja debts - Préstamos entre cajas */}
                    <div className="card">
                        <DeudaCajasPanel />
                    </div>

                    {/* Supplier debts - Cuentas por Pagar */}
                    <div className="card">
                        <DeudaTercerosPanel />
                    </div>
                </div>
            )}

            {/* TRANSACCION SECTION */}
            {activeSection === 'transaccion' && (
                <>
                    <h2 className="section-title">
                        {tipo === 'INGRESO' && <><ArrowDownLeft size={22} className="text-green-500" /> Nuevo Ingreso</>}
                        {tipo === 'EGRESO' && <><ArrowUpRight size={22} className="text-red-500" /> Nuevo Egreso</>}
                        {tipo === 'TRANSFERENCIA' && <><ArrowLeftRight size={22} className="text-blue-500" /> Nueva Transferencia</>}
                    </h2>

                    {/* Type selector */}
                    <div className="grid grid-cols-3 gap-2.5 mb-7">
                        {['INGRESO', 'EGRESO', 'TRANSFERENCIA'].map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTipo(t)}
                                className={`py-3 px-2 rounded-xl font-semibold text-sm transition-all
              ${tipo === t
                                        ? t === 'INGRESO'
                                            ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/20'
                                            : t === 'EGRESO'
                                                ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/20'
                                                : 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/20'
                                        : 'bg-card text-gray-400 hover:text-white'
                                    }`}
                            >
                                {t === 'INGRESO' && '+ Ingreso'}
                                {t === 'EGRESO' && '- Egreso'}
                                {t === 'TRANSFERENCIA' && '↔ Transfer'}
                            </button>
                        ))}
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Amount */}
                        <div>
                            <label className="label">Monto *</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-2xl">$</span>
                                <input
                                    type="text"
                                    value={formatDisplayNumber(monto)}
                                    onChange={(e) => setMonto(parseFormattedNumber(e.target.value))}
                                    className="input-field text-2xl font-bold"
                                    style={{ paddingLeft: '48px', height: '60px' }}
                                    placeholder="0"
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
                                value={fecha}
                                onChange={(e) => setFecha(e.target.value)}
                                className="input-field"
                            />
                        </div>

                        {/* Empresa */}
                        <div>
                            <label className="label">Empresa</label>
                            <select
                                value={empresaId}
                                onChange={(e) => {
                                    setEmpresaId(e.target.value);
                                    setCajaOrigenId(''); // Reset caja when empresa changes
                                    setCajaDestinoId('');
                                }}
                                className="input-field"
                            >
                                <option value="">Todas las empresas</option>
                                {empresas.map((empresa) => (
                                    <option key={empresa.id} value={empresa.id}>
                                        {empresa.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Caja Origen */}
                        <div>
                            <label className="label">
                                {tipo === 'TRANSFERENCIA' ? 'Caja Origen (De donde sale)' : 'Caja'} *
                            </label>
                            <AutocompleteInput
                                items={cajasFiltradas}
                                value={cajaOrigenId}
                                onChange={setCajaOrigenId}
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
                                <div className="absolute left-1/2 -translate-x-1/2 -top-4 bg-primary p-1">
                                    <ArrowRight className="text-gold" size={20} />
                                </div>
                                <label className="label">Caja Destino (A donde va)</label>
                                <AutocompleteInput
                                    items={cajas.filter(c => c.id !== cajaOrigenId)}
                                    value={cajaDestinoId}
                                    onChange={setCajaDestinoId}
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
                                value={categoria}
                                onChange={setCategoria}
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
                                value={proyectoId}
                                onChange={setProyectoId}
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
                                    value={terceroId}
                                    onChange={setTerceroId}
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
                                value={descripcion}
                                onChange={(e) => setDescripcion(e.target.value)}
                                className="input-field min-h-[80px] resize-none"
                                placeholder="Detalle del movimiento..."
                            />
                        </div>

                        {/* Photo button */}
                        {/* Soporte Upload */}
                        <div className="space-y-3">
                            <input
                                type="file"
                                id="soporte-upload"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files[0];
                                    if (!file) return;

                                    setUploading(true);
                                    try {
                                        const fileExt = file.name.split('.').pop();
                                        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
                                        const filePath = `${currentUser?.id || 'anon'}/${fileName}`;

                                        const { error: uploadError } = await supabase.storage
                                            .from('soportes')
                                            .upload(filePath, file);

                                        if (uploadError) throw uploadError;

                                        const { data: { publicUrl } } = supabase.storage
                                            .from('soportes')
                                            .getPublicUrl(filePath);

                                        setSoporteUrl(publicUrl);
                                    } catch (error) {
                                        console.error('Error uploading image:', error);
                                        alert(`Error al subir la imagen: ${error.message || 'Verifica que el bucket "soportes" exista en Supabase Storage'}`);
                                    } finally {
                                        setUploading(false);
                                    }
                                }}
                            />

                            {!soporteUrl ? (
                                <button
                                    type="button"
                                    onClick={() => document.getElementById('soporte-upload').click()}
                                    disabled={uploading}
                                    className="w-full py-3.5 border-2 border-dashed rounded-xl flex items-center justify-center gap-2 transition-colors group"
                                    style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-muted)' }}
                                    onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = 'var(--accent-gold)'; e.currentTarget.style.color = 'var(--accent-gold)'; } }}
                                    onMouseLeave={e => { if (!uploading) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--text-muted)'; } }}
                                >
                                    {uploading ? (
                                        <RefreshCw size={20} className="animate-spin text-gold" />
                                    ) : (
                                        <Camera size={20} className="group-hover:scale-110 transition-transform" />
                                    )}
                                    {uploading ? 'Subiendo imagen...' : 'Agregar foto del soporte'}
                                </button>
                            ) : (
                                <div className="relative rounded-xl overflow-hidden border border-white/10 group">
                                    <img
                                        src={soporteUrl}
                                        alt="Soporte preview"
                                        className="w-full h-48 object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                                    />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            type="button"
                                            onClick={() => setSoporteUrl(null)}
                                            className="bg-red-500/80 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                                            title="Eliminar imagen"
                                        >
                                            <XCircle size={24} />
                                        </button>
                                    </div>
                                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded-md backdrop-blur-sm flex items-center gap-1">
                                        <Check size={12} className="text-green-400" />
                                        Soporte adjunto
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Submit button */}
                        <button
                            type="submit"
                            disabled={saving || !monto || !cajaOrigenId}
                            className={`btn-primary w-full flex items-center justify-center gap-2 text-base
            ${saved ? '!bg-green-500 !shadow-green-500/30' : ''}`}
                            style={{ padding: '15px 24px', marginTop: '8px' }}
                        >
                            {saving ? (
                                <>
                                    <RefreshCw size={19} className="animate-spin" />
                                    Guardando...
                                </>
                            ) : saved ? (
                                <>
                                    <Check size={19} />
                                    ¡Guardado!
                                </>
                            ) : (
                                <>
                                    <Save size={19} />
                                    Guardar {tipo.toLowerCase()}
                                </>
                            )}
                        </button>
                    </form>

                    {/* Confirmation Modal */}
                    <ConfirmModal
                        isOpen={showConfirm}
                        title={`Confirmar ${tipo.toLowerCase()}`}
                        message="¿Deseas registrar este movimiento?"
                        details={getConfirmDetails()}
                        confirmText="Sí, registrar"
                        cancelText="Cancelar"
                        type={getConfirmType()}
                        onConfirm={handleConfirm}
                        onCancel={handleCancelConfirm}
                    />
                </>
            )}
        </div>
    );
}

