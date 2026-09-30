/**
 * AICLINIC - Plataforma de Juicio Clínico y Simulación Médica
 * Hospital General de Apatzingán
 * Dr. Gabriel Méndez Ortiz
 *
 * Módulo: Sistema de Enrutamiento y Failover con Prioridades por Módulo (apiRouter.ts)
 * 
 * Reglas de Prioridad:
 * - Caso A ('simulador'): [Respaldo 1, Respaldo 2, Respaldo 3, Principal]
 * - Caso B (demás módulos / general): [Respaldo 1, Respaldo 2, Respaldo 3] (Exclusivo respaldos)
 * 
 * Mecanismo de Failover:
 * - Reintento en cadena ante errores 429 (límite de cuota), 5xx (servidor) o fallas de red.
 * - Registro limpio en consola mediante console.warn con jerga y tono profesional mexicano.
 */

import { GoogleGenAI, Chat } from "@google/genai";

// Identificadores de módulos clínicos reconocidos por la plataforma
export type ModuloClinico =
    | 'simulador'       // Simulador de Casos Clínicos y Órdenes Médicas
    | 'analizador'      // Analizador de Artículos Médicos (Taxonomía de Bloom)
    | 'quizzes'         // Generador de Exámenes y Cuestionarios
    | 'scores'          // Escalas de Riesgo y Calculadoras Clínicas
    | 'notas'           // Guías y Plantillas de Notas Médicas Hospitalarias
    | 'doctoria'        // Copiloto Clínico y Chat Asistencial
    | 'guias'           // Guías Rápidas de Diagnóstico y Tratamiento
    | (string & {});    // Soporte para cualquier módulo o contexto adicional

export type IdLlave = 'principal' | 'resend_1' | 'resend_2' | 'resend_3';

export interface InfoLlave {
    id: IdLlave;
    nombre: string;
    clave: string;
    origen: string;
}

export interface RegistroLlaves {
    principal: InfoLlave;
    resend_1: InfoLlave;
    resend_2: InfoLlave;
    resend_3: InfoLlave;
}

export type OperacionGemini<T> = (ai: GoogleGenAI, infoLlave: InfoLlave) => Promise<T>;

// Caché en memoria para reutilizar instancias del cliente GoogleGenAI por cada llave
const clienteCache = new Map<string, GoogleGenAI>();

/**
 * Obtiene una variable de entorno de forma segura tanto en entorno de desarrollo
 * Vite (cliente) como en tiempo de ejecución Node / Vercel o localStorage del navegador.
 */
function obtenerVariableSegura(nombre: string): { valor: string; origen: string } {
    const prefijoVite = `VITE_${nombre}`;

    // 1. Prioridad: localStorage del navegador (útil para pruebas en caliente del usuario)
    if (typeof localStorage !== 'undefined') {
        try {
            const guardada = localStorage.getItem(nombre) || localStorage.getItem(prefijoVite);
            if (guardada && guardada.trim() !== '') {
                return { valor: guardada.trim(), origen: 'localStorage' };
            }
        } catch {
            // Ignoramos errores de acceso a almacenamiento local
        }
    }

    // 2. Prioridad: Variable global inyectada en el objeto window
    if (typeof window !== 'undefined') {
        const win = window as any;
        if (win[nombre] && typeof win[nombre] === 'string' && win[nombre].trim() !== '') {
            return { valor: win[nombre].trim(), origen: 'window' };
        }
        if (win[prefijoVite] && typeof win[prefijoVite] === 'string' && win[prefijoVite].trim() !== '') {
            return { valor: win[prefijoVite].trim(), origen: 'window' };
        }
    }

    // 3. Prioridad: Variables import.meta.env provistas por Vite
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
        const env = (import.meta as any).env;
        if (env[prefijoVite] && typeof env[prefijoVite] === 'string' && env[prefijoVite].trim() !== '') {
            return { valor: env[prefijoVite].trim(), origen: 'import.meta.env (Vite)' };
        }
        if (env[nombre] && typeof env[nombre] === 'string' && env[nombre].trim() !== '') {
            return { valor: env[nombre].trim(), origen: 'import.meta.env' };
        }
    }

    // 4. Prioridad: process.env (Node.js o variables inyectadas durante el build de Vercel)
    if (typeof process !== 'undefined' && process.env) {
        const pVal = process.env[nombre] || process.env[prefijoVite];
        if (pVal && typeof pVal === 'string' && pVal !== 'undefined' && pVal !== 'null' && pVal.trim() !== '') {
            return { valor: pVal.trim(), origen: 'process.env (Vercel/Node)' };
        }
    }

    return { valor: '', origen: 'no configurada' };
}

/**
 * Carga el registro de las 4 llaves maestras configuradas en Vercel y el entorno.
 */
