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
    Coins
} from 'lucide-react';
import useOnlineStatus from '../hooks/useOnlineStatus';

export default function Layout({ children, activeTab, setActiveTab, pendingSync, onSync }) {
    const [menuOpen, setMenuOpen] = useState(false);
    const isOnline = useOnlineStatus();

    const tabs = [
        { id: 'dashboard', label: 'Inicio', icon: Home },
        { id: 'nueva', label: 'Nueva', icon: PlusCircle },
        { id: 'cajas', label: 'Cajas', icon: Wallet },
        { id: 'config', label: 'Config', icon: Settings },
        { id: 'reportes', label: 'Reportes', icon: BarChart3 },
    ];

    return (
        <div className="h-screen bg-primary flex flex-col lg:flex-row overflow-hidden">
            {/* Desktop Sidebar - Hidden on mobile, visible on lg+ */}
            <aside className="hidden lg:flex lg:flex-col lg:w-64 bg-secondary border-r border-white/10 flex-shrink-0">
                {/* Sidebar Header */}
                <div className="p-4 border-b border-white/10">
                    <h1 className="text-xl font-bold text-gold flex items-center gap-2">
                        <Coins size={26} />
                        FinanzasObra
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">Sistema de Gestión Financiera</p>
                </div>

                {/* Sidebar Navigation */}
                <nav className="flex-1 p-3 space-y-1">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all
                                    ${isActive
                                        ? 'bg-gold/15 text-gold border-l-4 border-gold'
                                        : 'text-gray-400 hover:bg-white/5 hover:text-white border-l-4 border-transparent'
                                    }`}
                            >
                                <Icon size={22} />
                                <span className="font-medium">{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Sidebar Footer - Status */}
                <div className="p-4 border-t border-white/10 space-y-3">
                    <div className={`sync-indicator ${isOnline ? 'online' : 'offline'} justify-center`}>
                        {isOnline ? <Wifi size={14} /> : <WifiOff size={14} className="pulse" />}
                        <span>{isOnline ? 'Conectado' : 'Sin conexión'}</span>
                    </div>

                    {pendingSync > 0 && (
                        <button
                            onClick={onSync}
                            className="w-full flex items-center justify-center gap-2 bg-amber-500/20 text-amber-400 px-3 py-2 rounded-lg text-sm hover:bg-amber-500/30 transition-colors"
                        >
                            <RefreshCw size={16} />
                            Sincronizar ({pendingSync})
                        </button>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header - Hidden on desktop */}
                <header className="flex-shrink-0 bg-secondary px-4 py-3 flex items-center justify-between border-b border-white/10 lg:hidden">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setMenuOpen(!menuOpen)}
                            className="p-2 touch-target"
                        >
                            {menuOpen ? <X size={24} /> : <Menu size={24} />}
                        </button>
                        <h1 className="text-lg font-bold text-gold flex items-center gap-2">
                            <Coins size={22} />
                            FinanzasObra
                        </h1>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`sync-indicator ${isOnline ? 'online' : 'offline'}`}>
                            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} className="pulse" />}
                            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
                        </div>

                        {pendingSync > 0 && (
                            <button
                                onClick={onSync}
                                className="flex items-center gap-1 bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full text-xs"
                            >
                                <RefreshCw size={12} />
                                {pendingSync}
                            </button>
                        )}
                    </div>
                </header>

                {/* Desktop Header - Shows current section name */}
                <header className="hidden lg:flex flex-shrink-0 bg-secondary px-6 py-4 items-center justify-between border-b border-white/10">
                    <h2 className="text-xl font-semibold text-white">
                        {tabs.find(t => t.id === activeTab)?.label || 'Dashboard'}
                    </h2>
                    <div className="flex items-center gap-3">
                        {pendingSync > 0 && (
                            <button
                                onClick={onSync}
                                className="flex items-center gap-2 bg-amber-500/20 text-amber-400 px-4 py-2 rounded-lg text-sm hover:bg-amber-500/30 transition-colors"
                            >
                                <RefreshCw size={16} />
                                Sincronizar {pendingSync} pendiente(s)
                            </button>
                        )}
                    </div>
                </header>

                {/* Mobile menu overlay */}
                {menuOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setMenuOpen(false)}
                    />
                )}

                {/* Content area - Scrollable */}
                <main className="flex-1 overflow-y-auto p-5 lg:p-8 pb-4 lg:pb-8">
                    <div className="max-w-7xl mx-auto">
                        {children}
                    </div>
                </main>

                {/* Mobile Bottom Navigation - Hidden on desktop */}
                <nav className="flex-shrink-0 bg-secondary border-t border-white/10 px-1 py-2 lg:hidden safe-area-bottom">
                    <div className="flex justify-around">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex flex-col items-center gap-1 p-2 rounded-lg touch-target transition-colors
                                        ${isActive ? 'text-gold bg-gold/10' : 'text-gray-400 hover:text-white'}`}
                                >
                                    <Icon size={22} />
                                    <span className="text-xs font-medium">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </nav>
            </div>
        </div>
    );
}

