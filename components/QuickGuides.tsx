import React, { useEffect, useState, useRef } from 'react';
import { generateQuickGuide } from '../services/geminiService';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import { marked } from 'marked';
import { GroundingSource } from '../types';
import { GuideLibraryPayload, StudyLibraryRecord } from '../types';
import {
    buildStudyRecord,
    createStudyRecordId,
    findStudyRecord,
    markStudyViewed,
    saveStudyRecord,
} from '../services/studyLibrary';

const getLinkText = (source: GroundingSource) => {
    if (source.title && source.title.trim() !== '') return source.title;
    try {
        return new URL(source.uri).hostname;
    } catch {
        return source.uri; // Fallback if URL is invalid
    }
};

const formatShortUrl = (uri: string, maxLength = 60) => {
    try {
        const url = new URL(uri);
        const path = url.pathname !== '/' ? url.pathname : '';
        const combined = `${url.hostname}${path}`;
        return combined.length > maxLength ? `${combined.slice(0, maxLength - 3)}...` : combined;
    } catch {
        return uri.length > maxLength ? `${uri.slice(0, maxLength - 3)}...` : uri;
    }
};

const QuickGuides: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [guide, setGuide] = useState<{ text: string, sources: GroundingSource[] } | null>(null);
    const [isCached, setIsCached] = useState(false);
    const guidePrintRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const restoreSavedGuide = (event: Event) => {
            const record = (event as CustomEvent<StudyLibraryRecord<GuideLibraryPayload>>).detail;
            if (!record?.payload?.text) return;
            setTopic(record.topic);
            setGuide(record.payload);
            setIsCached(true);
            setError(null);
            setIsLoading(false);
            void markStudyViewed(record.id);
        };

        window.addEventListener('aiclinic:restore-guia', restoreSavedGuide);

        const checkPendingGuide = () => {
            try {
                const pending = sessionStorage.getItem('aiclinic:pending-guia');
                if (pending) {
                    sessionStorage.removeItem('aiclinic:pending-guia');
                    restoreSavedGuide(new CustomEvent('restore', { detail: JSON.parse(pending) }));
                }
            } catch (err) {
                console.warn('Error al restaurar guía pendiente:', err);
            }
        };

        checkPendingGuide();
        window.addEventListener('focus', checkPendingGuide);

        return () => {
            window.removeEventListener('aiclinic:restore-guia', restoreSavedGuide);
            window.removeEventListener('focus', checkPendingGuide);
        };
    }, []);

    const handleGenerate = async (forceRefresh = false) => {
        if (!topic.trim()) {
            setError('Por favor, ingresa un tema.');
            return;
        }
        setIsLoading(true);
        setError(null);
        setGuide(null);
        setIsCached(false);
        try {
            const requestedTopic = topic.trim();
            const existing = await findStudyRecord<GuideLibraryPayload>('guia', requestedTopic);
            const cached = forceRefresh ? null : existing;
            if (cached) {
                setGuide(cached.payload);
                setIsCached(true);
                await markStudyViewed(cached.id);
                setIsLoading(false);
                return;
            }

            const result = await generateQuickGuide(topic);
            setGuide(result);
            await saveStudyRecord(buildStudyRecord({
                id: createStudyRecordId('guia', requestedTopic),
                kind: 'guia',
                title: requestedTopic,
                topic: requestedTopic,
                payload: result,
                existing,
            }));
        } catch (e) {
            setError('Error al generar la guía. Inténtalo de nuevo.');
            console.error(e);
        }
        setIsLoading(false);
    };

    const handleReset = () => {
        setTopic('');
        setGuide(null);
        setError(null);
        setIsLoading(false);
        setIsCached(false);
    };

    const handleDownloadPDF = async () => {
        if (!guidePrintRef.current || !guide) return;
        setIsGeneratingPdf(true);

        const html = document.documentElement;
        const wasDark = html.classList.contains('dark');
        const originalStyle = guidePrintRef.current.getAttribute('style');
        const modifiedElements: { element: HTMLElement, originalStyle: string | null }[] = [];

        const forceStyle = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
            modifiedElements.push({ element: el, originalStyle: el.getAttribute('style') });
            Object.assign(el.style, styles);
        };

        try {
            if (wasDark) {
                html.classList.remove('dark');
            }

            Object.assign(guidePrintRef.current.style, {
                backgroundColor: '#ffffff',
                color: '#000000',
                width: '680px',
                maxWidth: '680px',
                minWidth: '680px',
                margin: '0 auto',
                padding: '12px 16px',
                boxSizing: 'border-box',
                border: 'none',
                boxShadow: 'none',
                borderRadius: '0px',
                fontSize: '12px',
                lineHeight: '1.45',
            });

            const proseDivs = guidePrintRef.current.querySelectorAll('.prose');
            proseDivs.forEach((el) => {
                const htmlEl = el as HTMLElement;
                forceStyle(htmlEl, { color: '#000000' });
                htmlEl.classList.remove('dark:prose-invert');
            });

            const detailsList = guidePrintRef.current.querySelectorAll('details');
            detailsList.forEach((d) => {
                (d as HTMLDetailsElement).open = true;
            });

            await new Promise(resolve => setTimeout(resolve, 500));

            // @ts-ignore
            if (typeof window.html2pdf === 'undefined') {
                window.print();
                return;
            }

            const cleanTopic = topic.trim().replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]/g, '_').slice(0, 35) || 'Guia_Clinica';
            const timestamp = new Date().toISOString().split('T')[0];

            const opt = {
                margin: [10, 10, 10, 10], // 10mm homogéneo en los 4 lados para centrado perfecto
                filename: `Guia_Rapida_${cleanTopic}_${timestamp}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: {
                    scale: 2,
                    useCORS: true,
                    letterRendering: true,
                    scrollY: 0,
                    scrollX: 0,
                },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
            };

            // @ts-ignore
            await window.html2pdf().set(opt).from(guidePrintRef.current).save();
        } catch (err: any) {
            console.error('Error generando PDF:', err);
            setError('Error al generar el PDF: ' + (err?.message || String(err)));
        } finally {
            if (wasDark) {
                html.classList.add('dark');
            }
            if (originalStyle) {
                guidePrintRef.current.setAttribute('style', originalStyle);
            } else {
                guidePrintRef.current.removeAttribute('style');
            }
            modifiedElements.forEach(({ element, originalStyle }) => {
                if (originalStyle !== null) {
                    element.setAttribute('style', originalStyle);
                } else {
                    element.removeAttribute('style');
                }
            });
            setIsGeneratingPdf(false);
        }
    };

    return (
        <Card className="max-w-3xl mx-auto">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-blue-800 dark:text-cyan-300">📚 Guías Rápidas de Consulta</h2>
                {guide && (
                    <div className="flex flex-wrap gap-2 justify-end">
                        {isCached && <span className="self-center text-xs font-semibold text-emerald-700 dark:text-emerald-400">Respuesta local</span>}
                        <button
                            type="button"
                            onClick={() => void handleDownloadPDF()}
                            disabled={isGeneratingPdf || isLoading}
                            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 font-semibold py-1 px-3 rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                            title="Descargar guía en PDF con fuentes acortadas"
                        >
                            <span>{isGeneratingPdf ? '⏳ Generando PDF...' : '📄 Descargar PDF'}</span>
                        </button>
                        <button
                            onClick={() => void handleGenerate(true)}
                            disabled={isLoading || isGeneratingPdf}
                            className="text-sm bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 font-semibold py-1 px-3 rounded-lg"
                        >
                            Actualizar con IA
                        </button>
                        <button
                            onClick={handleReset}
                            disabled={isGeneratingPdf}
                            className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-600 dark:hover:bg-slate-500 font-semibold py-1 px-3 rounded-lg border border-gray-300 dark:border-slate-500"
                        >
                            Reset
                        </button>
                    </div>
                )}
            </div>
            
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">{error}</div>}
            
            <div className="space-y-4 mb-6">
                <p className="text-gray-600 dark:text-gray-400">Obtén un resumen práctico y basado en evidencia, con prioridad en Guías de Práctica Clínica Mexicanas.</p>
                <div className="flex items-center gap-2">
                    <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ej: Manejo de Crisis Hipertensiva" className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-500 dark:focus:border-purple-500 focus:ring-1 focus:ring-blue-500 dark:focus:ring-purple-500 transition-all duration-200" onKeyDown={e => e.key === 'Enter' && handleGenerate()} />
                    <button onClick={() => void handleGenerate()} disabled={isLoading || isGeneratingPdf} className="bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 transition-colors dark:bg-purple-600 dark:hover:bg-purple-700 dark:disabled:bg-purple-400 whitespace-nowrap shadow-md border-2 border-transparent">
                        {isLoading ? '...' : 'Buscar'}
                    </button>
                </div>
            </div>
            
            {isLoading && <LoadingSpinner />}
            
            {guide && (() => {
                const guideText = guide.text;
                const sourcesHeader = "### Fuentes";
                const sourcesIndex = guideText.lastIndexOf(sourcesHeader);

                const mainGuide = sourcesIndex !== -1 ? guideText.substring(0, sourcesIndex) : guideText;
                const infoSources = sourcesIndex !== -1 ? guideText.substring(sourcesIndex) : "";

                return (
                    <div className="animate-fade-in space-y-4">
                        <div ref={guidePrintRef} className="space-y-4 bg-white dark:bg-slate-800 p-6 rounded-xl border-2 border-blue-400 dark:border-pink-500 shadow-lg">
                            <div className="border-b-2 border-blue-600 pb-3 mb-2">
                                <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                                    <span className="font-bold text-blue-700 dark:text-cyan-300 tracking-wide uppercase">AICLINIC • Guía Rápida de Práctica Clínica</span>
                                    <span>{new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 dark:text-pink-400 mt-1">Guía Rápida: {topic}</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Evidencia Médica, Dosis y Criterios Terapéuticos • Hospital General de Apatzingán</p>
                            </div>

                            <div className="prose max-w-none dark:prose-invert"
                                dangerouslySetInnerHTML={{ __html: marked.parse(mainGuide) }}
                            />
                            
                            {(infoSources || guide.sources.length > 0) && (
                                <details className="pt-4 border-t border-gray-200 dark:border-slate-700" open>
                                    <summary className="font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 list-inside">
                                        Fuentes y Evidencia Consultada
                                    </summary>
                                    <div className="mt-2 space-y-4">
                                        {infoSources && (
                                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 prose max-w-none dark:prose-invert dark:bg-slate-700/50 dark:border-slate-600 break-words text-xs"
                                                dangerouslySetInnerHTML={{ __html: marked.parse(infoSources) }}
                                            />
                                        )}
                                        {guide.sources.length > 0 && (
                                            <div className="p-4 bg-gray-50 rounded-lg border border-blue-200 dark:bg-slate-700/50 dark:border-slate-600">
                                                <h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2 text-sm">Referencias Web y Bases de Datos Médicas</h4>
                                                <ul className="list-disc list-inside text-xs mt-2 space-y-1.5 pl-2">
                                                    {guide.sources.map((source, i) => (
                                                        <li key={i} className="text-gray-700 dark:text-gray-300">
                                                            <span className="font-medium">{source.title || getLinkText(source)}: </span>
                                                            <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-cyan-400 break-all" title={source.uri}>
                                                                {formatShortUrl(source.uri)}
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </details>
                            )}
                        </div>
                    </div>
                );
            })()}
        </Card>
    );
};

export default QuickGuides;