export function cargarLlavesConfiguradas(): RegistroLlaves {
    // 1. Llave Principal (GEMINI_API_KEY o alias de compatibilidad API_KEY)
    let principal = obtenerVariableSegura('GEMINI_API_KEY');
    if (!principal.valor) {
        principal = obtenerVariableSegura('API_KEY');
    }

    // 2. Llaves de Respaldo (Resend 1, Resend 2, Resend 3)
    const resend1 = obtenerVariableSegura('GEMINI_API_KEY_RESEND_1');
    const resend2 = obtenerVariableSegura('GEMINI_API_KEY_RESEND_2');
    const resend3 = obtenerVariableSegura('GEMINI_API_KEY_RESEND_3');

    return {
        principal: {
            id: 'principal',
            nombre: 'API Principal (GEMINI_API_KEY)',
            clave: principal.valor,
            origen: principal.origen,
        },
        resend_1: {
            id: 'resend_1',
            nombre: 'Respaldo 1 (GEMINI_API_KEY_RESEND_1)',
            clave: resend1.valor,
            origen: resend1.origen,
        },
        resend_2: {
            id: 'resend_2',
            nombre: 'Respaldo 2 (GEMINI_API_KEY_RESEND_2)',
            clave: resend2.valor,
            origen: resend2.origen,
        },
        resend_3: {
            id: 'resend_3',
            nombre: 'Respaldo 3 (GEMINI_API_KEY_RESEND_3)',
            clave: resend3.valor,
            origen: resend3.origen,
        },
    };
}

/**
 * Genera el arreglo ordenado de llaves (apiKeyPool) con base en la regla de prioridades por módulo.
 * 
 * - Caso A: Simulador de Casos Clínicos ('simulador'):
 *   Prioridad: [Respaldo 1, Respaldo 2, Respaldo 3, Principal]
 *   (Las llaves de respaldo atienden la simulación y la Principal actúa como último salvavidas).
 * 
 * - Caso B: Demás Módulos / General ('analizador', 'quizzes', 'scores', 'notas', 'doctoria', etc.):
 *   Prioridad: [Respaldo 1, Respaldo 2, Respaldo 3]
 *   (Uso exclusivo de respaldos para blindar intacta la cuota de la API Principal).
 */
export function obtenerPoolLlaves(modulo?: ModuloClinico | string): InfoLlave[] {
    const llaves = cargarLlavesConfiguradas();
    const mod = (modulo || '').toLowerCase().trim();

    // Verificamos si corresponde al Caso A: Simulador de Casos Clínicos
    const esSimulador = mod === 'simulador' || mod === 'simulator' || mod === 'caso_clinico';

    if (esSimulador) {
        // Caso A: Se intercalan primero los 3 respaldos y la Principal queda al final como salvavidas
        return [
            llaves.resend_1,
            llaves.resend_2,
            llaves.resend_3,
            llaves.principal
        ];
    }

    // Caso B: Demás Módulos / General.
    // Utilizan exclusivamente las 3 APIs de respaldo para preservar intacta la cuota general.
    const poolRespaldos = [
        llaves.resend_1,
        llaves.resend_2,
        llaves.resend_3
    ];

    // Salvaguarda exclusiva para entorno de desarrollo local:
    // Si un desarrollador local sólo configuró GEMINI_API_KEY en su .env y ninguna de respaldo,
    // permitimos fallback a la principal con advertencia para no romper su entorno de pruebas local.
    const hayRespaldosValidos = poolRespaldos.some(ll => Boolean(ll.clave && ll.clave.trim() !== ''));
    if (!hayRespaldosValidos && llaves.principal.clave) {
        console.warn(
            `[AICLINIC Router] ⚠️ Aviso de desarrollo: No se detectaron llaves de respaldo configuradas en Vercel/entorno. ` +
            `Permitiendo provisionalmente la API Principal para el módulo "${modulo || 'general'}" en entorno local.`
        );
        return [llaves.principal];
    }

    return poolRespaldos;
}

/**
 * Obtiene o crea de forma eficiente una instancia de GoogleGenAI a partir de su clave de API.
 */
export function obtenerInstanciaGenAI(apiKey: string): GoogleGenAI {
    const claveLimpia = (apiKey || '').trim();
    if (!clienteCache.has(claveLimpia)) {
        clienteCache.set(claveLimpia, new GoogleGenAI({ apiKey: claveLimpia }));
    }
    return clienteCache.get(claveLimpia)!;
}

/**
 * Determina si un error reportado por la API amerita brincar a la siguiente llave del pool.
 * Abarca:
 * - 429 Too Many Requests / Quota Exceeded / Rate Limit
 * - 5xx Errores de servidor (500, 502, 503, 504)
 * - Llaves expiradas, canceladas o inválidas (400, 403)
 * - Desconexión o falla de red
 */
