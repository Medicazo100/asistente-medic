import { GoogleGenAI, Type, Chat } from "@google/genai";
import { 
    QuizQuestion, ClinicalCase, LabResult, ImagingResult, GroundingSource,
    TherapeuticPlanOptionsCache, PrescribedTherapeuticPlan, SuggestedDrugOption, SuggestedSolutionOption
} from '../types';
import { generateRealisticMedicalImageUrl, getInternetMedicalImageUrl } from './medicalImageRenderer';


function getAi(): GoogleGenAI {
    let apiKey = '';

    // 1. Prioridad 1: Clave ingresada por el usuario en localStorage
    if (typeof localStorage !== 'undefined') {
        const storedKey = localStorage.getItem('GEMINI_API_KEY') || localStorage.getItem('API_KEY');
        if (storedKey && storedKey.trim() !== '') {
            apiKey = storedKey.trim();
        }
    }

    // 2. Prioridad 2: Variable inyectada en window
    if (!apiKey && typeof window !== 'undefined' && (window as any).GEMINI_API_KEY) {
        apiKey = (window as any).GEMINI_API_KEY;
    }

    // 3. Prioridad 3: Variable de entorno de Vite (.env.local)
    if (!apiKey && typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) {
        apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY;
    }

    // 4. Prioridad 4: process.env (Node / Vercel)
    if (!apiKey && typeof process !== 'undefined' && process.env) {
        const pKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
        if (pKey && pKey !== 'undefined' && pKey !== 'null') {
            apiKey = pKey;
        }
    }

    if (apiKey === 'undefined' || apiKey === 'null' || !apiKey) {
        apiKey = '';
    }

    return new GoogleGenAI({ apiKey });
}

// Helper function for robust JSON parsing
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
        console.error("Failed to parse JSON response:", e.message);
        console.error("Raw API response text:", jsonString);
        throw new Error(`Failed to parse the response from the AI model. Details: ${e.message}`);
    }
}

const TEXT_MODELS = [
    'gemini-3.7-flash',
    'gemini-2.5-flash',
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite'
];

export async function generateContentWithFallback(params: {
    contents: any;
    config?: any;
    preferredModel?: string;
}): Promise<any> {
    const ai = getAi();
    const modelsToTry = params.preferredModel 
        ? [params.preferredModel, ...TEXT_MODELS.filter(m => m !== params.preferredModel)]
        : TEXT_MODELS;

    let lastError: any = null;
    for (const model of modelsToTry) {
        try {
            const response = await ai.models.generateContent({
                model: model,
                contents: params.contents,
                config: params.config
            });
            return response;
        } catch (err: any) {
            console.warn(`Intento con modelo ${model} no completado:`, err?.message || err);
            lastError = err;

            // Si falló por restricciones de herramientas/grounding (ej. error 429 en grounding_requests), reintentar sin tools
            const errMsg = err?.message || '';
            if (params.config?.tools && (errMsg.includes('grounding') || errMsg.includes('tools') || errMsg.includes('429'))) {
                try {
                    const fallbackConfig = { ...params.config };
                    delete fallbackConfig.tools;
                    const responseWithoutTools = await ai.models.generateContent({
                        model: model,
                        contents: params.contents,
                        config: fallbackConfig
                    });
                    return responseWithoutTools;
                } catch (toolErr) {
                    console.warn(`Reintento sin herramientas en ${model} falló:`, toolErr);
                }
            }
            continue;
        }
    }
    throw lastError || new Error("Error al comunicarse con el servicio de IA.");
}


