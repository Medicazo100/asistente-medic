import React, { useEffect, useRef } from 'react';
import { BoosterClinicoResult } from '../types';

export interface BoosterClinicoButtonProps {
    onClick: () => void;
    disabled?: boolean;
    isOptimizing?: boolean;
}

export const BoosterClinicoButton: React.FC<BoosterClinicoButtonProps> = ({
    onClick,
    disabled = false,
    isOptimizing = false,
}) => {
    return (
        <div className="relative group inline-block">
            <button
                type="button"
                onClick={onClick}
                disabled={disabled || isOptimizing}
                title="Consejo Pro: Escribe tu duda médica aquí abajo y pulsa ⚡ Booster Clínico: la convertiremos en una pregunta profesional con rigor de pase de visita para darte dosis exactas y perlas clínicas (¡Solo para internos pros! 🩺🔥)."
                className={`text-xs font-bold py-1 px-2.5 sm:px-3 rounded-lg transition-all duration-200 flex items-center justify-start gap-1.5 shadow-sm border-2 select-none w-auto whitespace-nowrap border-indigo-900/90 dark:border-cyan-400 text-white ${
                    disabled || isOptimizing
                        ? 'bg-gradient-to-r from-sky-600/90 to-indigo-700/90 dark:from-sky-700/90 dark:to-indigo-800/90 cursor-not-allowed opacity-85'
                        : 'bg-gradient-to-r from-sky-500 via-indigo-600 to-indigo-700 hover:from-sky-600 hover:via-indigo-700 hover:to-indigo-800 active:from-sky-700 active:to-indigo-900 shadow-indigo-500/25 hover:shadow-md cursor-pointer'
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
                        <span className="hidden sm:inline">Booster Clínico</span>
                        <span className="sm:hidden">Booster</span>
                    </>
                )}
            </button>

            {/* Tooltip emergente con el mensaje completo al pasar el cursor */}
            <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-72 sm:w-80 p-3 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white text-xs rounded-xl shadow-2xl border border-sky-500/40 pointer-events-none animate-fade-in leading-relaxed text-left">
                <div className="flex items-start gap-2">
                    <span className="text-base select-none shrink-0 mt-0.5">🎯</span>
                    <div>
                        <p className="font-extrabold text-sky-400 mb-1">Consejo Pro:</p>
                        <p className="text-slate-200 leading-normal">
                            Escribe tu duda médica aquí abajo y pulsa <strong className="text-sky-300">⚡ Booster Clínico</strong>: la convertiremos en una pregunta profesional con rigor de pase de visita para darte dosis exactas y perlas clínicas{' '}
                            <span className="font-bold text-indigo-300 whitespace-nowrap">(¡Solo para internos pros! 🩺🔥)</span>.
                        </p>
                    </div>
                </div>
                {/* Indicador flecha superior */}
                <div className="absolute -top-1.5 left-4 w-3 h-3 bg-slate-900/95 dark:bg-slate-950/95 border-t border-l border-sky-500/40 rotate-45"></div>
            </div>
        </div>
    );
};

export interface BoosterClinicoCardProps {
    result: BoosterClinicoResult | null;
    originalText: string;
    errorMessage: string | null;
    onClearError: () => void;
    onDiscard: () => void;
    onApply: () => void;
    onSendNow: () => void;
}

export const BoosterClinicoCard: React.FC<BoosterClinicoCardProps> = ({
    result,
    originalText,
    errorMessage,
    onClearError,
    onDiscard,
    onApply,
    onSendNow,
}) => {
    const resultRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (result && resultRef.current) {
            resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [result]);

    if (!result && !errorMessage) return null;

    return (
        <div className="w-full mb-2 sm:mb-2.5 space-y-2">
            {/* Mensaje de error sutil */}
            {errorMessage && (
                <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-2.5 flex items-center justify-between animate-fade-in">
                    <span>⚠️ {errorMessage}</span>
                    <button
                        type="button"
                        onClick={onClearError}
                        className="text-amber-800 dark:text-amber-200 hover:underline text-xs ml-2 font-semibold cursor-pointer"
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
                            onClick={onDiscard}
                            className="px-3 py-1.5 sm:py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-lg transition-colors text-center cursor-pointer"
                        >
                            Descartar
                        </button>
                        <button
                            type="button"
                            onClick={onApply}
                            title="Coloca la pregunta en el campo de texto para que puedas revisarla o editarla antes de enviar"
                            className="px-3 py-1.5 sm:py-2 text-xs font-semibold text-sky-700 dark:text-sky-300 bg-sky-100 hover:bg-sky-200 dark:bg-sky-950/60 dark:hover:bg-sky-900/60 border border-sky-300/80 dark:border-sky-700 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-center cursor-pointer"
                        >
                            <span>✏️</span>
                            <span>Editar en chat</span>
                        </button>
                        <button
                            type="button"
                            onClick={onSendNow}
                            title="Envía la pregunta optimizada directamente a DoctorIA y recibe la respuesta de inmediato"
                            className="px-3.5 py-1.5 sm:py-2 text-xs font-bold text-white bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 active:from-sky-800 active:to-indigo-800 rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1.5 text-center cursor-pointer"
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

export default BoosterClinicoCard;
