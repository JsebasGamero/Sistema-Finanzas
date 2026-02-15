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
            iconBg: 'bg-amber-500/15',
            iconColor: 'text-amber-400',
            confirmBg: 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500'
        },
        danger: {
            icon: AlertTriangle,
            iconBg: 'bg-red-500/15',
            iconColor: 'text-red-400',
            confirmBg: 'bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500'
        },
        success: {
            icon: Check,
            iconBg: 'bg-green-500/15',
            iconColor: 'text-green-400',
            confirmBg: 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500'
        }
    };

    const style = typeStyles[type];
    const Icon = style.icon;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-md"
                onClick={onCancel}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md animate-fade-in"
                style={{
                    background: 'linear-gradient(145deg, rgba(26,37,64,0.95) 0%, rgba(19,28,49,0.9) 100%)',
                    backdropFilter: 'blur(16px)',
                    borderRadius: 'var(--radius-xl)',
                    border: '1px solid var(--border-visible)',
                    boxShadow: '0 24px 64px -12px rgba(0,0,0,0.5)'
                }}>
                {/* Close button */}
                <button
                    onClick={onCancel}
                    className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors p-1"
                >
                    <X size={20} />
                </button>

                {/* Content */}
                <div className="p-7">
                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-2xl ${style.iconBg} flex items-center justify-center mx-auto mb-5`}>
                        <Icon size={26} className={style.iconColor} />
                    </div>

                    {/* Title */}
                    <h3 className="text-xl font-bold text-center text-white mb-2">
                        {title}
                    </h3>

                    {/* Message */}
                    <p className="text-center mb-5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {message}
                    </p>

                    {/* Details (optional) */}
                    {details && (
                        <div className="rounded-xl p-4 mb-6 space-y-2.5"
                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
                            {details.map((detail, idx) => (
                                <div key={idx} className="flex justify-between text-sm">
                                    <span style={{ color: 'var(--text-muted)' }}>{detail.label}</span>
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
                            className="btn-secondary flex-1 py-3"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 py-3 px-4 rounded-xl text-white font-semibold transition-all ${style.confirmBg}`}
                            style={{ boxShadow: '0 4px 12px -2px rgba(0,0,0,0.3)' }}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
