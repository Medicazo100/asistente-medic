import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { 
    generateClinicalCase, getAnamnesisFeedback, getSuggestedStudies, 
    generateStudyResults, generateImage, getFinalDiagnosis,
    prefetchTherapeuticPlanOptions
} from '../services/geminiService';
import { 
    ClinicalCase, AnamnesisTurn, LabResult, ImagingResult, GroundingSource,
    TherapeuticPlanOptionsCache, PrescribedTherapeuticPlan, SimulationLibraryPayload, StudyLibraryRecord
} from '../types';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import TherapeuticPlanSection from './TherapeuticPlanSection';
import useLocalStorage from '../hooks/useLocalStorage';
import { getInternetMedicalImageUrl, getInternetFallbackImage } from '../services/medicalImageRenderer';
import {
    getStudyRecordById,
    createSimulationRecordId,
    normalizeStudyTopic,
    saveStudyRecord,
} from '../services/studyLibrary';


const getLinkText = (source: GroundingSource) => {
    if (source.title && source.title.trim() !== '') return source.title;
    try {
        return new URL(source.uri).hostname;
    } catch {
        return source.uri; // Fallback if URL is invalid
    }
};

const getSourceDomain = (uri: string) => {
    try {
        const url = new URL(uri);
        const host = url.hostname.replace(/^www\./, '');
        if (uri.includes('site:gob.mx/cenetec') || host.includes('cenetec') || host.includes('gob.mx')) {
            return 'CENETEC / Salud México (GPC)';
        }
        if (host.includes('pubmed.ncbi.nlm.nih.gov') || host.includes('ncbi.nlm.nih.gov')) {
            return 'PubMed / NIH (EE. UU.)';
        }
        if (host.includes('scielo.org') || host.includes('imss.gob.mx')) {
            return 'SciELO / IMSS (Iberoamérica)';
        }
        if (host.includes('uptodate.com')) {
            return 'UpToDate (Decisión Clínica MBE)';
        }
        if (host.includes('cochranelibrary.com')) {
            return 'Cochrane Library (MBE)';
        }
        if (host.includes('kdigo.org')) {
            return 'KDIGO (Nefrología)';
        }
        if (host.includes('ahajournals.org') || host.includes('escardio.org')) {
            return 'AHA / ACC (Cardiología)';
        }
        if (host.includes('diabetesjournals.org')) {
            return 'ADA (Endocrinología/Diabetes)';
        }
        if (host.includes('atsjournals.org')) {
            return 'ATS / ERS (Neumología)';
        }
        if (host.includes('idsociety.org')) {
            return 'IDSA (Infectología)';
        }
        if (host.includes('aan.com')) {
            return 'AAN (Neurología)';
        }
        if (host.includes('gastro.org')) {
            return 'AGA (Gastroenterología)';
        }
        if (host.includes('nejm.org')) {
            return 'New England Journal of Medicine';
        }
        if (host.includes('thelancet.com')) {
            return 'The Lancet';
        }
        if (host.includes('jamanetwork.com')) {
            return 'JAMA Network';
        }
        return host;
    } catch {
        return 'Evidencia médica';
    }
};

