/**
 * AICLINIC - Cliente único de Gemini para todos los módulos.
 *
 * La aplicación conserva una sola API principal para evitar latencia y
 * consumo duplicado por failover entre credenciales. La disponibilidad se
 * mejora mediante fallback entre modelos dentro de geminiService.ts.
 */

import { GoogleGenAI, Chat } from '@google/genai';

export type ModuloClinico =
    | 'simulador'
    | 'analizador'
    | 'quizzes'
    | 'scores'
    | 'notas'
    | 'doctoria'
    | 'guias'
    | (string & {});

export type IdLlave = 'principal';

export interface InfoLlave {
    id: IdLlave;
    nombre: string;
    clave: string;
    origen: string;
}

export interface RegistroLlaves {
    principal: InfoLlave;
}

export type OperacionGemini<T> = (ai: GoogleGenAI, infoLlave: InfoLlave) => Promise<T>;

const clienteCache = new Map<string, GoogleGenAI>();

const LIMITES_TOKENS: Record<string, number> = {
    simulador: 1200,
    analizador: 1200,
    quizzes: 1000,
    notas: 1000,
};

const LIMITE_GENERAL_TOKENS = 800;
const MODELOS_CHAT = ['gemini-3.7-flash', 'gemini-2.5-flash'];
const TIMEOUTS_SOLICITUD_MS: Record<string, number> = {
    simulador: 25000,
    analizador: 25000,
};
const TIMEOUT_GENERAL_MS = 15000;

function esErrorTransitorio(error: any): boolean {
    const mensaje = String(error?.message || error || '').toLowerCase();
    return mensaje.includes('429') ||
        mensaje.includes('resource_exhausted') ||
        mensaje.includes('quota') ||
        mensaje.includes('500') ||
        mensaje.includes('502') ||
        mensaje.includes('503') ||
        mensaje.includes('504') ||
        mensaje.includes('unavailable') ||
        mensaje.includes('overloaded') ||
        mensaje.includes('timeout') ||
        mensaje.includes('aborterror') ||
        mensaje.includes('aborted') ||
        mensaje.includes('deadline exceeded');
}

/** Obtiene una variable de entorno compatible con Vite, navegador y Node. */
function obtenerVariableSegura(nombre: string): { valor: string; origen: string } {
    const prefijoVite = `VITE_${nombre}`;

    if (typeof localStorage !== 'undefined') {
        try {
            const guardada = localStorage.getItem(nombre) || localStorage.getItem(prefijoVite);
            if (guardada && guardada.trim() !== '') {
                return { valor: guardada.trim(), origen: 'localStorage' };
            }
        } catch {
            // El almacenamiento puede estar bloqueado por el navegador.
        }
    }

    if (typeof window !== 'undefined') {
        const win = window as any;
        for (const nombreVariable of [nombre, prefijoVite]) {
            const valor = win[nombreVariable];
            if (typeof valor === 'string' && valor.trim() !== '') {
                return { valor: valor.trim(), origen: 'window' };
            }
        }
    }

    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
        const env = (import.meta as any).env;
        for (const nombreVariable of [prefijoVite, nombre]) {
            const valor = env[nombreVariable];
            if (typeof valor === 'string' && valor.trim() !== '') {
                return { valor: valor.trim(), origen: 'import.meta.env' };
            }
        }
    }

    if (typeof process !== 'undefined' && process.env) {
        const valor = process.env[nombre] || process.env[prefijoVite];
        if (typeof valor === 'string' && valor.trim() !== '' && valor !== 'undefined' && valor !== 'null') {
            return { valor: valor.trim(), origen: 'process.env' };
        }
    }

    return { valor: '', origen: 'no configurada' };
}

/** Carga únicamente la API principal. */
export function cargarLlavesConfiguradas(): RegistroLlaves {
    let principal = obtenerVariableSegura('GEMINI_API_KEY');
    if (!principal.valor) {
        principal = obtenerVariableSegura('API_KEY');
    }

    return {
        principal: {
            id: 'principal',
            nombre: 'API Principal (GEMINI_API_KEY)',
            clave: principal.valor,
            origen: principal.origen,
        },
    };
}

/** Devuelve un pool de un solo elemento para conservar compatibilidad interna. */
export function obtenerPoolLlaves(_modulo?: ModuloClinico | string): InfoLlave[] {
    const { principal } = cargarLlavesConfiguradas();
    return principal.clave ? [principal] : [];
}

/** Límite de salida por módulo: más espacio para contenido clínico estructurado. */
export function obtenerLimiteTokens(modulo?: ModuloClinico | string): number {
    const clave = (modulo || '').toLowerCase().trim();
    return LIMITES_TOKENS[clave] || LIMITE_GENERAL_TOKENS;
}

