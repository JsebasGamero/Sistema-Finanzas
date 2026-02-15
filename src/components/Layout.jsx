// Layout component - Responsive navigation with sidebar (desktop) and bottom nav (mobile)
import { useState } from 'react';
import {
    Home,
    PlusCircle,
    Wallet,
    Settings,
    BarChart3,
    Menu,
    X,
    Wifi,
    WifiOff,
    RefreshCw,
    Coins,
    LogOut,
    User
} from 'lucide-react';
import useOnlineStatus from '../hooks/useOnlineStatus';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children, activeTab, setActiveTab, pendingSync, onSync, onLogout }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const isOnline = useOnlineStatus();
    const { currentUser } = useAuth();

    const userInitials = currentUser?.nombre
        ? currentUser.nombre.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : '??';

    const tabs = [
        { id: 'dashboard', label: 'Inicio', icon: Home },
        { id: 'nueva', label: 'Nueva', icon: PlusCircle },
        { id: 'cajas', label: 'Cajas', icon: Wallet },
        { id: 'config', label: 'Config', icon: Settings },
        { id: 'reportes', label: 'Reportes', icon: BarChart3 },
    ];

    return (
        <div className="h-screen bg-primary flex flex-col lg:flex-row overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex lg:flex-col lg:w-[260px] bg-secondary flex-shrink-0"
                style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                {/* Sidebar Header */}
                <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h1 className="text-xl font-bold text-gold flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
                            <Coins size={20} className="text-white" />
                        </div>
                        FinanzasObra
                    </h1>
                    <p className="text-xs mt-1.5 ml-[46px]" style={{ color: 'var(--text-muted)' }}>
                        Sistema de Gestión Financiera
                    </p>
                </div>

                {/* Sidebar Navigation */}
                <nav className="flex-1 px-3 py-4 space-y-1.5">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all text-[14.5px]
                                    ${isActive
                                        ? 'text-gold font-semibold'
                                        : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                                    }`}
                                style={isActive ? {
                                    background: 'linear-gradient(135deg, rgba(245,166,35,0.1) 0%, rgba(245,166,35,0.04) 100%)',
                                    borderLeft: '3px solid var(--accent-gold)'
                                } : { borderLeft: '3px solid transparent' }}
                            >
                                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Sidebar Footer – User + Status */}
                <div className="px-4 py-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* User info */}
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-md animate-glow"
                            style={{ boxShadow: '0 0 18px rgba(245,166,35,0.15)' }}>
                            {userInitials}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{currentUser?.nombre}</p>
                            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{currentUser?.email}</p>
                        </div>
                    </div>

                    <div className={`sync-indicator ${isOnline ? 'online' : 'offline'} justify-center`}>
                        {isOnline ? <Wifi size={14} /> : <WifiOff size={14} className="pulse" />}
                        <span>{isOnline ? 'Conectado' : 'Sin conexión'}</span>
                    </div>

                    {pendingSync > 0 && (
                        <button
                            onClick={onSync}
                            className="w-full flex items-center justify-center gap-2 bg-amber-500/15 text-amber-400 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-500/25 transition-colors"
                        >
                            <RefreshCw size={15} />
                            Sincronizar ({pendingSync})
                        </button>
                    )}

                    <button
                        onClick={onLogout}
                        className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-red-400 px-3 py-2.5 rounded-xl text-sm hover:bg-red-500/8 transition-colors"
                    >
                        <LogOut size={15} />
                        Cerrar sesión
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="flex-shrink-0 bg-secondary px-4 py-3 flex items-center justify-between lg:hidden"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="p-2 touch-target text-gray-400"
                        >
                            {menuOpen ? <X size={22} /> : <Menu size={22} />}
                        </button>
                        <h1 className="text-lg font-bold text-gold flex items-center gap-2">
                            <Coins size={20} />
                            FinanzasObra
                        </h1>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <div className={`sync-indicator ${isOnline ? 'online' : 'offline'}`}>
                            {isOnline ? <Wifi size={13} /> : <WifiOff size={13} className="pulse" />}
                            <span className="hidden sm:inline text-xs">{isOnline ? 'Online' : 'Offline'}</span>
                        </div>

                        {pendingSync > 0 && (
                            <button
                                onClick={onSync}
                                className="flex items-center gap-1 bg-amber-500/15 text-amber-400 px-2.5 py-1.5 rounded-full text-xs font-medium"
                            >
                                <RefreshCw size={12} />
                                {pendingSync}
                            </button>
                        )}

                        {/* Mobile user avatar */}
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-white text-xs font-bold">
                            {userInitials}
                        </div>
                        <button
                            onClick={onLogout}
                            className="text-gray-500 hover:text-red-400 p-1 transition-colors"
                            title="Cerrar sesión"
                        >
                            <LogOut size={17} />
                        </button>
                    </div>
                </header>

                {/* Desktop Header */}
                <header className="hidden lg:flex flex-shrink-0 bg-secondary/80 backdrop-blur-md px-8 py-4 items-center justify-between"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 className="text-lg font-semibold text-white">
                        {tabs.find(t => t.id === activeTab)?.label || 'Dashboard'}
                    </h2>
                    <div className="flex items-center gap-4">
                        {pendingSync > 0 && (
                            <button
                                onClick={onSync}
                                className="flex items-center gap-2 bg-amber-500/15 text-amber-400 px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-500/25 transition-colors"
                            >
                                <RefreshCw size={15} />
                                Sincronizar {pendingSync} pendiente(s)
                            </button>
                        )}
                        <span className="text-sm text-gray-400">
                            Hola, <span className="text-white font-medium">{currentUser?.nombre}</span>
                        </span>
                    </div>
                </header>

                {/* Mobile menu overlay */}
                {menuOpen && (
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
                        onClick={() => setMenuOpen(false)}
                    />
                )}

                {/* Content area – Scrollable */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6 lg:p-8 pb-24 lg:pb-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>

                {/* Mobile Bottom Navigation */}
                <nav className="flex-shrink-0 bg-secondary lg:hidden safe-area-bottom"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="flex justify-around px-1 py-2">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl touch-target transition-all
                                        ${isActive
                                            ? 'text-gold'
                                            : 'text-gray-500 hover:text-white'
                                        }`}
                                    style={isActive ? {
                                        background: 'rgba(245,166,35,0.08)'
                                    } : undefined}
                                >
                                    <Icon size={21} strokeWidth={isActive ? 2.2 : 1.7} />
                                    <span className="text-[10px] font-semibold">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>
            </div>
        </div>
    );
}
