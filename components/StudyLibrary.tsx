import React, { useEffect, useMemo, useState } from 'react';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import { Section } from '../constants';
import { StudyLibraryKind, StudyLibraryRecord } from '../types';
import {
    getSimulationDiagnosis,
    hydrateStudyLibraryFromCloud,
    listRecentStudyRecords,
    markStudyViewed,
    toggleStudyFavorite,
} from '../services/studyLibrary';

interface StudyLibraryProps {
    onSectionChange: (section: Section) => void;
}

type Filter = 'todos' | StudyLibraryKind | 'favoritos';

const KIND_LABELS: Record<StudyLibraryKind, string> = {
    doctoria: 'DoctorIA',
    guia: 'Guía clínica',
    simulacion: 'Caso clínico',
    articulo: 'Artículo analizado',
    quiz: 'Cuestionario / Quiz',
};

const KIND_ICONS: Record<StudyLibraryKind, string> = {
    doctoria: '💬',
    guia: '📚',
    simulacion: '🩺',
    articulo: '📄',
    quiz: '📝',
};

const formatDate = (value: string) => new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
}).format(new Date(value));

const formatFullDateTime = (value: string) => {
    try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return value;
        return new Intl.DateTimeFormat('es-MX', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        }).format(date);
    } catch {
        return value;
    }
};

