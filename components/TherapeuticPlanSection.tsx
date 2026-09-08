import React, { useState } from 'react';
import { marked } from 'marked';
import { 
    ClinicalCase, TherapeuticPlanOptionsCache, PrescribedTherapeuticPlan, 
    PrescribedSolution, PrescribedMedication, SuggestedDrugOption, SuggestedSolutionOption,
    TherapeuticTutorFeedback, PrescribedDiet
} from '../types';
import { validateTherapeuticPlanWithTutor } from '../services/geminiService';
import { searchHospitalDrugs, CatalogDrug } from '../services/hospitalDrugCatalog';


interface TherapeuticPlanSectionProps {
    clinicalCase: ClinicalCase;
    planOptionsCache: TherapeuticPlanOptionsCache | null;
    prescribedPlan: PrescribedTherapeuticPlan;
    onUpdatePlan: React.Dispatch<React.SetStateAction<PrescribedTherapeuticPlan>>;
    onPlanTransferredToSoap?: (soapText: string) => void;
}

export const COMMON_DIET_PRESETS: { category: string; options: string[] }[] = [
    {
        category: 'Ayuno y Reposo Digestivo',
        options: [
            'Ayuno total (NPO)',
            'Ayuno por taquipnea / riesgo de broncoaspiración',
            'Ayuno prequirúrgico / preparación a quirófano',
            'Ayuno por sangrado de tubo digestivo',
            'Ayuno por sospecha de abdomen agudo',
            'Ayuno por pancreatitis aguda',
            'Ayuno con sonda a derivación'
        ]
    },
    {
        category: 'Dietas Líquidas y Modificadas',
        options: [
            'Dieta de líquidos claros / estrictos',
            'Dieta de líquidos completos',
            'Líquidos orales a libre demanda / tolerancia',
            'Dieta blanda normocalórica baja en sodio',
            'Dieta blanda química (sin irritantes ni colecistoquinéticos)',
            'Dieta blanda mecánica / papilla (disfagia)',
            'Dieta astringente (antidiarreica)',
            'Dieta normal hospitalaria / completa'
        ]
    },
    {
        category: 'Dietas Terapéuticas Especiales',
        options: [
            'Dieta fraccionada para paciente diabético (1500-1800 kcal)',
            'Dieta hiposódica estricta (< 2 g Na/día) para cardiópata / HTA',
            'Dieta hipoproteica para insuficiencia renal / encefalopatía',
            'Dieta hiperproteica / hipercalórica',
            'Dieta baja en grasas (hepatobiliar / poscolecistitis)',
            'Dieta para pancreatitis (reinicio oral bajo en grasas)',
            'Dieta fraccionada en quintos'
        ]
    },
    {
        category: 'Enteral y Vías Especiales',
        options: [
            'Dieta enteral por sonda nasogástrica (SNG)',
            'Dieta enteral por sonda orogástrica (SOG) pediátrica',
            'Nutrición parenteral total (NPT)'
        ]
    },
    {
        category: 'Pediatría y Lactancia',
        options: [
            'Seno materno exclusivo (SME) a libre demanda',
            'Fórmula láctea de inicio / continuación',
            'Dieta papilla / ablactación para lactante'
        ]
    }
];

export const ALL_PRESET_DIETS = COMMON_DIET_PRESETS.flatMap(g => g.options);
export const COMMON_DIET_TYPES = ALL_PRESET_DIETS;

export const COMMON_DIET_ROUTES = [
    'Vía oral',
    'Sonda nasogástrica (SNG)',
    'Sonda orogástrica (SOG)',
    'Nutrición parenteral (NPT)',
    'N/A (Ayuno)'
];

const COMMON_SOLUTION_TYPES = [
    'Solución Hartmann',
    'Solución Fisiológica 0.9%',
    'Solución Mixta',
    'Solución Mixta (Glucosada 5% + Fisiológica 0.9%)',
    'Solución Glucosada 5%',
    'Solución Glucosada 10%',
    'Solución Salina 0.45%'
];

const COMMON_SOLUTION_TIMES = [
    'Para 24 horas',
    'Para 12 horas',
    'Para 8 horas',
    'Para 6 horas',
    'Carga en 1 hora',
    'Carga en 30 minutos'
];

const DOSE_UNITS = ['mg', 'g', 'mcg', 'UI', 'mL', 'gotas'];
const FREQUENCY_OPTIONS = [
    'Cada 24 h',
    'Cada 12 h',
    'Cada 8 h',
    'Cada 6 h',
    'Cada 4 h',
    'Dosis única',
    'PRN si temp > 38.0 °C',
    'PRN si dolor EVA > 4',
    'En infusión continua'
];
const ROUTE_OPTIONS = ['IV', 'VO', 'SC', 'IM', 'Inhalada', 'Sublingual', 'Tópica'];

