import { GoogleGenAI, Type, Chat } from "@google/genai";
import { 
    QuizQuestion, ClinicalCase, LabResult, ImagingResult, GroundingSource,
    TherapeuticPlanOptionsCache, PrescribedTherapeuticPlan, SuggestedDrugOption, SuggestedSolutionOption
} from '../types';
import { generateRealisticMedicalImageUrl, getInternetMedicalImageUrl } from './medicalImageRenderer';
import { 
    llamarGeminiConFailover, 
    obtenerAiClientePorModulo, 
    crearChatConFailover, 
    obtenerPoolLlaves, 
    cargarLlavesConfiguradas, 
    aplicarLimiteTokens,
    ModuloClinico, 
    InfoLlave 
} from './apiRouter';

// Reexportamos utilidades del enrutador para consumo transparente en la capa de servicios
export { 
    llamarGeminiConFailover, 
    obtenerPoolLlaves, 
    cargarLlavesConfiguradas, 
    crearChatConFailover,
    aplicarLimiteTokens
};
export type { ModuloClinico, InfoLlave };

/**
 * Obtiene el cliente de IA activo para el módulo solicitado según el pool de llaves configurado.
 * Mantiene compatibilidad total con cualquier llamada existente.
 */
export function getAi(modulo?: ModuloClinico | string): GoogleGenAI {
    return obtenerAiClientePorModulo(modulo);
}

/**
 * Intenta reparar y parsear JSON truncado o dañado devuelto por el modelo (cadenas no terminadas, llaves abiertas).
 */
function repairAndParseJson(raw: string): any {
    let s = raw.trim();
    if (s.startsWith('```')) {
        s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }
    const firstBrace = s.indexOf('{');
    const firstBracket = s.indexOf('[');
    let startIdx = 0;
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
    } else if (firstBracket !== -1) {
        startIdx = firstBracket;
    }
    s = s.slice(startIdx);

    let inString = false;
    let isEscaped = false;
    const stack: string[] = [];

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (isEscaped) {
            isEscaped = false;
            continue;
        }
        if (ch === '\\') {
            isEscaped = true;
            continue;
        }
        if (ch === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (ch === '{' || ch === '[') {
                stack.push(ch);
            } else if (ch === '}') {
                if (stack.length > 0 && stack[stack.length - 1] === '{') stack.pop();
            } else if (ch === ']') {
                if (stack.length > 0 && stack[stack.length - 1] === '[') stack.pop();
            }
        }
    }

    let repaired = s;
    if (inString) {
        repaired += '"';
    }

    // Limpiar claves incompletas o comas huérfanas al final
    repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*$/, '');
    repaired = repaired.replace(/,\s*"[^"]*"$/, '');
    repaired = repaired.replace(/,\s*$/, '');

    // Cerrar bloques abiertos
    while (stack.length > 0) {
        const open = stack.pop();
        if (open === '{') repaired += '}';
        else if (open === '[') repaired += ']';
    }

    return JSON.parse(repaired);
}

// Helper function for robust JSON parsing with self-healing fallback
function safeJsonParse(jsonString: string): any {
    try {
        let trimmedString = jsonString.trim();
        if (!trimmedString) {
            throw new Error("Received empty response from the AI model.");
        }
        // Clean markdown code fence if present
        if (trimmedString.startsWith('```')) {
            trimmedString = trimmedString.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        }
        return JSON.parse(trimmedString);
    } catch (e: any) {
        try {
            console.warn("[AICLINIC] Parseo JSON inicial falló, aplicando autoreparación de estructura truncada...");
            return repairAndParseJson(jsonString);
        } catch (repairErr: any) {
            console.error("Failed to parse JSON response:", e.message);
            console.error("Raw API response text:", jsonString);
            throw new Error(`Failed to parse the response from the AI model. Details: ${e.message}`);
        }
    }
}

const TEXT_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.7-flash',
    'gemini-2.5-flash',
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite'
];

/**
 * Genera contenido usando la API principal y fallback entre modelos.
 * El límite de salida es de 800 tokens para módulos generales y de 1000 a
 * 1200 para contenido clínico estructurado o de mayor razonamiento.
 */
export async function generateContentWithFallback(params: {
    contents: any;
    config?: any;
    preferredModel?: string;
    modulo?: ModuloClinico | string;
}): Promise<any> {
    const configConLimite = aplicarLimiteTokens(params.config, params.modulo);

    return llamarGeminiConFailover(async (ai, infoLlave) => {
        const modelsToTry = params.preferredModel 
            ? [params.preferredModel, ...TEXT_MODELS.filter(m => m !== params.preferredModel)]
            : TEXT_MODELS;

        let lastError: any = null;
        for (const model of modelsToTry) {
            try {
                const response = await ai.models.generateContent({
                    model: model,
                    contents: params.contents,
                    config: configConLimite
                });
                return response;
            } catch (err: any) {
                const errMsg = err?.message || String(err);
                lastError = err;

                console.warn(`[AICLINIC] Intento con modelo ${model} no completado (${infoLlave.nombre}):`, errMsg);

                // Si la búsqueda web o grounding falla, reintentar el mismo modelo sin tools.
                const mensajeNormalizado = errMsg.toLowerCase();
                if (configConLimite?.tools && (
                    mensajeNormalizado.includes('grounding') ||
                    mensajeNormalizado.includes('tools') ||
                    mensajeNormalizado.includes('429') ||
                    mensajeNormalizado.includes('quota') ||
                    mensajeNormalizado.includes('resource_exhausted')
                )) {
                    try {
                        const fallbackConfig = { ...configConLimite };
                        delete fallbackConfig.tools;
                        const responseWithoutTools = await ai.models.generateContent({
                            model: model,
                            contents: params.contents,
                            config: fallbackConfig
                        });
                        return responseWithoutTools;
                    } catch (toolErr) {
                        console.warn(`[AICLINIC] Reintento sin herramientas en ${model} falló:`, toolErr);
                    }
                }
                continue;
            }
        }
        throw lastError || new Error(`No fue posible completar la generación con la llave ${infoLlave.nombre}.`);
    }, params.modulo || 'general');
}


/**
 * Mezcla aleatoriamente las opciones de una pregunta (Fisher-Yates) para que la respuesta correcta
 * se distribuya de forma totalmente aleatoria y equitativa (25% de probabilidad en cada una de las 4 opciones),
 * evitando la concentración predecible en las primeras opciones.
 */
function aleatorizarOpcionesPregunta(pregunta: QuizQuestion): QuizQuestion {
    if (!pregunta || !Array.isArray(pregunta.options) || pregunta.options.length < 2) {
        return pregunta;
    }

    const opcionesMezcladas = [...pregunta.options];
    for (let i = opcionesMezcladas.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [opcionesMezcladas[i], opcionesMezcladas[j]] = [opcionesMezcladas[j], opcionesMezcladas[i]];
    }

    const respuestaNormalizada = (pregunta.correctAnswer || '').trim();
    const existeEnOpciones = opcionesMezcladas.some(opt => opt.trim() === respuestaNormalizada);
    if (!existeEnOpciones && opcionesMezcladas.length > 0) {
        opcionesMezcladas[Math.floor(Math.random() * opcionesMezcladas.length)] = respuestaNormalizada;
    }

    return {
        ...pregunta,
        options: opcionesMezcladas,
        correctAnswer: respuestaNormalizada,
    };
}

export async function generateQuiz(topic: string, difficulty: string, numQuestions: number): Promise<QuizQuestion[]> {
    const difficultyDescriptions: { [key: string]: string } = {
        'Interno': 'con un nivel de dificultad para un médico interno en sus primeras rotaciones. Las preguntas deben cubrir conceptos fundamentales, presentaciones clínicas típicas y tratamientos de primera línea.',
        'Temerario': 'con un nivel de dificultad para un médico interno avanzado o residente de primer año. Las preguntas deben ser más desafiantes, involucrando diagnósticos diferenciales complejos, conocimiento de guías de práctica clínica específicas o tratamientos de segunda línea.',
        'Dr. House': 'con un nivel de dificultad para un especialista o para un desafío diagnóstico tipo "Dr. House". Las preguntas deben ser sobre casos atípicos, enfermedades raras (zebras), detalles sutiles de la fisiopatología, o interacciones farmacológicas poco comunes.'
    };
    const difficultyPrompt = difficultyDescriptions[difficulty] || difficultyDescriptions['Interno'];
    const cantidadObjetivo = Math.max(1, Math.min(Number(numQuestions) || 10, 30));

    const prompt = `Genera un cuestionario de EXACTAMENTE ${cantidadObjetivo} preguntas de opción múltiple sobre "${topic}" para médicos internos, ${difficultyPrompt}.

REGLAS OBLIGATORIAS Y CRÍTICAS:
1. CANTIDAD EXACTA: El arreglo JSON DEBE CONTENER OBLIGATORIAMENTE EXACTAMENTE ${cantidadObjetivo} OBJETOS DE PREGUNTAS. No te detengas antes ni generes menos de ${cantidadObjetivo}.
2. FORMATO DE 4 OPCIONES: Cada una de las ${cantidadObjetivo} preguntas debe tener exactamente 4 opciones de respuesta diferenciadas en su arreglo 'options'.
3. ALEATORIEDAD DE POSICIÓN: Distribuye la opción correcta de manera variada y aleatoria entre las 4 posiciones (A, B, C, D). Está terminantemente prohibido concentrar las respuestas correctas en la primera o segunda opción.
4. RETROALIMENTACIÓN CONCISA: Explica en 1 o 2 oraciones concisas y directas por qué la respuesta es la correcta, para garantizar que la generación de las ${cantidadObjetivo} preguntas se complete sin sobrepasar la longitud.`;

    const response = await generateContentWithFallback({
        contents: prompt,
        modulo: 'quizzes',
        config: {
            maxOutputTokens: 5120,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        correctAnswer: { type: Type.STRING },
                        feedback: { type: Type.STRING }
                    },
                    required: ['question', 'options', 'correctAnswer', 'feedback']
                }
            }
        }
    });

    let rawQuestions: QuizQuestion[] = safeJsonParse(response.text || '');
    if (!Array.isArray(rawQuestions)) {
        rawQuestions = [];
    }

    // Si por contingencia la IA devolvió menos preguntas de las solicitadas, completar las faltantes
    if (rawQuestions.length < cantidadObjetivo && rawQuestions.length > 0) {
        const faltantes = cantidadObjetivo - rawQuestions.length;
        try {
            const promptFaltantes = `Genera EXACTAMENTE ${faltantes} preguntas de opción múltiple adicionales sobre "${topic}" (${difficultyPrompt}) que no se repitan. Cada pregunta debe tener exactamente 4 opciones con respuestas correctas en posiciones variadas y explicación concisa.`;
            const extraResponse = await generateContentWithFallback({
                contents: promptFaltantes,
                modulo: 'quizzes',
                config: {
                    maxOutputTokens: 3072,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                question: { type: Type.STRING },
                                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                                correctAnswer: { type: Type.STRING },
                                feedback: { type: Type.STRING }
                            },
                            required: ['question', 'options', 'correctAnswer', 'feedback']
                        }
                    }
                }
            });
            const extraQuestions = safeJsonParse(extraResponse.text || '');
            if (Array.isArray(extraQuestions)) {
                rawQuestions = [...rawQuestions, ...extraQuestions];
            }
        } catch (fillErr) {
            console.warn('[AICLINIC] No se pudieron generar preguntas de relleno:', fillErr);
        }
    }

    // Asegurar que devolvemos exactamente la cantidad solicitada y mezclar programáticamente las opciones
    return rawQuestions
        .slice(0, cantidadObjetivo)
        .map(pregunta => aleatorizarOpcionesPregunta(pregunta));
}

