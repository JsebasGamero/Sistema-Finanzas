// TransactionForm component - Form for income/expense/transfers with confirmation
import { useState, useEffect } from 'react';
import { Save, Camera, ArrowRight, Check, ArrowDownLeft, ArrowUpRight, ArrowLeftRight } from 'lucide-react';
import { db } from '../services/db';
import syncService from '../services/syncService';
import ConfirmModal from './ConfirmModal';

export default function TransactionForm({ onTransactionAdded }) {
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

    // Confirmation modal state
    const [showConfirm, setShowConfirm] = useState(false);
    const [pendingTransaction, setPendingTransaction] = useState(null);

    // Data lists
    const [empresas, setEmpresas] = useState([]);
    const [proyectos, setProyectos] = useState([]);
    const [cajas, setCajas] = useState([]);
    const [terceros, setTerceros] = useState([]);

    // Categories based on Excel analysis
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
            soporte_url: null,
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
            setTerceroId('');
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
        <div className="max-w-lg mx-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                {tipo === 'INGRESO' && <><ArrowDownLeft size={22} className="text-green-500" /> Nuevo Ingreso</>}
                {tipo === 'EGRESO' && <><ArrowUpRight size={22} className="text-red-500" /> Nuevo Egreso</>}
                {tipo === 'TRANSFERENCIA' && <><ArrowLeftRight size={22} className="text-blue-500" /> Nueva Transferencia</>}
            </h2>

            {/* Type selector */}
            <div className="grid grid-cols-3 gap-2 mb-6">
                {['INGRESO', 'EGRESO', 'TRANSFERENCIA'].map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTipo(t)}
                        className={`py-3 px-2 rounded-lg font-medium text-sm transition-all
              ${tipo === t
                                ? t === 'INGRESO'
                                    ? 'bg-green-500 text-white'
                                    : t === 'EGRESO'
                                        ? 'bg-red-500 text-white'
                                        : 'bg-blue-500 text-white'
                                : 'bg-card text-gray-400'
                            }`}
                    >
                        {t === 'INGRESO' && '+ Ingreso'}
                        {t === 'EGRESO' && '- Egreso'}
                        {t === 'TRANSFERENCIA' && '↔ Transfer'}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Amount */}
                <div>
                    <label className="label">Monto *</label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-2xl">$</span>
                        <input
                            type="number"
                            value={monto}
                            onChange={(e) => setMonto(e.target.value)}
                            className="input-field text-2xl font-bold"
                            style={{ paddingLeft: '48px' }}
                            placeholder="0"
                            required
                            inputMode="decimal"
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
                    <select
                        value={cajaOrigenId}
                        onChange={(e) => setCajaOrigenId(e.target.value)}
                        className="input-field"
                        required
                    >
                        <option value="">Seleccionar caja...</option>
                        {cajasFiltradas.map((caja) => (
                            <option key={caja.id} value={caja.id}>
                                {caja.nombre} ({caja.tipo})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Caja Destino - Only for transfers */}
                {tipo === 'TRANSFERENCIA' && (
                    <div className="relative">
                        <div className="absolute left-1/2 -translate-x-1/2 -top-4 bg-primary p-1">
                            <ArrowRight className="text-gold" size={20} />
                        </div>
                        <label className="label">Caja Destino (A donde va)</label>
                        <select
                            value={cajaDestinoId}
                            onChange={(e) => setCajaDestinoId(e.target.value)}
                            className="input-field"
                            required={tipo === 'TRANSFERENCIA'}
                        >
                            <option value="">Seleccionar caja...</option>
                            {cajas.filter(c => c.id !== cajaOrigenId).map((caja) => {
                                const empresaCaja = empresas.find(e => e.id === caja.empresa_id);
                                return (
                                    <option key={caja.id} value={caja.id}>
                                        {caja.nombre} ({caja.tipo}) - {empresaCaja?.nombre || 'Sin empresa'}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                )}

                {/* Category */}
                <div>
                    <label className="label">Categoría</label>
                    <select
                        value={categoria}
                        onChange={(e) => setCategoria(e.target.value)}
                        className="input-field"
                    >
                        <option value="">Seleccionar categoría...</option>
                        {categorias.map((cat) => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                {/* Project */}
                <div>
                    <label className="label">Proyecto / Obra</label>
                    <select
                        value={proyectoId}
                        onChange={(e) => setProyectoId(e.target.value)}
                        className="input-field"
                    >
                        <option value="">Sin proyecto específico</option>
                        {proyectos.map((proyecto) => (
                            <option key={proyecto.id} value={proyecto.id}>
                                {proyecto.nombre}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Third party */}
                {tipo === 'EGRESO' && (
                    <div>
                        <label className="label">Proveedor / Beneficiario</label>
                        <select
                            value={terceroId}
                            onChange={(e) => setTerceroId(e.target.value)}
                            className="input-field"
                        >
                            <option value="">Ninguno</option>
                            {terceros.map((tercero) => (
                                <option key={tercero.id} value={tercero.id}>
                                    {tercero.nombre} ({tercero.tipo})
                                </option>
                            ))}
                        </select>
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
                <button
                    type="button"
                    className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 flex items-center justify-center gap-2 hover:border-gold hover:text-gold transition-colors"
                >
                    <Camera size={20} />
                    Agregar foto del soporte
                </button>

                {/* Submit button */}
                <button
                    type="submit"
                    disabled={saving || !monto || !cajaOrigenId}
                    className={`btn-primary w-full flex items-center justify-center gap-2 text-lg
            ${saved ? 'bg-green-500' : ''}`}
                >
                    {saving ? (
                        <>
                            <RefreshCw size={20} className="animate-spin" />
                            Guardando...
                        </>
                    ) : saved ? (
                        <>
                            <Check size={20} />
                            ¡Guardado!
                        </>
                    ) : (
                        <>
                            <Save size={20} />
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
        </div>
    );
}

function RefreshCw({ size, className }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
        </svg>
    );
}