export const COMMON_MEASURE_PRESETS: { category: string; options: string[] }[] = [
    {
        category: 'Gineco-Obstetricia y Embarazo',
        options: [
            'Decúbito lateral izquierdo para descompresión aortocava',
            'Monitorización intermitente/continua de foco fetal (FCF)',
            'Vigilancia estrecha de dinámica uterina y pérdidas transvaginales (líquido/sangrado)',
            'Reposo absoluto en cama con soporte pélvico',
            'Control horario de tensión arterial / protocolo de preeclampsia'
        ]
    },
    {
        category: 'Psiquiatría y Seguridad del Paciente',
        options: [
            'Sujeción gentil terapéutica en 4 puntos por agitación psicomotriz',
            'Vigilancia estrecha 1:1 permanente por enfermería (riesgo de agresión o fuga)',
            'Retiro de objetos punzocortantes, cinturones, cables y calzado del entorno',
            'Habitación individual con baja estimulación sensorial y lumínica',
            'Acompañamiento permanente por familiar o personal de seguridad'
        ]
    },
    {
        category: 'Geriatría y Prevención de Caídas',
        options: [
            'Barandales elevados bilateralmente de forma permanente',
            'Acompañamiento obligatorio por familiar permanente / cuidador responsable',
            'Protocolo de prevención de caídas (semáforo / pulsera de alto riesgo)',
            'Prevención de úlceras por presión: cambios posturales cada 2 horas y colchón de aire',
            'Asistencia total del personal para deambulación y transferencias',
            'Uso de calzado cerrado antiderrapante y timbre de llamado al alcance'
        ]
    },
    {
        category: 'Neurología, Vía Aérea y Neuroprotección',
        options: [
            'Posición Semifowler a 30° con cabeza alineada y cuello neutro (neuroprotección / PIC)',
            'Precauciones anti-broncoaspiración / sonda nasogástrica a derivación',
            'Protocolo de crisis convulsivas: cánula de Guedel y aspirador funcional a cabecera',
            'Valoración neurológica horaria con Escala de Coma de Glasgow y reflejo pupilar',
            'Aspiración gentil de secreciones de vía aérea PRN con técnica estéril'
        ]
    },
    {
        category: 'Cardiovascular y Monitorización Hemodinámica',
        options: [
            'Monitorización electrocardiográfica continua y oximetría de pulso',
            'Control estricto de líquidos y balance hídrico por turno',
            'Cuantificación de uresis horaria mediante sonda Foley cerrada (meta > 0.5 mL/kg/h)',
            'Curva de presión arterial y signos vitales cada 15 a 30 minutos',
            'Reposo absoluto en cama a 0-15° o Semifowler según tolerancia'
        ]
    },
    {
        category: 'Respiratorio y Oxigenoterapia',
        options: [
            'Oxigenoterapia por puntas nasales meta SpO2 ≥ 92% (88-92% en EPOC/hipercapnia)',
            'Posición Fowler a 45-90° para optimizar mecánica ventilatoria diafragmática',
            'Micronebulizaciones con broncodilatador y fisioterapia pulmonar asistida',
            'Ejercicios respiratorios con espirómetro de incentivo cada 2 horas'
        ]
    },
    {
        category: 'Pediatría y Neonatología',
        options: [
            'Posición prona supervisada o decúbito supino con cabecera a 30°',
            'Termorregulación continua en cuna térmica / incubadora',
            'Monitorización no invasiva cardiopulmonar continua con sensor pediátrico',
            'Acompañamiento continuo de la madre o tutor legal',
            'Cuantificación de uresis mediante pesado estricto de pañales'
        ]
    },
    {
        category: 'Metabólico, Quirúrgico y Cuidados Generales',
        options: [
            'Glucometría capilar por turno / preprandial (protocolo escala móvil)',
            'Aseo bucal con clorhexidina al 0.12% y baño de esponja en cama',
            'Curación y vigilancia estrecha de herida quirúrgica y accesos vasculares',
            'Ejercicios pasivos de extremidades y movilización temprana para profilaxis trombótica'
        ]
    }
];

export const ALL_PRESET_MEASURES = COMMON_MEASURE_PRESETS.flatMap(g => g.options);