export async function generateClinicalCase(topic: string, difficulty: string): Promise<ClinicalCase> {
    const difficultyDescriptions: { [key: string]: string } = {
        'Interno': 'para un médico interno. El caso debe centrarse en una presentación clásica de una patología común.',
        'Adscrito': 'para un médico adscrito o residente de último año. El caso debe ser más complejo, presentar "red herrings" (pistas falsas), o involucrar comorbilidades que compliquen el diagnóstico y manejo.',
        'Dr. House': 'para un desafío diagnóstico tipo "Dr. House". El caso debe ser sobre una enfermedad rara (zebra), una presentación atípica de una enfermedad común, o requerir una integración profunda de hallazgos sutiles.'
    };
    const difficultyPrompt = difficultyDescriptions[difficulty] || difficultyDescriptions['Interno'];
    const prompt = `Genera un caso clínico detallado y desafiante ${difficultyPrompt}, basado en la siguiente presentación o frase médica: "${topic}". El caso debe tener un título o "frase alusiva" que genere intriga sin revelar el diagnóstico (ej: "Un corazón fuera de ritmo"). IMPORTANTE: NO menciones ni insinúes el diagnóstico final en ninguna parte de la descripción del caso. El objetivo es que el interno lo descubra. El caso debe incluir: un título alusivo, perfil del paciente, historia de la enfermedad actual, signos vitales y hallazgos del examen físico. Sé realista y educativo.`;

    const response = await generateContentWithFallback({
        contents: prompt,
        modulo: 'simulador',
        config: {
            maxOutputTokens: 4096,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    caseTitle: { type: Type.STRING },
                    patientProfile: { type: Type.STRING },
                    historyOfPresentIllness: { type: Type.STRING },
                    vitalSigns: {
                        type: Type.OBJECT, properties: {
                            presionArterial: { type: Type.STRING },
                            frecuenciaCardiaca: { type: Type.STRING },
                            frecuenciaRespiratoria: { type: Type.STRING },
                            temperatura: { type: Type.STRING },
                            saturacionOxigeno: { type: Type.STRING },
                        }
                    },
                    physicalExam: { type: Type.STRING }
                },
                required: ['caseTitle', 'patientProfile', 'historyOfPresentIllness', 'vitalSigns', 'physicalExam']
            }
        }
    });
    return safeJsonParse(response.text || '');
}

export async function getAnamnesisFeedback(
  clinicalCase: ClinicalCase, 
  history: any[], 
  userQuestion: string
): Promise<{ patientResponse: string, tutorFeedback: string }> {
  
  // Optimización de tokens: formateo compacto del historial omitiendo metadatos redundantes y feedback previo
  const formattedHistory = Array.isArray(history) && history.length > 0
    ? history.map((t, idx) => `${idx + 1}. Interno: "${t.question}" -> Paciente: "${t.patientResponse}"`).join('\n')
    : 'Ninguno (inicio de la anamnesis)';

  const vitalSignsStr = clinicalCase.vitalSigns 
    ? `PA: ${clinicalCase.vitalSigns.presionArterial}, FC: ${clinicalCase.vitalSigns.frecuenciaCardiaca}, FR: ${clinicalCase.vitalSigns.frecuenciaRespiratoria}, Temp: ${clinicalCase.vitalSigns.temperatura}, SatO2: ${clinicalCase.vitalSigns.saturacionOxigeno}`
    : 'No registrados';

  const caseSummary = `Caso: ${clinicalCase.caseTitle}
Perfil: ${clinicalCase.patientProfile}
Padecimiento: ${clinicalCase.historyOfPresentIllness}
Signos Vitales: ${vitalSignsStr}
Examen Físico: ${clinicalCase.physicalExam}`;

  const prompt = `Simulador clínico dual de alta fidelidad para formación de Médicos Internos de Pregrado (MIP):

CASO CLÍNICO DE REFERENCIA (ESTRICTAMENTE CONFIDENCIAL):
${caseSummary}

HISTORIAL DE ANAMNESIS ACUMULADA:
${formattedHistory}

PREGUNTA ACTUAL DEL INTERNO: 
"${userQuestion}"

---
INSTRUCCIONES DE ACTUACIÓN:

1. 👤 PACIENTE REAL:
- Responde en primera persona, con lenguaje natural, humano, coloquial y realista según tu perfil (ej. "Ay doctorcito", "mire usted", "fíjese que...").
- Refleja emociones acordes al trato: si el médico pregunta con empatía y calidez, colaboras con alivio; si el médico suena regañón, frío o impaciente, te muestras tímido, apenado o confundido ("Disculpe doctorcito, la dejé en casa, no me regañe...").
- Describe síntomas con sensaciones y analogías cotidianas (nunca con jerga médica técnica como "parálisis flácida" o "hipopotasemia").
- PROHIBICIÓN ABSOLUTA: Jamás reveles el diagnóstico médico definitivo ni nombres enfermedades ("No sé doctor, solo sé lo que siento").

2. 👨‍⚕️ TUTOR CLÍNICO DOCENTE (Médico Adscrito y Mentor de Enseñanza):
- Personalidad: Eres un Médico Adscrito de Medicina Interna/Urgencias reconocido por tu carisma pedagógico, empatía, buen humor y cercanía con los internos. Trata al interno con estima y camaradería ("¡Bien pensado, doc!", "¡Buen instinto, colega!", "¡Ojo clínico aquí!").
- Tono: Profesional, sumamente amigable, didáctico y motivador.
- Toque de humor amigable y tacto en buen plan: Si el interno formula preguntas toscas, impacientes o que rompen el rapport (como regañar al paciente o exigirle frascos que no trae), corrígelo con calidez, tacto y alguna bromilla simpática de guardia (ej. "¡Tranqui doc, no le apliques el tercer grado a la abuelita jaja!", "¡Cuidado que se nos espanta el paciente antes del electro!", "Respira hondo doc, ni Sherlock Holmes era tan exigente con las etiquetas jaja").
- Guía Activa de la Anamnesis:
  * Reconoce el valor de lo que preguntó.
  * Si hubo falla de empatía o técnica, enseña cómo reformular con amabilidad y obtener la información indirectamente.
  * Sugiere la siguiente pista semiológica clave a interrogar (ej. semiología cronológica de síntomas, progresión ascendente/descendente, diuresis, antecedentes tóxicos/herbolarios o síntomas de alarma cardiopulmonar/neurológica).
- Formato conciso: 3 a 4 oraciones fluidas, con emojis formativos (💡, 🩺, 🎯, 😉).

Responde únicamente con un objeto JSON estructurado con 'patientResponse' y 'tutorFeedback'.`;

  const response = await generateContentWithFallback({
    contents: prompt,
    modulo: 'simulador',
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          patientResponse: { type: Type.STRING },
          tutorFeedback: { type: Type.STRING }
        },
        required: ['patientResponse', 'tutorFeedback']
      }
    }
  });

  return safeJsonParse(response.text || '');
}

export async function getSuggestedStudies(clinicalCase: ClinicalCase): Promise<{ suggestedLabs: string[], suggestedImaging: string[] }> {
    const prompt = `Basado en el siguiente caso clínico: ${JSON.stringify(clinicalCase)}, sugiere una lista de los estudios de laboratorio e imagen más pertinentes para llegar al diagnóstico. Responde con un objeto JSON que contenga dos arreglos: "suggestedLabs" y "suggestedImaging". IMPORTANTE: Todos los nombres de estudios DEBEN estar escritos en español (ej. "Biometría hemática completa", "Radiografía de tórax PA", "Química sanguínea", "Examen general de orina"). Sé conciso y clínicamente relevante.`;
    const response = await generateContentWithFallback({
        contents: prompt,
        modulo: 'simulador',
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT, properties: {
                    suggestedLabs: { type: Type.ARRAY, items: { type: Type.STRING } },
                    suggestedImaging: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ['suggestedLabs', 'suggestedImaging']
            }
        }
    });
    return safeJsonParse(response.text || '');
}

export async function generateStudyResults(
    fullCaseContext: string, 
    requestedStudies: { labs: string[], imaging: string[] },
    directCatalog?: boolean
): Promise<{ labs: LabResult[], imaging: ImagingResult[] }> {
    if ((!requestedStudies.labs || requestedStudies.labs.length === 0) && (!requestedStudies.imaging || requestedStudies.imaging.length === 0)) {
        return { labs: [], imaging: [] };
    }

    const prompt = `Basado en el contexto clínico: ${fullCaseContext}
    
    Genera resultados clínicamente coherentes y realistas para los siguientes estudios solicitados:
    - Laboratorios: [${requestedStudies.labs?.join(', ') || 'Ninguno'}]
    - Imagen: [${requestedStudies.imaging?.join(', ') || 'Ninguna'}]
    
    Para cada estudio de laboratorio ('labs'), incluye el nombre ('study'), una interpretación médica clínica ('interpretation') y un arreglo 'components' con sus parámetros ('parameter'), valores numéricos o cualitativos ('value'), unidades ('units'), rango de referencia ('referenceRange') y si está alterado ('isAbnormal').
    Para cada estudio de imagen ('imaging'), incluye el nombre ('study') y el informe descriptivo detallado de los hallazgos radiológicos ('findings').`;

    const response = await generateContentWithFallback({
        contents: prompt,
        modulo: 'simulador',
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT, properties: {
                    labs: {
                        type: Type.ARRAY, items: {
                            type: Type.OBJECT, properties: {
                                study: { type: Type.STRING },
                                interpretation: { type: Type.STRING },
                                components: {
                                    type: Type.ARRAY, items: {
                                        type: Type.OBJECT, properties: {
                                            parameter: { type: Type.STRING },
                                            value: { type: Type.STRING },
                                            units: { type: Type.STRING },
                                            referenceRange: { type: Type.STRING },
                                            isAbnormal: { type: Type.BOOLEAN }
                                        },
                                        required: ["parameter", "value", "units", "referenceRange", "isAbnormal"]
                                    }
                                }
                            },
                            required: ['study', 'interpretation', 'components']
                        }
                    },
                    imaging: {
                        type: Type.ARRAY, items: {
                            type: Type.OBJECT, properties: {
                                study: { type: Type.STRING },
                                findings: { type: Type.STRING }
                            },
                            required: ['study', 'findings']
                        }
                    }
                },
                required: ['labs', 'imaging']
            }
        }
    });
    const parsed = safeJsonParse(response.text || '');
    if (parsed.imaging && Array.isArray(parsed.imaging)) {
        parsed.imaging = await Promise.all(parsed.imaging.map(async (img: any) => ({
            ...img,
            imageUrl: img.imageUrl || await generateImage(img.study, img.findings, directCatalog)
        })));
    }
    return parsed;
}

