import React, { useEffect } from 'react';

interface BoosterAnnouncementModalProps {
    onExplore: () => void;
    onClose: () => void;
}

const BoosterAnnouncementModal: React.FC<BoosterAnnouncementModalProps> = ({ onExplore, onClose }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-black/60 dark:bg-black/80 z-[70] flex justify-center items-center p-4 animate-fade-in backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 max-w-lg w-full relative transform transition-all duration-300 border border-sky-200 dark:border-sky-800 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Botón Cerrar */}
                <button
                    onClick={onClose}
                    className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex justify-center items-center text-slate-500 dark:text-slate-300 transition-colors"
                    aria-label="Cerrar novedad"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>

                {/* Encabezado con Icono y Badge */}
                <div className="text-center mb-5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950/80 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-700 uppercase tracking-wider mb-3">
                        <span>✨</span> Nueva Actualización
                    </span>
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-lg shadow-sky-500/30 mb-3 transform hover:rotate-6 transition-transform">
                        <span className="text-3xl">⚡</span>
                    </div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                        ¡Llegó el Booster Clínico a DoctorIA!
                    </h3>
                    <p className="text-xs sm:text-sm text-sky-600 dark:text-sky-400 font-semibold mt-1">
                        Andamiaje pedagógico para el Médico Interno de Pregrado
                    </p>
                </div>

                {/* Contenido / Pitch pedagógico */}
                <div className="space-y-3.5 text-slate-700 dark:text-slate-300 text-xs sm:text-sm leading-relaxed">
                    <p>
                        Ahora puedes transformar voluntariamente dudas redactadas con prisa o coloquiales en <strong>preguntas clínicas estructuradas</strong> con rigor hospitalario, semiología formal y enfoque de pase de visita antes de enviarlas.
                    </p>

                    {/* Mini vista previa comparativa */}
                    <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold shrink-0">💬 Antes:</span>
                            <span className="text-slate-500 dark:text-slate-400 italic">"¿qué le doy para la calentura y vómito?"</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="text-sky-600 dark:text-sky-400 font-bold shrink-0">⚡ Con Booster:</span>
                            <span className="text-slate-800 dark:text-slate-200 font-medium">"Paciente con síndrome febril y emesis: abordaje terapéutico escalonado según GPC..."</span>
                        </div>
                    </div>

                    <div className="bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
                        <span className="text-base">💡</span>
                        <span>
                            Una consulta de mayor nivel desbloquea respuestas más precisas, posologías exactas y perlas para tu entrega de guardia.
                        </span>
                    </div>
                </div>

                {/* Botones de Acción */}
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-end gap-2.5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
                    >
                        Más tarde
                    </button>
                    <button
                        type="button"
                        onClick={onExplore}
                        className="w-full sm:w-auto px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 rounded-xl shadow-lg shadow-sky-600/30 transform hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <span>🚀</span>
                        <span>Probar Booster en DoctorIA</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BoosterAnnouncementModal;
