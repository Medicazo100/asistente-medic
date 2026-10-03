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

const StudyLibrary: React.FC<StudyLibraryProps> = ({ onSectionChange }) => {
    const [records, setRecords] = useState<StudyLibraryRecord[]>([]);
    const [filter, setFilter] = useState<Filter>('todos');
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [revealedDiagnoses, setRevealedDiagnoses] = useState<Record<string, boolean>>({});

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
            window.dispatchEvent(new CustomEvent('aiclinic:restore-simulation', { detail: record }));
            onSectionChange(Section.Simulator);
        } else if (record.kind === 'articulo') {
            window.dispatchEvent(new CustomEvent('aiclinic:restore-articulo', { detail: record }));
            onSectionChange(Section.ArticleAnalyzer);
        } else if (record.kind === 'quiz') {
            window.dispatchEvent(new CustomEvent('aiclinic:restore-quiz', { detail: record }));
            onSectionChange(Section.Quiz);
        } else if (record.kind === 'doctoria') {
            window.dispatchEvent(new CustomEvent('aiclinic:restore-doctoria', { detail: record }));
            onSectionChange(Section.ChatBot);
        } else {
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
                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Visto {formatDate(record.lastViewedAt)} · {record.viewCount} {record.viewCount === 1 ? 'lectura' : 'lecturas'}</p>

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
        </div>
    );
};

export default StudyLibrary;