export async function generateImage(basePrompt: string, findings?: string, directCatalog?: boolean): Promise<string> {
    const isDirect = directCatalog !== undefined
        ? directCatalog
        : (typeof localStorage !== 'undefined' ? localStorage.getItem('aiclinic_use_direct_catalog_images') !== 'false' : true);

    // Si el usuario activó la opción de catálogo web directo, entrega inmediata sin latencia ni cuota
    if (isDirect) {
        return getInternetMedicalImageUrl(basePrompt, findings);
    }

    const normPrompt = basePrompt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const modalityDesc = (/\b(ultra\w*|ecograf\w*|ecocardio\w*|usg|doppler)\b/.test(normPrompt) || normPrompt.startsWith('eco'))
        ? 'un estudio de ultrasonido / ecografía diagnóstica'
        : /\b(ecg|ekg|electrocardiograma)\b/.test(normPrompt)
        ? 'un trazo real de electrocardiograma de 12 derivaciones'
        : /\b(tac|tc|tomograf\w*)\b/.test(normPrompt)
        ? 'un corte de tomografía computarizada (TAC)'
        : 'una radiografía diagnóstica';

    const fullPrompt = findings
        ? `Genera una imagen médica diagnóstica correspondiente estrictamente a ${modalityDesc} de: ${basePrompt}. La imagen DEBE mostrar de forma congruente los siguientes hallazgos patológicos: ${findings}. Estilo fotorrealista auténtico, escala de grises adecuada a la modalidad médica, anatomía humana correcta, sin texto ni etiquetas. Ideal para educación médica.`
        : `Genera una imagen médica diagnóstica fidedigna correspondiente estrictamente a ${modalityDesc} de: "${basePrompt}". Sin texto, etiquetas ni artefactos.`;

    // 1. Intentar prioritariamente con Imagen 3 Fast (imagen-3.0-fast-generate-001) para máxima rapidez y fluidez
    const isChest = /t[oó]rax|chest|pulmon/i.test(normPrompt) && 
                    !/\b(tac|tc|tomograf\w*|ultra\w*|ecograf\w*|ecocardio\w*|usg|doppler|resonanc\w*|rmn?)\b/i.test(normPrompt) &&
                    !normPrompt.startsWith("eco");

    try {
        const imgResponse = await llamarGeminiConFailover(async (ai) => {
            return await ai.models.generateImages({
                model: 'imagen-3.0-fast-generate-001',
                prompt: fullPrompt,
                config: {
                    numberOfImages: 1,
                    aspectRatio: isChest ? "3:4" : "1:1",
                    outputMimeType: 'image/jpeg'
                }
            });
        }, 'simulador');

        const imageBytes = imgResponse?.generatedImages?.[0]?.image?.imageBytes;
        if (imageBytes) {
            return `data:image/jpeg;base64,${imageBytes}`;
        }
    } catch (errFast: any) {
        console.warn("[AICLINIC] imagen-3.0-fast-generate-001 no disponible o sin cuota en este proyecto. Probando modelos multimodales:", errFast?.message || errFast);
    }

    // 2. Intentar con modelos de imagen multimodales nativos (gemini-3.1-flash-image, gemini-2.5-flash-image)
    const flashImageModels = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
    for (const flashModel of flashImageModels) {
        try {
            const response = await llamarGeminiConFailover(async (ai) => {
                return await ai.models.generateContent({
                    model: flashModel,
                    contents: {
                        parts: [{ text: fullPrompt }]
                    },
                    config: {
                        imageConfig: {
                            aspectRatio: isChest ? "3:4" : "1:1"
                        }
                    },
                });
            }, 'simulador');

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        } catch (err: any) {
            console.warn(`[AICLINIC] ${flashModel} no disponible en el pool:`, err?.message || err);
        }
    }

    // 3. Fallback inteligente e instantáneo: catálogo de imágenes médicas de internet fidedignas
    console.info("[AICLINIC] Integrando imagen médica fidedigna del catálogo clínico correspondiente al informe radiológico.");
    return getInternetMedicalImageUrl(basePrompt, findings);
}


export async function editImage(prompt: string, base64ImageData: string, mimeType: string): Promise<string> {
    const editModels = ['gemini-3.1-flash-image', 'gemini-2.5-flash-image'];
    for (const model of editModels) {
        try {
            const response = await llamarGeminiConFailover(async (ai) => {
                return await ai.models.generateContent({
                    model: model,
                    contents: {
                        parts: [
                            {
                                inlineData: {
                                    data: base64ImageData,
                                    mimeType: mimeType,
                                },
                            },
                            {
                                text: prompt,
                            },
                        ],
                    },
                });
            }, 'simulador');

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
        } catch {
            // Probar siguiente modelo
        }
    }
    throw new Error("No se pudo editar la imagen.");
}

export const TRUSTED_MEDICAL_DOMAINS = [
    'nih.gov', 'ncbi.nlm.nih.gov', 'nlm.nih.gov', 'pubmed.ncbi.nlm.nih.gov',
    'gob.mx', 'salud.gob.mx', 'cenetec.salud.gob.mx', 'cenetec-difusion.com',
    'scielo.org', 'sciencedirect.com', 'nejm.org', 'thelancet.com', 'bmj.com',
    'jamanetwork.com', 'ahajournals.org', 'kdigo.org', 'escardio.org', 'diabetesjournals.org',
    'who.int', 'paho.org', 'cdc.gov', 'uptodate.com', 'cochranelibrary.com',
    'msdmanuals.com', 'merckmanuals.com', 'medigraphic.com', 'revistamedica.imss.gob.mx',
    'aafp.org', 'acpjournals.org', 'gastro.org', 'idsociety.org', 'aan.com', 'chestnet.org',
    'atsjournals.org', 'elsevier.com', 'elsevier.es', 'springer.com', 'nature.com', 'medlineplus.gov'
];

export function isTrustedMedicalUrl(uri: string): boolean {
    if (!uri || typeof uri !== 'string') return false;
    try {
        const parsed = new URL(uri);
        const host = parsed.hostname.toLowerCase();
        // Filtrar tiendas de comercio electrónico, redes sociales, y portales comerciales de dudosa reputación
        if (/mercadolibre|amazon|ebay|aliexpress|walmart|facebook|twitter|instagram|tiktok|youtube|pinterest|doctoralia|topdoctors|tuasaude|salud180|farmacias|market/i.test(host)) {
            return false;
        }
        return TRUSTED_MEDICAL_DOMAINS.some(domain => host === domain || host.endsWith('.' + domain));
    } catch {
        return false;
    }
}