const StudyLibrary: React.FC<StudyLibraryProps> = ({ onSectionChange }) => {
    const [records, setRecords] = useState<StudyLibraryRecord[]>([]);
    const [filter, setFilter] = useState<Filter>('todos');
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [revealedDiagnoses, setRevealedDiagnoses] = useState<Record<string, boolean>>({});
    const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<StudyLibraryRecord | null>(null);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setSelectedHistoryRecord(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const loadRecords = async () => {
        setIsLoading(true);
        await hydrateStudyLibraryFromCloud();
        setRecords(await listRecentStudyRecords(50));
        setIsLoading(false);
    };

    useEffect(() => {
        void loadRecords();
    }, []);

    const visibleRecords = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase();
        return records.filter((record) => {
            const matchesFilter = filter === 'todos'
                || (filter === 'favoritos' && record.isFavorite)
                || record.kind === filter;
            const matchesQuery = !normalizedQuery
                || `${record.title} ${record.topic}`.toLocaleLowerCase().includes(normalizedQuery);
            return matchesFilter && matchesQuery;
        });
    }, [filter, query, records]);

    const openRecord = async (record: StudyLibraryRecord) => {
        await markStudyViewed(record.id);
        if (record.kind === 'simulacion') {
            try { sessionStorage.setItem('aiclinic:pending-simulation', JSON.stringify(record)); } catch {}
            window.dispatchEvent(new CustomEvent('aiclinic:restore-simulation', { detail: record }));
            onSectionChange(Section.Simulator);
        } else if (record.kind === 'articulo') {
            try { sessionStorage.setItem('aiclinic:pending-articulo', JSON.stringify(record)); } catch {}
            window.dispatchEvent(new CustomEvent('aiclinic:restore-articulo', { detail: record }));
            onSectionChange(Section.ArticleAnalyzer);
        } else if (record.kind === 'quiz') {
            try { sessionStorage.setItem('aiclinic:pending-quiz', JSON.stringify(record)); } catch {}
            window.dispatchEvent(new CustomEvent('aiclinic:restore-quiz', { detail: record }));
            onSectionChange(Section.Quiz);
        } else if (record.kind === 'doctoria') {
            try { sessionStorage.setItem('aiclinic:pending-doctoria', JSON.stringify(record)); } catch {}
            window.dispatchEvent(new CustomEvent('aiclinic:restore-doctoria', { detail: record }));
            onSectionChange(Section.ChatBot);
        } else {
            try { sessionStorage.setItem('aiclinic:pending-guia', JSON.stringify(record)); } catch {}
            window.dispatchEvent(new CustomEvent('aiclinic:restore-guia', { detail: record }));
            onSectionChange(Section.Guides);
        }
        setRecords(await listRecentStudyRecords(50));
    };

    const handleToggleFavorite = async (event: React.MouseEvent, record: StudyLibraryRecord) => {
        event.stopPropagation();
        await toggleStudyFavorite(record.id);
        setRecords(await listRecentStudyRecords(50));
    };

    const toggleRevealDiagnosis = (event: React.MouseEvent, recordId: string) => {
        event.stopPropagation();
        setRevealedDiagnoses((prev) => ({
            ...prev,
            [recordId]: !prev[recordId],
        }));
    };

    return (
        <div className="max-w-5xl mx-auto">
            <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                    <div>
                        <h2 className="text-2xl font-bold text-blue-800 dark:text-cyan-300">📚 Biblioteca de estudio</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Vistos recientemente, artículos analizados, cuestionarios y casos listos para reestudiar en cualquier dispositivo.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadRecords()}
                        className="self-start rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:border-slate-600 dark:text-cyan-300 dark:hover:bg-slate-800"
                    >
                        Actualizar lista
                    </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto] mb-4">
                    <input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Buscar tema, caso, artículo o quiz..."
                        className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                    <select
                        value={filter}
                        onChange={(event) => setFilter(event.target.value as Filter)}
                        className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        aria-label="Filtrar biblioteca"
                    >
                        <option value="todos">Vistos recientemente (hasta 50)</option>
                        <option value="favoritos">Favoritos</option>
                        <option value="simulacion">Casos clínicos</option>
                        <option value="articulo">Artículos analizados</option>
                        <option value="quiz">Quizzes y cuestionarios</option>
                        <option value="guia">Guías clínicas</option>
                        <option value="doctoria">DoctorIA</option>
                    </select>
                </div>

                {isLoading ? <LoadingSpinner /> : visibleRecords.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-slate-600 dark:text-gray-400">
                        Todavía no hay contenidos guardados. Al completar una respuesta, artículo, quiz, guía o caso aparecerá aquí disponible para todos los dispositivos.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {visibleRecords.map((record) => (
                            <div
                                role="button"
                                tabIndex={0}
                                key={record.id}
                                onClick={() => void openRecord(record)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        void openRecord(record);
                                    }
                                }}
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 p-4 text-left transition hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800/80 dark:hover:border-cyan-500 dark:hover:bg-slate-800"
                            >
                                <div className="flex items-start gap-3">
                                    <span className="text-2xl" aria-hidden="true">{KIND_ICONS[record.kind]}</span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-bold text-gray-800 dark:text-gray-100 break-words">{record.title}</h3>
                                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-slate-700 dark:text-cyan-300">{KIND_LABELS[record.kind]}</span>
                                        </div>
                                        <div className="mt-1">
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    setSelectedHistoryRecord(record);
                                                }}
                                                className="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs text-gray-500 hover:text-blue-700 hover:bg-blue-100/70 dark:text-gray-400 dark:hover:text-cyan-300 dark:hover:bg-slate-700/70 transition-colors"
                                                title="Ver historial de aperturas (últimas 30 vistas)"
                                            >
                                                <span className="underline decoration-dotted decoration-gray-400 group-hover:decoration-blue-600">
                                                    Visto {formatDate(record.lastViewedAt)} · {record.viewCount} {record.viewCount === 1 ? 'lectura' : 'lecturas'}
                                                </span>
                                                <span className="text-[11px] font-medium text-blue-600 dark:text-cyan-400 opacity-90 group-hover:opacity-100">
                                                    📋 Historial
                                                </span>
                                            </button>
                                        </div>

                                        {record.kind === 'simulacion' && (() => {
                                            const diag = getSimulationDiagnosis(record);
                                            if (!diag) return null;
                                            const isRevealed = Boolean(revealedDiagnoses[record.id]);
                                            return (
                                                <div className="mt-2.5 flex items-center gap-2 pt-2 border-t border-gray-200/70 dark:border-slate-700/60">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => toggleRevealDiagnosis(e, record.id)}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border shadow-xs ${
                                                            isRevealed
                                                                ? 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                                                : 'bg-white hover:bg-gray-100 text-gray-700 border-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-gray-200 dark:border-slate-600'
                                                        }`}
                                                        title={isRevealed ? "Ocultar diagnóstico (Modo Desafío Clínico)" : "Presiona el ojo para revelar el diagnóstico de este caso"}
                                                    >
                                                        <span className="text-sm">{isRevealed ? '👁️' : '👁️‍🗨️'}</span>
                                                        <span>{isRevealed ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}</span>
                                                    </button>
                                                    <div className="flex-1 min-w-0">
                                                        {isRevealed ? (
                                                            <span className="inline-block text-xs font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 truncate max-w-full animate-fade-in">
                                                                Dx: {diag}
                                                            </span>
                                                        ) : (
                                                            <span className="inline-block text-[11px] text-gray-400 dark:text-gray-400 italic select-none">
                                                                (Presiona el ojo solo si deseas conocer el diagnóstico antes de resolver el caso)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={(event) => void handleToggleFavorite(event, record)}
                                        aria-label={record.isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                                        className="rounded-lg px-2 py-1 text-lg hover:bg-white dark:hover:bg-slate-700"
                                    >
                                        {record.isFavorite ? '★' : '☆'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {selectedHistoryRecord && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in"
                    onClick={() => setSelectedHistoryRecord(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="history-modal-title"
                >
                    <div
                        className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl dark:bg-slate-900 border border-gray-200 dark:border-slate-700 max-h-[85vh] flex flex-col"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between pb-3 border-b border-gray-200 dark:border-slate-800">
                            <div className="min-w-0 pr-3">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xl" aria-hidden="true">{KIND_ICONS[selectedHistoryRecord.kind]}</span>
                                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-slate-700 dark:text-cyan-300">
                                        {KIND_LABELS[selectedHistoryRecord.kind]}
                                    </span>
                                </div>
                                <h3 id="history-modal-title" className="text-lg font-bold text-gray-900 dark:text-gray-100 break-words">
                                    {selectedHistoryRecord.title}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    Historial de aperturas · Total: <strong className="text-gray-700 dark:text-gray-200">{selectedHistoryRecord.viewCount} {selectedHistoryRecord.viewCount === 1 ? 'lectura' : 'lecturas'}</strong> (máx. 30 recientes)
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedHistoryRecord(null)}
                                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-slate-800 dark:hover:text-gray-200 transition-colors"
                                aria-label="Cerrar"
                            >
                                ✕
                            </button>
                        </div>

                        {/* List */}
                        <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1 my-1">
                            {(() => {
                                const history = (selectedHistoryRecord.viewHistory && selectedHistoryRecord.viewHistory.length > 0)
                                    ? selectedHistoryRecord.viewHistory
                                    : (selectedHistoryRecord.lastViewedAt ? [selectedHistoryRecord.lastViewedAt] : []);

                                if (history.length === 0) {
                                    return (
                                        <p className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                                            No hay registros de apertura aún.
                                        </p>
                                    );
                                }

                                return history.slice(0, 30).map((timestamp, index) => (
                                    <div
                                        key={`${timestamp}-${index}`}
                                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs sm:text-sm ${
                                            index === 0
                                                ? 'bg-blue-50/80 border-blue-200 text-blue-900 dark:bg-blue-950/40 dark:border-blue-800 dark:text-cyan-200 font-medium'
                                                : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-slate-800/60 dark:border-slate-700 dark:text-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold ${
                                                index === 0
                                                    ? 'bg-blue-600 text-white dark:bg-cyan-500 dark:text-slate-950'
                                                    : 'bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
                                            }`}>
                                                {index + 1}
                                            </span>
                                            <span className="font-mono text-xs sm:text-sm">
                                                {formatFullDateTime(timestamp)}
                                            </span>
                                        </div>
                                        {index === 0 && (
                                            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-cyan-900/60 dark:text-cyan-300">
                                                Más reciente
                                            </span>
                                        )}
                                    </div>
                                ));
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="pt-3 border-t border-gray-200 dark:border-slate-800 flex justify-between items-center">
                            <span className="text-xs text-gray-400 dark:text-gray-400">
                                Las aperturas anteriores se desplazan automáticamente al superar 30.
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedHistoryRecord(null)}
                                className="rounded-lg bg-gray-100 hover:bg-gray-200 px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default StudyLibrary;
