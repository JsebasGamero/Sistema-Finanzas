// Layout component - Mobile-first navigation with fixed header and footer
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
    RefreshCw
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
        <div className="h-screen bg-primary flex flex-col overflow-hidden">
            {/* Header - Fixed at top */}
            <header className="flex-shrink-0 bg-secondary px-4 py-3 flex items-center justify-between border-b border-white/10">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="p-2 touch-target lg:hidden"
                    >
                        {menuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                    <h1 className="text-lg font-bold text-gold">
                        💰 FinanzasObra
                    </h1>
                </div>

                <div className="flex items-center gap-2">
                    {/* Sync indicator */}
                    <div className={`sync-indicator ${isOnline ? 'online' : 'offline'}`}>
                        {isOnline ? <Wifi size={14} /> : <WifiOff size={14} className="pulse" />}
                        <span>{isOnline ? 'Online' : 'Offline'}</span>
                    </div>

                    {/* Pending sync badge */}
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

            {/* Mobile menu overlay */}
            {menuOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setMenuOpen(false)}
                />
            )}

            {/* Content area - Scrollable */}
            <main className="flex-1 overflow-y-auto p-4 pb-2">
                {children}
            </main>

            {/* Bottom navigation - Fixed at bottom */}
            <nav className="flex-shrink-0 bg-secondary border-t border-white/10 px-1 py-2 lg:hidden">
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
    );
}