export function buildPrecisionMedicalSources(condition: string, context: string = ''): GroundingSource[] {
    const cleanTopic = condition
        .replace(/[*_#\[\]\(\)]/g, '')
        .replace(/^(?:Diagnóstico|Paciente con|Probable|Diagnóstico más probable:?)\s*/i, '')
        .replace(/\b(?:secundaria a|asociada a|en paciente con|con datos de|con repercusión|con elevación|fase)\b.*$/i, '')
        .replace(/[,;.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || 'urgencias médicas';

    const encodedQuery = encodeURIComponent(cleanTopic);
    const combinedContext = (condition + ' ' + context).toLowerCase();

    let specialtySource: GroundingSource | null = null;

    if (/potasio|hiperpotasemia|hipopotasemia|renal|riñón|rinon|kdigo|glomerulo|creatinina|diálisis|dialisis|nefro/i.test(combinedContext)) {
        specialtySource = {
            title: `KDIGO Clinical Practice Guideline: Manejo de ${cleanTopic}`,
            uri: `https://kdigo.org/guidelines/?s=${encodedQuery}`
        };
    } else if (/corazón|corazon|miocardio|infarto|angina|arritmia|fibrilación|fibrilacion|insuficiencia cardíaca|insuficiencia cardiaca|aha|acc|troponina|hipertensión|hipertension|st|ecg|electrocardiograma/i.test(combinedContext)) {
        specialtySource = {
            title: `AHA / ACC Cardiovascular Guidelines & Statements: ${cleanTopic}`,
            uri: `https://www.ahajournals.org/action/doSearch?AllField=${encodedQuery}`
        };
    } else if (/diabetes|cetoacidosis|hiperosmolar|glucosa|insulina|ada|tiroides|tirotoxicosis|mixedema/i.test(combinedContext)) {
        specialtySource = {
            title: `American Diabetes Association (ADA) Standards of Care: ${cleanTopic}`,
            uri: `https://diabetesjournals.org/search-results?page=1&q=${encodedQuery}`
        };
    } else if (/pulmón|pulmon|neumonía|neumonia|epoc|asma|gold|ats|respiratorio|tromboembolia/i.test(combinedContext)) {
        specialtySource = {
            title: `ATS / ERS Respiratory Clinical Guidelines: ${cleanTopic}`,
            uri: `https://www.atsjournals.org/action/doSearch?AllField=${encodedQuery}`
        };
    } else if (/infecc|sepsis|choque séptico|choque septico|meningitis|bacteriemia|idsa|antibiótico|antibiotico/i.test(combinedContext)) {
        specialtySource = {
            title: `IDSA Practice Guidelines: Manejo Antimicrobiano de ${cleanTopic}`,
            uri: `https://www.idsociety.org/practice-guideline/search/?q=${encodedQuery}`
        };
    } else if (/apendic|colecist|pancreat|abdomen agudo|gastro|hígado|higado|cirrosis|sangrado/i.test(combinedContext)) {
        specialtySource = {
            title: `WSES / AGA Clinical Guidelines: Abordaje Quirúrgico y Manejo de ${cleanTopic}`,
            uri: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(cleanTopic + ' emergency surgery practice guideline')}`
        };
    } else if (/cefalea|migraña|migrana|evc|ictus|isquemia cerebral|convulsión|convulsion|epilepsia|aan|mening/i.test(combinedContext)) {
        specialtySource = {
            title: `American Academy of Neurology (AAN): Práctica Clínica en ${cleanTopic}`,
            uri: `https://www.aan.com/search?q=${encodedQuery}`
        };
    }

    const list: GroundingSource[] = [
        {
            title: `Guía de Práctica Clínica CENETEC (Sector Salud México): ${cleanTopic}`,
            uri: `https://www.google.com/search?q=${encodeURIComponent('site:gob.mx/cenetec ' + cleanTopic + ' guia practica clinica')}`
        },
        {
            title: `PubMed / National Library of Medicine: Guías Clínicas y Consenso sobre ${cleanTopic}`,
            uri: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(cleanTopic + ' clinical practice guideline')}`
        },
        {
            title: `SciELO / IMSS: Evidencia Científica y Manejo Terapéutico de ${cleanTopic}`,
            uri: `https://search.scielo.org/?q=${encodedQuery}&lang=es`
        },
        {
            title: `UpToDate: Abordaje, Diagnóstico y Tratamiento Basado en Evidencias de ${cleanTopic}`,
            uri: `https://www.uptodate.com/contents/search?search=${encodedQuery}`
        },
        {
            title: `Cochrane Library: Revisiones Sistemáticas de Eficacia Terapéutica en ${cleanTopic}`,
            uri: `https://www.cochranelibrary.com/search?searchText=${encodedQuery}`
        }
    ];

    if (specialtySource) {
        list.splice(1, 0, specialtySource);
    }

    return list;
}

export async function getFinalDiagnosis(fullCaseContext: string, currentTopic?: string): Promise<{ text: string, sources: GroundingSource[] }> {
    const prompt = `Basado en la siguiente información clínica completa: ${fullCaseContext}

    Realiza un análisis clínico-educativo exhaustivo para un médico interno y proporciona lo siguiente en formato Markdown estricto. Utiliza la herramienta de búsqueda de Google para fundamentar tus respuestas con evidencia médica actualizada y diversa (Guías de Práctica Clínica mexicanas CENETEC/SSA, guías internacionales AHA, ACC, ESC, ADA, KDIGO, IDSA, GOLD, revisiones en PubMed, NEJM, Lancet, JAMA y UpToDate).

    REGLAS DE FORMATO Y CITACIÓN:
    - IMPORTANTE: Redacta estrictamente en texto plano y Markdown estándar. NUNCA utilices sintaxis LaTeX ni símbolos de dólar ($ o $$) ni comandos como \\text{}, \\alpha, \\beta para fórmulas o nombres biológicos/médicos (ej. escribe simplemente "IL-1", "IL-6", "TNF-alfa", "IL-8", etc.).
    - DIVERSIDAD Y AMPLITUD BIBLIOGRÁFICA: Cita y fundamenta con entre 4 y 6 fuentes médicas autorizadas nacionales e internacionales.
    - Inserta llamadas de citas numéricas entre corchetes como [1], [2], [3], [4], [5], [6] dentro del texto redactado en las secciones correspondientes para respaldar cada punto fisiopatológico, criterio diagnóstico, esquema farmacológico con dosis y evidencia clínica.
    - Cada número [n] debe coincidir rigurosamente con el orden de las fuentes consultadas.

    Utiliza los siguientes encabezados exactamente como se indican y en este orden:

    ### Diagnóstico Principal
    Establece el diagnóstico más probable de forma clara y concisa.

    ### Fisiopatología y Correlación Clínica
    Esta es la sección más importante para el aprendizaje. Explica de manera detallada la fisiopatología subyacente del diagnóstico principal. Después, correlaciona de forma explícita CADA UNO de los hallazgos clave (signos, síntomas, resultados de laboratorio e imagen) del caso clínico con la fisiopatología descrita. Incluye citas numéricas [1], [2], [3] correspondientes a las fuentes de evidencia.

    ### Plan de Manejo y Tratamiento
    Detalla el plan de manejo inicial y el tratamiento específico para el diagnóstico principal. Basa tus recomendaciones en Guías de Práctica Clínica (GPC) actualizadas y en la medicina basada en evidencia. Sé específico en cuanto a fármacos, dosis y medidas de soporte, incluyendo citas numéricas [3], [4], [5] para las guías de referencia utilizadas.

    ### Diagnósticos Diferenciales
    Al final, enumera al menos 2 a 3 diagnósticos diferenciales importantes que se consideraron. Para cada uno, explica brevemente por qué es menos probable que el diagnóstico principal en este caso específico.
    
    ### Fuentes de Información
    Al final de todo, enumera entre 4 y 6 fuentes de evidencia médica de primer nivel que respalden rigurosamente este diagnóstico y su tratamiento:
    - [1] Guía de Práctica Clínica CENETEC (Sector Salud México)
    - [2] Guía de práctica clínica de sociedad médica especializada correspondiente al diagnóstico
    - [3] PubMed / National Library of Medicine (Guías Clínicas Internacionales)
    - [4] SciELO / Revista Médica del IMSS (Evidencia Clínica Iberoamericana)
    - [5] UpToDate (Decisión Clínica y Manejo Basado en Evidencias)
    - [6] Cochrane Library (Revisiones Sistemáticas de Eficacia Terapéutica)`;

    const response = await generateContentWithFallback({
        contents: prompt,
        modulo: 'analizador',
        config: {
            maxOutputTokens: 8192,
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text || '';
    const rawSources = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
        .map((chunk: any) => chunk.web)
        .filter((web: any): web is GroundingSource => Boolean(web && web.uri && web.uri.trim() !== ''));

    // 1. Extraer diagnóstico principal confirmado para sincronizar fuentes exactas
    let diagnosedCondition = '';
    const diagMatch = text.match(/###\s*Diagnóstico Principal\s*\n+([^\n#]+)/i);
    if (diagMatch && diagMatch[1]) {
        diagnosedCondition = diagMatch[1]
            .replace(/[*_#\[\]\(\)]/g, '')
            .replace(/^(?:Diagnóstico|Paciente con|Probable|Diagnóstico más probable:?)\s*/i, '')
            .trim();
    }
    if (!diagnosedCondition) {
        const caseTitleMatch = fullCaseContext.match(/Título:\s*([^\n]+)/i);
        if (caseTitleMatch && caseTitleMatch[1]) {
            diagnosedCondition = caseTitleMatch[1].replace(/[*_#\[\]\(\)]/g, '').trim();
        } else if (currentTopic) {
            diagnosedCondition = currentTopic.trim();
        }
    }

    const precisionSources = buildPrecisionMedicalSources(diagnosedCondition || currentTopic || 'patología', fullCaseContext);

    // 2. Extraer fuentes web de grounding o texto que pasen filtro estricto de dominios médicos
    const seenUris = new Set<string>();
    const verifiedGroundingSources: GroundingSource[] = [];

    const addGroundingIfValid = (s: GroundingSource) => {
        if (!s || !s.uri) return;
        const cleanUri = s.uri.trim();
        if (!isTrustedMedicalUrl(cleanUri)) return; // Rechazar tiendas, redes sociales o dominios no médicos
        if (!seenUris.has(cleanUri)) {
            seenUris.add(cleanUri);
            verifiedGroundingSources.push({
                title: s.title && s.title.trim() ? s.title.trim() : 'Evidencia Médica Avalada',
                uri: cleanUri
            });
        }
    };

    for (const source of rawSources) {
        addGroundingIfValid(source);
    }

    if (text) {
        const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(text)) !== null) {
            const title = match[1].trim();
            const uri = match[2].trim();
            if (!/^\d+$/.test(title)) {
                addGroundingIfValid({ title, uri });
            }
        }
    }

    // 3. Integrar fuentes con prioridad de precisión temática:
    // Las fuentes de precisión médica de la patología exacta encabezan la lista [1..N]
    // para garantizar congruencia absoluta entre cada cita [1], [2], [3] y la evidencia científica oficial.
    const sources: GroundingSource[] = [];
    const finalSeenUris = new Set<string>();

    for (const precSource of precisionSources) {
        if (!finalSeenUris.has(precSource.uri)) {
            finalSeenUris.add(precSource.uri);
            sources.push(precSource);
        }
    }

    for (const groundSource of verifiedGroundingSources) {
        if (!finalSeenUris.has(groundSource.uri)) {
            finalSeenUris.add(groundSource.uri);
            sources.push(groundSource);
        }
    }

    return { text, sources };
}

export async function generateNoteGuide(topic: string): Promise<{ guide: string, template: string }> {
    const prompt = `Para un paciente con "${topic}", genera un objeto JSON con dos propiedades: "guide" (guía detallada en Markdown para redactar una nota SOAP) y "template" (plantilla de nota SOAP en texto plano, pre-llenada con ejemplos y placeholders claros).`;
    const response = await generateContentWithFallback({
        contents: prompt,
        modulo: 'notas',
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT, properties: {
                    guide: { type: Type.STRING },
                    template: { type: Type.STRING }
                },
                required: ['guide', 'template']
            }
        }
    });
    return safeJsonParse(response.text || '');
}

export async function generateQuickGuide(topic: string): Promise<{ text: string, sources: GroundingSource[] }> {
    const prompt = `Proporciona una guía de referencia rápida sobre el manejo de "${topic}" para médicos internos. Basa tu respuesta en la información más actualizada posible, consultando una amplia variedad de fuentes (entre 3 y 5 fuentes médicas autorizadas), dando **prioridad a las Guías de Práctica Clínica (GPC) de México / CENETEC** y complementando con guías internacionales de primer nivel (ej. AAFP, AHA, ACC, ESC, ADA, KDIGO). 
    
    Utiliza formato Markdown, sé conciso y directo al punto.

    Al final de la guía, incluye una sección titulada "### Fuentes" y lista de 3 a 5 fuentes de evidencia médica autorizadas.`;
    
    const response = await generateContentWithFallback({
        contents: prompt,
        modulo: 'guias',
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text || '';
    const rawSources = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
        .map((chunk: any) => chunk.web)
        .filter((web: any): web is GroundingSource => Boolean(web && web.uri && web.uri.trim() !== ''));

    const precisionSources = buildPrecisionMedicalSources(topic);
    const seenUris = new Set<string>();
    const sources: GroundingSource[] = [];

    // Incorporar fuentes de precisión para el tema específico
    for (const pSource of precisionSources) {
        if (!seenUris.has(pSource.uri)) {
            seenUris.add(pSource.uri);
            sources.push(pSource);
        }
    }

    // Agregar fuentes de grounding si son dominios médicos de confianza
    for (const rSource of rawSources) {
        if (isTrustedMedicalUrl(rSource.uri) && !seenUris.has(rSource.uri)) {
            seenUris.add(rSource.uri);
            sources.push(rSource);
        }
    }

    return { text, sources };
}

export function createChat(modulo: ModuloClinico | string = 'doctoria'): Chat {
    return crearChatConFailover(modulo);
}

// --- ARTICLE ANALYZER ---

const ARTICLE_ANALYSIS_SYSTEM_PROMPT = `
Eres un **tutor médico clínico-pedagógico experto**, especializado en **Medicina Basada en Evidencia (MBE)**, **aprendizaje activo** y **formación de Médicos Internos de Pregrado**.
Formas parte de una **aplicación médica educativa** diseñada para transformar la lectura pasiva de artículos científicos en **aprendizaje profundo, crítico y clínicamente aplicable**.

Tu función es **enseñar a pensar como médico**, no solo a resumir artículos, guiando al usuario a través de la **Taxonomía de Bloom revisada**, con enfoque realista en **guardia, pase de visita, consulta y exámenes**.

### Instrucciones generales de estilo
- Español claro, clínico y didáctico
- Tono de tutor cercano
- Prioriza lo útil para el hospital real
- Usa tablas, viñetas y ejemplos
- Señala errores comunes de internos
- Destaca perlas clínicas de alto rendimiento
- Reduce carga cognitiva cuando sea necesario
- **SI TE ENVÍAN IMÁGENES O UN PDF ESCANEADO**: Actúa como un sistema OCR médico experto. Extrae la información visual, gráficos y texto para realizar el análisis exactamente igual que si fuera texto plano.

REALIZA EL ANÁLISIS SIGUIENDO ESTA ESTRUCTURA EXACTA (usa Markdown):

# 📚 ANÁLISIS DEL ARTÍCULO SEGÚN TAXONOMÍA DE BLOOM (v1.2)

Inicia con: **“¡Perfecto! He recibido y analizado el artículo que subiste. Vamos a estudiarlo paso a paso, como lo haríamos en una sesión con un Médico Interno de Pregrado.”**

## 🔍 IDENTIFICACIÓN Y ESTRUCTURA DEL ARTÍCULO (OBLIGATORIO)
- **Tipo de artículo**: (ECA, Cohorte, Caso-control, Revisión, etc.)
- **Nivel de evidencia esperado** (alto/moderado/bajo)
- **Sesgos probables por diseño**: Explica 2-3 en lenguaje sencillo.

### 🏗️ Estructura del Contenido (Síntesis traducida)
*Para facilitar tu lectura y comprensión, aquí tienes la esencia de cada sección de ESTE artículo (2-3 líneas máximo por sección):*
- **Abstract/Resumen**: [Traduce y resume el mensaje ejecutivo principal].
- **Introducción**: [Explica cuál es el problema clínico, el contexto y el objetivo del estudio].
- **Métodos**: [Resume cómo lo hicieron (Diseño, población, intervención y análisis estadístico básico)].
- **Resultados**: [Los hallazgos principales objetivos (datos duros)].
- **Discusión**: [Cómo interpretan los autores sus hallazgos y qué limitaciones mencionan].

- ⚠️ **Sesgo que un interno suele pasar por alto en este tipo de estudios**.

## 1️⃣ RECORDAR — ¿Qué dice el artículo?
Extrae hechos objetivos.
- Título, autores, año, revista.
- Objetivo/Hipótesis.
- Población e Intervención.
- Resultados clave (Datos duros: RR, OR, p, etc).
- Conclusiones textuales.

### 📊 Tabla: “Datos clave en un vistazo”
Incluye al final de la sección:
- 🔰 **Lo mínimo que un interno debe recordar**
- ⚠️ **Dato que suele confundirse en exámenes**
- 🩺 **Dato que sí impacta decisiones en guardia**

## 2️⃣ COMPRENDER — ¿Qué significa realmente?
- **Contexto actual**: 1-2 frases sobre guías o controversias recientes.
- **Explicación clínica**: Resumen en 200 palabras (lenguaje clínico). ¿Qué problema aborda?
- **Preguntas de comprensión**: Plantea 3 preguntas con su ✔️ **Respuesta esperada de un interno competente**.

## 3️⃣ APLICAR — ¿Cómo lo uso en la práctica?
- 2 escenarios clínicos realistas.
- Cambios en Diagnóstico/Tratamiento.
- 🩺 **¿Cómo se vería esto en una nota médica?**
- ⚠️ **Error frecuente del interno al aplicar este hallazgo**.
- 📚 **Comparación con guías vigentes** (Coincide/Contradice).

## 4️⃣ ANALIZAR — ¿Qué tan sólido es el estudio?
- Fortalezas y Debilidades metodológicas.
- Validez interna/externa.
- Control de sesgos.

### 📋 Tabla: “Análisis crítico” (Aspecto | Fortalezas | Debilidades)

## 5️⃣ EVALUAR — ¿Confío en esta evidencia?
- Juicio clínico honesto.
- ¿Cambiarías tu práctica como interno?
- **Pregunta reflexiva**: "¿Estás de acuerdo con las conclusiones? ¿Por qué?" (+ Respuesta modelo).

## 6️⃣ CREAR — ¿Qué puedo generar a partir de esto?
Elige 2 actividades:
- Nota de evolución breve.
- Frase para explicar al paciente.
- Diapositiva para sesión.
- Pregunta PICO.

## 🧩 SÍNTESIS GLOBAL Y APLICACIÓN PERSONAL
- **3 perlas clínicas imprescindibles**.
- ⚠️ **Riesgo de mala aplicación fuera de contexto**.
- **Curaduría de lectura**: (Obligatoria/Recomendable/Interesante/Opcional).
- **Evaluación final**: "Del 1 al 10, ¿cuánto cambió tu forma de pensar?".
- **Pregunta tipo ENARM/MIR**: Con 4 opciones y justificación.

Cierra con: **“¡Excelente trabajo! Acabas de analizar un artículo científico con criterio clínico, reconociendo su valor y sus límites. Sigue así.”**
`;

export async function analyzeMedicalArticle(content: string | string[], mimeType: string = 'text/plain'): Promise<string> {
    // If the content is empty, throw error
    if (!content || (Array.isArray(content) && content.length === 0)) {
        throw new Error("El contenido del artículo está vacío.");
    }

    const ai = getAi();
    
    // Prepare parts based on mimeType
    const parts: any[] = [];
    
    if (Array.isArray(content)) {
        // Handle multiple images (e.g. converted PDF pages) for OCR analysis
        content.forEach((base64Image) => {
             parts.push({
                inlineData: {
                    data: base64Image,
                    mimeType: 'image/jpeg' // We assume conversions are to JPEG
                }
            });
        });
        parts.push({ text: "Analiza estas imágenes de un documento médico (OCR semántico). Extrae el texto y la información visual relevante para realizar el análisis solicitado." });

    } else if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) {
        // For PDF (native support if enabled) or Single Image
        parts.push({
            inlineData: {
                data: content, // content is base64 string here
                mimeType: mimeType
            }
        });
        parts.push({ text: "Analiza este artículo médico/infografía siguiendo estrictamente tus instrucciones de tutor experto." });
    } else {
        // For text (plain text or extracted from word), we pass it as text
        parts.push({ text: `Analiza el siguiente texto de un artículo médico siguiendo estrictamente tus instrucciones de tutor experto:\n\n${content}` });
    }

    const response = await generateContentWithFallback({
        contents: {
            parts: parts
        },
        modulo: 'analizador',
        config: {
            systemInstruction: ARTICLE_ANALYSIS_SYSTEM_PROMPT,
        }
    });

    return response.text || '';
}

export async function prefetchTherapeuticPlanOptions(caseData: ClinicalCase, topicHint?: string): Promise<TherapeuticPlanOptionsCache> {
    const prompt = `Actúa como Coordinador de Enseñanza Clínica y Médico Adscrito del Hospital General de Apatzingán.
A partir de la siguiente ficha clínica de paciente, analiza comorbilidades, edad, signos vitales y diagnóstico probable para precargar las opciones sugeridas del "Plan Terapéutico & Prescripción Hospitalaria Guiada" del interno:

FICHA DEL PACIENTE:
- Título/Caso: ${caseData.caseTitle}
- Perfil del paciente: ${caseData.patientProfile}
- Padecimiento actual: ${caseData.historyOfPresentIllness}
- Signos vitales: PA: ${caseData.vitalSigns.presionArterial}, FC: ${caseData.vitalSigns.frecuenciaCardiaca}, FR: ${caseData.vitalSigns.frecuenciaRespiratoria}, Temp: ${caseData.vitalSigns.temperatura}, SpO2: ${caseData.vitalSigns.saturacionOxigeno}
- Examen físico: ${caseData.physicalExam}
${topicHint ? `- Contexto / Diagnóstico presuntivo: ${topicHint}` : ''}

REGLAS DE GENERACIÓN DE OPCIONES (CANON HOSPITALARIO):
1. dietasSugeridas: Array de 3-4 opciones contextualizadas al estado hemodinámico, metabólico y respiratorio (ej. si hay taquipnea FR > 28 o dificultad respiratoria, incluir "Ayuno por taquipnea / riesgo de broncoaspiración"; si el paciente tiene diabetes o hiperglucemia, incluir "Dieta fraccionada para diabético"; si es hipertenso "Dieta hiposódica normocalórica"; si está estable "Dieta blanda / normal").
2. solucionesSugeridas: Array de 3-4 esquemas de fluidoterapia de primera línea estrictamente adaptados a la hemodinamia y fisiopatología del caso:
   - SI EL PACIENTE PRESENTA CHOQUE, HIPOTENSIÓN SEVERA (TAS < 90 o TAM < 65), NEUMOTÓRAX A TENSIÓN, SEPSIS, TRAUMA O PÉRDIDAS AGUDAS:
     Genera ÚNICAMENTE opciones de reanimación activa con cristaloides isotónicos balanceados:
     1) "Carga rápida Solución Hartmann 1000 mL para 30-60 min (reanimación hemodinámica)"
     2) "Carga rápida Solución Hartmann 500 mL para 30 min (reanimación inicial)"
     3) "Carga rápida Solución Fisiológica 0.9% 1000 mL para 1 hora"
     4) "Solución Hartmann 1000 mL para 12 h (mantenimiento post-reanimación)"
     PROHIBIDO generar Solución Mixta o Glucosada como sugerencia en pacientes chocados o hipotensos.
   - SI EL PACIENTE PRESENTA EDEMA AGUDO DE PULMÓN, INSUFICIENCIA CARDIACA O FALLA RENAL OLIGÚRICA:
     Genera opciones de restricción:
     1) "Solución Fisiológica 0.9% 250 mL para 24 h (vía permeable / KVO)"
     2) "Solución Glucosada 5% 250 mL para 24 h (vía permeable / KVO)"
     3) "Restricción hídrica estricta (< 500 mL en 24 h)"
   - SI EL PACIENTE ESTÁ ESTABLE (NORMOTENSO, EN AYUNO BASAL):
     Genera esquemas de mantenimiento:
     1) "Solución Hartmann 1000 mL para 12 h (mantenimiento de primera línea)"
     2) "Solución Fisiológica 0.9% 1000 mL para 24 h (aporte basal)"
     3) "Solución Mixta 1000 mL para 24 h (aporte calórico basal en ayuno prolongado)"
     4) "Solución Hartmann 1000 mL para 8 h (restitución de pérdidas leves/moderadas)"
3. familiasMedicamentos: Array de 4 a 6 fármacos de 1ª y 2ª línea según las Guías de Práctica Clínica (GPC) mexicanas y protocolos hospitalarios para esta patología. Cada uno debe incluir:
   - familia: Grupo farmacológico (ej: "Cefalosporina 3ª Gen", "Macrólido", "Antipirético IV", "Analgesia AINE", "Inhibidor de Bomba de Protones", "Broncodilatador", etc.)
   - farmaco: Nombre genérico oficial (ej: "Ceftriaxona", "Claritromicina", "Paracetamol", "Omeprazol", "Salbutamol")
   - dosis: Cantidad numérica estándar recomendada (ej: "1", "500", "40", "100")
   - unidad: Unidad médica ("g", "mg", "mcg", "UI", "mL")
   - via: Vía de administración ("IV", "VO", "SC", "IM", "Inhalada")
   - frecuencia: Intervalo posológico estándar ("Cada 24 h", "Cada 12 h", "Cada 8 h", "Cada 6 h", "Dosis única", "PRN si temp > 38.0 °C")
   - justificacionGPC: Breve justificación según la GPC (ej. "Terapia de 1ª línea según GPC para neumonía bacteriana adquirida en la comunidad")
4. medidasSugeridas: Array priorizado de 4-6 medidas generales y monitorización hospitalaria acordes a la severidad (ej. "Posición Semifowler a 30-45°", "Oxigenoterapia con puntas nasales (meta SpO2 ≥ 92%)", "Monitorización continua de signos vitales por turno", "Control de líquidos y balance hídrico estricto", "Cuantificación de uresis horaria", "Glucometrías capilares por turno").

Devuelve un JSON estrictamente estructurado.`;

    try {
        const response = await generateContentWithFallback({
            contents: prompt,
            modulo: 'simulador',
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        dietasSugeridas: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        },
                        solucionesSugeridas: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    label: { type: Type.STRING },
                                    tipo: { type: Type.STRING },
                                    volumen: { type: Type.INTEGER },
                                    tiempo: { type: Type.STRING },
                                    via: { type: Type.STRING }
                                },
                                required: ['label', 'tipo', 'volumen', 'tiempo', 'via']
                            }
                        },
                        familiasMedicamentos: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    familia: { type: Type.STRING },
                                    farmaco: { type: Type.STRING },
                                    dosis: { type: Type.STRING },
                                    unidad: { type: Type.STRING },
                                    via: { type: Type.STRING },
                                    frecuencia: { type: Type.STRING },
                                    justificacionGPC: { type: Type.STRING }
                                },
                                required: ['familia', 'farmaco', 'dosis', 'unidad', 'via', 'frecuencia']
                            }
                        },
                        medidasSugeridas: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ['dietasSugeridas', 'solucionesSugeridas', 'familiasMedicamentos', 'medidasSugeridas']
                }
            }
        });

        const parsed = safeJsonParse(response.text || '');
        if (parsed && Array.isArray(parsed.dietasSugeridas) && parsed.dietasSugeridas.length > 0) {
            return parsed;
        }
        throw new Error("Invalid structure received from AI for therapeutic plan options");
    } catch (error) {
        console.warn("prefetchTherapeuticPlanOptions fallback activated due to:", error);
        // Robust Fallback generator based on vitals and keywords
        const frNum = parseInt(caseData.vitalSigns.frecuenciaRespiratoria) || 20;
        const spo2Num = parseInt(caseData.vitalSigns.saturacionOxigeno) || 95;
        const paStr = caseData.vitalSigns.presionArterial || '';
        const systolic = parseInt(paStr.split('/')[0]) || 120;
        const caseText = (caseData.caseTitle + ' ' + caseData.patientProfile + ' ' + caseData.historyOfPresentIllness + ' ' + caseData.physicalExam).toLowerCase();
        
        const isTaquipneico = frNum >= 26;
        const isDesaturando = spo2Num < 92;
        const isDiabetico = caseText.includes('diab');
        const isShockOrHypo = systolic < 90 || /choque|shock|neumot[oó]rax|tensi[oó]n|hipoten|sepsis|trauma|hemorr/i.test(caseText);
        const isHeartFail = /insuficiencia card[ií]aca|falla card|edema pulmonar|edema agudo|estertores/i.test(caseText);

        const fallbackDietas: string[] = [];
        if (isTaquipneico || isShockOrHypo) fallbackDietas.push("Ayuno por taquipnea y riesgo de broncoaspiración");
        if (isDiabetico) fallbackDietas.push("Dieta fraccionada para diabético (1500-1800 kcal)");
        fallbackDietas.push("Dieta blanda con líquidos a tolerancia");
        fallbackDietas.push("Dieta normocalórica hiposódica");

        let fallbackSoluciones: SuggestedSolutionOption[];
        if (isShockOrHypo) {
            fallbackSoluciones = [
                {
                    label: "Carga rápida Sol. Hartmann 1000 mL en 30-60 min (reanimación)",
                    tipo: "Solución Hartmann",
                    volumen: 1000,
                    tiempo: "Carga en 1 hora",
                    via: "IV periférica"
                },
                {
                    label: "Carga rápida Sol. Hartmann 500 mL en 30 min (reanimación inicial)",
                    tipo: "Solución Hartmann",
                    volumen: 500,
                    tiempo: "Carga en 30 minutos",
                    via: "IV periférica"
                },
                {
                    label: "Carga rápida Sol. Fisiológica 0.9% 1000 mL en 1 h (expansor)",
                    tipo: "Solución Fisiológica 0.9%",
                    volumen: 1000,
                    tiempo: "Carga en 1 hora",
                    via: "IV periférica"
                },
                {
                    label: "Sol. Hartmann 1000 mL para 12 h (mantenimiento post-carga)",
                    tipo: "Solución Hartmann",
                    volumen: 1000,
                    tiempo: "Para 12 horas",
                    via: "IV periférica"
                }
            ];
        } else if (isHeartFail) {
            fallbackSoluciones = [
                {
                    label: "Sol. Fisiológica 0.9% 250 mL para 24 h (vía permeable / KVO)",
                    tipo: "Solución Fisiológica 0.9%",
                    volumen: 250,
                    tiempo: "Para 24 horas",
                    via: "IV periférica"
                },
                {
                    label: "Sol. Glucosada 5% 250 mL para 24 h (vía permeable / KVO)",
                    tipo: "Solución Glucosada 5%",
                    volumen: 250,
                    tiempo: "Para 24 horas",
                    via: "IV periférica"
                },
                {
                    label: "Sol. Fisiológica 0.9% 500 mL para 24 h (restricción hídrica)",
                    tipo: "Solución Fisiológica 0.9%",
                    volumen: 500,
                    tiempo: "Para 24 horas",
                    via: "IV periférica"
                }
            ];
        } else {
            fallbackSoluciones = [
                {
                    label: "Sol. Hartmann 1000 mL para 12 h (mantenimiento GPC)",
                    tipo: "Solución Hartmann",
                    volumen: 1000,
                    tiempo: "Para 12 horas",
                    via: "IV periférica"
                },
                {
                    label: "Sol. Fisiológica 0.9% 1000 mL para 24 h (aporte basal)",
                    tipo: "Solución Fisiológica 0.9%",
                    volumen: 1000,
                    tiempo: "Para 24 horas",
                    via: "IV periférica"
                },
                {
                    label: "Sol. Mixta 1000 mL para 24 h (aporte basal y calórico)",
                    tipo: "Solución Mixta",
                    volumen: 1000,
                    tiempo: "Para 24 horas",
                    via: "IV periférica"
                },
                {
                    label: "Carga rápida Sol. Hartmann 500 mL en 1 h (reanimación)",
                    tipo: "Solución Hartmann",
                    volumen: 500,
                    tiempo: "Carga en 1 hora",
                    via: "IV periférica"
                }
            ];
        }

        const fallbackFamilias: SuggestedDrugOption[] = [
            {
                familia: "Cefalosporina 3ª Gen",
                farmaco: "Ceftriaxona",
                dosis: "1",
                unidad: "g",
                via: "IV",
                frecuencia: "Cada 24 h",
                justificacionGPC: "Cobertura antimicrobiana de amplio espectro hospitalaria según GPC"
            },
            {
                familia: "Macrólido",
                farmaco: "Claritromicina",
                dosis: "500",
                unidad: "mg",
                via: "IV",
                frecuencia: "Cada 12 h",
                justificacionGPC: "Cobertura de patógenos atípicos respiratorios según GPC"
            },
            {
                familia: "Antipirético / Analgésico IV",
                farmaco: "Paracetamol",
                dosis: "1",
                unidad: "g",
                via: "IV",
                frecuencia: "PRN si temp > 38.0 °C",
                justificacionGPC: "Control térmico y analgesia de primera línea sin nefrotoxicidad"
            },
            {
                familia: "Protector Gástrico / IBP",
                farmaco: "Omeprazol",
                dosis: "40",
                unidad: "mg",
                via: "IV",
                frecuencia: "Cada 24 h",
                justificacionGPC: "Profilaxis de úlceras por estrés en paciente hospitalizado"
            }
        ];

        const fallbackMedidas: string[] = [
            "Posición Semifowler a 30-45° para optimizar mecánica ventilatoria",
            isDesaturando 
                ? "Oxígeno por puntas nasales a 2-3 L/min con meta de SpO2 ≥ 92%" 
                : "Monitorización de oximetría de pulso y signos vitales por turno",
            "Monitorización continua de signos vitales cada 4 horas",
            "Control de líquidos y balance hídrico estricto por turno",
            "Cuantificación de uresis horaria mediante recolección",
            "Glucometría capilar en ayuno y por turno"
        ];

        return {
            dietasSugeridas: fallbackDietas,
            solucionesSugeridas: fallbackSoluciones,
            familiasMedicamentos: fallbackFamilias,
            medidasSugeridas: fallbackMedidas
        };
    }
}