/** Aplica un límite máximo sin permitir que una llamada lo eleve. */
export function aplicarLimiteTokens(config: any = {}, modulo?: ModuloClinico | string): any {
    const limite = obtenerLimiteTokens(modulo);
    const solicitado = Number(config.maxOutputTokens);
    const maxOutputTokens = Number.isFinite(solicitado) && solicitado > 0
        ? Math.min(solicitado, limite)
        : limite;

    const timeoutBase = TIMEOUTS_SOLICITUD_MS[(modulo || '').toLowerCase().trim()] || TIMEOUT_GENERAL_MS;
    const timeoutSolicitado = Number(config.httpOptions?.timeout);
    const timeout = Number.isFinite(timeoutSolicitado) && timeoutSolicitado > 0
        ? Math.min(timeoutSolicitado, timeoutBase)
        : timeoutBase;

    return {
        ...config,
        maxOutputTokens,
        httpOptions: {
            ...config.httpOptions,
            timeout,
            retryOptions: {
                ...config.httpOptions?.retryOptions,
                attempts: 1,
            },
        },
    };
}

export function obtenerInstanciaGenAI(apiKey?: string): GoogleGenAI {
    const claveLimpia = (apiKey || cargarLlavesConfiguradas().principal.clave || '').trim();
    if (!clienteCache.has(claveLimpia)) {
        clienteCache.set(claveLimpia, new GoogleGenAI({ apiKey: claveLimpia }));
    }
    return clienteCache.get(claveLimpia)!;
}

/** Ejecuta la operación una sola vez con la API principal. */
export async function llamarGeminiConFailover<T>(
    operacion: OperacionGemini<T>,
    _modulo?: ModuloClinico | string
): Promise<T> {
    const infoLlave = cargarLlavesConfiguradas().principal;
    if (!infoLlave.clave) {
        throw new Error('No hay una API principal configurada. Verifique GEMINI_API_KEY.');
    }

    return operacion(obtenerInstanciaGenAI(infoLlave.clave), infoLlave);
}

/** Alias de compatibilidad para los módulos que solicitan el cliente por contexto. */
export function obtenerAiClientePorModulo(_modulo?: ModuloClinico | string): GoogleGenAI {
    return obtenerInstanciaGenAI();
}

/**
 * Crea una sesión de chat con la única API y el límite correspondiente al módulo.
 * Si el modelo principal está saturado, prueba una sola alternativa usando la
 * misma API y conserva el historial de la conversación.
 */
export function crearChatConFailover(modulo: ModuloClinico | string = 'doctoria', config?: any): Chat {
    const modelos = config?.model ? [config.model, ...MODELOS_CHAT.filter(modelo => modelo !== config.model)] : MODELOS_CHAT;
    const configConLimite = aplicarLimiteTokens(config?.config, modulo);
    const ai = obtenerInstanciaGenAI();
    let indiceModelo = 0;
    let chatInstancia = ai.chats.create({ model: modelos[indiceModelo], config: configConLimite });

    const crearChatAlternativo = () => {
        const historial = typeof (chatInstancia as any).getHistory === 'function'
            ? (chatInstancia as any).getHistory()
            : [];
        chatInstancia = ai.chats.create({
            model: modelos[indiceModelo],
            config: configConLimite,
            history: historial,
        });
    };

    return new Proxy(chatInstancia, {
        get(target: any, prop: string | symbol) {
            if (prop === 'sendMessageStream') {
                return async function* (params: any) {
                    while (indiceModelo < modelos.length) {
                        try {
                            const stream = await chatInstancia.sendMessageStream(params);
                            for await (const chunk of stream) {
                                yield chunk;
                            }
                            return;
                        } catch (error) {
                            if (indiceModelo >= modelos.length - 1 || !esErrorTransitorio(error)) {
                                throw error;
                            }
                            indiceModelo += 1;
                            console.warn(`[AICLINIC] Modelo ${modelos[indiceModelo - 1]} no disponible; probando ${modelos[indiceModelo]} con la API principal.`);
                            crearChatAlternativo();
                        }
                    }
                };
            }

            if (prop === 'sendMessage') {
                return async function (params: any) {
                    while (indiceModelo < modelos.length) {
                        try {
                            return await chatInstancia.sendMessage(params);
                        } catch (error) {
                            if (indiceModelo >= modelos.length - 1 || !esErrorTransitorio(error)) {
                                throw error;
                            }
                            indiceModelo += 1;
                            console.warn(`[AICLINIC] Modelo ${modelos[indiceModelo - 1]} no disponible; probando ${modelos[indiceModelo]} con la API principal.`);
                            crearChatAlternativo();
                        }
                    }
                };
            }

            const valor = target[prop];
            return typeof valor === 'function' ? valor.bind(target) : valor;
        },
    }) as Chat;
}
