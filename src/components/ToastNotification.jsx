// ToastNotification - Toast notification container and items
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ICONS = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info
};

const STYLES = {
    success: 'bg-green-600 border-green-500',
    error: 'bg-red-600 border-red-500',
    warning: 'bg-amber-600 border-amber-500',
    info: 'bg-blue-600 border-blue-500'
};

function ToastItem({ toast, onRemove }) {
    const Icon = ICONS[toast.type] || Info;
    const style = STYLES[toast.type] || STYLES.info;

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-white animate-slide-in ${style}`}
            role="alert"
        >
            <Icon size={20} className="flex-shrink-0" />
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            <button
                onClick={() => onRemove(toast.id)}
                className="p-1 hover:bg-white/20 rounded transition-colors"
            >
                <X size={16} />
            </button>
        </div>
    );
}

export default function ToastContainer({ toasts, onRemove }) {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
            {toasts.map(toast => (
                <ToastItem
                    key={toast.id}
                    toast={toast}
                    onRemove={onRemove}
                />
            ))}
        </div>
    );
}