export function esErrorRecuperableConFailover(error: any): boolean {
    if (!error) return false;
    const mensaje = (error?.message || String(error)).toLowerCase();
    const status = error?.status || error?.statusCode || error?.code;

    // Errores de cuota o saturación
    if (status === 429 || status === 'RESOURCE_EXHAUSTED') return true;
    if (
        mensaje.includes('429') ||
        mensaje.includes('quota') ||
        mensaje.includes('resource_exhausted') ||
        mensaje.includes('rate limit') ||
        mensaje.includes('rate_limit')
    ) {
        return true;
    }

    // Errores internos de Google Cloud / GenAI (5xx)
    if (typeof status === 'number' && status >= 500 && status < 600) return true;
    if (
        mensaje.includes('500') ||
        mensaje.includes('502') ||
        mensaje.includes('503') ||
        mensaje.includes('504') ||
        mensaje.includes('server error') ||
        mensaje.includes('unavailable') ||
        mensaje.includes('overloaded') ||
        mensaje.includes('deadline exceeded')
    ) {
        return true;
    }

    // Problemas con la llave actual o permisos
    if (
        status === 400 ||
        status === 403 ||
        mensaje.includes('api key') ||
        mensaje.includes('permission_denied') ||
        mensaje.includes('unauthenticated')
    ) {
        return true;
    }

    // Falla de red o conexión
    if (
        mensaje.includes('fetch failed') ||
        mensaje.includes('network error') ||
        mensaje.includes('econnreset') ||
        mensaje.includes('timeout')
    ) {
        return true;
    }

    // En ambiente hospitalario crítico, ante cualquier error no controlado reintentamos con la siguiente llave
    return true;
}

/**
 * Ejecuta una operación con la SDK de Google GenAI aplicando el enrutador con prioridades
 * y el mecanismo de Failover en Cadena de forma 100% transparente.
 * 
 * @param operacion Callback asíncrono que recibe el cliente GoogleGenAI y los datos de la llave activa.
 * @param modulo Módulo o contexto clínico solicitante ('simulador', 'analizador', 'quizzes', etc.)
 * @returns Resultado devuelto por la operación de IA
 */
export async function llamarGeminiConFailover<T>(
    operacion: OperacionGemini<T>,
    modulo?: ModuloClinico | string
): Promise<T> {
    const pool = obtenerPoolLlaves(modulo);
    const nombreModulo = modulo || 'general';
    let ultimoError: any = null;
    let intentosRealizados = 0;

    for (let i = 0; i < pool.length; i++) {
        const infoLlave = pool[i];

        // Verificamos si la llave está configurada
        if (!infoLlave.clave || infoLlave.clave.trim() === '') {
            console.warn(
                `[AICLINIC Router] ⚠️ Llave no configurada: "${infoLlave.nombre}" se encuentra vacía. ` +
                `Saltando de volada a la siguiente llave del pool...`
            );
            continue;
        }

        intentosRealizados++;

        try {
            const ai = obtenerInstanciaGenAI(infoLlave.clave);
            const resultado = await operacion(ai, infoLlave);
            return resultado;
        } catch (err: any) {
            ultimoError = err;
            const razon = err?.message || String(err);
            const esUltimaLlave = i === pool.length - 1;

            if (esErrorRecuperableConFailover(err)) {
                if (!esUltimaLlave) {
                    const siguienteLlave = pool[i + 1];
                    console.warn(
                        `[AICLINIC Router] ⚠️ Advertencia en módulo "${nombreModulo}": La llave "${infoLlave.nombre}" ` +
                        `falló por cuota agotada o error de servicio (${razon}). ` +
                        `Alternando de inmediato hacia la siguiente llave disponible: "${siguienteLlave.nombre}"...`
                    );
                } else {
                    console.warn(
                        `[AICLINIC Router] ⚠️ Advertencia en módulo "${nombreModulo}": La llave "${infoLlave.nombre}" ` +
                        `falló (${razon}). Se han agotado todas las llaves del pool asignado.`
                    );
                }
            } else {
                // Error no catalogado pero capturado para failover
                console.warn(
                    `[AICLINIC Router] ⚠️ Error inesperado con "${infoLlave.nombre}" en "${nombreModulo}": ${razon}. ` +
                    (esUltimaLlave ? 'No quedan más llaves.' : 'Intentando con la siguiente llave...')
                );
            }
        }
    }

    // Si se agotan todas las llaves permitidas para este módulo, lanzamos una excepción controlada
    const mensajeDetallado = 
        `[AICLINIC Router] Falló la conexión con la IA en el módulo "${nombreModulo}". ` +
        `Se agotaron todas las llaves disponibles del pool (intentos completados: ${intentosRealizados}). ` +
        `Detalle del último error: ${ultimoError?.message || 'Error no especificado'}. ` +
        `Por favor, verifique el estado de las cuotas en Vercel o en Google AI Studio.`;

    console.error(mensajeDetallado);
    throw new Error(mensajeDetallado);
}

