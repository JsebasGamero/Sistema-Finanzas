// ImagePreviewModal component - View support documents
import { X, ExternalLink, Download } from 'lucide-react';

export default function ImagePreviewModal({ isOpen, onClose, imageUrl, title }) {
    if (!isOpen || !imageUrl) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5 animate-fade-in">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/90 backdrop-blur-md"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col items-center">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute -top-12 right-0 text-white/70 hover:text-white transition-colors p-2"
                >
                    <X size={24} />
                </button>

                {/* Toolbar */}
                <div className="absolute -top-12 left-0 flex gap-4">
                    <a
                        href={imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/70 hover:text-white transition-colors flex items-center gap-2 text-sm"
                        title="Abrir en nueva pestaña"
                    >
                        <ExternalLink size={20} />
                        <span className="hidden sm:inline">Abrir original</span>
                    </a>
                </div>

                {/* Image Container */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10">
                    <img
                        src={imageUrl}
                        alt={title || "Soporte del movimiento"}
                        className="max-h-[85vh] w-auto object-contain"
                    />
                </div>

                {title && (
                    <p className="mt-4 text-white/60 text-sm text-center">
                        {title}
                    </p>
                )}
            </div>
        </div>
    );
}
