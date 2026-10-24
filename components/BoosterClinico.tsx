import React, { useState } from 'react';
import { optimizarPreguntaClinica } from '../services/doctorIaService';
import { BoosterClinicoResult } from '../types';

interface BoosterClinicoProps {
    inputText: string;
    onApplyOptimized: (optimizedQuestion: string) => void;
    onSendOptimized?: (optimizedQuestion: string) => void;
    disabled?: boolean;
}

const BoosterClinico: React.FC<BoosterClinicoProps> = ({
    inputText,
    onApplyOptimized,
    onSendOptimized,
    disabled = false,
}) => {
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [result, setResult] = useState<BoosterClinicoResult | null>(null);
    const [originalText, setOriginalText] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const hasInput = inputText.trim().length > 0;

    const handleOptimize = async () => {
        if (!hasInput || isOptimizing || disabled) return;

        const currentPrompt = inputText.trim();
        setIsOptimizing(true);
        setErrorMessage(null);

        try {
            const data = await optimizarPreguntaClinica(currentPrompt);
            setOriginalText(currentPrompt);
            setResult(data);
        } catch (error: any) {
            console.error('Error al optimizar con Booster Clínico:', error);
            setErrorMessage('No pudimos optimizar tu duda en este momento. Inténtalo de nuevo.');
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleDiscard = () => {
        setResult(null);
        setErrorMessage(null);
    };

    const handleApply = () => {
        if (!result) return;
        onApplyOptimized(result.preguntaOptimizada);
        setResult(null);
        setErrorMessage(null);
    };

    const handleSendNow = () => {
        if (!result) return;
        const text = result.preguntaOptimizada;
        setResult(null);
        setErrorMessage(null);
        if (onSendOptimized) {
            onSendOptimized(text);
        } else {
            onApplyOptimized(text);
        }
    };

    return (
        <div className="w-full mb-3 space-y-2">
            {/* Barra de Invitación y Activación */}
            <div className="bg-gradient-to-r from-sky-50 via-indigo-50 to-emerald-50 dark:from-slate-800 dark:via-indigo-950/40 dark:to-emerald-950/30 border border-sky-200/80 dark:border-sky-700/60 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-3 transition-all">
                <div className="flex items-start sm:items-center gap-2.5 text-xs md:text-sm text-slate-700 dark:text-slate-200">
                    <span className="text-lg select-none shrink-0 mt-0.5 sm:mt-0">🎯</span>
                    <p className="leading-snug">
                        <span className="font-extrabold text-sky-800 dark:text-sky-300">Consejo Pro:</span>{' '}
                        Escribe tu duda médica aquí abajo y pulsa <strong className="text-sky-700 dark:text-sky-300">⚡ Booster Clínico</strong>: la convertiremos en una pregunta profesional con rigor de pase de visita para darte dosis exactas y perlas clínicas{' '}
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">(¡Solo para internos pros! 🩺🔥)</span>.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleOptimize}
                    disabled={!hasInput || isOptimizing || disabled}
                    title={!hasInput ? 'Escribe una duda para activar el booster' : 'Elevar nivel clínico de la pregunta'}
                    className={`inline-flex items-center justify-center gap-1.5 shrink-0 font-bold text-xs px-3.5 py-2 rounded-lg transition-all duration-200 shadow-sm ${
                        !hasInput || disabled || isOptimizing
                            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed opacity-70'
                            : 'bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-sky-600/20 hover:shadow-md'
                    }`}
                >
                    {isOptimizing ? (
                        <>
                            <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                            </svg>
                            <span>Optimizando...</span>
                        </>
                    ) : (
                        <>
                            <span>⚡</span>
                            <span>Booster Clínico</span>
                        </>
                    )}
                </button>
            </div>

            {/* Mensaje de error sutil */}
            {errorMessage && (
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-2.5 flex items-center justify-between animate-fade-in">
                    <span>⚠️ {errorMessage}</span>
                    <button
                        type="button"
                        onClick={() => setErrorMessage(null)}
                        className="text-amber-800 dark:text-amber-200 hover:underline text-xs ml-2 font-semibold"
                    >
                        Cerrar
                    </button>
                </div>
            )}

            {/* Tarjeta de Contraste y Decisión */}
            {result && (
                <div className="bg-white dark:bg-slate-800 border-2 border-sky-300 dark:border-sky-600 rounded-xl p-4 shadow-md animate-fade-in space-y-3">
                    {/* Encabezado con Título y Badge didáctico */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 dark:border-slate-700 pb-2">
                        <div className="flex items-center gap-1.5 text-sky-800 dark:text-sky-300 font-extrabold text-sm tracking-wide">
                            <span>🚀</span>
                            <span>PREGUNTA OPTIMIZADA</span>
                        </div>
                        {result.perla && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700">
                                <span>💡</span>
                                <span>{result.perla}</span>
                            </span>
                        )}
                    </div>

                    {/* Cuerpo Comparativo */}
                    <div className="space-y-2 text-xs sm:text-sm">
                        {/* Bloque 1: Original */}
                        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200/80 dark:border-slate-600/60 text-slate-600 dark:text-slate-300">
                            <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-1 uppercase tracking-wider text-[10px]">
                                Tu duda inicial:
                            </span>
                            <p className="italic">"{originalText}"</p>
                        </div>

                        {/* Bloque 2: Optimizada */}
                        <div className="p-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 font-medium text-slate-800 dark:text-slate-100 shadow-sm">
                            <span className="font-bold text-sky-700 dark:text-sky-400 block mb-1 uppercase tracking-wider text-[10px]">
                                Versión para DoctorIA / Pase de visita:
                            </span>
                            <p className="leading-relaxed whitespace-pre-wrap">{result.preguntaOptimizada}</p>
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={handleDiscard}
                            className="px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors text-center"
                        >
                            Descartar
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            title="Coloca la pregunta en el campo de texto para que puedas revisarla o editarla antes de enviar"
                            className="px-3.5 py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border border-sky-300/80 dark:border-sky-700 rounded-lg transition-colors flex items-center justify-center gap-1.5"
                        >
                            <span>✏️</span>
                            <span>Editar en chat</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleSendNow}
                            title="Envía la pregunta optimizada directamente a DoctorIA y recibe la respuesta de inmediato"
                            className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:from-sky-800 active:to-indigo-800 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5"
                        >
                            <span>🚀</span>
                            <span>Enviar a DoctorIA</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BoosterClinico;
