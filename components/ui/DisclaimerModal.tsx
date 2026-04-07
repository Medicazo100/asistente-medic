import React, { useEffect } from 'react';

interface DisclaimerModalProps {
    onClose: () => void;
}

const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onClose }) => {
    useEffect(() => {
        const handleEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => {
            window.removeEventListener('keydown', handleEsc);
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-black/60 dark:bg-black/80 z-[60] flex justify-center items-center p-4 animate-fade-in backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 max-w-lg w-full relative transform transition-all duration-300 scale-100 border-l-8 border-amber-500 ring-1 ring-gray-200 dark:ring-slate-700"
                onClick={e => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 flex justify-center items-center text-gray-600 dark:text-gray-300 transition-colors"
                    aria-label="Cerrar aviso"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4 animate-bounce">
                        <span className="text-4xl">⚕️</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Aviso Importante</h3>
                    <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider mt-1">Uso Exclusivo Académico</p>
                </div>

                <div className="space-y-4 text-gray-700 dark:text-gray-300 text-justify leading-relaxed">
                    <p>
                        Esta aplicación es una <strong>herramienta de apoyo educativo</strong> diseñada para potenciar el aprendizaje de médicos internos de pregrado y estudiantes en formación.
                    </p>
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800/50">
                        <p className="font-medium text-amber-800 dark:text-amber-200 text-sm">
                            ⚠️ <strong>NO SUSTITUYE EL CRITERIO MÉDICO</strong>
                        </p>
                        <p className="text-sm mt-1 text-amber-900/80 dark:text-amber-100/70">
                            La información, simulaciones y sugerencias generadas por la Inteligencia Artificial pueden contener imprecisiones. <strong>No debe utilizarse como base única para la toma de decisiones diagnósticas o terapéuticas en pacientes reales.</strong>
                        </p>
                    </div>
                    <p className="text-sm">
                        Todo procedimiento o decisión clínica debe ser supervisada por un médico adscrito o especialista certificado y basarse en las Guías de Práctica Clínica y Normas Oficiales vigentes.
                    </p>
                </div>

                <div className="mt-8 flex justify-center">
                    <button
                        onClick={onClose}
                        className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-3 px-8 rounded-xl hover:from-blue-700 hover:to-indigo-700 shadow-lg transform hover:scale-[1.02] transition-all"
                    >
                        Entendido, soy responsable
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DisclaimerModal;