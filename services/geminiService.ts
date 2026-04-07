import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import { QuizQuestion, ClinicalCase, LabResult, ImagingResult, GroundingSource } from '../types';

function getAi(): GoogleGenAI {
    // CRITICAL: Use process.env.API_KEY (from selection dialog) or fallback to GEMINI_API_KEY.
    // Create a new instance every time to ensure the latest API key is used.
    let apiKey = (typeof process !== 'undefined' ? (process.env.API_KEY || process.env.GEMINI_API_KEY) : null) || (import.meta as any).env?.VITE_GEMINI_API_KEY;
    
    // Handle cases where Vite define might have stringified 'undefined'
    if (apiKey === 'undefined') apiKey = null;

    if (!apiKey) {
        console.warn("API Key not found. Please ensure GEMINI_API_KEY is set in environment variables.");
    }
    
    return new GoogleGenAI({ apiKey: apiKey || '' });
}

// Helper function for robust JSON parsing
function safeJsonParse(jsonString: string): any {
    try {
        const trimmedString = jsonString.trim();
        if (!trimmedString) {
            throw new Error("Received empty response from the AI model.");
        }
        return JSON.parse(trimmedString);
    } catch (e: any) {
        console.error("Failed to parse JSON response:", e.message);
        console.error("Raw API response text:", jsonString);
        throw new Error(`Failed to parse the response from the AI model. Details: ${e.message}`);
    }
}

