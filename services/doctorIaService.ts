import { generateContentWithFallback, safeJsonParse } from './geminiService';
import { BoosterClinicoResult } from '../types';

/**
 * Optimiza la duda médica formulada por un Médico Interno de Pregrado (MIP),
 * elevándola a una consulta técnica con rigor semiológico, estructura de pase de visita
 * y apego a Guías de Práctica Clínica (GPC).
 */
export async function optimizarPreguntaClinica(preguntaUsuario: string): Promise<BoosterClinicoResult> {
    const textoLimpio = preguntaUsuario.trim();
    if (!textoLimpio) {
        throw new Error('La pregunta no puede estar vacía.');
    }

    const prompt = `Actúa como médico adscrito y docente clínico del Hospital General de Apatzingán.
Tu labor es tomar la duda médica formulada por un médico interno de pregrado (MIP), frecuentemente escrita con prisa, lenguaje coloquial, telegráfico o sin terminología técnica, y elevarla a una formulación clínica profesional sin alterar la intención original.

Entrada del interno: "${textoLimpio}"

Instrucciones pedagógicas:
1. No regañes ni califiques la redacción.
2. Reformula la duda integrando:
   - Términos semiológicos y fisiopatológicos formales (ej. disnea en vez de falta de aire, emesis en vez de vómito, síndrome febril en vez de calentura, alacranismo en vez de picadura de alacrán).
   - Estructura útil para entrega de guardia, interconsulta o pase de visita (mención de grupo etario o contexto, abordaje diagnóstico o terapéutico escalonado y apego a Guías de Práctica Clínica / GPC).
3. Identifica la "perla" terminológica: el contraste clave entre el término común y el técnico (ej. "calentura ➔ síndrome febril").

Devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura, sin texto adicional ni bloques markdown:
{
  "preguntaOptimizada": "Texto completo de la pregunta formulada con rigor clínico",
  "perla": "Contraste terminológico conciso"
}`;

    const response = await generateContentWithFallback({
        contents: prompt,
        modulo: 'doctoria',
        config: {
            maxOutputTokens: 1024,
            responseMimeType: 'application/json',
            temperature: 0.2
        }
    });

    const parsed = safeJsonParse(response.text || '');

    return {
        preguntaOptimizada: (parsed.preguntaOptimizada || textoLimpio).trim(),
        perla: (parsed.perla || 'Optimización terminológica clínica').trim()
    };
}
