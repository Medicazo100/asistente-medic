import React, { useState } from 'react';
import { generateNoteGuide } from '../services/geminiService';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import { marked } from 'marked';

const NoteGuide: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [content, setContent] = useState<{ guide: string; template: string } | null>(null);
    const [copySuccess, setCopySuccess] = useState(false);
    const [importedPlan, setImportedPlan] = useState<string | null>(() => {
        try {
            return localStorage.getItem('sim_soap_plan_nom004');
        } catch {
            return null;
        }
    });

    const handleInsertImportedPlan = () => {
        if (!importedPlan) return;
        if (content) {
            setContent(prev => prev ? {
                ...prev,
                template: prev.template + '\n\n' + importedPlan
            } : null);
        } else {
            setContent({
                guide: `### Plan Terapéutico Hospitalario Trasladado\n\nEste plan fue formulado y estructurado conforme a la **NOM-004-SSA3-2012** desde el módulo de Simulación Clínica.\n\nPuedes editar los campos en la plantilla editable a la izquierda.`,
                template: importedPlan
            });
            if (!topic) setTopic('Plan Hospitalario Trasladado (Simulación)');
        }
    };

    const handleClearImportedPlan = () => {
        try {
            localStorage.removeItem('sim_soap_plan_nom004');
        } catch {}
        setImportedPlan(null);
    };

    const handleGenerate = async () => {
        if (!topic.trim()) {
            setError('Por favor, ingresa un tema.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setContent(null);
        try {
            const result = await generateNoteGuide(topic);
            setContent(result);
        } catch (e) {
            setError('Error al generar la guía. Inténtalo de nuevo.');
            console.error(e);
        }
        setIsLoading(false);
    };

    const handleCopy = () => {
        if (content?.template) {
            navigator.clipboard.writeText(content.template)
                .then(() => {
                    setCopySuccess(true);
                    setTimeout(() => setCopySuccess(false), 2000);
                })
                .catch(err => console.error('Failed to copy text: ', err));
        }
    };

    const handleReset = () => {
        setTopic('');
        setContent(null);
        setError(null);
        setIsLoading(false);
    };

    return (
        <Card className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-blue-800 dark:text-cyan-300">📝 Asistente para Notas Médicas (SOAP)</h2>
                {content && (
                    <button
                        onClick={handleReset}
                        className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-600 dark:hover:bg-slate-500 font-semibold py-1 px-3 rounded-lg border border-gray-300 dark:border-slate-500"
                    >
                        Reset
                    </button>
                )}
            </div>
            
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}
            
            {importedPlan && (
                <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-700 rounded-xl flex items-center justify-between flex-wrap gap-2 animate-fade-in shadow-2xs">
                    <div className="flex items-center gap-2 text-xs md:text-sm text-emerald-900 dark:text-emerald-200">
                        <span className="text-base">📋</span>
                        <span><strong>Plan hospitalario disponible:</strong> Se detectaron órdenes médicas transferidas desde el simulador clínico conforme a la NOM-004.</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleInsertImportedPlan}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg transition-colors"
                        >
                            Cargar en Nota Editable
                        </button>
                        <button
                            type="button"
                            onClick={handleClearImportedPlan}
                            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2 py-1"
                        >
                            Descartar
                        </button>
                    </div>
                </div>
            )}
            
            <div className="space-y-4 mb-6">
                <p className="text-gray-600 dark:text-gray-400">Ingresa una patología para generar una plantilla editable y una guía de llenado.</p>
                <div className="flex items-center gap-2">
                    <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ej: Faringoamigdalitis" className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:focus:border-purple-500 focus:ring-1 focus:ring-blue-500 dark:focus:ring-purple-500 transition-all duration-200" onKeyDown={e => e.key === 'Enter' && handleGenerate} />
                    <button onClick={handleGenerate} disabled={isLoading} className="bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors dark:bg-purple-600 dark:hover:bg-purple-700 dark:disabled:bg-purple-400 whitespace-nowrap shadow-md border-2 border-transparent">
                        {isLoading ? '...' : 'Generar'}
                    </button>
                </div>
            </div>
            {isLoading && <LoadingSpinner />}
            {content && (
                <div className="mt-8 animate-fade-in">
                    <h3 className="text-2xl font-bold text-center text-green-800 dark:text-pink-400 mb-6">Resultado para: {topic}</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300">📋 Plantilla Editable</h4>
                                <button onClick={handleCopy} className={`px-3 py-1 text-sm font-semibold rounded-md transition-all duration-200 border ${copySuccess ? 'bg-green-600 text-white border-green-600' : 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 dark:bg-slate-600 dark:text-gray-200 dark:border-slate-500 dark:hover:bg-slate-500'}`}>
                                    {copySuccess ? '✓ Copiado' : 'Copiar'}
                                </button>
                            </div>
                            <textarea className="w-full flex-grow p-3 bg-white rounded-lg border-2 border-blue-300 text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm leading-relaxed dark:bg-slate-900 dark:border-slate-500 dark:focus:border-purple-500 dark:text-gray-100 shadow-inner" style={{ minHeight: '500px' }} value={content.template} onChange={e => setContent(c => c ? { ...c, template: e.target.value } : null)} />
                        </div>
                        <div className="flex flex-col">
                            <h4 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">📖 Guía y Fundamentos</h4>
                            <div className="p-4 bg-gray-50 rounded-lg border-2 border-blue-400 flex-grow overflow-y-auto prose max-w-none dark:prose-invert dark:bg-slate-800 dark:border-violet-500 shadow-md" style={{ minHeight: '500px' }} dangerouslySetInnerHTML={{ __html: marked.parse(content.guide) }}>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
};

export default NoteGuide;