export function getSolucionesFallback(caseContext: string, plan: PrescribedTherapeuticPlan): string {
    if (plan.soluciones.length === 0) {
        return `✅ **¿Por qué SÍ? (Argumento):**
Las soluciones parenterales aseguran la reposición hídrica basal o la reanimación hemodinámica inmediata según la gravedad del paciente.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Omitir soluciones parenterales en ayuno o ante pérdidas patológicas agudas precipita deshidratación, hipoperfusión renal y progresión a falla orgánica.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** No has prescrito soluciones parenterales en el plan. Selecciona el esquema de fluidoterapia adaptado al estado hemodinámico del paciente.`;
    }

    const ctx = caseContext.toLowerCase();
    // Check hemodynamics and acute conditions requiring rapid volume resuscitation
    const isShockOrHypotension = /choque|shock|neumot[oó]rax|tensi[oó]n|hipoten|sepsis|politrauma|hemorr|taquicardia severa|inestabilidad hemodin[aá]mica|cetoacidosis|cad|hiperosmolar|cetoacid|deshidrataci[oó]n (severa|grave)/i.test(ctx) ||
        /pa (5\d|6\d|7\d|8\d)\//i.test(ctx) ||
        /tas\s*[:<]?\s*(5\d|6\d|7\d|8\d)/i.test(ctx);
    const isHeartFailureOrEdema = /insuficiencia card[ií]aca|falla card|edema pulmonar|edema agudo|estertores crepitantes/i.test(ctx);
    const isTBI = /traumatismo craneo|tce|edema cerebral|hipertensi[oó]n intracraneal/i.test(ctx);

    const hasDextrose = plan.soluciones.some(s => /mixta|glucosad|dextros/i.test(s.tipo));
    const hasRapidBolus = plan.soluciones.some(s => /carga|30 min|1 h|1 hora/i.test(s.tiempo) || /carga/i.test(s.tipo));
    const isSlowMaintenance = plan.soluciones.every(s => /24 h|24 horas|12 h|12 horas|8 h|8 horas/i.test(s.tiempo)) && !hasRapidBolus;
    const hasIsotonicCrystalloid = plan.soluciones.some(s => /hartmann|fisiol[oó]gica|ringer/i.test(s.tipo));

    if (isShockOrHypotension) {
        if (hasDextrose) {
            return `✅ **¿Por qué SÍ? (Argumento):**
En inestabilidad hemodinámica, cetoacidosis o choque, la reanimación prioritaria exige cristaloides isotónicos balanceados (Solución Hartmann o Fisiológica 0.9%) para restaurar inmediatamente la precarga y perfusión tisular.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Las soluciones mixtas o glucosadas están formalmente contraindicadas en choque y descompensación aguda: la glucosa se metaboliza velozmente a agua libre que difunde al espacio extravascular (~90% fuga al intersticio), no restituye la volemia efectiva, agrava el edema y desencadena hiperglucemia severa con diuresis osmótica contraproducente.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** Esta indicación no es la adecuada para este cuadro clínico. En choque, cetoacidosis o hipotensión severa, la Solución Mixta o Glucosada está contraindicada porque no expande el volumen intravascular efectivo y una velocidad para 24 horas (41 mL/h) es letalmente insuficiente para reanimar. Cambia a la opción recomendada: Carga rápida de Solución Hartmann o Fisiológica 0.9% 1000 mL para 1 hora para restaurar de inmediato la presión de perfusión tisular.`;
        }

        if (isSlowMaintenance) {
            const solPrescrita = plan.soluciones[0];
            return `✅ **¿Por qué SÍ? (Argumento):**
El cristaloide isotónico seleccionado (${solPrescrita.tipo}) es el indicado para la restitución del volumen intravascular; sin embargo, en cuadros de choque, cetoacidosis diabética o inestabilidad hemodinámica, el volumen debe infundirse en CARGA RÁPIDA (en 1 hora o en 30 minutos).

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Prescribir una velocidad lenta de mantenimiento ("${solPrescrita.tiempo}" = ~41 mL/h) en un paciente con inestabilidad hemodinámica, choque o cetoacidosis diabética perpetúa el colapso circulatorio y la hipoperfusión renal antes de recibir volumen efectivo.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** Has indicado ${solPrescrita.tipo} ${solPrescrita.volumen} mL con un tiempo de infusión de "${solPrescrita.tiempo}". Esta velocidad de infusión lenta (~41 mL/h) es letalmente insuficiente para la reanimación aguda de este paciente. En esta fase se requiere una CARGA RÁPIDA (Carga en 1 hora o Carga en 30 minutos). Cambia el Tiempo / Infusión a: Carga en 1 hora para restaurar oportunamente la precarga y perfusión tisular.`;
        }

        if (hasIsotonicCrystalloid && hasRapidBolus) {
            const solPrescrita = plan.soluciones[0];
            return `✅ **¿Por qué SÍ? (Argumento):**
La carga rápida con cristaloide isotónico balanceado (${solPrescrita.tipo} a ${solPrescrita.volumen} mL en ${solPrescrita.tiempo}) expande de inmediato el volumen circulante efectivo, optimiza el volumen sistólico por mecanismo de Frank-Starling y rescata la perfusión tisular.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
La fluidoterapia en choque o cetoacidosis debe titularse de forma dinámica: vigilar uresis horaria (> 0.5-1 mL/kg/h), descenso del lactato/cetonas y ausencia de estertores crepitantes pulmonares para evitar la sobrecarga iatrogénica posterior.

💡 **Perla del Pase de Visita:**
✅ **¡Tu respuesta es correcta!** Excelente indicación de fluidoterapia de reanimación: el bolo de ${solPrescrita.volumen} mL de cristaloide isotónico en ${solPrescrita.tiempo} expande el volumen circulante efectivo de forma inmediata para restaurar la precarga y perfusión tisular sin provocar edema osmótico.`;
        }
    }

    if (isHeartFailureOrEdema) {
        if (hasRapidBolus || plan.soluciones.some(s => s.volumen >= 1000 && !/24/.test(s.tiempo))) {
            return `✅ **¿Por qué SÍ? (Argumento):**
En falla cardiaca descompensada o congestión pulmonar, la prioridad es la restricción estricta de sodio y agua para disminuir la presión en cuña capilar pulmonar y la postcarga.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Administrar bolos rápidos o volúmenes altos (> 500 mL) precipita edema agudo de pulmón fulminante y claudicación ventricular por sobrecarga hidrostática retrógrada.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** Esta indicación es riesgosa para este paciente con sobrecarga hídrica o falla cardiaca. Cambia a la opción recomendada: Vía permeable (KVO) con Solución Fisiológica 0.9% 250 mL para 24 horas o restricción hídrica estricta.`;
        }

        return `✅ **¿Por qué SÍ? (Argumento):**
La restricción estricta de volumen y el mantenimiento de vía permeable (KVO) evitan elevar la presión telediastólica del ventrículo izquierdo y previenen el edema alveolar.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
La administración descuidada de soluciones parenterales en pacientes con falla cardiaca o sobrecarga precipita rápidamente descompensación respiratoria e insuficiencia ventricular.

💡 **Perla del Pase de Visita:**
✅ **¡Tu respuesta es correcta!** Excelente juicio clínico: restricción hídrica estricta y vía permeable (KVO). En falla cardiaca o edema agudo pulmonar, la fluidoterapia de mantenimiento debe limitarse al mínimo necesario para administración de medicamentos y balance hídrico neutro o negativo.`;
    }

    if (isTBI && hasDextrose) {
        return `✅ **¿Por qué SÍ? (Argumento):**
En traumatismo craneoencefálico, la fluidoterapia debe mantener la osmolaridad sérica normal-alta para evitar gradientes que favorezcan el edema cerebral.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Las soluciones glucosadas o hipotónicas generan agua libre que cruza la barrera hematoencefálica dañada, aumentando la presión intracraneal y el riesgo de herniación cerebral.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** Las soluciones con dextrosa/mixtas están contraindicadas en TCE. Cambia a la opción recomendada: Solución Fisiológica 0.9% 1000 mL para 12 a 24 horas para mantener estabilidad osmolar y hemodinámica.`;
    }

    // Stable case
    if (hasRapidBolus) {
        return `✅ **¿Por qué SÍ? (Argumento):**
Las soluciones de mantenimiento cubren los requerimientos hídricos y electrolíticos fisiológicos diarios (25-30 mL/kg/día).

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Infundir cargas rápidas de volumen en pacientes normovolémicos sin choque genera sobrecarga de volumen innecesaria y hemodilución.

💡 **Perla del Pase de Visita:**
⚠️ **Ajusta tu prescripción:** El paciente se encuentra hemodinámicamente estable sin signos de choque ni hipovolemia severa. Las cargas rápidas no están indicadas; ajusta a un esquema de mantenimiento (ej. Solución Hartmann 1000 mL para 12 a 24 horas).`;
    }

    return `✅ **¿Por qué SÍ? (Argumento):**
Las soluciones cristaloides isotónicas de mantenimiento a 25-30 mL/kg/día restauran el volumen intravascular efectivo y garantizan adecuada perfusión tisular y renal.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
La prescripción por inercia sin balance hídrico acumulado puede pasar por alto balances positivos excesivos; todo esquema de mantenimiento debe recalcularse cada 24 horas según uresis y electrolitos séricos.

💡 **Perla del Pase de Visita:**
✅ **¡Tu respuesta es correcta!** Esquema de fluidoterapia de mantenimiento adecuado para las metas basales del paciente. Las soluciones se titulan por uresis horaria (> 0.5-1 mL/kg/h) y campos pulmonares limpios, no por inercia de turno a turno.`;
}

