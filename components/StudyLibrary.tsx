import React, { useEffect, useMemo, useState } from 'react';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import { Section } from '../constants';
import { StudyLibraryKind, StudyLibraryRecord } from '../types';
import {
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
};

const KIND_ICONS: Record<StudyLibraryKind, string> = {
    doctoria: '💬',
    guia: '📚',
    simulacion: '🩺',
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

    const loadRecords = async () => {
        setIsLoading(true);
        await hydrateStudyLibraryFromCloud();
        setRecords(await listRecentStudyRecords(100));
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
        } else if (record.kind === 'doctoria') {
            window.dispatchEvent(new CustomEvent('aiclinic:restore-doctoria', { detail: record }));
            onSectionChange(Section.ChatBot);
        } else {
            window.dispatchEvent(new CustomEvent('aiclinic:restore-guia', { detail: record }));
            onSectionChange(Section.Guides);
        }
        setRecords(await listRecentStudyRecords(100));
    };

    const handleToggleFavorite = async (event: React.MouseEvent, record: StudyLibraryRecord) => {
        event.stopPropagation();
        await toggleStudyFavorite(record.id);
        setRecords(await listRecentStudyRecords(100));
    };

    return (
        <div className="max-w-5xl mx-auto">
            <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
                    <div>
                        <h2 className="text-2xl font-bold text-blue-800 dark:text-cyan-300">📚 Biblioteca de estudio</h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Vistos recientemente, respuestas guardadas y casos listos para reestudiar.
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
                        placeholder="Buscar tema o pregunta guardada..."
                        className="w-full rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                    />
                    <select
                        value={filter}
                        onChange={(event) => setFilter(event.target.value as Filter)}
                        className="rounded-lg border-2 border-gray-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                        aria-label="Filtrar biblioteca"
                    >
                        <option value="todos">Vistos recientemente</option>
                        <option value="favoritos">Favoritos</option>
                        <option value="doctoria">DoctorIA</option>
                        <option value="guia">Guías clínicas</option>
                        <option value="simulacion">Casos clínicos</option>
                    </select>
                </div>

                {isLoading ? <LoadingSpinner /> : visibleRecords.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-slate-600 dark:text-gray-400">
                        Todavía no hay contenidos guardados. Al completar una respuesta, guía o caso aparecerá aquí.
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
