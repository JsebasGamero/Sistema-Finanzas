// CajaList component - Displays all cash boxes with balances
import { useState, useEffect } from 'react';
import { Wallet, Building2, CreditCard, Banknote, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { db } from '../services/db';

export default function CajaList() {
    const [cajas, setCajas] = useState([]);
    const [empresas, setEmpresas] = useState({});
    const [filter, setFilter] = useState('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        try {
            const [cajasData, empresasData] = await Promise.all([
                db.cajas.toArray(),
                db.empresas.toArray()
            ]);

            const empresasMap = Object.fromEntries(
                empresasData.map(e => [e.id, e])
            );

            setCajas(cajasData);
            setEmpresas(empresasMap);
        } finally {
            setLoading(false);
        }
    }

    const filteredCajas = filter === 'all'
        ? cajas
        : cajas.filter(c => c.tipo === filter);

    const totalBalance = cajas.reduce((sum, c) => sum + (c.saldo_actual || 0), 0);

    const getIcon = (tipo) => {
        switch (tipo) {
            case 'Efectivo': return Banknote;
            case 'Banco': return Building2;
            case 'Tarjeta': return CreditCard;
            default: return Wallet;
        }
    };

    const getColor = (tipo) => {
        switch (tipo) {
            case 'Efectivo': return { icon: 'text-green-400', bg: 'bg-green-500/10' };
            case 'Banco': return { icon: 'text-blue-400', bg: 'bg-blue-500/10' };
            case 'Tarjeta': return { icon: 'text-purple-400', bg: 'bg-purple-500/10' };
            default: return { icon: 'text-gray-400', bg: 'bg-gray-500/10' };
        }
    };

    function formatMoney(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount || 0);
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Total balance card */}
            <div className="card stat-card stat-gold" style={{
                background: 'linear-gradient(145deg, rgba(245,166,35,0.08) 0%, rgba(26,37,64,0.85) 100%)',
                borderColor: 'rgba(245,166,35,0.12)'
            }}>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/12 flex items-center justify-center">
                        <DollarSign size={22} className="text-amber-400" />
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Saldo Total en Cajas</span>
                </div>
                <p className={`text-3xl font-bold tracking-tight ${totalBalance >= 0 ? 'text-green' : 'text-red'}`}>
                    {formatMoney(totalBalance)}
                </p>
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                    {cajas.length} cajas registradas
                </p>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2.5 overflow-x-auto pb-1">
                {['all', 'Efectivo', 'Banco', 'Tarjeta'].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`tab-pill ${filter === f ? 'active' : ''}`}
                    >
                        {f === 'all' ? 'Todas' : f}
                    </button>
                ))}
            </div>

            {/* Cajas grid */}
            <div className="responsive-grid">
                {filteredCajas.map((caja) => {
                    const Icon = getIcon(caja.tipo);
                    const color = getColor(caja.tipo);
                    const empresa = empresas[caja.empresa_id];
                    const balance = caja.saldo_actual || 0;

                    return (
                        <div key={caja.id} className="card flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                <div className={`w-11 h-11 rounded-xl ${color.bg} flex items-center justify-center`}>
                                    <Icon size={22} className={color.icon} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-white truncate text-[15px]">{caja.nombre}</h3>
                                    <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                                        {empresa?.nombre || 'Sin empresa'} • {caja.tipo}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-end justify-between">
                                <p className={`font-bold text-xl tracking-tight ${balance >= 0 ? 'text-green' : 'text-red'}`}>
                                    {formatMoney(balance)}
                                </p>
                                <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {balance >= 0 ? (
                                        <TrendingUp size={13} className="text-green-500" />
                                    ) : (
                                        <TrendingDown size={13} className="text-red-500" />
                                    )}
                                    <span>Saldo</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredCajas.length === 0 && (
                <p className="empty-state">
                    No hay cajas de tipo "{filter}"
                </p>
            )}
        </div>
    );
}
