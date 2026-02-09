// CajaList component - Displays all cash boxes with balances
import { useState, useEffect } from 'react';
import { Wallet, Building2, CreditCard, Banknote, TrendingUp, TrendingDown } from 'lucide-react';
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
            case 'Efectivo': return 'text-green-400 bg-green-500/10';
            case 'Banco': return 'text-blue-400 bg-blue-500/10';
            case 'Tarjeta': return 'text-purple-400 bg-purple-500/10';
            default: return 'text-gray-400 bg-gray-500/10';
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
        <div className="space-y-8">
            {/* Total balance card */}
            <div className="card bg-gradient-to-br from-amber-500/20 to-amber-600/10 border-amber-500/30">
                <p className="text-sm text-gray-400 mb-2">Saldo Total</p>
                <p className={`text-3xl font-bold ${totalBalance >= 0 ? 'text-green' : 'text-red'}`}>
                    {formatMoney(totalBalance)}
                </p>
                <p className="text-xs text-gray-500 mt-3">{cajas.length} cajas registradas</p>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-3 overflow-x-auto pb-2">
                {['all', 'Efectivo', 'Banco', 'Tarjeta'].map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 rounded-full whitespace-nowrap text-sm font-medium transition-colors
              ${filter === f
                                ? 'bg-gold text-white'
                                : 'bg-card text-gray-400 hover:text-white'
                            }`}
                    >
                        {f === 'all' ? 'Todas' : f}
                    </button>
                ))}
            </div>

            {/* Cajas grid - responsive */}
            <div className="responsive-grid">
                {filteredCajas.map((caja) => {
                    const Icon = getIcon(caja.tipo);
                    const colorClass = getColor(caja.tipo);
                    const empresa = empresas[caja.empresa_id];
                    const balance = caja.saldo_actual || 0;

                    return (
                        <div key={caja.id} className="card flex flex-col gap-4">
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-xl ${colorClass}`}>
                                    <Icon size={24} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-white truncate">{caja.nombre}</h3>
                                    <p className="text-sm text-gray-400 truncate">
                                        {empresa?.nombre || 'Sin empresa'} • {caja.tipo}
                                    </p>
                                </div>
                            </div>

                            <div className="text-right">
                                <p className={`font-bold text-lg ${balance >= 0 ? 'text-green' : 'text-red'}`}>
                                    {formatMoney(balance)}
                                </p>
                                <div className="flex items-center justify-end gap-1 text-xs text-gray-500">
                                    {balance >= 0 ? (
                                        <TrendingUp size={12} className="text-green-500" />
                                    ) : (
                                        <TrendingDown size={12} className="text-red-500" />
                                    )}
                                    <span>Saldo actual</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {filteredCajas.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                    No hay cajas de tipo "{filter}"
                </div>
            )}
        </div>
    );
}