export async function generateQuiz(topic: string, difficulty: string, numQuestions: number): Promise<QuizQuestion[]> {
    const difficultyDescriptions: { [key: string]: string } = {
        'Interno': 'con un nivel de dificultad para un médico interno en sus primeras rotaciones. Las preguntas deben cubrir conceptos fundamentales, presentaciones clínicas típicas y tratamientos de primera línea.',
        'Temerario': 'con un nivel de dificultad para un médico interno avanzado o residente de primer año. Las preguntas deben ser más desafiantes, involucrando diagnósticos diferenciales complejos, conocimiento de guías de práctica clínica específicas o tratamientos de segunda línea.',
        'Dr. House': 'con un nivel de dificultad para un especialista o para un desafío diagnóstico tipo "Dr. House". Las preguntas deben ser sobre casos atípicos, enfermedades raras (zebras), detalles sutiles de la fisiopatología, o interacciones farmacológicas poco comunes.'
    };
    const difficultyPrompt = difficultyDescriptions[difficulty] || difficultyDescriptions['Interno'];
    const prompt = `Genera un cuestionario de ${numQuestions} preguntas de opción múltiple sobre "${topic}" para médicos internos, ${difficultyPrompt}. Cada pregunta debe tener 4 opciones. Una opción debe ser la correcta. Proporciona la respuesta correcta en texto y una retroalimentación concisa para cada pregunta, explicando por qué la respuesta es correcta.`;

    const response = await generateContentWithFallback({
        contents: prompt,
        config: {
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
    return safeJsonParse(response.text || '');
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
        config: {
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

  const prompt = `Simulador dual para internos de pregrado: PACIENTE real y TUTOR MÉDICO docente.

CASO CLÍNICO DE REFERENCIA (ESTRICTAMENTE CONFIDENCIAL):
${caseSummary}

HISTORIAL DE ANAMNESIS ACUMULADA:
${formattedHistory}

PREGUNTA ACTUAL DEL INTERNO: 
"${userQuestion}"

---
REGLAS OBLIGATORIAS:
1. PROHIBICIÓN ABSOLUTA DE REVELAR DIAGNÓSTICO: Jamás nombres la patología, diagnóstico definitivo ni sospecha directa.
2. PACIENTE: Responde con lenguaje natural, coloquial y subjetivo según tu cuadro clínico. Si el interno intenta adivinar el diagnóstico directamente, muestra confusión: "No lo sé doctor, solo sé lo que siento...".
3. TUTOR: Proporciona retroalimentación ultra concisa y formativa (máximo 2 a 3 oraciones). Evalúa la pertinencia semiológica de la pregunta y sugiere áreas semiológicas clave que convenga indagar (ej. semiología ALICIA, antecedentes, desencadenantes).

Responde únicamente con un objeto JSON estructurado con 'patientResponse' y 'tutorFeedback'.`;

  const response = await generateContentWithFallback({
    contents: prompt,
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

export async function generateStudyResults(fullCaseContext: string, requestedStudies: { labs: string[], imaging: string[] }): Promise<{ labs: LabResult[], imaging: ImagingResult[] }> {
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
            imageUrl: img.imageUrl || await generateImage(img.study, img.findings)
        })));
    }
    return parsed;
}

export async function generateImage(basePrompt: string, findings?: string): Promise<string> {
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

    // 1. Intentar primero con gemini-2.5-flash-image
    try {
        const isChest = /t[oó]rax|chest|pulmon/i.test(normPrompt) && 
                        !/\b(tac|tc|tomograf\w*|ultra\w*|ecograf\w*|ecocardio\w*|usg|doppler|resonanc\w*|rmn?)\b/i.test(normPrompt) &&
                        !normPrompt.startsWith("eco");
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [{ text: fullPrompt }]
            },
            config: {
                imageConfig: {
                    aspectRatio: isChest ? "3:4" : "1:1"
                }
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    } catch (err: any) {
        console.warn("gemini-2.5-flash-image no disponible por falta de cuota. Integrando imagen médica de internet correspondiente al informe radiológico:", err?.message || err);
    }

    // 2. Solo después de que no se pueda generar por gemini-2.5-flash-image por falta de cuota:
    // Integrar imagen de internet acorde o lo más parecido al informe radiológico
    return getInternetMedicalImageUrl(basePrompt, findings);
}


export async function editImage(prompt: string, base64ImageData: string, mimeType: string): Promise<string> {
    const response = await getAi().models.generateContent({
        model: 'gemini-2.5-flash-image',
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

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }
    throw new Error("No se pudo editar la imagen.");
}

export async function getFinalDiagnosis(fullCaseContext: string): Promise<{ text: string, sources: GroundingSource[] }> {
    const prompt = `Basado en la siguiente información clínica completa: ${fullCaseContext}

    Realiza un análisis clínico-educativo exhaustivo para un médico interno y proporciona lo siguiente en formato Markdown estricto. Utiliza la herramienta de búsqueda de Google para fundamentar tus respuestas con evidencia médica actualizada y diversa (Guías de Práctica Clínica mexicanas CENETEC/SSA, guías internacionales AHA, ACC, ESC, ADA, KDIGO, IDSA, GOLD, revisiones en PubMed, NEJM, Lancet, JAMA y UpToDate).

    REGLAS DE FORMATO Y CITACIÓN:
    - IMPORTANTE: Redacta estrictamente en texto plano y Markdown estándar. NUNCA utilices sintaxis LaTeX ni símbolos de dólar ($ o $$) ni comandos como \text{}, \alpha, \beta para fórmulas o nombres biológicos/médicos (ej. escribe simplemente "IL-1", "IL-6", "TNF-alfa", "IL-8", etc.).
    - DIVERSIDAD Y AMPLITUD BIBLIOGRÁFICA: Consulta e incorpora activamente entre 4 y 6 fuentes médicas autorizadas y complementarias (nacionales e internacionales).
    - Inserta llamadas de citas numéricas entre corchetes como [1], [2], [3], [4], [5], [6] dentro del texto redactado en las secciones correspondientes para respaldar cada punto fisiopatológico, criterio diagnóstico, esquema farmacológico con dosis y evidencia clínica.
    - Cada número [n] debe coincidir rigurosamente con el orden de las fuentes consultadas.

    Utiliza los siguientes encabezados exactamente como se indican y en este orden:

    ### Diagnóstico Principal
    Establece el diagnóstico más probable de forma clara y concisa.

    ### Fisiopatología y Correlación Clínica
    Esta es la sección más importante para el aprendizaje. Explica de manera detallada la fisiopatología subyacente del diagnóstico principal. Después, correlaciona de forma explícita CADA UNO de los hallazgos clave (signos, síntomas, resultados de laboratorio e imagen) del caso clínico con la fisiopatología descrita (ej. "...liberación de citoquinas pro-inflamatorias como IL-1 y TNF-alfa [1]", "...leucocitosis reactiva observada en la biometría hemática [2]"). Incluye citas numéricas [1], [2], [3] correspondientes a las fuentes de evidencia.

    ### Plan de Manejo y Tratamiento
    Detalla el plan de manejo inicial y el tratamiento específico para el diagnóstico principal. Basa tus recomendaciones en Guías de Práctica Clínica (GPC) actualizadas y en la medicina basada en evidencia. Sé específico en cuanto a fármacos, dosis y medidas de soporte, incluyendo citas numéricas [3], [4], [5] para las guías de referencia utilizadas.

    ### Diagnósticos Diferenciales
    Al final, enumera al menos 2 a 3 diagnósticos diferenciales importantes que se consideraron. Para cada uno, explica brevemente por qué es menos probable que el diagnóstico principal en este caso específico, citando evidencia comparativa si aplica.
    
    ### Fuentes de Información
    Al final de todo, enumera de forma ordenada y numerada entre 4 y 6 fuentes de alta calidad que respalden el diagnóstico y manejo, coincidiendo con los números de cita del texto:
    - [1] [Título del artículo o guía clínica](URL directa)
    - [2] [Título del artículo o guía clínica](URL directa)
    - [3] [Título del artículo o guía clínica](URL directa)
    - [4] [Título del artículo o guía clínica](URL directa)
    - [5] [Título del artículo o guía clínica](URL directa)
    - [6] [Título del artículo o guía clínica](URL directa)`;

    const response = await generateContentWithFallback({
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text || '';
    const rawSources = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
        .map((chunk: any) => chunk.web)
        .filter((web: any): web is GroundingSource => Boolean(web && web.uri && web.uri.trim() !== ''));
        
    // Deduplicate sources by URI while preserving order
    const seenUris = new Set<string>();
    const sources: GroundingSource[] = [];
    for (const source of rawSources) {
        if (!seenUris.has(source.uri)) {
            seenUris.add(source.uri);
            sources.push(source);
        }
    }

    // Complement with markdown links from text to ensure full coverage of all cited sources
    if (text) {
        const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(text)) !== null) {
            const title = match[1];
            const uri = match[2];
            if (!seenUris.has(uri)) {
                seenUris.add(uri);
                sources.push({ title, uri });
            }
        }
    }

    return { text, sources };
}

export async function generateNoteGuide(topic: string): Promise<{ guide: string, template: string }> {
    const prompt = `Para un paciente con "${topic}", genera un objeto JSON con dos propiedades: "guide" (guía detallada en Markdown para redactar una nota SOAP) y "template" (plantilla de nota SOAP en texto plano, pre-llenada con ejemplos y placeholders claros).`;
    const response = await generateContentWithFallback({
        contents: prompt,
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

    Al final de la guía, incluye una sección titulada "### Fuentes" y lista de 3 a 5 fuentes web que utilizaste con enlaces directos, formateadas como: "- [Título de la guía o artículo](URL)".`;
    
    const response = await generateContentWithFallback({
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text || '';
    const rawSources = (response.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
        .map((chunk: any) => chunk.web)
        .filter((web: any): web is GroundingSource => Boolean(web && web.uri && web.uri.trim() !== ''));
        
    const seenUris = new Set<string>();
    const sources: GroundingSource[] = [];
    for (const source of rawSources) {
        if (!seenUris.has(source.uri)) {
            seenUris.add(source.uri);
            sources.push(source);
        }
    }

    if (text) {
        const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
        let match;
        while ((match = linkRegex.exec(text)) !== null) {
            const title = match[1];
            const uri = match[2];
            if (!seenUris.has(uri)) {
                seenUris.add(uri);
                sources.push({ title, uri });
            }
        }
    }
        
    return { text, sources };
}

export function createChat(): Chat {
    return getAi().chats.create({
        model: 'gemini-3.7-flash',
    });
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
2. solucionesSugeridas: Array de 3-4 esquemas de fluidoterapia de primera línea basados en Guías de Práctica Clínica hospitalarias que correspondan exactamente a lo que el tutor docente validará como acertado (deben incluir: 1) Solución Hartmann 1000 mL para 12 h como mantenimiento de primera línea, 2) Solución Fisiológica 0.9% 1000 mL para 24 h como aporte basal, 3) Solución Mixta 1000 mL para 24 h si requiere aporte calórico basal en ayuno, y 4) Carga rápida Solución Hartmann o Fisiológica 0.9% 500 mL en 1 h si hay deshidratación o hipotensión).
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
        const isTaquipneico = frNum >= 26;
        const isDesaturando = spo2Num < 92;
        const isDiabetico = (caseData.patientProfile + caseData.historyOfPresentIllness).toLowerCase().includes('diab');

        const fallbackDietas: string[] = [];
        if (isTaquipneico) fallbackDietas.push("Ayuno por taquipnea y riesgo de broncoaspiración");
        if (isDiabetico) fallbackDietas.push("Dieta fraccionada para diabético (1500-1800 kcal)");
        fallbackDietas.push("Dieta blanda con líquidos a tolerancia");
        fallbackDietas.push("Dieta normocalórica hiposódica");

        const fallbackSoluciones: SuggestedSolutionOption[] = [
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

export async function validateTherapeuticPlanWithTutor(
    caseContext: string,
    plan: PrescribedTherapeuticPlan,
    focusBlock?: 'dieta' | 'soluciones' | 'medicamentos' | 'medidas'
): Promise<string> {
    const ai = getAi();

    const planSummaryText = `
ÓRDENES MÉDICAS HOSPITALARIAS PRESCRITAS POR EL INTERNO:

1. DIETA:
- Tipo de dieta: ${plan.tipoDieta || 'No especificada'}
- Justificación clínica: ${plan.justificacionDieta || 'Sin justificación registrada'}

2. ESQUEMA DE SOLUCIONES Y ELECTRÓLITOS:
${plan.soluciones.length > 0 ? plan.soluciones.map((s, idx) => `  ${idx + 1}. ${s.tipo} - ${s.volumen} mL, Vía: ${s.via}, Ritmo/Tiempo: ${s.tiempo}`).join('\n') : '  - Sin soluciones prescritas'}

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

${focusBlock === 'soluciones' ? `REGLAS DE CONGRUENCIA TOTAL PARA SOLUCIONES Y FLUIDOTERAPIA:
1. SI EL INTERNO PRESCRIBE una solución cristaloide isotónica estándar adecuada (como Solución Hartmann 1000 mL para 12 h o 24 h, Solución Fisiológica 0.9% 1000 mL para 12 h o 24 h, Solución Mixta para 24 h, o carga rápida de 500-1000 mL en 1 h ante hipotensión o choque), o cualquiera de las opciones sugeridas por el tutor en la interfaz:
   - DICTAMEN OBLIGATORIO: ¡ES CORRECTA!
   - En la "💡 Perla del Pase de Visita", DEBES INICIAR OBLIGATORIAMENTE CON:
     "✅ **¡Tu respuesta es correcta!** [Reafirma que la indicación (Hartmann, Fisiológica 0.9% o Mixta) mantiene la perfusión tisular y gasto urinario fisiológico sin riesgo de sobrecarga]".
   - PROHIBIDO calificarla como incorrecta si el interno eligió o redactó una de estas soluciones estándar o una opción sugerida por el tutor. Nunca contradigas la indicación sugerida.
2. ÚNICAMENTE DICTAMINA "❌ **Elige otra opción:**" si:
   - No hay ninguna solución prescrita en el plan.
   - Hay sobrecarga manifiesta con múltiples infusiones simultáneas (> 3500 mL/día sin choque).
   - Se indicó una infusión contraindicada (ej. agua destilada pura IV o exceso de volumen en edema agudo de pulmón cardiogénico).
   Al indicar "❌ **Elige otra opción:**", recomienda con total claridad cuál de las soluciones sugeridas elegir (ej. "Cambia a la opción recomendada: Solución Hartmann 1000 mL para 12 horas").
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
- Si la elección del interno es INCORRECTA / INADECUADA / RIESGOSA o falta ajustar:
  Inicia EXACTAMENTE con: "❌ **Elige otra opción:** Esta indicación no es la adecuada para este cuadro clínico. Cambia a la opción recomendada ([menciona explícitamente la indicación correcta recomendada]) para evitar [complicación]. [Añade la regla de oro que fundamenta la corrección]".`;

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

        soluciones: plan.soluciones.length === 0
            ? `✅ **¿Por qué SÍ? (Argumento):**
Las soluciones cristaloides isotónicas (Hartmann o Fisiológica 0.9%) a 25-30 mL/kg/día restauran el volumen intravascular efectivo y garantizan adecuada perfusión tisular y renal.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Omitir soluciones parenterales en ayuno o ante pérdidas patológicas precipita deshidratación y fracaso renal agudo prerrenal.

💡 **Perla del Pase de Visita:**
❌ **Elige otra opción:** No has prescrito soluciones parenterales. Selecciona la opción recomendada (Solución Hartmann 1000 mL para 12 horas o Solución Fisiológica 0.9% 1000 mL para 24 horas) para asegurar hidratación basal y vía venosa permeable.`
            : `✅ **¿Por qué SÍ? (Argumento):**
Las soluciones cristaloides isotónicas (Hartmann o Fisiológica 0.9%) a 25-30 mL/kg/día restauran el volumen intravascular efectivo y garantizan adecuada perfusión tisular y renal.

⚠️ **¿Por qué NO? / Riesgo a vigilar (Contra-argumento):**
Infundir bolos rápidos o volúmenes excesivos (> 35 mL/kg) sin correlacionar con gasto cardiaco puede precipitar edema agudo de pulmón; infundir solución salina masiva genera acidosis hiperclorémica.

💡 **Perla del Pase de Visita:**
✅ **¡Tu respuesta es correcta!** Esquema de fluidoterapia adecuado para las metas basales del paciente. Las soluciones se titulan por uresis horaria (> 0.5-1 mL/kg/h) y campos pulmonares limpios, no por inercia de turno a turno.`,

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
            preferredModel: 'gemini-3.7-flash',
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