import { GoogleGenAI, Type, Chat } from "@google/genai";
import { QuizQuestion, ClinicalCase, LabResult, ImagingResult, GroundingSource } from '../types';

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

export async function generateQuiz(topic: string, difficulty: string, numQuestions: number): Promise<QuizQuestion[]> {
    const difficultyDescriptions: { [key: string]: string } = {
        'Interno': 'con un nivel de dificultad para un médico interno en sus primeras rotaciones. Las preguntas deben cubrir conceptos fundamentales, presentaciones clínicas típicas y tratamientos de primera línea.',
        'Temerario': 'con un nivel de dificultad para un médico interno avanzado o residente de primer año. Las preguntas deben ser más desafiantes, involucrando diagnósticos diferenciales complejos, conocimiento de guías de práctica clínica específicas o tratamientos de segunda línea.',
        'Dr. House': 'con un nivel de dificultad para un especialista o para un desafío diagnóstico tipo "Dr. House". Las preguntas deben ser sobre casos atípicos, enfermedades raras (zebras), detalles sutiles de la fisiopatología, o interacciones farmacológicas poco comunes.'
    };
    const difficultyPrompt = difficultyDescriptions[difficulty] || difficultyDescriptions['Interno'];
    const prompt = `Genera un cuestionario de ${numQuestions} preguntas de opción múltiple sobre "${topic}" para médicos internos, ${difficultyPrompt}. Cada pregunta debe tener 4 opciones. Una opción debe ser la correcta. Proporciona la respuesta correcta en texto y una retroalimentación concisa para cada pregunta, explicando por qué la respuesta es correcta.`;

    const response = await getAi().models.generateContent({
        model: 'gemini-3.7-flash',
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
        model: 'gemini-3.7-flash',
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

  const response = await getAi().models.generateContent({
    model: 'gemini-3.7-flash',
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
    const prompt = `Basado en el siguiente caso clínico: ${JSON.stringify(clinicalCase)}, sugiere una lista de los estudios de laboratorio e imagen más pertinentes para llegar al diagnóstico. Responde con un objeto JSON que contenga dos arreglos: "suggestedLabs" y "suggestedImaging". Sé conciso y clínicamente relevante.`;
    const response = await getAi().models.generateContent({
        model: 'gemini-3.7-flash',
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

    const response = await getAi().models.generateContent({
        model: 'gemini-3.7-flash',
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

export async function generateImage(basePrompt: string, findings?: string): Promise<string> {
    const fullPrompt = findings
        ? `Genera una imagen médica diagnóstica (ej: radiografía, tomografía o fotografía clínica) de: ${basePrompt}. La imagen DEBE mostrar explícitamente los siguientes hallazgos patológicos: ${findings}. Estilo fotorrealista, alta resolución, anatomía humana correcta, sin texto ni etiquetas. Ideal para educación médica.`
        : `Genera una imagen médica o científica de alta calidad, estilo fotorrealista, representando: "${basePrompt}". Sin texto, etiquetas ni artefactos.`;

    const ai = getAi();
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

    const response = await getAi().models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text || '';
    const rawSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map(chunk => chunk.web)
        .filter((web): web is GroundingSource => Boolean(web && web.uri && web.uri.trim() !== '')) || [];
        
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
    const response = await getAi().models.generateContent({
        model: 'gemini-3.7-flash',
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
    
    const response = await getAi().models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
            tools: [{ googleSearch: {} }]
        }
    });

    const text = response.text || '';
    const rawSources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
        ?.map(chunk => chunk.web)
        .filter((web): web is GroundingSource => Boolean(web && web.uri && web.uri.trim() !== '')) || [];
        
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

    const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: {
            parts: parts
        },
        config: {
            systemInstruction: ARTICLE_ANALYSIS_SYSTEM_PROMPT,
        }
    });

    return response.text || '';
}