/**
 * Obtiene la mejor instancia disponible de GoogleGenAI para un módulo dado
 * (útil para inicializaciones rápidas o componentes auxiliares).
 */
export function obtenerAiClientePorModulo(modulo?: ModuloClinico | string): GoogleGenAI {
    const pool = obtenerPoolLlaves(modulo);
    for (const info of pool) {
        if (info.clave && info.clave.trim() !== '') {
            return obtenerInstanciaGenAI(info.clave);
        }
    }
    // Fallback de contingencia
    return obtenerInstanciaGenAI('');
}

/**
 * Crea una sesión de Chat interactiva (Doctor IA) con soporte transparente de Failover.
 * Inicializa el chat con la primera llave del pool correspondiente a 'doctoria' (Caso B: Respaldos)
 * y envuelve los métodos sendMessage y sendMessageStream para alternar de llave si se presenta un error 429/5xx.
 */
export function crearChatConFailover(modulo: ModuloClinico | string = 'doctoria', config?: any): Chat {
    const pool = obtenerPoolLlaves(modulo).filter(ll => Boolean(ll.clave && ll.clave.trim() !== ''));
    let indiceActual = 0;

    // Si el pool está vacío, fallback de contingencia
    if (pool.length === 0) {
        const aiDefault = obtenerAiClientePorModulo(modulo);
        return aiDefault.chats.create({
            model: config?.model || 'gemini-3.7-flash',
            config: config?.config,
        });
    }

    const aiInicial = obtenerInstanciaGenAI(pool[0].clave);
    let chatInstancia = aiInicial.chats.create({
        model: config?.model || 'gemini-3.7-flash',
        config: config?.config,
    });

    // Creamos un Proxy transparente sobre el objeto Chat para capturar errores en envío de mensajes
    return new Proxy(chatInstancia, {
        get(target: any, prop: string | symbol) {
            if (prop === 'sendMessageStream') {
                return async function* (params: any) {
                    while (indiceActual < pool.length) {
                        try {
                            const stream = await chatInstancia.sendMessageStream(params);
                            for await (const chunk of stream) {
                                yield chunk;
                            }
                            return;
                        } catch (err: any) {
                            const infoActual = pool[indiceActual];
                            indiceActual++;

                            if (indiceActual < pool.length && esErrorRecuperableConFailover(err)) {
                                const infoSiguiente = pool[indiceActual];
                                console.warn(
                                    `[AICLINIC Router] ⚠️ Chat Doctor IA: La llave "${infoActual.nombre}" falló ` +
                                    `(${err?.message || err}). Reanudando conversación de volada con "${infoSiguiente.nombre}"...`
                                );
                                // Extraemos el historial actual para no perder el contexto de la charla médica
                                let historialPrevio: any[] = [];
                                try {
                                    if (typeof chatInstancia.getHistory === 'function') {
                                        historialPrevio = chatInstancia.getHistory();
                                    }
                                } catch {
                                    // Si no es posible recuperar historial, continuamos con nueva sesión
                                }

                                const aiSiguiente = obtenerInstanciaGenAI(infoSiguiente.clave);
                                chatInstancia = aiSiguiente.chats.create({
                                    model: config?.model || 'gemini-3.7-flash',
                                    config: config?.config,
                                    history: historialPrevio
                                });
                                continue;
                            }
                            throw err;
                        }
                    }
                };
            }

            if (prop === 'sendMessage') {
                return async function (params: any) {
                    while (indiceActual < pool.length) {
                        try {
                            return await chatInstancia.sendMessage(params);
                        } catch (err: any) {
                            const infoActual = pool[indiceActual];
                            indiceActual++;

                            if (indiceActual < pool.length && esErrorRecuperableConFailover(err)) {
                                const infoSiguiente = pool[indiceActual];
                                console.warn(
                                    `[AICLINIC Router] ⚠️ Chat Doctor IA: La llave "${infoActual.nombre}" falló ` +
                                    `(${err?.message || err}). Cambiando de llave hacia "${infoSiguiente.nombre}"...`
                                );
                                let historialPrevio: any[] = [];
                                try {
                                    if (typeof chatInstancia.getHistory === 'function') {
                                        historialPrevio = chatInstancia.getHistory();
                                    }
                                } catch {}

                                const aiSiguiente = obtenerInstanciaGenAI(infoSiguiente.clave);
                                chatInstancia = aiSiguiente.chats.create({
                                    model: config?.model || 'gemini-3.7-flash',
                                    config: config?.config,
                                    history: historialPrevio
                                });
                                continue;
                            }
                            throw err;
                        }
                    }
                };
            }

            const val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
        }
    }) as Chat;
}