export async function generateQuiz(topic: string, difficulty: string, numQuestions: number): Promise<QuizQuestion[]> {
    const difficultyDescriptions: { [key: string]: string } = {
        'Interno': 'con un nivel de dificultad para un médico interno en sus primeras rotaciones. Las preguntas deben cubrir conceptos fundamentales, presentaciones clínicas típicas y tratamientos de primera línea.',
        'Temerario': 'con un nivel de dificultad para un médico interno avanzado o residente de primer año. Las preguntas deben ser más desafiantes, involucrando diagnósticos diferenciales complejos, conocimiento de guías de práctica clínica específicas o tratamientos de segunda línea.',
        'Dr. House': 'con un nivel de dificultad para un especialista o para un desafío diagnóstico tipo "Dr. House". Las preguntas deben ser sobre casos atípicos, enfermedades raras (zebras), detalles sutiles de la fisiopatología, o interacciones farmacológicas poco comunes.'
    };
    const difficultyPrompt = difficultyDescriptions[difficulty] || difficultyDescriptions['Interno'];
    const prompt = `Genera un cuestionario de ${numQuestions} preguntas de opción múltiple sobre "${topic}" para médicos internos, ${difficultyPrompt}. Cada pregunta debe tener 4 opciones. Una opción debe ser la correcta. Proporciona la respuesta correcta en texto y una retroalimentación concisa para cada pregunta, explicando por qué la respuesta es correcta.`;

    const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
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

    const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
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

export async function getAnamnesisFeedback(clinicalCase: ClinicalCase, history: any[], userQuestion: string): Promise<{ patientResponse: string, tutorFeedback: string }> {
    const prompt = `Eres un simulador de paciente y tutor médico. CASO CLÍNICO: ${JSON.stringify(clinicalCase)} HISTORIAL DE ANAMNESIS: ${JSON.stringify(history)} PREGUNTA DEL INTERNO: "${userQuestion}" TAREA: 1. Como PACIENTE, responde la pregunta de manera realista. 2. Como TUTOR, da una retroalimentación concisa sobre la pregunta del interno. Responde únicamente con un objeto JSON.`;
    
    const response = await getAi().models.generateContent({
        model: 'gemini-3.1-flash-lite-preview',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT, properties: {
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
    const prompt = `Basado en el siguiente caso clínico: ${JSON.stringify(clinicalCase)}, sugiere una lista de los estudios de laboratorio e imagen más pertinentes para llegar al diagnóstico. Responde con un objeto JSON que contenga dos arreglos: "suggestedLabs" y "suggestedImaging". Sé conciso y clínicamente relevante.`;
    const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
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
    const prompt = `Basado en el caso clínico: ${fullCaseContext}, genera resultados para los estudios: Labs [${requestedStudies.labs.join(', ')}], Imagen [${requestedStudies.imaging.join(', ')}]. Para laboratorios, proporciona una interpretación clínica y un arreglo 'components' con 'parameter', 'value', 'units', 'referenceRange', y 'isAbnormal'. Para imagen, proporciona 'findings' detallados.`;
    const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
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
    return safeJsonParse(response.text || '');
}

// FIX: Reverted to gemini-2.5-flash-image to avoid 403 PERMISSION_DENIED errors often seen with 3.1 preview models.
// Also improved the prompt to ensure realistic medical imagery (e.g., chest X-rays for pneumonia).
export async function generateImage(basePrompt: string, findings?: string): Promise<string> {
    const fullPrompt = findings
        ? `Genera una imagen médica diagnóstica (ej: radiografía, tomografía o fotografía clínica) de: ${basePrompt}. La imagen DEBE mostrar explícitamente los siguientes hallazgos patológicos: ${findings}. Estilo fotorrealista, alta resolución, anatomía humana correcta, sin texto ni etiquetas. Ideal para educación médica.`
        : `Genera una imagen médica o científica de alta calidad, estilo fotorrealista, representando: "${basePrompt}". Sin texto, etiquetas ni artefactos.`;

    const ai = getAi();
    
    // gemini-2.5-flash-image is the recommended default for image generation.
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
            parts: [{ text: fullPrompt }]
        },
        config: {
            imageConfig: {
                aspectRatio: "1:1"
            }
        },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
            return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
    }

    throw new Error("No se generó ninguna imagen en la respuesta.");
}

// FIX: Reverted to gemini-2.5-flash-image.
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

    Realiza un análisis clínico-educativo exhaustivo para un médico interno y proporciona lo siguiente en formato Markdown estricto. Utiliza los siguientes encabezados exactamente como se indican y en este orden:

    ### Diagnóstico Principal
    Establece el diagnóstico más probable de forma clara y concisa.

    ### Fisiopatología y Correlación Clínica
    Esta es la sección más importante para el aprendizaje. Explica de manera detallada la fisiopatología subyacente del diagnóstico principal. Después, correlaciona de forma explícita CADA UNO de los hallazgos clave (signos, síntomas, resultados de laboratorio e imagen) del caso clínico con la fisiopatología descrita. Por ejemplo: "La fiebre se debe a la liberación de citoquinas pro-inflamatorias como IL-1 y TNF-alfa en respuesta a...", "La leucocitosis con neutrofilia observada en la biometría hemática refleja la respuesta del sistema inmune a...". El objetivo es que el estudiante integre el porqué de cada manifestación.

    ### Plan de Manejo y Tratamiento
    Detalla el plan de manejo inicial y el tratamiento específico para el diagnóstico principal. Basa tus recomendaciones en Guías de Práctica Clínica (GPC) actualizadas y en la medicina basada en evidencia. Sé específico en cuanto a fármacos, dosis y medidas de soporte.

    ### Diagnósticos Diferenciales
    Al final, enumera al menos 2 diagnósticos diferenciales importantes que se consideraron. Para cada uno, explica brevemente por qué es menos probable que el diagnóstico principal en este caso específico.
    
    ### Fuentes de Información
    Al final de todo, busca y proporciona al menos 2 fuentes de alta calidad (Guías de Práctica Clínica, artículos de revisión de PubMed, UpToDate, etc.) que respalden el diagnóstico y manejo. Formatea cada fuente como: "- [Título del artículo o guía](URL directa)".`;

    const response = await getAi().models.generateContent({
        // FIX: Updated model to gemini-3.1-pro-preview for complex text tasks per guidelines.
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text || '';
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map(chunk => chunk.web)
        .filter((web): web is GroundingSource => web !== undefined && web.uri !== undefined && web.uri !== '') || [];
        
    return { text, sources };
}

export async function generateNoteGuide(topic: string): Promise<{ guide: string, template: string }> {
    const prompt = `Para un paciente con "${topic}", genera un objeto JSON con dos propiedades: "guide" (guía detallada en Markdown para redactar una nota SOAP) y "template" (plantilla de nota SOAP en texto plano, pre-llenada con ejemplos y placeholders claros).`;
    const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
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
    const prompt = `Proporciona una guía de referencia rápida sobre el manejo de "${topic}" para médicos internos. Basa tu respuesta en la información más actualizada posible, dando **prioridad absoluta a las Guías de Práctica Clínica (GPC) de México**. Si no encuentras información mexicana, utiliza guías internacionales reconocidas, **preferiblemente de Estados Unidos** (ej. AAFP, AHA, etc.). 
    
    Utiliza formato Markdown, sé conciso y directo al punto.

    Al final de la guía, incluye una sección titulada "### Fuentes" y lista las fuentes web que utilizaste con enlaces directos, formateadas como: "- [Título de la guía o artículo](URL)".`;
    
    const response = await getAi().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text || '';
    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map(chunk => chunk.web)
        .filter((web): web is GroundingSource => web !== undefined && web.uri !== undefined && web.uri !== '') || [];
        
    return { text, sources };
}

export function createChat(): Chat {
    return getAi().chats.create({
        model: 'gemini-3-flash-preview',
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
        content.forEach((base64Image, index) => {
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

    const response = await ai.models.generateContent({
        // gemini-3-flash is multimodal and handles long context well (up to 1M tokens)
        model: 'gemini-3-flash-preview',
        contents: {
            parts: parts
        },
        config: {
            systemInstruction: ARTICLE_ANALYSIS_SYSTEM_PROMPT,
        }
    });

    return response.text || '';
}