import type { SupabaseClient } from '@supabase/supabase-js';
import {
    ArticleLibraryPayload,
    DoctoriaLibraryPayload,
    GuideLibraryPayload,
    QuizLibraryPayload,
    SimulationLibraryPayload,
    StudyLibraryKind,
    StudyLibraryRecord,
} from '../types';

const DB_NAME = 'aiclinic-study-library-v1';
const DB_VERSION = 1;
const STORE_NAME = 'records';
const FALLBACK_KEY = 'aiclinic_study_library_v1';
const CLOUD_TABLE = 'study_library';

export type DoctoriaRecord = StudyLibraryRecord<DoctoriaLibraryPayload>;
export type GuideRecord = StudyLibraryRecord<GuideLibraryPayload>;
export type SimulationRecord = StudyLibraryRecord<SimulationLibraryPayload>;
export type ArticleRecord = StudyLibraryRecord<ArticleLibraryPayload>;
export type QuizRecord = StudyLibraryRecord<QuizLibraryPayload>;

let databasePromise: Promise<IDBDatabase | null> | null = null;
let supabaseClient: SupabaseClient | null = null;
let cloudWarningShown = false;

export function normalizeStudyTopic(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function compactHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createStudyRecordId(kind: StudyLibraryKind, identity: string): string {
    return `${kind}:${compactHash(normalizeStudyTopic(identity))}`;
}

export function createSimulationRecordId(topic: string, clinicalCase: unknown): string {
    return createStudyRecordId('simulacion', `${topic}|${JSON.stringify(clinicalCase)}`);
}

export function createArticleRecordId(title: string, excerpt: string): string {
    return createStudyRecordId('articulo', `${title}|${excerpt.slice(0, 100)}`);
}

export function createQuizRecordId(topic: string, difficulty: string, questionCount: number): string {
    return createStudyRecordId('quiz', `${topic}|${difficulty}|${questionCount}`);
}

export function getSimulationDiagnosis(record: StudyLibraryRecord): string | null {
    if (record.kind !== 'simulacion') return null;
    const payload = record.payload as any;
    if (payload?.preloadedDiagnosis?.text) {
        const text = payload.preloadedDiagnosis.text;
        const match = text.match(/###\s*Diagnóstico Principal\s*\n+([^\n#]+)/i);
        if (match && match[1]) {
            return match[1].replace(/[*_#\[\]\(\)]/g, '').trim();
        }
    }
    return record.topic || payload?.topic || null;
}

function getFallbackRecords(): StudyLibraryRecord[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = window.localStorage.getItem(FALLBACK_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function setFallbackRecords(records: StudyLibraryRecord[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(FALLBACK_KEY, JSON.stringify(records));
    } catch (error) {
        console.warn('No se pudo guardar la biblioteca local de estudio:', error);
    }
}

function openDatabase(): Promise<IDBDatabase | null> {
    if (databasePromise) return databasePromise;
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
        databasePromise = Promise.resolve(null);
        return databasePromise;
    }

    databasePromise = new Promise((resolve) => {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            const store = database.objectStoreNames.contains(STORE_NAME)
                ? request.transaction?.objectStore(STORE_NAME)
                : database.createObjectStore(STORE_NAME, { keyPath: 'id' });
            if (store && !store.indexNames.contains('kind')) store.createIndex('kind', 'kind', { unique: false });
            if (store && !store.indexNames.contains('lastViewedAt')) store.createIndex('lastViewedAt', 'lastViewedAt', { unique: false });
            if (store && !store.indexNames.contains('topicKey')) store.createIndex('topicKey', 'topicKey', { unique: false });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
    });
    return databasePromise;
}

function normalizeRecordHistory(record: StudyLibraryRecord): StudyLibraryRecord {
    const rawHistory = Array.isArray(record.viewHistory) && record.viewHistory.length > 0
        ? record.viewHistory
        : Array.isArray((record.payload as any)?._viewHistory) && (record.payload as any)._viewHistory.length > 0
            ? (record.payload as any)._viewHistory
            : (record.lastViewedAt ? [record.lastViewedAt] : []);
    const filteredHistory: string[] = (rawHistory as unknown[]).filter((item): item is string => typeof item === 'string' && Boolean(item));
    const viewHistory: string[] = Array.from(new Set(filteredHistory)).slice(0, 30);
    return {
        ...record,
        viewHistory,
    };
}

async function readAllLocalRecords(): Promise<StudyLibraryRecord[]> {
    const database = await openDatabase();
    let records: StudyLibraryRecord[] = [];
    if (!database) {
        records = getFallbackRecords();
    } else {
        records = await new Promise((resolve) => {
            const transaction = database.transaction(STORE_NAME, 'readonly');
            const request = transaction.objectStore(STORE_NAME).getAll();
            request.onsuccess = () => resolve((request.result || []) as StudyLibraryRecord[]);
            request.onerror = () => resolve(getFallbackRecords());
        });
    }
    return records.filter(isValidStudyRecord).map(normalizeRecordHistory);
}

async function writeLocalRecord(record: StudyLibraryRecord): Promise<void> {
    const database = await openDatabase();
    if (!database) {
        const records = getFallbackRecords().filter((item) => item.id !== record.id);
        setFallbackRecords([...records, record]);
        return;
    }

    await new Promise<void>((resolve) => {
        const transaction = database.transaction(STORE_NAME, 'readwrite');
        transaction.objectStore(STORE_NAME).put(record);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => resolve();
    });
}

function cloudSyncEnabled(): boolean {
    return String((import.meta as any).env?.VITE_SUPABASE_ENABLE_SYNC || '').toLowerCase() === 'true';
}

async function getCloudClient(): Promise<SupabaseClient | null> {
    if (supabaseClient) return supabaseClient;
    const url = String((import.meta as any).env?.VITE_SUPABASE_URL || '').trim();
    const publishableKey = String((import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
    if (!cloudSyncEnabled() || !url || !publishableKey) return null;
    const { createClient } = await import('@supabase/supabase-js');
    supabaseClient = createClient(url, publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });
    return supabaseClient;
}

function getLocalAnonymousUserId(): string {
    if (typeof window === 'undefined' || !window.localStorage) return 'shared_anon';
    try {
        let anonId = window.localStorage.getItem('aiclinic_anon_user_id');
        if (!anonId) {
            anonId = 'anon_' + Math.random().toString(36).substring(2, 12);
            window.localStorage.setItem('aiclinic_anon_user_id', anonId);
        }
        return anonId;
    } catch {
        return 'shared_anon';
    }
}

async function getCloudUserId(client: SupabaseClient): Promise<string> {
    try {
        const current = await client.auth.getUser();
        if (current.data?.user?.id) return current.data.user.id;
    } catch {
        // Ignorar si auth no está activo
    }
    return getLocalAnonymousUserId();
}

export function isValidStudyRecord(record: unknown): record is StudyLibraryRecord {
    if (!record || typeof record !== 'object') return false;
    const r = record as StudyLibraryRecord;
    if (!r.id || r.id === 'test:connectivity') return false;
    if (!r.kind || !r.payload || typeof r.payload !== 'object') return false;
    if (r.kind === 'simulacion') {
        const payload = r.payload as any;
        if (!payload.clinicalCase || (!payload.clinicalCase.caseTitle && !payload.clinicalCase.patientProfile && !payload.clinicalCase.historyOfPresentIllness)) return false;
    }
    if (r.kind === 'quiz') {
        const payload = r.payload as any;
        if (!Array.isArray(payload.questions) || payload.questions.length === 0) return false;
    }
    if (r.kind === 'articulo') {
        const payload = r.payload as any;
        if (!payload.analysis && !payload.content) return false;
    }
    return true;
}

function removeLargeInlineImages(value: unknown): unknown {
    try {
        return JSON.parse(JSON.stringify(value, (_key, child) => {
            if (typeof child === 'string' && child.startsWith('data:image/')) return undefined;
            return child;
        }));
    } catch {
        return value;
    }
}

async function syncRecordToCloud(record: StudyLibraryRecord): Promise<void> {
    if (!isValidStudyRecord(record)) return;
    const client = await getCloudClient();
    if (!client) return;
    try {
        const userId = await getCloudUserId(client);
        const { error } = await client.from(CLOUD_TABLE).upsert({
            user_id: userId,
            id: record.id,
            kind: record.kind,
            title: record.title,
            topic: record.topic,
            topic_key: record.topicKey,
            payload: removeLargeInlineImages(record.payload),
            created_at: record.createdAt,
            last_viewed_at: record.lastViewedAt,
            view_count: record.viewCount,
            is_favorite: record.isFavorite,
            version: record.version,
        }, { onConflict: 'id' });
        if (error) {
            console.warn('Error al sincronizar con Supabase:', error);
            throw error;
        }
    } catch (error) {
        if (!cloudWarningShown) {
            cloudWarningShown = true;
            console.warn('La sincronización opcional con Supabase no está disponible:', error);
        }
    }
}

export async function hydrateStudyLibraryFromCloud(): Promise<void> {
    const client = await getCloudClient();
    if (!client) return;
    try {
        // Consultar los 50 registros más recientes a nivel global para que estén disponibles
        // en todos los dispositivos de la red y reutilizar análisis y casos previos sin gastar IA
        const { data, error } = await client
            .from(CLOUD_TABLE)
            .select('*')
            .order('last_viewed_at', { ascending: false })
            .limit(50);
        if (error) throw error;
        for (const item of data || []) {
            if (item.id === 'test:connectivity') continue;
            const rawCloudHistory = Array.isArray((item.payload as any)?._viewHistory)
                ? (item.payload as any)._viewHistory
                : (item.last_viewed_at ? [item.last_viewed_at] : []);
            const filteredCloudHistory: string[] = (rawCloudHistory as unknown[]).filter((ts): ts is string => typeof ts === 'string' && Boolean(ts));
            const cloudHistory: string[] = Array.from(new Set(filteredCloudHistory)).slice(0, 30);
            const remoteRecord: StudyLibraryRecord = {
                id: item.id,
                kind: item.kind,
                title: item.title,
                topic: item.topic,
                topicKey: item.topic_key,
                payload: item.payload,
                createdAt: item.created_at,
                lastViewedAt: item.last_viewed_at,
                viewCount: item.view_count || 1,
                viewHistory: cloudHistory,
                isFavorite: Boolean(item.is_favorite),
                version: 1,
            };
            if (!isValidStudyRecord(remoteRecord)) continue;
            const local = (await readAllLocalRecords()).find((record) => record.id === remoteRecord.id);
            if (!local || new Date(remoteRecord.lastViewedAt).getTime() > new Date(local.lastViewedAt).getTime()) {
                await writeLocalRecord(remoteRecord);
            }
        }
    } catch (error) {
        if (!cloudWarningShown) {
            cloudWarningShown = true;
            console.warn('No se pudo hidratar la biblioteca desde Supabase:', error);
        }
    }
}

export async function saveStudyRecord<T>(record: StudyLibraryRecord<T>): Promise<void> {
    await writeLocalRecord(record as StudyLibraryRecord);
    void syncRecordToCloud(record as StudyLibraryRecord);
}

export async function findStudyRecord<T>(kind: StudyLibraryKind, topic: string): Promise<StudyLibraryRecord<T> | null> {
    const topicKey = normalizeStudyTopic(topic);
    const records = await readAllLocalRecords();
    const match = records.find((record) => record.kind === kind && record.topicKey === topicKey);
    return (match as StudyLibraryRecord<T> | undefined) || null;
}

export async function getStudyRecordById<T>(id: string): Promise<StudyLibraryRecord<T> | null> {
    const records = await readAllLocalRecords();
    return (records.find((record) => record.id === id) as StudyLibraryRecord<T> | undefined) || null;
}

export async function listRecentStudyRecords(limit = 50): Promise<StudyLibraryRecord[]> {
    const records = await readAllLocalRecords();
    return records
        .sort((left, right) => new Date(right.lastViewedAt).getTime() - new Date(left.lastViewedAt).getTime())
        .slice(0, limit);
}

export async function markStudyViewed(id: string): Promise<void> {
    const records = await readAllLocalRecords();
    const record = records.find((item) => item.id === id);
    if (!record) return;
    const now = new Date().toISOString();
    const prevHistory = Array.isArray(record.viewHistory) && record.viewHistory.length > 0
        ? record.viewHistory
        : (record.lastViewedAt ? [record.lastViewedAt] : []);
    const updatedHistory = [now, ...prevHistory.filter((ts) => ts !== now)].slice(0, 30);
    const updatedPayload = record.payload && typeof record.payload === 'object'
        ? { ...(record.payload as any), _viewHistory: updatedHistory }
        : record.payload;
    const updated: StudyLibraryRecord = {
        ...record,
        payload: updatedPayload,
        lastViewedAt: now,
        viewCount: record.viewCount + 1,
        viewHistory: updatedHistory,
    };
    await saveStudyRecord(updated);
}

export async function toggleStudyFavorite(id: string): Promise<void> {
    const records = await readAllLocalRecords();
    const record = records.find((item) => item.id === id);
    if (!record) return;
    await saveStudyRecord({ ...record, isFavorite: !record.isFavorite });
}

export function buildStudyRecord<T>(params: {
    id: string;
    kind: StudyLibraryKind;
    title: string;
    topic: string;
    payload: T;
    existing?: StudyLibraryRecord<T> | null;
}): StudyLibraryRecord<T> {
    const now = new Date().toISOString();
    const rawExistingHistory: unknown[] = Array.isArray(params.existing?.viewHistory)
        ? params.existing.viewHistory
        : Array.isArray((params.existing?.payload as any)?._viewHistory)
            ? (params.existing?.payload as any)._viewHistory
            : (params.existing?.lastViewedAt ? [params.existing.lastViewedAt] : []);
    const filteredExisting = rawExistingHistory.filter((ts): ts is string => typeof ts === 'string' && ts !== now);
    const updatedHistory: string[] = [now, ...filteredExisting].slice(0, 30);
    const updatedPayload = params.payload && typeof params.payload === 'object'
        ? { ...(params.payload as any), _viewHistory: updatedHistory }
        : params.payload;

    return {
        id: params.id,
        kind: params.kind,
        title: params.title,
        topic: params.topic,
        topicKey: normalizeStudyTopic(params.topic),
        payload: updatedPayload,
        createdAt: params.existing?.createdAt || now,
        lastViewedAt: now,
        viewCount: (params.existing?.viewCount || 0) + 1,
        viewHistory: updatedHistory,
        isFavorite: params.existing?.isFavorite || false,
        version: 1,
    };
}

export function isStudyLibraryRecord(value: unknown): value is StudyLibraryRecord {
    return Boolean(value && typeof value === 'object' && 'kind' in value && 'payload' in value);
}