export const TherapeuticPlanSection: React.FC<TherapeuticPlanSectionProps> = ({
    clinicalCase,
    planOptionsCache,
    prescribedPlan,
    onUpdatePlan,
    onPlanTransferredToSoap
}) => {
    const [isValidatingDieta, setIsValidatingDieta] = useState(false);
    const [tutorFeedbackDieta, setTutorFeedbackDieta] = useState<TherapeuticTutorFeedback | null>(null);
    const [isValidatingSoluciones, setIsValidatingSoluciones] = useState(false);
    const [tutorFeedbackSoluciones, setTutorFeedbackSoluciones] = useState<TherapeuticTutorFeedback | null>(null);
    const [isValidatingMedicamentos, setIsValidatingMedicamentos] = useState(false);
    const [tutorFeedbackMedicamentos, setTutorFeedbackMedicamentos] = useState<TherapeuticTutorFeedback | null>(null);
    const [isValidatingMedidas, setIsValidatingMedidas] = useState(false);
    const [tutorFeedbackMedidas, setTutorFeedbackMedidas] = useState<TherapeuticTutorFeedback | null>(null);

    const [copyStatus, setCopyStatus] = useState<string | null>(null);
    const [showSoapPreview, setShowSoapPreview] = useState(false);
    const [additionalNursingInput, setAdditionalNursingInput] = useState('');
    const [activeAutocompleteMedId, setActiveAutocompleteMedId] = useState<string | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

    // Helper to highlight matching text in drug autocomplete suggestions
    const highlightMatch = (text: string, query: string) => {
        const q = query.trim();
        if (!q) return text;
        const index = text.toLowerCase().indexOf(q.toLowerCase());
        if (index === -1) return text;
        const before = text.substring(0, index);
        const match = text.substring(index, index + q.length);
        const after = text.substring(index + q.length);
        return (
            <span>
                {before}
                <strong className="text-blue-600 dark:text-cyan-400 font-extrabold underline decoration-blue-400/50">
                    {match}
                </strong>
                {after}
            </span>
        );
    };

    // Fallback options if cache is still populating
    const dietOptions = planOptionsCache?.dietasSugeridas || COMMON_DIET_TYPES.slice(0, 4);
    const solutionSuggestions = planOptionsCache?.solucionesSugeridas || [];
    const drugSuggestions = planOptionsCache?.familiasMedicamentos || [];
    const measureSuggestions = planOptionsCache?.medidasSugeridas || [
        'Posición Semifowler a 30-45°',
        'Oxigenoterapia por puntas nasales meta SpO2 ≥ 92%',
        'Monitorización continua de signos vitales por turno',
        'Control de líquidos y balance hídrico estricto',
        'Cuantificación de uresis horaria',
        'Glucometría capilar por turno'
    ];

    // Helper to render formatted tutor feedback with marked
    const renderTutorFeedbackContent = (feedbackText: string) => (
        <div 
            className="text-xs text-slate-800 dark:text-slate-100 leading-relaxed pt-2 border-t border-emerald-200/70 dark:border-emerald-800/50 space-y-2 [&_p]:my-1.5 [&_strong]:text-emerald-950 dark:[&_strong]:text-emerald-200 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0.5"
            dangerouslySetInnerHTML={{ __html: marked.parse(feedbackText) }}
        />
    );

    // Helper to build case context string
    const buildCaseContext = () =>
        `Paciente: ${clinicalCase.patientProfile}. Padecimiento: ${clinicalCase.historyOfPresentIllness}. Signos Vitales: PA ${clinicalCase.vitalSigns.presionArterial}, FC ${clinicalCase.vitalSigns.frecuenciaCardiaca}, FR ${clinicalCase.vitalSigns.frecuenciaRespiratoria}, Temp ${clinicalCase.vitalSigns.temperatura}, SpO2 ${clinicalCase.vitalSigns.saturacionOxigeno}. Examen físico: ${clinicalCase.physicalExam}`;

    const handleValidateBlock = async (
        block: 'dieta' | 'soluciones' | 'medicamentos' | 'medidas',
        setValidating: (v: boolean) => void,
        setFeedback: (f: TherapeuticTutorFeedback | null) => void,
        overridePlan?: PrescribedTherapeuticPlan
    ) => {
        setValidating(true);
        try {
            const caseContext = buildCaseContext();
            const planToEvaluate = overridePlan || prescribedPlan;
            const feedbackText = await validateTherapeuticPlanWithTutor(caseContext, planToEvaluate, block);
            setFeedback({
                feedbackText,
                evaluatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } catch (err) {
            console.error(`Error al validar bloque ${block} con tutor:`, err);
        } finally {
            setValidating(false);
        }
    };

    const handleValidateDieta = () => handleValidateBlock('dieta', setIsValidatingDieta, setTutorFeedbackDieta);
    const handleValidateSoluciones = () => handleValidateBlock('soluciones', setIsValidatingSoluciones, setTutorFeedbackSoluciones);
    const handleValidateMedicamentos = () => handleValidateBlock('medicamentos', setIsValidatingMedicamentos, setTutorFeedbackMedicamentos);
    const handleValidateMedidas = () => handleValidateBlock('medidas', setIsValidatingMedidas, setTutorFeedbackMedidas);

    // Helper to get active diets array (supports both new array and legacy string)
    const currentDiets: PrescribedDiet[] = prescribedPlan.dietas || (prescribedPlan.tipoDieta ? [{
        id: 'diet-init',
        nombre: prescribedPlan.tipoDieta,
        via: prescribedPlan.tipoDieta.toLowerCase().includes('ayuno') ? 'N/A (Ayuno)' : 'Vía oral'
    }] : []);

    const syncDietsToPlan = (newDiets: PrescribedDiet[]) => {
        const combined = newDiets.map(d => d.nombre).join(' + ');
        onUpdatePlan(prev => ({
            ...prev,
            tipoDieta: combined,
            dietas: newDiets
        }));
    };

    const handleToggleSuggestedDiet = (dietName: string) => {
        const exists = currentDiets.some(d => d.nombre === dietName);
        if (exists) {
            syncDietsToPlan(currentDiets.filter(d => d.nombre !== dietName));
        } else {
            const newDiet: PrescribedDiet = {
                id: 'diet-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
                nombre: dietName,
                via: dietName.toLowerCase().includes('ayuno') ? 'N/A (Ayuno)' : 'Vía oral'
            };
            syncDietsToPlan([...currentDiets, newDiet]);
        }
    };

    const handleAddBlankDiet = () => {
        const newDiet: PrescribedDiet = {
            id: 'diet-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            nombre: 'Ayuno total (NPO)',
            via: 'N/A (Ayuno)'
        };
        syncDietsToPlan([...currentDiets, newDiet]);
    };

    const handleUpdateDiet = (id: string, field: keyof PrescribedDiet, value: string) => {
        const updated = currentDiets.map(d => {
            if (d.id !== id) return d;
            const item = { ...d, [field]: value };
            if (field === 'nombre' && value.toLowerCase().includes('ayuno')) {
                item.via = 'N/A (Ayuno)';
            }
            return item;
        });
        syncDietsToPlan(updated);
    };

    const handleRemoveDiet = (id: string) => {
        syncDietsToPlan(currentDiets.filter(d => d.id !== id));
    };

    // Handlers for Block 2: Soluciones (activación manual del tutor mediante botón)
    const handleAddSuggestedSolution = (suggestion: SuggestedSolutionOption) => {
        const newSolution: PrescribedSolution = {
            id: 'sol-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            tipo: suggestion.tipo,
            volumen: suggestion.volumen,
            tiempo: suggestion.tiempo,
            via: suggestion.via
        };
        // Sustituir o establecer como solución principal para evitar duplicidad de infusiones y sobrecarga hídrica accidental.
        // Si el interno necesita expresamente otra línea venosa, puede usar "+ Agregar otra solución".
        onUpdatePlan(prev => ({
            ...prev,
            soluciones: [newSolution]
        }));
    };

    const handleAddBlankSolution = () => {
        const newSolution: PrescribedSolution = {
            id: 'sol-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            tipo: 'Solución Hartmann',
            volumen: 1000,
            tiempo: 'Para 12 horas',
            via: 'IV periférica'
        };
        onUpdatePlan(prev => ({
            ...prev,
            soluciones: [...prev.soluciones, newSolution]
        }));
    };

    const handleUpdateSolution = (id: string, field: keyof PrescribedSolution, value: any) => {
        onUpdatePlan(prev => ({
            ...prev,
            soluciones: prev.soluciones.map(s => s.id === id ? { ...s, [field]: value } : s)
        }));
    };

    const handleRemoveSolution = (id: string) => {
        onUpdatePlan(prev => ({
            ...prev,
            soluciones: prev.soluciones.filter(s => s.id !== id)
        }));
    };

    // Handlers for Block 3: Medicamentos (activación manual del tutor mediante botón)
    const handleAddSuggestedDrug = (drug: SuggestedDrugOption) => {
        const newMed: PrescribedMedication = {
            id: 'med-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            familia: drug.familia,
            nombre: drug.farmaco,
            dosis: drug.dosis,
            unidad: drug.unidad,
            via: drug.via,
            frecuencia: drug.frecuencia,
            justificacionGPC: drug.justificacionGPC
        };
        onUpdatePlan(prev => ({
            ...prev,
            medicamentos: [...prev.medicamentos, newMed]
        }));
    };

    const handleAddBlankDrug = () => {
        const newMed: PrescribedMedication = {
            id: 'med-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            nombre: '',
            dosis: '500',
            unidad: 'mg',
            via: 'IV',
            frecuencia: 'Cada 8 h'
        };
        onUpdatePlan(prev => ({
            ...prev,
            medicamentos: [...prev.medicamentos, newMed]
        }));
    };

    const handleUpdateDrug = (id: string, field: keyof PrescribedMedication, value: string) => {
        onUpdatePlan(prev => ({
            ...prev,
            medicamentos: prev.medicamentos.map(m => m.id === id ? { ...m, [field]: value } : m)
        }));
    };

    const handleRemoveDrug = (id: string) => {
        onUpdatePlan(prev => ({
            ...prev,
            medicamentos: prev.medicamentos.filter(m => m.id !== id)
        }));
    };

    const handleSelectDrugAutocomplete = (medId: string, drug: CatalogDrug) => {
        onUpdatePlan(prev => ({
            ...prev,
            medicamentos: prev.medicamentos.map(m => {
                if (m.id !== medId) return m;
                return {
                    ...m,
                    nombre: drug.nombre,
                    familia: drug.familia,
                    dosis: drug.dosisDefault || m.dosis,
                    unidad: drug.unidadDefault || m.unidad,
                    via: drug.viaDefault || m.via,
                    frecuencia: drug.frecuenciaDefault || m.frecuencia,
                    justificacionGPC: drug.justificacionGPC || m.justificacionGPC
                };
            })
        }));
        setActiveAutocompleteMedId(null);
        setHighlightedIndex(0);
    };

    // Handlers for Block 4: Medidas Generales (activación manual del tutor mediante botón)
    const handleToggleMeasure = (measure: string) => {
        onUpdatePlan(prev => {
            const exists = prev.medidasGenerales.includes(measure);
            const updatedMedidas = exists 
                ? prev.medidasGenerales.filter(m => m !== measure)
                : [...prev.medidasGenerales, measure];
            return {
                ...prev,
                medidasGenerales: updatedMedidas
            };
        });
    };

    const handleAddBlankMeasure = () => {
        const defaultMeasure = 'Barandales elevados bilateralmente de forma permanente';
        onUpdatePlan(prev => ({
            ...prev,
            medidasGenerales: [...prev.medidasGenerales, defaultMeasure]
        }));
    };

    const handleUpdateMeasure = (index: number, value: string) => {
        onUpdatePlan(prev => {
            const next = [...prev.medidasGenerales];
            next[index] = value;
            return {
                ...prev,
                medidasGenerales: next
            };
        });
    };

    const handleRemoveMeasure = (index: number) => {
        onUpdatePlan(prev => ({
            ...prev,
            medidasGenerales: prev.medidasGenerales.filter((_, i) => i !== index)
        }));
    };


    const handleAddCustomNursingMeasure = () => {
        if (!additionalNursingInput.trim()) return;
        onUpdatePlan(prev => ({
            ...prev,
            medidasAdicionalesEnfermeria: prev.medidasAdicionalesEnfermeria 
                ? `${prev.medidasAdicionalesEnfermeria}; ${additionalNursingInput.trim()}`
                : additionalNursingInput.trim()
        }));
        setAdditionalNursingInput('');
    };


    // Format NOM-004 SOAP Plan String
    const buildNom004SoapPlanText = () => {
        const lines: string[] = [];
        lines.push('=== PLAN TERAPÉUTICO Y ÓRDENES HOSPITALARIAS (NOM-004-SSA3-2012) ===');
        lines.push(`Fecha y Hora: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        lines.push(`Servicio: Medicina Interna / Hospitalización`);
        lines.push('');
        
        // 1. Dieta
        lines.push('1. DIETA Y NUTRICIÓN:');
        if (currentDiets.length > 0) {
            currentDiets.forEach((d, i) => {
                lines.push(`   ${i + 1}. ${d.nombre} (${d.via})`);
            });
        } else {
            lines.push(`   - ${prescribedPlan.tipoDieta || 'Ayuno en valoración'}`);
        }
        if (prescribedPlan.justificacionDieta) {
            lines.push(`   - Justificación clínica: ${prescribedPlan.justificacionDieta}`);
        }
        lines.push('');

        // 2. Soluciones
        lines.push('2. SOLUCIONES Y APORTE HIDROELECTROLÍTICO:');
        if (prescribedPlan.soluciones.length > 0) {
            prescribedPlan.soluciones.forEach((sol, i) => {
                lines.push(`   ${i + 1}. ${sol.tipo} ${sol.volumen} mL por vía ${sol.via}, a infundir ${sol.tiempo}.`);
            });
        } else {
            lines.push('   - Vena permeable con solución salina / Mantener vía venosa.');
        }
        lines.push('');

        // 3. Medicamentos
        lines.push('3. ESQUEMA FARMACOLÓGICO (POSOLOGÍA GPC):');
        if (prescribedPlan.medicamentos.length > 0) {
            prescribedPlan.medicamentos.forEach((med, i) => {
                const fam = med.familia ? ` [${med.familia}]` : '';
                lines.push(`   ${i + 1}. ${med.nombre} ${med.dosis} ${med.unidad}, vía ${med.via}, ${med.frecuencia}.${fam}`);
            });
        } else {
            lines.push('   - Sin medicamentos adicionales en este momento.');
        }
        lines.push('');

        // 4. Medidas Generales
        lines.push('4. MEDIDAS GENERALES, MONITORIZACIÓN Y CUIDADOS DE ENFERMERÍA:');
        if (prescribedPlan.medidasGenerales.length > 0) {
            prescribedPlan.medidasGenerales.forEach(mg => {
                lines.push(`   - ${mg}`);
            });
        }
        if (prescribedPlan.medidasAdicionalesEnfermeria) {
            lines.push(`   - Cuidados adicionales: ${prescribedPlan.medidasAdicionalesEnfermeria}`);
        }
        lines.push('   - Reportar eventualidades y cambios en signos vitales al médico de guardia.');
        lines.push('======================================================================');

        return lines.join('\n');
    };

    const handleTransferToSoap = () => {
        const formattedText = buildNom004SoapPlanText();
        
        // Save in localStorage for SOAP Note Integration
        try {
            localStorage.setItem('sim_soap_plan_nom004', formattedText);
            localStorage.setItem('sim_soap_plan_timestamp', Date.now().toString());
        } catch (e) {
            console.warn("Could not save to localStorage", e);
        }

        // Copy to clipboard
        if (navigator.clipboard) {
            navigator.clipboard.writeText(formattedText)
                .then(() => {
                    setCopyStatus('¡Plan copiado al portapapeles en formato NOM-004!');
                    setTimeout(() => setCopyStatus(null), 3500);
                })
                .catch(() => {
                    setCopyStatus('Plan listo (ver vista previa abajo)');
                    setTimeout(() => setCopyStatus(null), 3500);
                });
        } else {
            setCopyStatus('Plan formateado listo');
        }

        if (onPlanTransferredToSoap) {
            onPlanTransferredToSoap(formattedText);
        }

        setShowSoapPreview(true);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 md:p-6 space-y-6 transition-all">
            {/* Header / Pedagogical Banner */}
            <div className="border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-cyan-300 flex items-center justify-center font-bold text-lg">
                            📋
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                Plan Terapéutico & Prescripción Hospitalaria Guiada
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Modelo formativo del Hospital General de Apatzingán • Andamiaje socrático MIP
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-cyan-300 border border-blue-200 dark:border-blue-800">
                        <span className="text-slate-400">Orden canónico:</span>
                        <span>Dieta ➔ Soluciones ➔ Fármacos ➔ Medidas</span>
                    </div>
                </div>
            </div>

            {/* BLOQUE 1: Tipo de Dieta y Nutrición */}
            <div className="space-y-3 bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                        Tipo de Dieta y Vía Nutricional
                    </label>
                    <button
                        type="button"
                        onClick={handleAddBlankDiet}
                        className="text-xs text-blue-600 dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1"
                    >
                        + Agregar dieta
                    </button>
                </div>

                {/* Diet Suggested Chips */}
                {dietOptions.length > 0 && (
                    <div className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Dietas sugeridas por el Tutor para el cuadro clínico:</span>
                        <div className="flex flex-wrap gap-1.5">
                            {dietOptions.map((diet, idx) => {
                                const isSelected = currentDiets.some(d => d.nombre === diet);
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleToggleSuggestedDiet(diet)}
                                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                                            isSelected
                                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700 shadow-2xs font-semibold ring-1 ring-emerald-400/50'
                                                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-cyan-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                                        }`}
                                    >
                                        {isSelected ? '✓ ' : '+ '}{diet}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Structured Diet Rows / Table */}
                {currentDiets.length === 0 ? (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            No hay dieta prescrita. Haz clic en una dieta sugerida o en "+ Agregar dieta".
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {currentDiets.map((d, index) => (
                            <div 
                                key={d.id} 
                                className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 items-center shadow-2xs"
                            >
                                <div className="sm:col-span-7">
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                        Dieta Predeterminada ({index + 1})
                                    </label>
                                    <select
                                        value={d.nombre}
                                        onChange={e => handleUpdateDiet(d.id, 'nombre', e.target.value)}
                                        className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200"
                                    >
                                        {!ALL_PRESET_DIETS.includes(d.nombre) && (
                                            <option value={d.nombre}>{d.nombre}</option>
                                        )}
                                        {COMMON_DIET_PRESETS.map(group => (
                                            <optgroup key={group.category} label={group.category}>
                                                {group.options.map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-4">
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                        Vía Nutricional
                                    </label>
                                    <select
                                        value={d.via || (d.nombre.toLowerCase().includes('ayuno') ? 'N/A (Ayuno)' : 'Vía oral')}
                                        onChange={e => handleUpdateDiet(d.id, 'via', e.target.value)}
                                        className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200"
                                    >
                                        {COMMON_DIET_ROUTES.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-1 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveDiet(d.id)}
                                        title="Eliminar dieta"
                                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Justificación clínica */}
                <div className="pt-1">
                    <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Justificación clínica breve (opcional):
                    </span>
                    <input
                        type="text"
                        value={prescribedPlan.justificacionDieta}
                        onChange={e => onUpdatePlan(prev => ({ ...prev, justificacionDieta: e.target.value }))}
                        placeholder="Ej. Taquipnea > 28 rpm / riesgo de broncoaspiración"
                        className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                </div>

                {/* Recuadro del Tutor Inmediato — Bloque Dieta */}
                <div className="mt-2 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <span className="text-base">👨‍🏫</span>
                            <span>Tutor Docente (Hospital General de Apatzingán)</span>
                            {tutorFeedbackDieta && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">({tutorFeedbackDieta.evaluatedAt})</span>}
                        </div>
                        <button
                            type="button"
                            onClick={handleValidateDieta}
                            disabled={isValidatingDieta || currentDiets.length === 0}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shadow-2xs"
                        >
                            {isValidatingDieta ? <><span className="animate-spin inline-block">⟳</span><span>Analizando...</span></> : <><span>🩺</span><span>{tutorFeedbackDieta ? 'Re-evaluar Dieta' : 'Consultar Tutor'}</span></>}
                        </button>
                    </div>
                    {isValidatingDieta ? (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 italic flex items-center gap-2 py-1">
                            <span className="animate-pulse">●</span> Analizando argumento y contra-argumento de la dieta...
                        </div>
                    ) : tutorFeedbackDieta ? (
                        renderTutorFeedbackContent(tutorFeedbackDieta.feedbackText)
                    ) : (
                        <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 italic">
                            Selecciona o agrega una dieta y pulsa <strong className="font-semibold text-emerald-800 dark:text-emerald-300">Consultar Tutor</strong> para recibir retroalimentación médica (argumentos y contra-argumentos).
                        </p>
                    )}
                </div>
            </div>


            {/* BLOQUE 2: Tipo de Solución y Aporte Hidroelectrolítico */}
            <div className="space-y-3 bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                        Esquema de Soluciones y Aporte Hidroelectrolítico
                    </label>
                    <button
                        type="button"
                        onClick={handleAddBlankSolution}
                        className="text-xs text-blue-600 dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1"
                    >
                        + Agregar otra solución
                    </button>
                </div>

                {/* Solution Suggested Chips */}
                {solutionSuggestions.length > 0 && (
                    <div className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Esquemas sugeridos por el Tutor para el estado hemodinámico:</span>
                        <div className="flex flex-wrap gap-1.5">
                            {solutionSuggestions.map((sol, idx) => {
                                const isSelected = prescribedPlan.soluciones.length === 1 &&
                                    prescribedPlan.soluciones[0].tipo === sol.tipo &&
                                    prescribedPlan.soluciones[0].volumen === sol.volumen &&
                                    prescribedPlan.soluciones[0].tiempo === sol.tiempo;
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleAddSuggestedSolution(sol)}
                                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                                            isSelected
                                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700 shadow-2xs font-semibold ring-1 ring-emerald-400/50'
                                                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-cyan-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                                        }`}
                                    >
                                        {isSelected ? '✓ ' : '+ '}{sol.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Structured Solution Rows / Table */}
                {prescribedPlan.soluciones.length === 0 ? (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            No hay soluciones prescritas. Haz clic en un esquema sugerido o en "+ Agregar otra solución".
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {prescribedPlan.soluciones.map((sol) => (
                            <div 
                                key={sol.id} 
                                className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 items-center shadow-2xs"
                            >
                                <div className="sm:col-span-4">
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Tipo de Solución</label>
                                    <select
                                        value={sol.tipo}
                                        onChange={e => handleUpdateSolution(sol.id, 'tipo', e.target.value)}
                                        className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded"
                                    >
                                        {COMMON_SOLUTION_TYPES.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Volumen (mL)</label>
                                    <input
                                        type="number"
                                        min="50"
                                        step="50"
                                        value={sol.volumen}
                                        onChange={e => handleUpdateSolution(sol.id, 'volumen', parseInt(e.target.value) || 0)}
                                        className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded"
                                    />
                                </div>

                                <div className="sm:col-span-3">
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Tiempo / Infusión</label>
                                    <select
                                        value={sol.tiempo}
                                        onChange={e => handleUpdateSolution(sol.id, 'tiempo', e.target.value)}
                                        className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded"
                                    >
                                        {COMMON_SOLUTION_TIMES.map(tm => (
                                            <option key={tm} value={tm}>{tm}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="sm:col-span-2">
                                    <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Vía</label>
                                    <select
                                        value={sol.via}
                                        onChange={e => handleUpdateSolution(sol.id, 'via', e.target.value)}
                                        className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded"
                                    >
                                        <option value="IV periférica">IV periférica</option>
                                        <option value="IV central">IV central</option>
                                    </select>
                                </div>

                                <div className="sm:col-span-1 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveSolution(sol.id)}
                                        title="Eliminar solución"
                                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {/* Recuadro del Tutor Inmediato — Bloque Soluciones */}
                <div className="mt-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <span className="text-base">👨‍🏫</span>
                            <span>Tutor Docente (Hospital General de Apatzingán)</span>
                            {tutorFeedbackSoluciones && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">({tutorFeedbackSoluciones.evaluatedAt})</span>}
                        </div>
                        <button
                            type="button"
                            onClick={handleValidateSoluciones}
                            disabled={isValidatingSoluciones || prescribedPlan.soluciones.length === 0}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shadow-2xs"
                        >
                            {isValidatingSoluciones ? <><span className="animate-spin inline-block">⟳</span><span>Analizando...</span></> : <><span>🩺</span><span>{tutorFeedbackSoluciones ? 'Re-evaluar Soluciones' : 'Consultar Tutor'}</span></>}
                        </button>
                    </div>
                    {isValidatingSoluciones ? (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 italic flex items-center gap-2 py-1">
                            <span className="animate-pulse">●</span> Analizando argumento y contra-argumento del esquema de soluciones...
                        </div>
                    ) : tutorFeedbackSoluciones ? (
                        renderTutorFeedbackContent(tutorFeedbackSoluciones.feedbackText)
                    ) : (
                        <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 italic">
                            Indica las soluciones deseadas y pulsa <strong className="font-semibold text-emerald-800 dark:text-emerald-300">Consultar Tutor</strong> para evaluar el aporte hidroelectrolítico y hemodinámico.
                        </p>
                    )}
                </div>
            </div>

            {/* BLOQUE 3: Esquema Farmacológico (Posología GPC) */}
            <div className="space-y-3 bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                        Esquema Farmacológico Hospitalario (Posología GPC)
                    </label>
                    <button
                        type="button"
                        onClick={handleAddBlankDrug}
                        className="text-xs bg-blue-600 text-white hover:bg-blue-700 font-semibold px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                    >
                        + Agregar Medicamento Manual
                    </button>
                </div>

                {/* Horizontal Bar with GPC Suggested Family Chips */}
                {drugSuggestions.length > 0 && (
                    <div className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            Grupos y Fármacos de 1ª y 2ª línea sugeridos según GPC mexicana:
                        </span>
                        <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1">
                            {drugSuggestions.map((drug, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleAddSuggestedDrug(drug)}
                                    title={`${drug.justificacionGPC || ''} (${drug.farmaco} ${drug.dosis}${drug.unidad} ${drug.via})`}
                                    className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-medium transition-all shadow-2xs flex items-center gap-1.5 text-left"
                                >
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">+</span>
                                    <span>{drug.familia}</span>
                                    <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">({drug.farmaco} {drug.dosis} {drug.unidad})</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Dynamic Drug Rows */}
                {prescribedPlan.medicamentos.length === 0 ? (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Sin fármacos indicados. Selecciona una familia sugerida arriba o agrega un medicamento manual.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {prescribedPlan.medicamentos.map((med) => (
                            <div 
                                key={med.id} 
                                className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2 shadow-2xs"
                            >
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                    {/* Fármaco con autocompletado inteligente */}
                                    <div className="sm:col-span-4 relative">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Fármaco</label>
                                            {med.familia && (
                                                <span className="text-[9px] bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-cyan-400 px-1.5 py-0.5 rounded">
                                                    {med.familia}
                                                </span>
                                            )}
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={med.nombre}
                                                onChange={e => {
                                                    handleUpdateDrug(med.id, 'nombre', e.target.value);
                                                    setActiveAutocompleteMedId(med.id);
                                                    setHighlightedIndex(0);
                                                }}
                                                onFocus={() => {
                                                    setActiveAutocompleteMedId(med.id);
                                                    setHighlightedIndex(0);
                                                }}
                                                onBlur={() => {
                                                    // Pequeño timeout para permitir que onMouseDown del botón de sugerencia se ejecute antes de cerrar
                                                    setTimeout(() => {
                                                        setActiveAutocompleteMedId(curr => curr === med.id ? null : curr);
                                                    }, 250);
                                                }}
                                                onKeyDown={e => {
                                                    const suggestions = searchHospitalDrugs(med.nombre, 8);
                                                    if (activeAutocompleteMedId === med.id && suggestions.length > 0) {
                                                        if (e.key === 'ArrowDown') {
                                                            e.preventDefault();
                                                            setHighlightedIndex(prev => (prev + 1) % suggestions.length);
                                                        } else if (e.key === 'ArrowUp') {
                                                            e.preventDefault();
                                                            setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
                                                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                                                            if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
                                                                e.preventDefault();
                                                                handleSelectDrugAutocomplete(med.id, suggestions[highlightedIndex]);
                                                            }
                                                        } else if (e.key === 'Escape') {
                                                            setActiveAutocompleteMedId(null);
                                                        }
                                                    }
                                                }}
                                                placeholder="Ej. Paracetamol, Ceftriaxona..."
                                                autoComplete="off"
                                                className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                                            />

                                            {/* Desplegable de Sugerencias de Fármacos */}
                                            {activeAutocompleteMedId === med.id && (() => {
                                                const suggestions = searchHospitalDrugs(med.nombre, 8);
                                                if (suggestions.length === 0) return null;
                                                return (
                                                    <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 ring-1 ring-black/5 animate-in fade-in duration-100">
                                                        <div className="px-2.5 py-1 text-[9px] bg-slate-100/80 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 flex items-center justify-between font-medium">
                                                            <span>Fármacos coincidentes ({suggestions.length})</span>
                                                            <span>Presiona <strong>↵ Enter</strong> o <strong>Tab</strong></span>
                                                        </div>
                                                        {suggestions.map((drug, sIdx) => {
                                                            const isHighlighted = sIdx === highlightedIndex;
                                                            return (
                                                                <button
                                                                    key={drug.nombre}
                                                                    type="button"
                                                                    onMouseDown={e => {
                                                                        e.preventDefault();
                                                                        handleSelectDrugAutocomplete(med.id, drug);
                                                                    }}
                                                                    onMouseEnter={() => setHighlightedIndex(sIdx)}
                                                                    className={`w-full text-left px-2.5 py-2 transition-colors flex flex-col gap-0.5 ${
                                                                        isHighlighted
                                                                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-cyan-200'
                                                                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-800 dark:text-slate-200'
                                                                    }`}
                                                                >
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <span className="text-xs font-bold">
                                                                            {highlightMatch(drug.nombre, med.nombre)}
                                                                        </span>
                                                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100/70 dark:bg-blue-900/60 text-blue-800 dark:text-cyan-300 font-semibold truncate max-w-[140px]">
                                                                            {drug.familia}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                                                                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                                                                            {drug.dosisDefault} {drug.unidadDefault}
                                                                        </span>
                                                                        <span>•</span>
                                                                        <span>{drug.viaDefault}</span>
                                                                        <span>•</span>
                                                                        <span>{drug.frecuenciaDefault}</span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Dosis y Unidad */}
                                    <div className="sm:col-span-3">
                                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Dosis y Unidad</label>
                                        <div className="flex gap-1">
                                            <input
                                                type="text"
                                                value={med.dosis}
                                                onChange={e => handleUpdateDrug(med.id, 'dosis', e.target.value)}
                                                className="w-20 text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-center"
                                            />
                                            <select
                                                value={med.unidad}
                                                onChange={e => handleUpdateDrug(med.id, 'unidad', e.target.value)}
                                                className="flex-1 text-xs px-1.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded"
                                            >
                                                {DOSE_UNITS.map(u => (
                                                    <option key={u} value={u}>{u}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Vía */}
                                    <div className="sm:col-span-2">
                                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Vía</label>
                                        <select
                                            value={med.via}
                                            onChange={e => handleUpdateDrug(med.id, 'via', e.target.value)}
                                            className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded"
                                        >
                                            {ROUTE_OPTIONS.map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Frecuencia */}
                                    <div className="sm:col-span-2">
                                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">Frecuencia / Intervalo</label>
                                        <select
                                            value={med.frecuencia}
                                            onChange={e => handleUpdateDrug(med.id, 'frecuencia', e.target.value)}
                                            className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded"
                                        >
                                            {FREQUENCY_OPTIONS.map(f => (
                                                <option key={f} value={f}>{f}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Eliminar */}
                                    <div className="sm:col-span-1 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveDrug(med.id)}
                                            title="Eliminar medicamento"
                                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Quick Dose Chips & GPC note */}
                                <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-1">
                                        <span className="text-slate-400">Dosis rápida:</span>
                                        {['250', '500', '1', '2', '40', '100'].map(d => (
                                            <button
                                                key={d}
                                                type="button"
                                                onClick={() => handleUpdateDrug(med.id, 'dosis', d)}
                                                className={`px-1.5 py-0.5 rounded border text-[10px] ${
                                                    med.dosis === d 
                                                        ? 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/60 dark:text-cyan-300' 
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                                                }`}
                                            >
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                    {med.justificacionGPC && (
                                        <span className="text-emerald-700 dark:text-emerald-400 italic text-[10px]">
                                            GPC: {med.justificacionGPC}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {/* Recuadro del Tutor Inmediato — Bloque Medicamentos */}
                <div className="mt-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <span className="text-base">👨‍🏫</span>
                            <span>Tutor Docente (Hospital General de Apatzingán)</span>
                            {tutorFeedbackMedicamentos && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">({tutorFeedbackMedicamentos.evaluatedAt})</span>}
                        </div>
                        <button
                            type="button"
                            onClick={handleValidateMedicamentos}
                            disabled={isValidatingMedicamentos || prescribedPlan.medicamentos.length === 0}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shadow-2xs"
                        >
                            {isValidatingMedicamentos ? <><span className="animate-spin inline-block">⟳</span><span>Analizando...</span></> : <><span>🩺</span><span>{tutorFeedbackMedicamentos ? 'Re-evaluar Fármacos' : 'Consultar Tutor'}</span></>}
                        </button>
                    </div>
                    {isValidatingMedicamentos ? (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 italic flex items-center gap-2 py-1">
                            <span className="animate-pulse">●</span> Analizando argumento de cobertura y contra-argumentos de posología GPC...
                        </div>
                    ) : tutorFeedbackMedicamentos ? (
                        renderTutorFeedbackContent(tutorFeedbackMedicamentos.feedbackText)
                    ) : (
                        <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 italic">
                            Añade los fármacos requeridos y pulsa <strong className="font-semibold text-emerald-800 dark:text-emerald-300">Consultar Tutor</strong> para analizar la cobertura completa y posología GPC.
                        </p>
                    )}
                </div>
            </div>

            {/* BLOQUE 4: Medidas Generales y Monitorización */}
            <div className="space-y-3 bg-slate-50/60 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <label className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 flex-wrap">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold">4</span>
                        <span>Medidas Generales, Posición y Monitorización</span>
                        <span className="text-[11px] font-normal text-blue-700 dark:text-cyan-300 bg-blue-100/70 dark:bg-blue-950/60 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800/80">
                            Multiopción (2 o más correctas)
                        </span>
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {prescribedPlan.medidasGenerales.length} seleccionada{prescribedPlan.medidasGenerales.length === 1 ? '' : 's'}
                        </span>
                        <button
                            type="button"
                            onClick={handleAddBlankMeasure}
                            className="text-xs text-blue-600 dark:text-cyan-400 hover:underline font-semibold flex items-center gap-1"
                        >
                            + Agregar medida
                        </button>
                    </div>
                </div>

                {/* Measure Suggested Chips */}
                {measureSuggestions.length > 0 && (
                    <div className="space-y-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400">Sugerencias rápidas del Tutor para el cuadro clínico:</span>
                        <div className="flex flex-wrap gap-1.5">
                            {measureSuggestions.map((measure, idx) => {
                                const isSelected = prescribedPlan.medidasGenerales.includes(measure);
                                return (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => handleToggleMeasure(measure)}
                                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                                            isSelected
                                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700 shadow-2xs font-semibold ring-1 ring-emerald-400/50'
                                                : 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-cyan-300 border-blue-200 dark:border-blue-800/60 hover:bg-blue-100 dark:hover:bg-blue-900/60'
                                        }`}
                                    >
                                        {isSelected ? '✓ ' : '+ '}{measure}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Structured Measures List */}
                {prescribedPlan.medidasGenerales.length === 0 ? (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            No hay medidas generales prescritas. Haz clic en una sugerencia rápida o en "+ Agregar medida".
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {prescribedPlan.medidasGenerales.map((measure, index) => {
                            const isPreset = ALL_PRESET_MEASURES.includes(measure);
                            return (
                                <div 
                                    key={index} 
                                    className="grid grid-cols-1 sm:grid-cols-12 gap-2 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 items-center shadow-2xs"
                                >
                                    <div className="sm:col-span-7">
                                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                            Medida Predeterminada ({index + 1})
                                        </label>
                                        <select
                                            value={isPreset ? measure : '__CUSTOM__'}
                                            onChange={e => {
                                                const val = e.target.value;
                                                if (val !== '__CUSTOM__') {
                                                    handleUpdateMeasure(index, val);
                                                }
                                            }}
                                            className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200"
                                        >
                                            {!isPreset && (
                                                <option value="__CUSTOM__">✏️ Personalizada (especificar a la derecha)</option>
                                            )}
                                            {COMMON_MEASURE_PRESETS.map(group => (
                                                <optgroup key={group.category} label={group.category}>
                                                    {group.options.map(opt => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="sm:col-span-4">
                                        <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                            Detalle / Especificación
                                        </label>
                                        <input
                                            type="text"
                                            value={measure}
                                            onChange={e => handleUpdateMeasure(index, e.target.value)}
                                            placeholder="Detalle o texto de la indicación..."
                                            className="w-full text-xs px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200"
                                        />
                                    </div>

                                    <div className="sm:col-span-1 flex justify-end items-center">
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveMeasure(index)}
                                            title="Eliminar medida"
                                            className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Additional Nursing Measures */}
                <div className="pt-2">
                    <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Cuidados específicos adicionales de enfermería:
                    </span>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={additionalNursingInput}
                            onChange={e => setAdditionalNursingInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAddCustomNursingMeasure()}
                            placeholder="Ej. Cuidados de sonda vesical, aspiración de secreciones PRN, vendaje elástico..."
                            className="flex-1 text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg"
                        />
                        <button
                            type="button"
                            onClick={handleAddCustomNursingMeasure}
                            className="text-xs px-3 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 font-semibold rounded-lg"
                        >
                            + Añadir
                        </button>
                    </div>
                    {prescribedPlan.medidasAdicionalesEnfermeria && (
                        <div className="mt-1.5 p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between">
                            <span><strong>Adicional: </strong>{prescribedPlan.medidasAdicionalesEnfermeria}</span>
                            <button
                                type="button"
                                onClick={() => onUpdatePlan(prev => ({ ...prev, medidasAdicionalesEnfermeria: '' }))}
                                className="text-[10px] text-red-500 hover:underline ml-2"
                            >
                                Limpiar
                            </button>
                        </div>
                    )}
                </div>
                {/* Recuadro del Tutor Inmediato — Bloque Medidas Generales */}
                <div className="mt-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                            <span className="text-base">👨‍🏫</span>
                            <span>Tutor Docente (Hospital General de Apatzingán)</span>
                            {tutorFeedbackMedidas && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">({tutorFeedbackMedidas.evaluatedAt})</span>}
                        </div>
                        <button
                            type="button"
                            onClick={handleValidateMedidas}
                            disabled={isValidatingMedidas || prescribedPlan.medidasGenerales.length === 0}
                            className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 shadow-2xs"
                        >
                            {isValidatingMedidas ? <><span className="animate-spin inline-block">⟳</span><span>Analizando...</span></> : <><span>🩺</span><span>{tutorFeedbackMedidas ? 'Re-evaluar Medidas' : 'Consultar Tutor'}</span></>}
                        </button>
                    </div>
                    {isValidatingMedidas ? (
                        <div className="text-xs text-emerald-700 dark:text-emerald-400 italic flex items-center gap-2 py-1">
                            <span className="animate-pulse">●</span> Analizando argumento fisiológico y contra-argumentos de monitorización...
                        </div>
                    ) : tutorFeedbackMedidas ? (
                        renderTutorFeedbackContent(tutorFeedbackMedidas.feedbackText)
                    ) : (
                        <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 italic">
                            Selecciona todas las medidas pertinentes (multiopción: 2 o más) y pulsa <strong className="font-semibold text-emerald-800 dark:text-emerald-300">Consultar Tutor</strong> para evaluar el paquete integral de soporte.
                        </p>
                    )}
                </div>
            </div>

            {/* Action Bar: Transfer to SOAP Note */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                    type="button"
                    onClick={handleTransferToSoap}
                    className="w-full bg-blue-50 hover:bg-blue-100 text-blue-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-cyan-300 font-semibold py-3 px-4 rounded-xl border border-blue-200 dark:border-slate-700 transition-all flex items-center justify-center gap-2 shadow-2xs"
                >
                    <span>📋</span>
                    <span>Trasladar al Plan (P) de la Nota Médica (NOM-004)</span>
                </button>
            </div>

            {/* Copy / Transfer Notification Toast */}
            {copyStatus && (
                <div className="p-3 bg-blue-100 dark:bg-blue-950/80 border border-blue-300 dark:border-blue-800 rounded-lg text-blue-900 dark:text-cyan-200 text-xs font-semibold flex items-center gap-2 animate-fade-in">
                    <span>✓</span>
                    <span>{copyStatus}</span>
                </div>
            )}

            {/* NOM-004 SOAP Note Preview Modal / Collapse */}
            {showSoapPreview && (
                <div className="mt-4 p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-bold text-cyan-400">
                                📋 Vista Previa: Plan de la Nota Médica (NOM-004)
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(buildNom004SoapPlanText());
                                    setCopyStatus('¡Copiado de nuevo al portapapeles!');
                                    setTimeout(() => setCopyStatus(null), 2500);
                                }}
                                className="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-2.5 py-1 rounded"
                            >
                                Copiar Texto
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowSoapPreview(false)}
                                className="text-xs text-slate-400 hover:text-white px-1.5 py-1"
                            >
                                ✕ Cerrar
                            </button>
                        </div>
                    </div>
                    <pre className="text-xs font-mono bg-slate-950 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed text-slate-300 border border-slate-800">
                        {buildNom004SoapPlanText()}
                    </pre>
                </div>
            )}
        </div>
    );
};

export default TherapeuticPlanSection;
