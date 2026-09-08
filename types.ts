
export interface QuizQuestion {
    question: string;
    options: string[];
    correctAnswer: string;
    feedback: string;
}

export interface VitalSigns {
    presionArterial: string;
    frecuenciaCardiaca: string;
    frecuenciaRespiratoria: string;
    temperatura: string;
    saturacionOxigeno: string;
}

export interface ClinicalCase {
    caseTitle: string;
    patientProfile: string;
    historyOfPresentIllness: string;
    vitalSigns: VitalSigns;
    physicalExam: string;
}

export interface AnamnesisTurn {
    question: string;
    patientResponse: string;
    tutorFeedback: string;
}

export interface LabResultComponent {
    parameter: string;
    value: string;
    units: string;
    referenceRange: string;
    isAbnormal: boolean;
}

export interface LabResult {
    study: string;
    interpretation: string;
    components: LabResultComponent[];
}

export interface ImagingResult {
    study: string;
    findings: string;
    imageUrl?: string;
}

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
}

export interface GroundingSource {
    uri: string;
    title: string;
}

export interface SuggestedSolutionOption {
    label: string;
    tipo: string;
    volumen: number;
    tiempo: string;
    via: string;
}

export interface SuggestedDrugOption {
    familia: string;
    farmaco: string;
    dosis: string;
    unidad: string;
    via: string;
    frecuencia: string;
    justificacionGPC?: string;
}

export interface TherapeuticPlanOptionsCache {
    dietasSugeridas: string[];
    solucionesSugeridas: SuggestedSolutionOption[];
    familiasMedicamentos: SuggestedDrugOption[];
    medidasSugeridas: string[];
}

export interface PrescribedSolution {
    id: string;
    tipo: string;
    volumen: number;
    tiempo: string;
    via: string;
}

export interface PrescribedMedication {
    id: string;
    familia?: string;
    nombre: string;
    dosis: string;
    unidad: string;
    via: string;
    frecuencia: string;
    justificacionGPC?: string;
}

export interface PrescribedDiet {
    id: string;
    nombre: string;
    via: string;
}

export interface PrescribedTherapeuticPlan {
    tipoDieta: string;
    dietas?: PrescribedDiet[];
    justificacionDieta: string;
    soluciones: PrescribedSolution[];
    medicamentos: PrescribedMedication[];
    medidasGenerales: string[];
    medidasAdicionalesEnfermeria: string;
}

export interface TherapeuticTutorFeedback {
    feedbackText: string;
    evaluatedAt: string;
}