const MedicalSimulator: React.FC = () => {
    // Persistent State for Automatic Restoration
    const [topic, setTopic] = useLocalStorage<string>('sim_topic', '');
    const [step, setStep] = useLocalStorage<number>('sim_step', 0);
    const [difficulty, setDifficulty] = useLocalStorage<string>('sim_difficulty', 'Interno');
    const [clinicalCase, setClinicalCase] = useLocalStorage<ClinicalCase | null>('sim_clinicalCase', null);
    const [anamnesisHistory, setAnamnesisHistory] = useLocalStorage<AnamnesisTurn[]>('sim_anamnesisHistory', []);
    const [labResults, setLabResults] = useLocalStorage<LabResult[]>('sim_labResults', []);
    const [imagingResults, setImagingResults] = useLocalStorage<ImagingResult[]>('sim_imagingResults', []);
    const [finalDiagnosis, setFinalDiagnosis] = useLocalStorage<{text: string, sources: GroundingSource[]} | null>('sim_finalDiagnosis', null);
    
    // Complex objects that don't need strict persistence or are derived
    const [selectedStudies, setSelectedStudies] = useLocalStorage<{ labs: string[], imaging: string[] }>('sim_selectedStudies', { labs: [], imaging: [] });
    const [allAvailableStudies, setAllAvailableStudies] = useLocalStorage<{ labs: string[], imaging: string[] }>('sim_availableStudies', { labs: [], imaging: [] });

    // Dynamic Preloading Buffers (100% dinámico por cada caso clínico generado)
    const [dynamicLabsBuffer, setDynamicLabsBuffer] = useLocalStorage<LabResult[]>('sim_dynLabsBuffer', []);
    const [dynamicImagingBuffer, setDynamicImagingBuffer] = useLocalStorage<ImagingResult[]>('sim_dynImagingBuffer', []);

    // Final Diagnosis Preloading Buffer & Status
    const [preloadedDiagnosis, setPreloadedDiagnosis] = useLocalStorage<{text: string, sources: GroundingSource[]} | null>('sim_preloadedDiagnosis', null);
    const [isPrefetchingDiagnosis, setIsPrefetchingDiagnosis] = useState(false);

    // Plan Terapéutico Preloading Buffer & Prescribed Plan State
    const [planOptionsCache, setPlanOptionsCache] = useLocalStorage<TherapeuticPlanOptionsCache | null>('sim_planOptionsCache', null);
    const [prescribedPlan, setPrescribedPlan] = useLocalStorage<PrescribedTherapeuticPlan>('sim_prescribedPlan', {
        tipoDieta: '',
        justificacionDieta: '',
        soluciones: [],
        medicamentos: [],
        medidasGenerales: [],
        medidasAdicionalesEnfermeria: ''
    });

    // Transient State (UI only)
    const [isLoading, setIsLoading] = useState(false);
    const [isBufferingStudies, setIsBufferingStudies] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userQuestion, setUserQuestion] = useState('');
    const [customLab, setCustomLab] = useState('');
    const [customImaging, setCustomImaging] = useState('');
    const [loadingStudies, setLoadingStudies] = useState(new Set<string>());
    const [showTherapeuticPlan, setShowTherapeuticPlan] = useLocalStorage<boolean>('sim_showTherapeuticPlan', false);
    const [useDirectCatalogImages, setUseDirectCatalogImages] = useLocalStorage<boolean>('aiclinic_use_direct_catalog_images', true);


    const anamnesisEndRef = useRef<HTMLDivElement>(null);
    const resultsEndRef = useRef<HTMLDivElement>(null);
    const backgroundPipelinePromiseRef = useRef<Promise<{ labs: LabResult[], imaging: ImagingResult[] }> | null>(null);
    const prefetchingDiagnosisPromiseRef = useRef<Promise<{text: string, sources: GroundingSource[]}> | null>(null);
    const planPrefetchPromiseRef = useRef<Promise<TherapeuticPlanOptionsCache> | null>(null);

    useEffect(() => {
        const restoreSavedSimulation = (event: Event) => {
            const record = (event as CustomEvent<StudyLibraryRecord<SimulationLibraryPayload>>).detail;
            const snapshot = record?.payload;
            if (!snapshot?.clinicalCase) return;

            backgroundPipelinePromiseRef.current = null;
            prefetchingDiagnosisPromiseRef.current = null;
            planPrefetchPromiseRef.current = null;
            setTopic(snapshot.topic);
            setDifficulty(snapshot.difficulty);
            setClinicalCase(snapshot.clinicalCase);
            setStep(1);

            // Nueva sesión pedagógica: no se arrastra la anamnesis ni las selecciones del estudiante anterior.
            setAnamnesisHistory([]);
            setSelectedStudies({ labs: [], imaging: [] });
            setLabResults([]);
            setImagingResults([]);
            setFinalDiagnosis(null);
            setShowTherapeuticPlan(false);
            setPrescribedPlan({
                tipoDieta: '',
                justificacionDieta: '',
                soluciones: [],
                medicamentos: [],
                medidasGenerales: [],
                medidasAdicionalesEnfermeria: ''
            });

            // Los recursos precargados quedan disponibles internamente, no visibles todavía.
            setAllAvailableStudies(snapshot.allAvailableStudies || { labs: [], imaging: [] });
            setDynamicLabsBuffer(snapshot.dynamicLabsBuffer || []);
            setDynamicImagingBuffer(snapshot.dynamicImagingBuffer || []);
            setPreloadedDiagnosis(snapshot.preloadedDiagnosis || null);
            setPlanOptionsCache(snapshot.planOptionsCache || null);
            setIsBufferingStudies(false);
            setIsPrefetchingDiagnosis(false);
            setIsLoading(false);
            setLoadingStudies(new Set());
            setError(null);
            setUserQuestion('');
        };

        window.addEventListener('aiclinic:restore-simulation', restoreSavedSimulation);

        const checkPendingSimulation = () => {
            try {
                const pending = sessionStorage.getItem('aiclinic:pending-simulation');
                if (pending) {
                    sessionStorage.removeItem('aiclinic:pending-simulation');
                    restoreSavedSimulation(new CustomEvent('restore', { detail: JSON.parse(pending) }));
                }
            } catch (err) {
                console.warn('Error al restaurar simulación pendiente:', err);
            }
        };

        checkPendingSimulation();
        window.addEventListener('focus', checkPendingSimulation);

        return () => {
            window.removeEventListener('aiclinic:restore-simulation', restoreSavedSimulation);
            window.removeEventListener('focus', checkPendingSimulation);
        };
    }, []);

    useEffect(() => {
        if (!clinicalCase || step === 0) return;

        const effectiveTopic = topic || clinicalCase.caseTitle;
        const recordId = createSimulationRecordId(effectiveTopic, clinicalCase);
        const payload: SimulationLibraryPayload = {
            topic: effectiveTopic,
            difficulty,
            clinicalCase,
            allAvailableStudies,
            dynamicLabsBuffer,
            dynamicImagingBuffer,
            preloadedDiagnosis,
            planOptionsCache,
        };

        void (async () => {
            const existing = await getStudyRecordById<SimulationLibraryPayload>(recordId);
            const now = new Date().toISOString();
            await saveStudyRecord({
                id: recordId,
                kind: 'simulacion',
                title: clinicalCase.caseTitle,
                topic: effectiveTopic,
                topicKey: normalizeStudyTopic(effectiveTopic),
                payload,
                createdAt: existing?.createdAt || now,
                lastViewedAt: existing?.lastViewedAt || now,
                viewCount: existing?.viewCount || 1,
                viewHistory: existing?.viewHistory || [now],
                isFavorite: existing?.isFavorite || false,
                version: 1,
            });
        })();
    }, [allAvailableStudies, clinicalCase, difficulty, dynamicImagingBuffer, dynamicLabsBuffer, planOptionsCache, preloadedDiagnosis, step, topic]);

    const startBackgroundPlanPrefetch = (caseData: ClinicalCase, currentTopic?: string) => {
        const promise = (async () => {
            try {
                const options = await prefetchTherapeuticPlanOptions(caseData, currentTopic);
                setPlanOptionsCache(options);
                return options;
            } catch (err) {
                console.error("Error en la precarga del plan terapéutico en segundo plano:", err);
                throw err;
            }
        })();
        planPrefetchPromiseRef.current = promise;
        return promise;
    };

    useEffect(() => {
        if (labResults.length > 0 || imagingResults.length > 0) {
             setTimeout(() => resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }, [labResults, imagingResults]);

    // Función para orquestar la generación dinámica en segundo plano (Fases A, B y C)
    const startBackgroundStudyPipeline = (caseData: ClinicalCase) => {
        setIsBufferingStudies(true);

        const pipelinePromise = (async () => {
            try {
                // Fase A: Obtener sugerencias de estudios específicas para este caso clínico único
                const suggestions = await getSuggestedStudies(caseData);
                const suggestedLabs = suggestions.suggestedLabs || [];
                const suggestedImaging = suggestions.suggestedImaging || [];
                
                setAllAvailableStudies({
                    labs: suggestedLabs,
                    imaging: suggestedImaging
                });

                // Fase B: Disparar inmediatamente la generación de resultados de estudios en segundo plano
                const caseContext = `Caso: ${caseData.caseTitle}. Paciente: ${caseData.patientProfile}. Padecimiento: ${caseData.historyOfPresentIllness}. Signos Vitales: ${JSON.stringify(caseData.vitalSigns)}. Examen Físico: ${caseData.physicalExam}`;
                const studyResults = await generateStudyResults(caseContext, {
                    labs: suggestedLabs,
                    imaging: suggestedImaging
                }, useDirectCatalogImages);

                // Fase C: Guardar los resultados generados dinámicamente en los buffers
                if (studyResults.labs && studyResults.labs.length > 0) {
                    setDynamicLabsBuffer(prev => {
                        const existingNames = new Set(prev.map(l => l.study.toLowerCase().trim()));
                        const filteredNew = studyResults.labs.filter(l => !existingNames.has(l.study.toLowerCase().trim()));
                        return [...prev, ...filteredNew];
                    });
                }

                if (studyResults.imaging && studyResults.imaging.length > 0) {
                    setDynamicImagingBuffer(prev => {
                        const existingNames = new Set(prev.map(i => i.study.toLowerCase().trim()));
                        const filteredNew = studyResults.imaging.filter(i => !existingNames.has(i.study.toLowerCase().trim()));
                        return [...prev, ...filteredNew];
                    });
                }

                return studyResults;
            } catch (err) {
                console.error("Error en la canalización en segundo plano de estudios:", err);
                throw err;
            } finally {
                setIsBufferingStudies(false);
            }
        })();

        backgroundPipelinePromiseRef.current = pipelinePromise;
        return pipelinePromise;
    };

    // Precarga automática en segundo plano si se restaura el estado en el paso 1 o 2 sin buffers
    useEffect(() => {
        if (
            (step === 1 || step === 2) && 
            clinicalCase && 
            dynamicLabsBuffer.length === 0 && 
            dynamicImagingBuffer.length === 0 && 
            !backgroundPipelinePromiseRef.current
        ) {
            startBackgroundStudyPipeline(clinicalCase);
        }

        if (
            (step === 1 || step === 2) &&
            clinicalCase &&
            !planOptionsCache &&
            !planPrefetchPromiseRef.current
        ) {
            startBackgroundPlanPrefetch(clinicalCase, topic);
        }
    }, [step, clinicalCase, dynamicLabsBuffer.length, dynamicImagingBuffer.length, planOptionsCache, topic]);

    const getFullCaseSummaryForDiagnosis = () => {
        if (!clinicalCase) return '';
        const vitalSignsLabels: {[key: string]: string} = { presionArterial: 'Presión Arterial', frecuenciaCardiaca: 'Frecuencia Cardiaca', frecuenciaRespiratoria: 'Frecuencia Respiratoria', temperatura: 'Temperatura', saturacionOxigeno: 'Saturación de Oxígeno' };
        let summary = `**CASO CLÍNICO INICIAL**\n- Título: ${clinicalCase.caseTitle}\n- Perfil: ${clinicalCase.patientProfile}\n- Padecimiento: ${clinicalCase.historyOfPresentIllness}\n- Signos Vitales:\n${Object.entries(clinicalCase.vitalSigns).map(([k, v]) => `  - ${vitalSignsLabels[k] || k}: ${v}`).join('\n')}\n- Examen Físico: ${clinicalCase.physicalExam}\n\n`;
        summary += `**ANAMNESIS DIRIGIDA**\n${anamnesisHistory.length > 0 ? anamnesisHistory.map(t => `- Médico: ${t.question}\n- Paciente: ${t.patientResponse}\n`).join('\n') : 'No se realizó anamnesis adicional.\n'}\n`;
        summary += `**RESULTADOS DE ESTUDIOS**\nLaboratorios:\n${labResults.length > 0 ? labResults.map(l => `- ${l.study}: ${l.interpretation}\n`).join('') : 'No se solicitaron.\n'}\nImagen:\n${imagingResults.length > 0 ? imagingResults.map(i => `- ${i.study}: ${i.findings}\n`).join('') : 'No se solicitaron.\n'}`;
        return summary;
    };

    // DISPARADOR ASÍNCRONO EN SEGUNDO PLANO: Precarga del Diagnóstico Final al tener estudios disponibles en step 2
    useEffect(() => {
        const shouldPrefetch = 
            step === 2 && 
            Boolean(clinicalCase) && 
            (labResults.length > 0 || imagingResults.length > 0) && 
            !isPrefetchingDiagnosis && 
            !preloadedDiagnosis && 
            !prefetchingDiagnosisPromiseRef.current;

        if (shouldPrefetch) {
            const fullContext = getFullCaseSummaryForDiagnosis();
            if (!fullContext) return;

            setIsPrefetchingDiagnosis(true);
            const promise = (async () => {
                try {
                    const diagnosisData = await getFinalDiagnosis(fullContext, topic);
                    setPreloadedDiagnosis(diagnosisData);
                    return diagnosisData;
                } catch (err) {
                    console.error("Error en la precarga del diagnóstico en segundo plano:", err);
                    throw err;
                } finally {
                    setIsPrefetchingDiagnosis(false);
                }
            })();

            prefetchingDiagnosisPromiseRef.current = promise;
        }
    }, [step, clinicalCase, labResults, imagingResults, isPrefetchingDiagnosis, preloadedDiagnosis]);
    
    const handleStartSimulation = async () => {
        if (!topic.trim()) { setError('Por favor, ingresa un signo, síntoma o patología.'); return; }
        setIsLoading(true); setError(null);
        try {
            // Limpiar buffers y estudios del caso previo
            backgroundPipelinePromiseRef.current = null;
            setDynamicLabsBuffer([]);
            setDynamicImagingBuffer([]);
            setPreloadedDiagnosis(null);
            setIsPrefetchingDiagnosis(false);
            prefetchingDiagnosisPromiseRef.current = null;
            setSelectedStudies({ labs: [], imaging: [] });
            setAllAvailableStudies({ labs: [], imaging: [] });
            setLabResults([]);
            setImagingResults([]);
            setFinalDiagnosis(null);

            // Limpiar buffers del plan terapéutico previo
            setPlanOptionsCache(null);
            setPrescribedPlan({
                tipoDieta: '',
                justificacionDieta: '',
                soluciones: [],
                medicamentos: [],
                medidasGenerales: [],
                medidasAdicionalesEnfermeria: ''
            });
            setShowTherapeuticPlan(false);
            planPrefetchPromiseRef.current = null;


            const caseData = await generateClinicalCase(topic, difficulty);
            setClinicalCase(caseData); 
            setStep(1);

            // Guardar inmediatamente en la Biblioteca de Estudio para asegurar persistencia instantánea
            try {
                const recordId = createSimulationRecordId(topic, caseData);
                const now = new Date().toISOString();
                void saveStudyRecord({
                    id: recordId,
                    kind: 'simulacion',
                    title: caseData.caseTitle,
                    topic,
                    topicKey: normalizeStudyTopic(topic),
                    payload: {
                        topic,
                        difficulty,
                        clinicalCase: caseData,
                        allAvailableStudies: { labs: [], imaging: [] },
                        dynamicLabsBuffer: [],
                        dynamicImagingBuffer: [],
                        preloadedDiagnosis: null,
                        planOptionsCache: null,
                    },
                    createdAt: now,
                    lastViewedAt: now,
                    viewCount: 1,
                    viewHistory: [now],
                    isFavorite: false,
                    version: 1,
                });
            } catch (saveErr) {
                console.warn('No se pudo guardar la simulación inicial en la biblioteca:', saveErr);
            }

            // DISPARO EN SEGUNDO PLANO: Estudios y Plan Terapéutico sin bloquear la interfaz
            startBackgroundStudyPipeline(caseData);
            startBackgroundPlanPrefetch(caseData, topic);
        } catch (e: any) { 
            const errorMsg = e?.message || '';
            setError(`Error al generar el caso clínico: ${errorMsg || 'Por favor verifica la conexión y reintenta.'}`); 
            console.error(e); 
        }
        setIsLoading(false);
    };

    const handleAskQuestion = async () => {
        if (!userQuestion.trim() || !clinicalCase) return;
        setIsLoading(true);
        try {
            const feedback = await getAnamnesisFeedback(clinicalCase, anamnesisHistory, userQuestion);
            setAnamnesisHistory(prev => [...prev, { question: userQuestion, ...feedback }]);
            setUserQuestion(''); 
            setTimeout(() => anamnesisEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        } catch(e) { setError('Error al procesar la pregunta.'); console.error(e); }
        setIsLoading(false);
    };



    const handleStudySelection = async (type: 'labs' | 'imaging', study: string, checked: boolean) => {
        const isAlreadySelected = selectedStudies[type].includes(study);
        if (checked === isAlreadySelected) return;

        // Invalidate current preloaded diagnosis as new studies will change the clinical summary
        setPreloadedDiagnosis(null);
        prefetchingDiagnosisPromiseRef.current = null;

        setSelectedStudies(prev => ({ ...prev, [type]: checked ? [...prev[type], study] : prev[type].filter(s => s !== study) }));

        if (!checked) {
            if (type === 'labs') setLabResults(prev => prev.filter(r => r.study !== study));
            else setImagingResults(prev => prev.filter(r => r.study !== study));
            return;
        }

        const normalizedStudy = study.trim().toLowerCase();

        // 1. Comprobar si ya está disponible en el buffer dinámico generado en segundo plano
        if (type === 'labs') {
            const bufferedLab = dynamicLabsBuffer.find(l => 
                l.study.toLowerCase().trim() === normalizedStudy ||
                l.study.toLowerCase().includes(normalizedStudy) ||
                normalizedStudy.includes(l.study.toLowerCase())
            );

            if (bufferedLab) {
                // Copia instantánea sin llamadas de API adicionales ni pantalla de carga
                setLabResults(prev => [...prev.filter(r => r.study !== study), bufferedLab]);
                return;
            }
        } else {
            const bufferedImaging = dynamicImagingBuffer.find(i => 
                i.study.toLowerCase().trim() === normalizedStudy ||
                i.study.toLowerCase().includes(normalizedStudy) ||
                normalizedStudy.includes(i.study.toLowerCase())
            );

            if (bufferedImaging) {
                // Si la imagen médica ya fue generada previamente
                if (bufferedImaging.imageUrl) {
                    setImagingResults(prev => [...prev.filter(r => r.study !== study), bufferedImaging]);
                    return;
                } else {
                    // Generar la imagen usando el informe de hallazgos que ya tenemos en el buffer
                    setLoadingStudies(prev => new Set(prev).add(study));
                    let imageUrl: string | undefined;
                    try {
                        imageUrl = await generateImage(bufferedImaging.study, bufferedImaging.findings, useDirectCatalogImages);
                    } catch (imgErr: any) { 
                        console.warn("Error al generar imagen, usando respaldo de internet:", imgErr);
                        imageUrl = getInternetMedicalImageUrl(bufferedImaging.study, bufferedImaging.findings);
                    }
                    const finalResult: ImagingResult = { 
                        ...bufferedImaging, 
                        imageUrl: imageUrl || getInternetMedicalImageUrl(bufferedImaging.study, bufferedImaging.findings) 
                    };
                    setImagingResults(prev => [...prev.filter(r => r.study !== study), finalResult]);
                    setDynamicImagingBuffer(prev => prev.map(i => i.study === bufferedImaging.study ? finalResult : i));
                    setLoadingStudies(prev => { const newSet = new Set(prev); newSet.delete(study); return newSet; });
                    return;
                }
            }
        }

        // 2. Si no está en el buffer y la llamada en segundo plano sigue en vuelo (in-flight)
        setLoadingStudies(prev => new Set(prev).add(study));
        setError(null);

        try {
            if (backgroundPipelinePromiseRef.current) {
                try {
                    const resolved = await backgroundPipelinePromiseRef.current;
                    if (type === 'labs') {
                        const found = resolved.labs?.find(l => 
                            l.study.toLowerCase().trim() === normalizedStudy ||
                            l.study.toLowerCase().includes(normalizedStudy) ||
                            normalizedStudy.includes(l.study.toLowerCase())
                        );
                        if (found) {
                            setLabResults(prev => [...prev.filter(r => r.study !== study), found]);
                            return;
                        }
                    } else {
                        const found = resolved.imaging?.find(i => 
                            i.study.toLowerCase().trim() === normalizedStudy ||
                            i.study.toLowerCase().includes(normalizedStudy) ||
                            normalizedStudy.includes(i.study.toLowerCase())
                        );
                        if (found) {
                            let imageUrl: string | undefined = found.imageUrl;
                            if (!imageUrl) {
                                try {
                                    imageUrl = await generateImage(found.study, found.findings, useDirectCatalogImages);
                                } catch (imgErr: any) {
                                    imageUrl = getInternetMedicalImageUrl(found.study, found.findings);
                                }
                            }
                            const finalResult = { 
                                ...found, 
                                imageUrl: imageUrl || getInternetMedicalImageUrl(found.study, found.findings) 
                            };
                            setImagingResults(prev => [...prev.filter(r => r.study !== study), finalResult]);
                            return;
                        }
                    }
                } catch (pipeErr) {
                    console.warn("Pipeline error, fallback to direct request:", pipeErr);
                }
            }

            // 3. Si es un estudio personalizado añadido por el usuario, generar bajo demanda
            const request = type === 'labs' ? { labs: [study], imaging: [] } : { labs: [], imaging: [study] };
            const tempContext = `Caso: ${clinicalCase?.historyOfPresentIllness}. Anamnesis: ${anamnesisHistory.map(h => h.patientResponse).join(' ')}`;
            const resultData = await generateStudyResults(tempContext, request, useDirectCatalogImages);
            
            if (type === 'labs' && resultData.labs && resultData.labs.length > 0) {
                const labResult = resultData.labs[0];
                setLabResults(prev => [...prev.filter(r => r.study !== study), labResult]);
                setDynamicLabsBuffer(prev => [...prev.filter(r => r.study !== study), labResult]);
            } else if (type === 'imaging' && resultData.imaging && resultData.imaging.length > 0) {
                const result = resultData.imaging[0];
                let imageUrl: string | undefined = result.imageUrl;
                if (!imageUrl) {
                    try {
                        imageUrl = await generateImage(result.study, result.findings, useDirectCatalogImages);
                    } catch (imgErr: any) { 
                        imageUrl = getInternetMedicalImageUrl(result.study, result.findings);
                    }
                }
                const finalResult = { 
                    ...result, 
                    imageUrl: imageUrl || getInternetMedicalImageUrl(result.study, result.findings) 
                };
                setImagingResults(prev => [...prev.filter(r => r.study !== study), finalResult]);
                setDynamicImagingBuffer(prev => [...prev.filter(r => r.study !== study), finalResult]);
            }

        } catch (e: any) {
            console.error(`Error al generar resultado para ${study}:`, e);
            setError(`Error al generar resultado para ${study}.`);
            setSelectedStudies(prev => ({ ...prev, [type]: prev[type].filter(s => s !== study) }));
        } finally {
            setLoadingStudies(prev => { const newSet = new Set(prev); newSet.delete(study); return newSet; });
        }
    };

    const handleAddCustomStudy = (type: 'labs' | 'imaging') => {
        const studyName = (type === 'labs' ? customLab : customImaging).trim();
        if (!studyName) return;

        if (!allAvailableStudies[type].includes(studyName)) {
            setAllAvailableStudies(prev => ({ ...prev, [type]: [...prev[type], studyName]}));
        }
        
        if (!selectedStudies[type].includes(studyName)) {
            handleStudySelection(type, studyName, true);
        }

        if (type === 'labs') setCustomLab('');
        else setCustomImaging('');
    };
    
    const handleGetDiagnosis = async () => {
        setError(null);

        // Caso 1: El diagnóstico ya está listo en el búfer precargado (cambio instantáneo 0ms)
        if (preloadedDiagnosis) {
            setFinalDiagnosis(preloadedDiagnosis);
            setStep(3);
            return;
        }

        // Caso 2: La llamada en segundo plano sigue en vuelo (esperar su resolución con spinner)
        if (isPrefetchingDiagnosis && prefetchingDiagnosisPromiseRef.current) {
            setIsLoading(true);
            try {
                const diagnosisData = await prefetchingDiagnosisPromiseRef.current;
                setFinalDiagnosis(diagnosisData);
                setPreloadedDiagnosis(diagnosisData);
                setStep(3);
            } catch (err) {
                console.error("Error al aguardar diagnóstico en vuelo:", err);
                // Respaldo directo en caso de fallo
                try {
                    const fullContext = getFullCaseSummaryForDiagnosis();
                    if (!fullContext) throw new Error('No hay suficiente información.');
                    const directData = await getFinalDiagnosis(fullContext, topic);
                    setFinalDiagnosis(directData);
                    setPreloadedDiagnosis(directData);
                    setStep(3);
                } catch (fallbackErr) {
                    setError('Error al generar el diagnóstico.');
                    console.error(fallbackErr);
                }
            } finally {
                setIsLoading(false);
            }
            return;
        }

        // Caso 3: Fallback normal si no había precarga activa
        setIsLoading(true);
        try {
            const fullContext = getFullCaseSummaryForDiagnosis();
            if (!fullContext) { setError('No hay suficiente información.'); setIsLoading(false); return; }
            const diagnosisData = await getFinalDiagnosis(fullContext, topic);
            setFinalDiagnosis(diagnosisData); 
            setPreloadedDiagnosis(diagnosisData);
            setStep(3);
        } catch(e) { 
            setError('Error al generar el diagnóstico.'); 
            console.error(e); 
        } finally {
            setIsLoading(false);
        }
    };
    
    const resetSimulator = () => {
        backgroundPipelinePromiseRef.current = null;
        prefetchingDiagnosisPromiseRef.current = null;
        planPrefetchPromiseRef.current = null;
        setIsBufferingStudies(false);
        setIsPrefetchingDiagnosis(false);
        setPreloadedDiagnosis(null);
        setPlanOptionsCache(null);
        setPrescribedPlan({
            tipoDieta: '',
            justificacionDieta: '',
            soluciones: [],
            medicamentos: [],
            medidasGenerales: [],
            medidasAdicionalesEnfermeria: ''
        });
        setTopic(''); setStep(0); setClinicalCase(null); setAnamnesisHistory([]); 
        setAllAvailableStudies({ labs: [], imaging: [] }); setSelectedStudies({ labs: [], imaging: [] }); 
        setLabResults([]); setImagingResults([]); setFinalDiagnosis(null); setError(null);
        setDynamicLabsBuffer([]); setDynamicImagingBuffer([]);
        setShowTherapeuticPlan(false);
        setDifficulty('Interno');

    };

    const handleProceedToStudies = async () => {
        if (!clinicalCase) { setError('Error: no hay caso clínico cargado.'); return; }

        if (allAvailableStudies.labs.length > 0 || allAvailableStudies.imaging.length > 0) {
            setStep(2);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            if (backgroundPipelinePromiseRef.current) {
                await backgroundPipelinePromiseRef.current;
            } else {
                await startBackgroundStudyPipeline(clinicalCase);
            }
            setStep(2);
        } catch (e) { 
            setError('Error al obtener sugerencias de estudios.'); 
            console.error(e); 
        } finally {
            setIsLoading(false);
        }
    };

    

    const renderCaseInfo = () => {
        if (!clinicalCase) return null;
        const vitalSignsLabels: {[key: string]: string} = { presionArterial: 'Presión Arterial', frecuenciaCardiaca: 'Frecuencia Cardiaca', frecuenciaRespiratoria: 'Frecuencia Respiratoria', temperatura: 'Temperatura', saturacionOxigeno: 'Saturación de Oxígeno' };
        return <div className="p-6 bg-blue-50 dark:bg-slate-900/80 rounded-xl border-2 border-blue-400 dark:border-cyan-400 shadow-md space-y-3 text-gray-800 dark:text-gray-200">
            <h3 className="font-bold text-2xl text-blue-900 dark:text-cyan-300 border-b border-blue-200 dark:border-cyan-700 pb-2">{clinicalCase.caseTitle}</h3>
            <p><strong>Perfil del Paciente: </strong>{clinicalCase.patientProfile}</p>
            <p><strong>Padecimiento Actual: </strong>{clinicalCase.historyOfPresentIllness}</p>
            <div className="bg-white/50 dark:bg-slate-800/50 p-3 rounded-lg border border-blue-100 dark:border-cyan-800">
                <strong>Signos Vitales:</strong>
                <ul className="list-disc list-inside ml-4 mt-1">{Object.entries(clinicalCase.vitalSigns).map(([key, value]) => <li key={key}>{`${vitalSignsLabels[key] || key}: ${value}`}</li>)}</ul>
            </div>
            <p><strong>Examen Físico: </strong>{clinicalCase.physicalExam}</p>
        </div>;
    };

    const renderAnamnesis = () => <div className="space-y-4">
        <h3 className="font-bold text-lg text-green-800 dark:text-pink-400 px-2">Anamnesis Interactiva y Tutor</h3>
        <div className="max-h-96 overflow-y-auto space-y-4 p-4 bg-gray-50 dark:bg-slate-900/70 rounded-xl border-2 border-blue-300 dark:border-purple-500 shadow-inner">
            {anamnesisHistory.map((turn, index) => <div key={index} className="space-y-2">
                <p className="bg-blue-100 dark:bg-indigo-900/80 border border-blue-200 dark:border-indigo-700 p-3 rounded-lg text-right ml-12 shadow-sm"><strong>Tú: </strong>{turn.question}</p>
                <p className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 p-3 rounded-lg mr-12 shadow-sm"><strong>Paciente: </strong>{turn.patientResponse}</p>
                <div className="text-sm bg-gradient-to-r from-emerald-50 to-teal-50/70 border-l-4 border-emerald-500 text-slate-800 dark:from-purple-950/40 dark:to-slate-900/60 dark:border-purple-400 dark:text-purple-200 p-3.5 rounded-r-xl shadow-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-purple-300 text-xs">
                        <span>👨‍⚕️ Tutor Clínico Docente</span>
                    </div>
                    <p className="leading-relaxed">{turn.tutorFeedback}</p>
                </div>
            </div>)}
            <div ref={anamnesisEndRef} />
        </div>
        {(step === 1 || step === 2) && <div className="flex items-center gap-2">
            <input type="text" value={userQuestion} onChange={e => setUserQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAskQuestion()} placeholder="Haz una pregunta al paciente..." className="flex-grow px-4 py-3 bg-white dark:bg-slate-800 border-2 border-blue-200 dark:border-slate-600 rounded-lg focus:outline-none focus:border-blue-500 dark:focus:border-purple-500 transition-all" />
            <button onClick={handleAskQuestion} disabled={isLoading} className="bg-green-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-green-300 dark:bg-pink-600 dark:hover:bg-pink-700 shadow-md border-2 border-transparent">{isLoading ? '...' : 'Preguntar'}</button>
        </div>}
    </div>;

    const renderStudies = () => {
        const renderStudySelectionList = (type: 'labs' | 'imaging', studies: string[], title: string) => <div className="space-y-3">
            <h4 className="font-semibold text-lg text-gray-700 dark:text-gray-300">{title}</h4>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {studies.map(study => (
                    <label key={study} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedStudies[type].includes(study)}
                            onChange={e => handleStudySelection(type, study, e.target.checked)}
                            disabled={loadingStudies.has(study)}
                            className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-gray-800 dark:text-gray-200 text-sm">{study}</span>
                        {loadingStudies.has(study) && <span className="text-xs text-blue-500 animate-pulse">Cargando...</span>}
                    </label>
                ))}
            </div>
            <div className="flex gap-2 mt-2">
                <input
                    type="text"
                    value={type === 'labs' ? customLab : customImaging}
                    onChange={e => type === 'labs' ? setCustomLab(e.target.value) : setCustomImaging(e.target.value)}
                    placeholder={`Añadir ${type === 'labs' ? 'laboratorio' : 'imagen'}...`}
                    className="flex-grow text-xs px-3 py-2 bg-white dark:bg-slate-800 border rounded-lg"
                    onKeyDown={e => e.key === 'Enter' && handleAddCustomStudy(type)}
                />
                <button
                    onClick={() => handleAddCustomStudy(type)}
                    className="text-xs bg-gray-200 dark:bg-slate-700 px-3 py-2 rounded-lg hover:bg-gray-300"
                >
                    +
                </button>
            </div>
        </div>;

        const renderResultsPanel = () => <div className="space-y-6 mt-6">
            {labResults.length > 0 && <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <h4 className="font-bold text-lg mb-3 text-blue-900 dark:text-cyan-400">Resultados de Laboratorio</h4>
                <div className="space-y-4">
                    {labResults.map((result, index) => <div key={index} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700">
                        <h5 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{result.study}</h5>
                        {result.components && result.components.length > 0 ? (
                            <div className="overflow-x-auto my-2">
                                <table className="min-w-full text-xs text-left">
                                    <thead className="bg-gray-100 dark:bg-slate-700">
                                        <tr>
                                            <th className="p-1">Parámetro</th>
                                            <th className="p-1">Resultado</th>
                                            <th className="p-1">Referencia</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.components.map((c, idx) => (
                                            <tr key={idx} className={`border-b dark:border-slate-700 ${c.isAbnormal ? 'text-red-600 dark:text-red-400 font-bold' : ''}`}>
                                                <td className="p-1">{c.parameter}</td>
                                                <td className="p-1">{c.value} {c.units}</td>
                                                <td className="p-1 text-gray-500">{c.referenceRange}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                        <p className="text-xs text-gray-600 dark:text-gray-300 mt-1"><strong>Interpretación: </strong>{result.interpretation}</p>
                    </div>)}
                </div>
            </div>}
            {imagingResults.length > 0 && <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-lg text-blue-900 dark:text-cyan-400">Estudios de Imagen & Gabinete</h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Interpretación con Imagen Simulada</span>
                </div>
                <div className="space-y-4">
                    {imagingResults.map((result, index) => {
                        const imgSource = result.imageUrl || getInternetMedicalImageUrl(result.study, result.findings);
                        const normStudy = result.study.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                        const isChest = /t[oó]rax|chest|pulmon/i.test(normStudy) && 
                                        !/\b(tac|tc|tomograf\w*|ultra\w*|ecograf\w*|ecocardio\w*|usg|doppler|resonanc\w*|rmn?)\b/i.test(normStudy) &&
                                        !normStudy.startsWith("eco");
                        return (
                            <div key={index} className="p-4 bg-gray-50 dark:bg-slate-800/80 rounded-xl border border-gray-200 dark:border-slate-700 space-y-3">
                                <div>
                                    <h5 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">{result.study}</h5>
                                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                        <strong className="text-slate-700 dark:text-slate-200">Hallazgos: </strong>{result.findings}
                                    </p>
                                </div>
                                {imgSource && (
                                    <div className={`relative bg-slate-950 rounded-xl overflow-hidden shadow-md border border-slate-700/70 mx-auto group ${isChest ? 'max-w-xs sm:max-w-sm' : 'max-w-md'}`}>
                                        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] font-mono text-cyan-400">
                                            <span className="flex items-center gap-1.5 font-bold">
                                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                                {result.study}
                                            </span>
                                            <span className="text-[10px] text-slate-400">{isChest ? 'Proyección Vertical (PA)' : 'Imagen Clínica de Referencia'}</span>
                                        </div>
                                        <div className={`flex items-center justify-center bg-black/90 ${isChest ? 'min-h-[360px] sm:min-h-[420px] max-h-[520px] p-2' : ''}`}>
                                            <img 
                                                src={imgSource} 
                                                alt={result.study} 
                                                loading="lazy"
                                                onError={(e) => {
                                                    const fallback = getInternetFallbackImage(result.study);
                                                    if (e.currentTarget.src !== fallback) {
                                                        e.currentTarget.src = fallback;
                                                    }
                                                }}
                                                className={isChest 
                                                    ? "w-auto h-auto max-h-[500px] max-w-full object-contain mx-auto transition-transform duration-300 group-hover:scale-[1.02]"
                                                    : "w-full h-auto object-contain max-h-80 mx-auto transition-transform duration-300 group-hover:scale-[1.02]"
                                                } 
                                            />
                                        </div>
                                        <div className="px-3 py-1 bg-slate-900/80 border-t border-slate-800/80 text-[10px] text-slate-400 text-center font-mono">
                                            {isChest ? 'Tele de Tórax • Proyección Vertical Estándar' : 'Estudio Clínico • Correlación con Informe Radiológico'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>}
            <div ref={resultsEndRef} />
        </div>;

        return <div className="space-y-6 mt-6">
            <div className="p-4 bg-gray-50 dark:bg-slate-900/50 rounded-xl border-2 border-gray-200 dark:border-slate-700">
                <h3 className="font-bold text-xl mb-4 border-b dark:border-slate-600 pb-2">Selección de Estudios</h3>
                <div className="grid md:grid-cols-2 gap-8">
                    {renderStudySelectionList('labs', allAvailableStudies.labs, "Laboratorio")}
                    {renderStudySelectionList('imaging', allAvailableStudies.imaging, "Imagen")}
                </div>
            </div>
            {(labResults.length > 0 || imagingResults.length > 0) && renderResultsPanel()}
            
            {/* Botón para avanzar al Plan Terapéutico — solo visible cuando hay resultados y el plan no se ha desplegado */}
            {clinicalCase && (labResults.length > 0 || imagingResults.length > 0) && !showTherapeuticPlan && !loadingStudies.size && step === 2 && (
                <button
                    onClick={() => setShowTherapeuticPlan(true)}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg border-2 border-transparent flex items-center justify-center gap-2 transition-all"
                >
                    <span className="text-lg">📋</span>
                    <span>Avanzar al Plan Terapéutico & Prescripción</span>
                </button>
            )}

            {/* Plan Terapéutico — solo se muestra al presionar el botón */}
            {clinicalCase && showTherapeuticPlan && (
                <TherapeuticPlanSection
                    clinicalCase={clinicalCase}
                    planOptionsCache={planOptionsCache}
                    prescribedPlan={prescribedPlan}
                    onUpdatePlan={setPrescribedPlan}
                />
            )}

            {(labResults.length > 0 || imagingResults.length > 0) && !loadingStudies.size && step === 2 && showTherapeuticPlan &&
            <button onClick={handleGetDiagnosis} disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 shadow-lg border-2 border-transparent">{isLoading ? 'Procesando...' : 'Obtener Diagnóstico Final'}</button>}
        </div>;

    };

    const cleanLatexFormatting = (text: string): string => {
        if (!text) return '';
        return text
            // Replace common Greek letters and LaTeX math symbols
            .replace(/\\alpha\b/g, 'α')
            .replace(/\\beta\b/g, 'β')
            .replace(/\\gamma\b/g, 'γ')
            .replace(/\\delta\b/g, 'δ')
            .replace(/\\mu\b/g, 'µ')
            .replace(/\\pm\b/g, '±')
            .replace(/\\leq\b/g, '≤')
            .replace(/\\geq\b/g, '≥')
            .replace(/\\times\b/g, '×')
            .replace(/\\rightarrow\b/g, '→')
            .replace(/\\leftarrow\b/g, '←')
            .replace(/\\approx\b/g, '≈')
            .replace(/\\neq\b/g, '≠')
            // Strip \text{...} or \mathrm{...} or \mathbf{...}
            .replace(/\\(?:text|mathrm|mathbf|textit|textbf)\{([^}]+)\}/g, '$1')
            // Strip remaining lone $...$ or $$...$$ math wrappers that contain text/symbols
            .replace(/\$\$([^$]+)\$\$/g, '$1')
            .replace(/\$([^$\n]+)\$/g, '$1');
    };

    const renderDiagnosisHtml = (markdownText: string, sources: GroundingSource[]) => {
        const cleanedText = cleanLatexFormatting(markdownText);
        let parsedHtml = marked.parse(cleanedText) as string;
        // Reemplazar citas simples [1] y compuestas [1, 2, 4] o [2, 3] por enlaces clicables directos
        parsedHtml = parsedHtml.replace(/\[([\d\s,]+)\]/g, (fullMatch, numbersGroup) => {
            const numbers = numbersGroup.split(',').map((s: string) => s.trim()).filter((s: string) => /^\d+$/.test(s));
            if (numbers.length === 0) return fullMatch;
            return numbers.map((numberStr: string) => {
                const index = parseInt(numberStr, 10) - 1;
                const source = sources[index];
                if (source && source.uri) {
                    return `<a href="${source.uri}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-cyan-950 dark:text-cyan-300 border border-blue-300 dark:border-cyan-700 hover:scale-110 hover:bg-blue-200 dark:hover:bg-cyan-900 transition-all no-underline shadow-xs cursor-pointer" title="${source.title || source.uri}">[${numberStr}]</a>`;
                }
                const fallbackUri = `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(numberStr)}`;
                return `<a href="${fallbackUri}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 dark:bg-slate-700 dark:text-cyan-300 border border-blue-200 dark:border-slate-600 hover:underline" title="Evidencia médica [${numberStr}]">[${numberStr}]</a>`;
            }).join('');
        });
        return parsedHtml;
    };

    const renderContent = () => {
        if (step === 0) {
            return <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-400">Ingresa la presentación inicial del paciente para iniciar la simulación.</p>
                <div>
                    <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nivel de Dificultad</label>
                        <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-gray-200/80 dark:bg-slate-800 border border-gray-300/80 dark:border-slate-700 shadow-xs">
                            <button
                                type="button"
                                onClick={() => setUseDirectCatalogImages(true)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all flex items-center justify-center ${
                                    useDirectCatalogImages
                                        ? 'bg-emerald-600 text-white shadow-xs scale-105'
                                        : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 opacity-50 hover:opacity-90'
                                }`}
                                aria-label="⚡"
                            >
                                <span className="text-sm">⚡</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setUseDirectCatalogImages(false)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all flex items-center justify-center ${
                                    !useDirectCatalogImages
                                        ? 'bg-indigo-600 text-white shadow-xs scale-105'
                                        : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 opacity-50 hover:opacity-90'
                                }`}
                                aria-label="✨"
                            >
                                <span className="text-sm">✨</span>
                            </button>
                        </div>
                    </div>
                    <div className="flex space-x-2 rounded-lg p-1 bg-gray-200 dark:bg-slate-700">
                        {['Interno', 'Adscrito', 'Dr. House'].map(level =>
                            <button key={level} onClick={() => setDifficulty(level)} className={`flex-1 py-2 px-2 text-sm font-semibold rounded-md transition-all ${difficulty === level ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-900 dark:text-purple-300' : 'bg-transparent text-gray-600 hover:bg-gray-300/50 dark:text-gray-300 dark:hover:bg-slate-600'}`}>
                                {level === 'Interno' ? '😇 Interno' : level === 'Adscrito' ? '🧐 Adscrito' : '😈 Dr. House'}
                            </button>)}
                    </div>
                </div>
                <input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Ej: Dolor torácico opresivo, Cefalea y fiebre" className="w-full px-4 py-3 bg-white dark:bg-slate-800 border-2 border-gray-300 dark:border-slate-600 rounded-lg focus:border-blue-500 dark:focus:border-purple-500" onKeyDown={e => e.key === 'Enter' && handleStartSimulation()} />
                <button onClick={handleStartSimulation} disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-300 dark:bg-purple-600 dark:hover:bg-purple-700 shadow-lg border-2 border-transparent">{isLoading ? 'Generando...' : 'Iniciar Simulación'}</button>
            </div>;
        }
        
        return <div className="space-y-6">
            {renderCaseInfo()}
            {renderAnamnesis()}
            {step === 1 && <button onClick={handleProceedToStudies} disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 shadow-md border-2 border-transparent">{isLoading ? 'Obteniendo Sugerencias...' : "Proceder a Estudios"}</button>}
            {step >= 2 && renderStudies()}
            {isLoading && (step > 1) && <LoadingSpinner />}
            {step === 3 && finalDiagnosis && (() => {
                const diagnosisText = finalDiagnosis.text;
                const sourcesHeaderRegex = /###\s*(?:Fuentes(?:\s+de\s+Información|\s+Bibliográficas)?|Referencias(?:\s+Bibliográficas)?|Bibliografía)/i;
                const headerMatch = sourcesHeaderRegex.exec(diagnosisText);
                const sourcesIndex = headerMatch ? headerMatch.index : -1;
                const mainDiagnosis = sourcesIndex !== -1 ? diagnosisText.substring(0, sourcesIndex).trim() : diagnosisText;
                const infoSources = sourcesIndex !== -1 ? diagnosisText.substring(sourcesIndex).trim() : "";
                
                return (
                    <div className="mt-6 animate-fade-in space-y-6">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <h3 className="font-bold text-2xl text-blue-900 dark:text-cyan-300">Diagnóstico y Desglose Clínico</h3>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 dark:bg-emerald-950 dark:text-emerald-300 border border-green-300 dark:border-emerald-700 shadow-xs">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                Grounding Activo
                            </span>
                        </div>
                        <div 
                            className="p-6 bg-green-50/50 dark:bg-slate-800 rounded-xl border-2 border-green-500 dark:border-pink-500 shadow-lg prose max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: renderDiagnosisHtml(mainDiagnosis, finalDiagnosis.sources) }} 
                        />
                        {finalDiagnosis.sources.length > 0 && (
                            <div className="p-6 bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/50 dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 rounded-2xl border-2 border-blue-300 dark:border-cyan-700/70 shadow-lg space-y-4">
                                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-blue-200 dark:border-cyan-800/60">
                                    <div className="flex items-center gap-2.5 text-blue-950 dark:text-cyan-200">
                                        <span className="p-2 bg-blue-600 dark:bg-cyan-500 text-white dark:text-slate-950 rounded-xl text-base shadow-sm">
                                            📚
                                        </span>
                                        <div>
                                            <h4 className="font-bold text-base md:text-lg text-blue-950 dark:text-cyan-200">
                                                Fuentes y Evidencia Científica
                                            </h4>
                                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                                Referencias clínicas avaladas vinculadas a las citas numéricas del desglose
                                            </p>
                                        </div>
                                    </div>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-cyan-950 dark:text-cyan-300 border border-blue-300 dark:border-cyan-700">
                                        <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-cyan-400"></span>
                                        {finalDiagnosis.sources.length} {finalDiagnosis.sources.length === 1 ? 'fuente consultada' : 'fuentes consultadas'}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                    {finalDiagnosis.sources.map((source, idx) => {
                                        if (!source.uri) return null;
                                        const citationNumber = idx + 1;
                                        const title = getLinkText(source);
                                        const domain = getSourceDomain(source.uri);
                                        return (
                                            <div 
                                                key={idx}
                                                id={`fuente-${citationNumber}`}
                                                className="group flex flex-col justify-between p-3.5 rounded-xl bg-white dark:bg-slate-800/90 border border-blue-200/80 dark:border-slate-700 shadow-xs hover:shadow-md hover:border-blue-400 dark:hover:border-cyan-500 transition-all duration-200"
                                            >
                                                <div className="flex items-start gap-2.5 mb-2">
                                                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 dark:bg-cyan-500 text-white dark:text-slate-950 text-xs font-bold shadow-xs">
                                                        {citationNumber}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs md:text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
                                                            {title}
                                                        </p>
                                                        <span className="inline-block mt-1 text-[11px] text-gray-500 dark:text-gray-400 font-mono truncate max-w-full">
                                                            🌐 {domain}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="pt-2 border-t border-gray-100 dark:border-slate-700/60 flex items-center justify-between">
                                                    <span className="text-[11px] text-blue-600 dark:text-cyan-400 font-medium">
                                                        Cita [{citationNumber}]
                                                    </span>
                                                    <a 
                                                        href={source.uri} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-cyan-300 transition-colors no-underline"
                                                    >
                                                        <span>Consultar fuente</span>
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                        </svg>
                                                    </a>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {infoSources && (
                            <div className="p-4 bg-gray-50 dark:bg-slate-900/60 rounded-xl border border-gray-200 dark:border-slate-700 space-y-2">
                                <h5 className="font-semibold text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                    <span>📑</span>
                                    <span>Desglose Bibliográfico y Metodológico</span>
                                </h5>
                                <div 
                                    className="text-xs md:text-sm text-gray-700 dark:text-gray-300 prose max-w-none dark:prose-invert"
                                    dangerouslySetInnerHTML={{ __html: renderDiagnosisHtml(infoSources, finalDiagnosis.sources) }}
                                />
                            </div>
                        )}
                    </div>
                );
            })()}
         </div>;
    };

    return <Card className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-blue-800 dark:text-cyan-300">🩺 Simulador de Casos Clínicos</h2>
            {step > 0 && <button onClick={resetSimulator} className="text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 dark:bg-slate-600 dark:hover:bg-slate-500 font-semibold py-1 px-3 rounded-lg border border-gray-300 dark:border-slate-500">Nuevo Caso</button>}
        </div>
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
        {isLoading && step === 0 && <LoadingSpinner />}
        {renderContent()}
    </Card>;
};

export default MedicalSimulator;