export async function validateTherapeuticPlanWithTutor(
    caseContext: string,
    plan: PrescribedTherapeuticPlan,
    focusBlock?: 'dieta' | 'soluciones' | 'medicamentos' | 'medidas'
): Promise<string> {
    const planSummaryText = `
ÓRDENES MÉDICAS HOSPITALARIAS PRESCRITAS POR EL INTERNO:

1. DIETA:
- Tipo de dieta: ${plan.tipoDieta || 'No especificada'}
- Justificación clínica: ${plan.justificacionDieta || 'Sin justificación registrada'}

2. ESQUEMA DE SOLUCIONES Y ELECTRÓLITOS:
${plan.soluciones.length > 0 ? plan.soluciones.map((s, idx) => `  [Solución ${idx + 1}]
   - Tipo de Solución: "${s.tipo}"
   - Volumen: ${s.volumen} mL
   - Vía: ${s.via}
   - RITMO / TIEMPO EXACTO DE INFUSIÓN ELEGIDO POR EL INTERNO: "${s.tiempo}" (¡ATENCIÓN TUTOR!: Evalúa obligatoriamente si este tiempo "${s.tiempo}" es una carga rápida de 30-60 min o una infusión lenta de 8-24 horas, y calcula los mL/hora reales)`).join('\n') : '  - Sin soluciones prescritas'}

3. ESQUEMA FARMACOLÓGICO (MEDICAMENTOS CON POSOLOGÍA GPC):
${plan.medicamentos.length > 0 ? plan.medicamentos.map((m, idx) => `  ${idx + 1}. ${m.nombre} - ${m.dosis} ${m.unidad}, Vía: ${m.via}, Frecuencia: ${m.frecuencia}${m.familia ? ` (Familia: ${m.familia})` : ''}`).join('\n') : '  - Sin medicamentos prescritos'}

4. MEDIDAS GENERALES Y MONITORIZACIÓN HOSPITALARIA:
${plan.medidasGenerales.length > 0 ? plan.medidasGenerales.map((mg, idx) => `  - ${mg}`).join('\n') : '  - Sin medidas generales seleccionadas'}
- Cuidados adicionales de enfermería: ${plan.medidasAdicionalesEnfermeria || 'Ninguno especificado'}
`;

    const blockLabels: Record<string, string> = {
        dieta: 'DIETA Y VÍA NUTRICIONAL',
        soluciones: 'ESQUEMA DE SOLUCIONES Y FLUIDOTERAPIA',
        medicamentos: 'ESQUEMA FARMACOLÓGICO Y POSOLOGÍA GPC',
        medidas: 'MEDIDAS GENERALES Y MONITORIZACIÓN',
    };

    const targetBlock = focusBlock ? blockLabels[focusBlock] : 'ÓRDENES MÉDICAS HOSPITALARIAS';

    const systemPrompt = `Eres un Médico Especialista Adscrito y Tutor Docente del Hospital General de Apatzingán.
Tu misión formativa en el pase de visita es dar retroalimentación ULTRA CONCISA, DIRECTA Y SIN RODEOS, enseñando mediante el contraste pedagógico: ARGUMENTO (por qué sí) vs CONTRA-ARGUMENTO (por qué no o riesgos), y emitiendo un DICTAMEN INMEDIATO EN LA PERLA.

ENFOQUE OBLIGATORIO: Esta evaluación es EXCLUSIVA para el sub-apartado: "${targetBlock}".
No menciones otros apartados. Prohibido dar discursos largos, saludos formales de relleno o despedidas.

${focusBlock === 'soluciones' ? `REGLAS DE EVALUACIÓN CLÍNICA Y HEMODINÁMICA PARA SOLUCIONES Y FLUIDOTERAPIA:
Como Médico Especialista y Tutor Docente, debes evaluar con RIGOR CLÍNICO Y FARMACOLÓGICO la prescripción del interno contrastando minuciosamente:
1) TIPO DE SOLUCIÓN (Hartmann, Fisiológica 0.9%, Mixta, Glucosada al 5%/10%, Salina 0.45%, etc.)
2) VOLUMEN TOTAL (mL)
3) TIEMPO Y VELOCIDAD DE INFUSIÓN EXACTA INDICADA POR EL INTERNO (ej. "Para 24 horas" = ~41 mL/h vs. "Para 12 horas" = ~83 mL/h vs. "Carga en 1 hora" = 1000 mL/h vs. "Carga en 30 minutos" = 2000 mL/h)
frente al estado hemodinámico, comorbilidades y patología específica del caso clínico.

