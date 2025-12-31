// ConfirmModal component - Reusable confirmation dialog
import { X, Check, AlertTriangle } from 'lucide-react';

export default function ConfirmModal({
    isOpen,
    title,
    message,
    details,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    type = 'default', // 'default', 'danger', 'success'
    onConfirm,
    onCancel
}) {
    if (!isOpen) return null;

    const typeStyles = {
        default: {
            icon: AlertTriangle,
            iconBg: 'bg-amber-500/20',
            iconColor: 'text-amber-400',
            confirmBg: 'bg-amber-500 hover:bg-amber-600'
        },
        danger: {
            icon: AlertTriangle,
            iconBg: 'bg-red-500/20',
            iconColor: 'text-red-400',
            confirmBg: 'bg-red-500 hover:bg-red-600'
        },
        success: {
            icon: Check,
            iconBg: 'bg-green-500/20',
            iconColor: 'text-green-400',
            confirmBg: 'bg-green-500 hover:bg-green-600'
        }
    };

    const style = typeStyles[type];
    const Icon = style.icon;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative bg-secondary rounded-xl shadow-2xl w-full max-w-md border border-white/10 animate-in fade-in zoom-in duration-200">
                {/* Close button */}
                <button
                    onClick={onCancel}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
                >
                    <X size={20} />
                </button>

                {/* Content */}
                <div className="p-6">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-full ${style.iconBg} flex items-center justify-center mx-auto mb-4`}>
                        <Icon size={24} className={style.iconColor} />
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-center text-white mb-2">
                        {title}
                    </h3>

                    {/* Message */}
                    <p className="text-gray-400 text-center mb-4">
                        {message}
                    </p>

                    {/* Details (optional) */}
                    {details && (
                        <div className="bg-card rounded-lg p-4 mb-6 space-y-2">
                            {details.map((detail, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                    <span className="text-gray-400">{detail.label}</span>
                                    <span className={`font-medium ${detail.highlight ? 'text-gold' : 'text-white'}`}>
                                        {detail.value}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-3 px-4 rounded-lg bg-card text-gray-300 font-medium hover:bg-gray-600 transition-colors"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 py-3 px-4 rounded-lg text-white font-medium transition-colors ${style.confirmBg}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
