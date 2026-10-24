import React, { useState, useEffect, useRef } from 'react';
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
    const resultRef = useRef<HTMLDivElement>(null);

    const hasInput = inputText.trim().length > 0;

    useEffect(() => {
        if (result && resultRef.current) {
            resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [result]);

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
        <div className="w-full mb-2 sm:mb-2.5 space-y-2">
            {/* Si NO hay resultado, mostramos la barra compacta de activación del Booster */}
            {!result && (
                <div className="bg-gradient-to-r from-sky-50 via-indigo-50/70 to-emerald-50/60 dark:from-slate-800/90 dark:via-indigo-950/40 dark:to-emerald-950/30 border border-sky-200/80 dark:border-sky-700/60 rounded-xl px-3 py-2 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-3 transition-all">
                    <div className="flex items-center gap-2 text-xs md:text-sm text-slate-700 dark:text-slate-200 w-full sm:w-auto min-w-0">
                        <span className="text-base select-none shrink-0">🎯</span>
                        <p className="leading-snug">
                            <span className="font-extrabold text-sky-800 dark:text-sky-300">Booster Clínico:</span>{' '}
                            <span className="text-slate-600 dark:text-slate-300">
                                Eleva tu duda a formato de pase de visita con rigor MBE, dosis y perlas{' '}
                                <span className="font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">(¡Solo internos pros! 🩺🔥)</span>.
                            </span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleOptimize}
                        disabled={!hasInput || isOptimizing || disabled}
                        title={!hasInput ? 'Escribe una duda para activar el booster' : 'Elevar nivel clínico de la pregunta'}
                        className={`inline-flex items-center justify-center gap-1.5 shrink-0 font-bold text-xs px-3.5 py-1.5 rounded-lg transition-all duration-200 shadow-xs w-full sm:w-auto ${
                            !hasInput || disabled || isOptimizing
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-400 cursor-not-allowed opacity-60'
                                : 'bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white shadow-sky-600/20 hover:shadow-sm'
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
            )}

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

            {/* Tarjeta de Contraste y Decisión: se muestra de forma limpia y exclusiva cuando hay resultado */}
            {result && (
                <div
                    ref={resultRef}
                    className="bg-white dark:bg-slate-800/95 border-2 border-sky-400/80 dark:border-sky-500/80 rounded-xl p-3 sm:p-3.5 shadow-lg animate-fade-in space-y-2 max-h-[44vh] sm:max-h-[48vh] flex flex-col"
                >
                    {/* Encabezado con Título y Badge didáctico */}
                    <div className="flex items-center justify-between gap-1.5 border-b border-sky-100 dark:border-slate-700 pb-1.5 shrink-0">
                        <div className="flex items-center gap-1.5 text-sky-800 dark:text-sky-300 font-extrabold text-xs sm:text-sm tracking-wide">
                            <span>🚀</span>
                            <span>PREGUNTA OPTIMIZADA</span>
                        </div>
                        {result.perla && (
                            <span
                                className="inline-flex items-center gap-1 text-[10px] sm:text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700 max-w-[60%] sm:max-w-none truncate"
                                title={result.perla}
                            >
                                <span>💡</span>
                                <span className="truncate">{result.perla}</span>
                            </span>
                        )}
                    </div>

                    {/* Cuerpo Comparativo con scroll interno */}
                    <div className="space-y-2 text-xs sm:text-sm flex-1 min-h-0 overflow-y-auto pr-1">
                        {/* Bloque 1: Original */}
                        <div className="p-2 sm:p-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200/80 dark:border-slate-600/60 text-slate-600 dark:text-slate-300">
                            <span className="font-semibold text-slate-500 dark:text-slate-400 block mb-0.5 uppercase tracking-wider text-[9px] sm:text-[10px]">
                                Tu duda inicial:
                            </span>
                            <p className="italic text-xs sm:text-sm">"{originalText}"</p>
                        </div>

                        {/* Bloque 2: Optimizada */}
                        <div className="p-2.5 sm:p-3 rounded-lg bg-sky-50/70 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 font-medium text-slate-800 dark:text-slate-100 shadow-xs">
                            <span className="font-bold text-sky-700 dark:text-sky-400 block mb-0.5 uppercase tracking-wider text-[9px] sm:text-[10px]">
                                Versión para DoctorIA / Pase de visita:
                            </span>
                            <p className="leading-relaxed whitespace-pre-wrap text-xs sm:text-sm">{result.preguntaOptimizada}</p>
                        </div>
                    </div>

                    {/* Botones de Acción */}
                    <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2 pt-1 shrink-0">
                        <button
                            type="button"
                            onClick={handleDiscard}
                            className="px-3 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors text-center"
                        >
                            Descartar
                        </button>
                        <button
                            type="button"
                            onClick={handleApply}
                            title="Coloca la pregunta en el campo de texto para que puedas revisarla o editarla antes de enviar"
                            className="px-3 py-1.5 sm:py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border border-sky-300/80 dark:border-sky-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-center"
                        >
                            <span>✏️</span>
                            <span>Editar en chat</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleSendNow}
                            title="Envía la pregunta optimizada directamente a DoctorIA y recibe la respuesta de inmediato"
                            className="px-3.5 py-1.5 sm:py-2 text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:from-sky-800 active:to-indigo-800 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 text-center"
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