¡REGLA ANTI-ALUCINACIÓN OBLIGATORIA PARA EL TUTOR DOCENTE!:
¡PROHIBIDO asumir, inventar o felicitar al interno diciendo que indicó "un bolo en 1 hora" o "carga rápida" si en la orden médica dice textualmente "Para 24 horas", "Para 12 horas" o "Para 8 horas"!
Verifica con exactitud el valor literal en "RITMO / TIEMPO EXACTO DE INFUSIÓN ELEGIDO POR EL INTERNO".

CATEGORÍAS DE PACIENTE Y CRITERIOS DE EVALUACIÓN:

1. PACIENTE EN CETOACIDOSIS DIABÉTICA (CAD), ESTADO HIPEROSMOLAR, CHOQUE (SÉPTICO, HIPOVOLÉMICO, OBSTRUCTIVO, DISTRIBUTIVO), HIPOTENSIÓN SEVERA (TAS < 90 mmHg o TAM < 65 mmHg), NEUMOTÓRAX A TENSIÓN O DESHIDRATACIÓN GRAVE:
   - OBJETIVO TERAPÉUTICO: Reanimación hídrica agresiva inicial con cristaloide isotónico (Solución Hartmann o Fisiológica 0.9%) en CARGA RÁPIDA (500 a 1000 mL para pasar en 30 a 60 minutos) para expandir inmediatamente el volumen circulante efectivo y restaurar la presión de perfusión tisular.
   - EVALUACIÓN DEL TIEMPO / VELOCIDAD DE INFUSIÓN (CRÍTICO):
     * SI EL INTERNO ELIGIÓ CRISTALOIDE ISOTÓNICO (ej. Solución Fisiológica 0.9% o Hartmann) PERO INDICÓ VELOCIDAD LENTA DE MANTENIMIENTO ("Para 24 horas", "Para 12 horas", "Para 8 horas"):
       -> DICTAMEN OBLIGATORIO: "❌ **Elige otra opción:**"
       -> RECHAZO EXPLÍCITO Y ESPECÍFICO:
          Debes señalar con claridad que aunque el cristaloide es el correcto, la velocidad para 24 horas (~41 mL/h) es letalmente tardía e insuficiente para reanimar un paciente agudo descompensado/deshidratado, y que requiere una carga rápida.
          Ejemplo obligatorio de dictamen:
          💡 **Perla del Pase de Visita:**
          ❌ **Elige otra opción:** Has indicado [Nombre de la Solución] [Volumen] mL pero con un tiempo de infusión de "[Tiempo elegido, ej. Para 24 horas]". Esta velocidad lenta (~41 mL/h) es letalmente insuficiente para la reanimación inicial de este paciente con [diagnóstico/cetoacidosis/choque]. El tipo de cristaloide es adecuado, pero requiere una CARGA RÁPIDA. Cambia el Tiempo / Infusión a: Carga en 1 hora (o Carga en 30 minutos) para expandir oportunamente el volumen intravascular y restaurar la perfusión orgánica.
     * SI EL INTERNO ELIGIÓ SOLUCIONES CON GLUCOSA (Solución Mixta, Solución Glucosada 5% o 10%):
       -> DICTAMEN OBLIGATORIO: "❌ **Elige otra opción:**"
       -> En cetoacidosis diabética o hiperglucemia agrava la hiperosmolaridad y la deshidratación por diuresis osmótica; en choque no expande el espacio intravascular (~90% fuga al intersticio).
     * SI EL INTERNO ELIGIÓ CRISTALOIDE ISOTÓNICO (Hartmann o Fisiológica 0.9%) Y ADEMÁS ELIGIÓ VELOCIDAD RÁPIDA ("Carga en 1 hora" o "Carga en 30 minutos"):
       -> DICTAMEN:
          💡 **Perla del Pase de Visita:**
          ✅ **¡Tu respuesta es correcta!** Excelente elección de fluidoterapia de reanimación: el bolo rápido de [Volumen] mL de cristaloide isotónico en [Tiempo] expande el volumen circulante efectivo de forma inmediata para restaurar la precarga y perfusión tisular sin provocar edema osmótico.

2. PACIENTE CON INSUFICIENCIA CARDIACA DESCOMPENSADA, EDEMA AGUDO DE PULMÓN O FALLA RENAL OLIGÚRICA/ANÚRICA:
   - OBJETIVO TERAPÉUTICO: Restricción hídrica estricta (KVO / mantener vía permeable a 250 mL en 24 h o < 500 mL/día).
   - CONDUCTAS QUE MERECEN OBLIGATORIAMENTE "❌ **Elige otra opción:**": Cargas rápidas de líquidos o esquemas de 1000-2000 mL para 8-12 h. Esto precipita asfixia por inundación alveolar y claudicación del ventrículo izquierdo.
   - DICTAMEN: "❌ **Elige otra opción:** Cambia a la opción recomendada: Vía permeable (KVO) con Solución Fisiológica 0.9% 250 mL para 24 horas para evitar sobrecarga hidrostática pulmonar."

