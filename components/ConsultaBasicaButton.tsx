import React from 'react';

export interface ConsultaBasicaButtonProps {
    onClick: () => void;
    disabled?: boolean;
    isLoading?: boolean;
}

export const ConsultaBasicaButton: React.FC<ConsultaBasicaButtonProps> = ({
    onClick,
    disabled = false,
    isLoading = false,
}) => {
    return (
        <div className="relative group w-full">
            <button
                type="button"
                onClick={onClick}
                disabled={disabled || isLoading}
                title="Consulta Básica: Responde directamente a tu duda como cualquier modelo de lenguaje, limitándose solo a lo que preguntas y sin protocolos forzados."
                className={`text-xs font-bold py-1 px-2.5 sm:px-3 rounded-lg transition-all duration-200 flex items-center justify-start gap-1.5 shadow-sm border-2 select-none w-full min-w-[134px] sm:min-w-[146px] border-teal-900/90 dark:border-emerald-400 text-white ${
                    disabled || isLoading
                        ? 'bg-gradient-to-r from-emerald-600/90 to-teal-700/90 dark:from-emerald-700/90 dark:to-teal-800/90 cursor-not-allowed opacity-85'
                        : 'bg-gradient-to-r from-emerald-500 via-teal-600 to-teal-700 hover:from-emerald-600 hover:via-teal-700 hover:to-teal-800 active:from-emerald-700 active:to-teal-900 shadow-teal-500/25 hover:shadow-md cursor-pointer'
                }`}
            >
                {isLoading ? (
                    <>
                        <svg className="animate-spin -ml-0.5 mr-1 h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                        <span>Consultando...</span>
                    </>
                ) : (
                    <>
                        <span>💡</span>
                        <span className="hidden sm:inline">Consulta básica</span>
                        <span className="sm:hidden">Básica</span>
                    </>
                )}
            </button>

            {/* Tooltip emergente con el mensaje explicativo al pasar el cursor */}
            <div className="absolute left-0 top-full mt-2 hidden group-hover:block z-50 w-72 sm:w-80 p-3 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white text-xs rounded-xl shadow-2xl border border-emerald-500/40 pointer-events-none animate-fade-in leading-relaxed text-left">
                <div className="flex items-start gap-2">
                    <span className="text-base select-none shrink-0 mt-0.5">💡</span>
                    <div>
                        <p className="font-extrabold text-emerald-400 mb-1">Consulta Básica:</p>
                        <p className="text-slate-200 leading-normal">
                            Escribe tu duda y presiona este botón para recibir una respuesta <strong className="text-emerald-300">directa, al grano y sin rodeos</strong> como a cualquier modelo de lenguaje, respondiendo estrictamente lo que preguntas sin exigirte rigor clínico ni forzar el uso del Booster.
                        </p>
                    </div>
                </div>
                {/* Indicador flecha superior */}
                <div className="absolute -top-1.5 left-4 w-3 h-3 bg-slate-900/95 dark:bg-slate-950/95 border-t border-l border-emerald-500/40 rotate-45"></div>
            </div>
        </div>
    );
};

export default ConsultaBasicaButton;