3. PACIENTE CON TRAUMATISMO CRANEOENCEFÁLICO (TCE) O HIPERTENSIÓN INTRACRANEAL:
   - OBJETIVO TERAPÉUTICO: Mantener osmolaridad plasmática normal-alta. Cristaloide de elección: Solución Fisiológica 0.9% (308 mOsm/L).
   - SOLUCIONES CONTRAINDICADAS: Solución Glucosada 5%, Mixta, o hipotónicas (Salina 0.45%), y evitar excesos de Hartmann (~273 mOsm/L, ligeramente hipotónico respecto al cerebro). Generan edema cerebral citotóxico y vasogénico con riesgo de herniación transtentorial.
   - DICTAMEN: Si indicó glucosada o hipotónica -> "❌ **Elige otra opción:** Cambia a Solución Fisiológica 0.9% 1000 mL para 12-24 h para prevenir edema cerebral".

4. PACIENTE HOSPITALIZADO ESTABLE, NORMOTENSO EN AYUNO BASAL (CIRUGÍA, PATOLOGÍA CLÍNICA SIN CHOQUE):
   - OBJETIVO TERAPÉUTICO: Mantenimiento hidroelectrolítico y calórico basal (Holiday-Segar 25-35 mL/kg/día).
   - SOLUCIONES ADECUADAS: Solución Hartmann 1000 mL para 12 h o 24 h, Solución Fisiológica 0.9% 1000 mL para 12-24 h, o Solución Mixta 1000 mL para 12-24 h (para evitar cetosis de ayuno en normoglucémicos).
   - DICTAMEN: "✅ **¡Tu respuesta es correcta!** [Reafirma que la infusión cubre el gasto fisiológico y pérdidas insensibles]".
   - Si indica una carga rápida en un paciente estable sin deshidratación ni choque:
     -> "⚠️ **Ajusta tu prescripción:** En paciente hemodinámicamente estable sin hipovolemia no se justifican cargas rápidas de volumen; ajusta a infusión de mantenimiento para 12 a 24 horas".

5. SI EL INTERNO NO HA PRESCRITO NINGUNA SOLUCIÓN:
   - Dictamina: "❌ **Elige otra opción:** No has prescrito ninguna solución parenteral..."
` : ''}
${focusBlock === 'medidas' ? `REGLAS DE EVALUACIÓN MULTI-OPCIÓN PARA MEDIDAS GENERALES Y MONITORIZACIÓN:
1. NATURALEZA MULTI-OPCIÓN / MULTI-RESPUESTA (OBLIGATORIO): En el pase de visita y órdenes médicas de hospitalización, este apartado es SIEMPRE MULTI-OPCIÓN. Prácticamente siempre se requieren 2, 3 o más medidas indicadas de manera simultánea para el paciente (ej. posición Semifowler 30-45°, monitorización continua de signos vitales por turno, control de líquidos y balance hídrico, cuantificación de uresis horaria, oxigenoterapia con metas específicas de SpO2, glucometrías capilares).
2. CRITERIO DE ACIERTO (2 O MÁS MEDIDAS): Si el interno ha seleccionado 2 o más medidas generales apropiadas para el cuadro clínico del paciente:
   - DICTAMEN OBLIGATORIO: ¡ES CORRECTA!
   - En la "💡 Perla del Pase de Visita", DEBES INICIAR OBLIGATORIAMENTE CON:
     "✅ **¡Tu respuesta es correcta!** [Felicita y reafirma la adecuada integración multi-opción de las medidas seleccionadas, explicando cómo la sinergia de posición, vigilancia hemodinámica y balance de líquidos protege al paciente y previene complicaciones]".
   - PROHIBIDO calificarla como incorrecta o exigir que solo elija una medida aislada cuando ha seleccionado 2 o más opciones válidas.
3. SI SELECCIONÓ 1 SOLA MEDIDA VÁLIDA:
   - Dictamina: "✅ **¡Tu respuesta es correcta!** [Valida la medida elegida, pero recuérdale que en sala hospitalaria este apartado es multi-opción y debe integrar al menos otra medida sinérgica como monitorización o balance hídrico]".
4. ÚNICAMENTE DICTAMINA "❌ **Elige otra opción:**" SI:
   - No hay ninguna medida seleccionada en el checklist.
   - O seleccionó una medida francamente contraindicada (ej. decúbito plano supino en un paciente con insuficiencia respiratoria o disnea severa).
   En caso de dictaminar "❌ **Elige otra opción:**", recomienda con claridad seleccionar 2 o más medidas (ej. "Selecciona posición Semifowler a 30-45° y monitorización continua de signos vitales").
` : ''}
ESTRUCTURA EXACTA REQUERIDA (3 viñetas directas):

✅ **¿Por qué SÍ? (Argumento):**
[1 a 2 oraciones directas: justificación clínica y fisiopatológica de por qué la indicación correcta beneficia a este paciente].

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
[1 a 2 oraciones directas: cuándo esta indicación sería perjudicial, qué riesgo específico precipitaría si se erra o no se titula (ej. sobrecarga hídrica, broncoaspiración, toxicidad renal, hipoglucemia), o qué omisión crítica ocurrió].

💡 **Perla del Pase de Visita:**
Dictamina de forma EXPLÍCITA y VISIBLE si la elección prescrita por el interno es ACERTADA o NO para este caso:
- Si la elección del interno es ACERTADA / CORRECTA:
  Inicia EXACTAMENTE con: "✅ **¡Tu respuesta es correcta!** [Reafirma brevemente el acierto clínico y añade la regla de oro o máxima hospitalaria memorable]".
- Si la elección del interno es INCORRECTA / INADECUADA / RIESGOSA:
  Inicia EXACTAMENTE con: "❌ **Elige otra opción:** Esta indicación no es la adecuada para este cuadro clínico. Cambia a la opción recomendada ([menciona explícitamente la indicación correcta recomendada]) para evitar [complicación]. [Añade la regla de oro que fundamenta la corrección]".
- Si la elección del interno es en general aceptable pero requiere calibrar velocidad o volumen:
  Inicia EXACTAMENTE con: "⚠️ **Ajusta tu prescripción:** [Explica el ajuste necesario de velocidad o volumen y la meta hemodinámica o renal a vigilar]".`;

    const fallbackResponses: Record<string, string> = {
        dieta: !plan.tipoDieta
            ? `✅ **¿Por qué SÍ? (Argumento):**
El ayuno o la dieta específica según el patrón ventilatorio protege la vía aérea de broncoaspiración o aporta los requerimientos metabólicos necesarios.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Indicar vía oral con taquipnea severa precipita neumonitis por aspiración; el ayuno prolongado sin indicación deteriora la barrera mucosa.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** Aún no has seleccionado el tipo de dieta. Selecciona la opción recomendada según la estabilidad respiratoria y metabólica del paciente.`
            : `✅ **¿Por qué SÍ? (Argumento):**
Si el paciente presenta taquipnea (FR ≥ 24 rpm), dificultad ventilatoria o sospecha quirúrgica, el ayuno protege la vía aérea y previene broncoaspiración en la fase aguda.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Indicar vía oral con polipnea severa puede desencadenar neumonitis química por aspiración; por el contrario, un ayuno prolongado (> 48 h) sin soporte enteral deteriora la barrera mucosa e incrementa translocación bacteriana.

💡 **Perla del Pase de Visita:**
✅ **¡Tu respuesta es correcta!** Paciente con FR ≥ 24 rpm o disnea = boca cerrada (ayuno estricto). Se reinicia tolerancia oral en cuanto la FR sea < 20 rpm y el patrón respiratorio esté estable.`,

        soluciones: getSolucionesFallback(caseContext, plan),

        medicamentos: plan.medicamentos.length === 0
            ? `✅ **¿Por qué SÍ? (Argumento):**
La cobertura farmacológica oportuna según Guías de Práctica Clínica previene complicaciones sépticas y estabiliza los síntomas cardinales.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Retrasar el esquema farmacológico hospitalario empeora el pronóstico y eleva la morbilidad.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** Aún no has prescrito medicamentos. Selecciona el esquema farmacológico GPC de primera línea recomendado para esta patología.`
            : `✅ **¿Por qué SÍ? (Argumento):**
El esquema antimicrobiano y analgésico de primera línea según GPC asegura una adecuada concentración inhibitoria mínima (CIM) frente a los patógenos más probables con excelente perfil hospitalario.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Prescribir AINEs en pacientes deshidratados o con nefropatía de base desencadena lesión renal aguda por vasoconstricción aferente; omitir ajuste por filtrado glomerular eleva el riesgo de toxicidad.

💡 **Perla del Pase de Visita:**
✅ **¡Tu respuesta es correcta!** Todo antimicrobiano hospitalario debe llevar dosis ajustada a la función renal y fecha obligatoria de revaloración clínica a las 48-72 h.`,

        medidas: plan.medidasGenerales.length === 0
            ? `✅ **¿Por qué SÍ? (Argumento):**
Las medidas generales y de monitorización hospitalaria son esenciales para prevenir complicaciones, optimizar la ventilación y detectar oportunamente el deterioro hemodinámico.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Omitir las medidas generales de enfermería y monitorización deja al paciente sin vigilancia activa ni soporte postural adecuado.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** Aún no has indicado medidas generales. Recuerda que este apartado es multi-opción (casi siempre son 2 o más correctas): selecciona al menos 2 medidas complementarias (como posición Semifowler a 30-45°, monitorización continua de signos vitales o balance hídrico).`
            : plan.medidasGenerales.length === 1
            ? `✅ **¿Por qué SÍ? (Argumento):**
La medida seleccionada contribuye favorablemente a la estabilidad y confort hospitalario del paciente.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Indicar una sola medida suele ser insuficiente en hospitalización; se requiere un esquema integral que combine postura, vigilancia hemodinámica y balance de líquidos.

💡 **Perla del Pase de Visita:**
✅ **¡Tu respuesta es correcta!** Buena elección, pero recuerda la máxima docente: este apartado es multi-opción (se esperan 2 o más medidas simultáneas). Suma al menos otra indicación sinérgica como monitorización de signos vitales o control de líquidos.`
            : `✅ **¿Por qué SÍ? (Argumento):**
Excelente integración multi-opción: la combinación de medidas posturales (Semifowler a 30-45°), vigilancia de constantes vitales y balance hídrico crea una red de seguridad integral que optimiza la mecánica ventilatoria y permite identificar oportunamente cualquier deterioro clínico.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Prescribir medidas aisladas o incompletas (ej. indicar oxígeno sin monitorizar o decúbito plano con disnea) compromete la ventilación; no cuantificar uresis y balance hídrico impide titular la fluidoterapia y evaluar la perfusión renal.

💡 **Perla del Pase de Visita:**
✅ **¡Tu respuesta es correcta!** En hospitalización, las órdenes médicas son sinérgicas y multi-opción: jamás indiques una sola medida aislada. El conjunto de posición adecuada, signos vitales continuos y vigilancia de uresis es el estándar de oro en el pase de visita del Hospital General de Apatzingán.`
    };

    try {
        const response = await generateContentWithFallback({
            contents: `RESUMEN CLÍNICO DEL CASO:\n${caseContext}\n\n${planSummaryText}`,
            preferredModel: 'gemini-3.8-flash',
            modulo: 'simulador',
            config: {
                systemInstruction: systemPrompt
            }
        });

        return response.text || (focusBlock ? fallbackResponses[focusBlock] : fallbackResponses.dieta);
    } catch (err: any) {
        console.error("Error en validación con tutor clínico:", err);
        return focusBlock ? fallbackResponses[focusBlock] : fallbackResponses.dieta;
    }
}
