import React, { useState, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { 
    generateClinicalCase, getAnamnesisFeedback, getSuggestedStudies, 
    generateStudyResults, generateImage, getFinalDiagnosis 
} from '../services/geminiService';
import { ClinicalCase, AnamnesisTurn, LabResult, ImagingResult, GroundingSource } from '../types';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import useLocalStorage from '../hooks/useLocalStorage';

const getLinkText = (source: GroundingSource) => {
    if (source.title && source.title.trim() !== '') return source.title;
    try {
        return new URL(source.uri).hostname;
    } catch {
        return source.uri; // Fallback if URL is invalid
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

    // Transient State (UI only)
    const [isLoading, setIsLoading] = useState(false);
    const [isBufferingStudies, setIsBufferingStudies] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userQuestion, setUserQuestion] = useState('');
    const [customLab, setCustomLab] = useState('');
    const [customImaging, setCustomImaging] = useState('');
    const [loadingStudies, setLoadingStudies] = useState(new Set<string>());

    const anamnesisEndRef = useRef<HTMLDivElement>(null);
    const resultsEndRef = useRef<HTMLDivElement>(null);
    const backgroundPipelinePromiseRef = useRef<Promise<{ labs: LabResult[], imaging: ImagingResult[] }> | null>(null);
    const prefetchingDiagnosisPromiseRef = useRef<Promise<{text: string, sources: GroundingSource[]}> | null>(null);

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
                });

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
    }, [step, clinicalCase, dynamicLabsBuffer.length, dynamicImagingBuffer.length]);

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
                    const diagnosisData = await getFinalDiagnosis(fullContext);
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

            const caseData = await generateClinicalCase(topic, difficulty);
            setClinicalCase(caseData); 
            setStep(1);

            // DISPARO EN SEGUNDO PLANO (Fases A, B y C) sin bloquear la interfaz
            startBackgroundStudyPipeline(caseData);
        } catch (e) { setError('Error al generar el caso clínico.'); console.error(e); }
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

    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [pendingImageRequest, setPendingImageRequest] = useState<{study: string, findings: string} | null>(null);

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
                        imageUrl = await generateImage(bufferedImaging.study, bufferedImaging.findings);
                    } catch (imgErr: any) { 
                        console.warn("No se pudo renderizar la imagen gráfica para " + bufferedImaging.study, imgErr);
                        const rawMsg = imgErr?.message || imgErr?.error?.message || '';
                        if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('depleted') || rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('429')) {
                            setPendingImageRequest({ study: bufferedImaging.study, findings: bufferedImaging.findings });
                            setShowApiKeyModal(true);
                        }
                    }
                    const finalResult: ImagingResult = { ...bufferedImaging, imageUrl };
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
                            let imageUrl: string | undefined;
                            try {
                                imageUrl = await generateImage(found.study, found.findings);
                            } catch (imgErr: any) {
                                console.warn("No se pudo renderizar la imagen gráfica para " + found.study, imgErr);
                                const rawMsg = imgErr?.message || imgErr?.error?.message || '';
                                if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('depleted') || rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('429')) {
                                    setPendingImageRequest({ study: found.study, findings: found.findings });
                                    setShowApiKeyModal(true);
                                }
                            }
                            const finalResult = { ...found, imageUrl };
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
            const resultData = await generateStudyResults(tempContext, request);
            
            if (type === 'labs' && resultData.labs && resultData.labs.length > 0) {
                const labResult = resultData.labs[0];
                setLabResults(prev => [...prev.filter(r => r.study !== study), labResult]);
                setDynamicLabsBuffer(prev => [...prev.filter(r => r.study !== study), labResult]);
            } else if (type === 'imaging' && resultData.imaging && resultData.imaging.length > 0) {
                const result = resultData.imaging[0];
                let imageUrl: string | undefined;
                try {
                    imageUrl = await generateImage(result.study, result.findings);
                } catch (imgErr: any) { 
                    console.warn("No se pudo renderizar la imagen para " + result.study, imgErr);
                    const rawMsg = imgErr?.message || imgErr?.error?.message || '';
                    if (rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('depleted') || rawMsg.includes('403') || rawMsg.includes('PERMISSION_DENIED') || rawMsg.includes('429')) {
                         setPendingImageRequest({ study: result.study, findings: result.findings });
                         setShowApiKeyModal(true);
                    }
                }
                const finalResult = { ...result, imageUrl };
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
                setStep(3);
            } catch (err) {
                console.error("Error al aguardar diagnóstico en vuelo:", err);
                // Respaldo directo en caso de fallo
                try {
                    const fullContext = getFullCaseSummaryForDiagnosis();
                    if (!fullContext) throw new Error('No hay suficiente información.');
                    const directData = await getFinalDiagnosis(fullContext);
                    setFinalDiagnosis(directData);
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
            const diagnosisData = await getFinalDiagnosis(fullContext);
            setFinalDiagnosis(diagnosisData); 
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
        setIsBufferingStudies(false);
        setIsPrefetchingDiagnosis(false);
        setPreloadedDiagnosis(null);
        setTopic(''); setStep(0); setClinicalCase(null); setAnamnesisHistory([]); 
        setAllAvailableStudies({ labs: [], imaging: [] }); setSelectedStudies({ labs: [], imaging: [] }); 
        setLabResults([]); setImagingResults([]); setFinalDiagnosis(null); setError(null);
        setDynamicLabsBuffer([]); setDynamicImagingBuffer([]);
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

    const handleRetryImage = async () => {
        if (!pendingImageRequest) return;
        setIsLoading(true);
        setError(null);
        try {
            await (window as any).aistudio.openSelectKey();
            const imageUrl = await generateImage(pendingImageRequest.study, pendingImageRequest.findings);
            setImagingResults(prev => [...prev.filter(r => r.study !== pendingImageRequest.study), { 
                study: pendingImageRequest.study, 
                findings: pendingImageRequest.findings, 
                imageUrl 
            }]);
            setShowApiKeyModal(false);
            setPendingImageRequest(null);
        } catch (e: any) {
            console.error("Retry failed", e);
            setError("No se pudo generar la imagen. Asegúrate de haber seleccionado una clave válida.");
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
                <p className="text-sm bg-green-50 border-l-4 border-green-500 text-green-800 dark:bg-purple-900/30 dark:border-purple-500 dark:text-purple-200 p-3 rounded-r-lg shadow-sm"><strong>Tutor: </strong>{turn.tutorFeedback}</p>
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
                <h4 className="font-bold text-lg mb-3 text-blue-900 dark:text-cyan-400">Estudios de Imagen</h4>
                <div className="space-y-4">
                    {imagingResults.map((result, index) => <div key={index} className="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700">
                        <h5 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{result.study}</h5>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2"><strong>Hallazgos: </strong>{result.findings}</p>
                        {result.imageUrl ? (
                            <img src={result.imageUrl} alt={result.study} className="w-full max-w-sm mx-auto rounded-lg shadow-md mt-2" />
                        ) : null}
                    </div>)}
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
            {(labResults.length > 0 || imagingResults.length > 0) && !loadingStudies.size && step === 2 &&
            <button onClick={handleGetDiagnosis} disabled={isLoading} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 shadow-lg border-2 border-transparent">{isLoading ? 'Procesando...' : 'Obtener Diagnóstico Final'}</button>}
        </div>;
    };

    const renderDiagnosisHtml = (markdownText: string, sources: GroundingSource[]) => {
        let parsedHtml = marked.parse(markdownText) as string;
        parsedHtml = parsedHtml.replace(/\[(\d+)\]/g, (match, numberStr) => {
            const index = parseInt(numberStr, 10) - 1;
            const source = sources[index];
            if (source && source.uri) {
                return `<a href="${source.uri}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-800 dark:bg-cyan-950 dark:text-cyan-300 border border-blue-300 dark:border-cyan-700 hover:scale-110 hover:bg-blue-200 dark:hover:bg-cyan-900 transition-all no-underline shadow-xs cursor-pointer" title="${source.title || source.uri}">[${numberStr}]</a>`;
            }
            return `<span class="inline-flex items-center justify-center px-1.5 py-0.5 mx-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300 border border-gray-300 dark:border-slate-600">[${numberStr}]</span>`;
        });
        return parsedHtml;
    };

    const renderContent = () => {
        if (step === 0) {
            return <div className="space-y-4">
                <p className="text-gray-600 dark:text-gray-400">Ingresa la presentación inicial del paciente para iniciar la simulación.</p>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nivel de Dificultad</label>
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
                const sourcesHeader = "### Fuentes de Información";
                const sourcesIndex = diagnosisText.lastIndexOf(sourcesHeader);
                const mainDiagnosis = sourcesIndex !== -1 ? diagnosisText.substring(0, sourcesIndex) : diagnosisText;
                const infoSources = sourcesIndex !== -1 ? diagnosisText.substring(sourcesIndex) : "";
                
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
                            <div className="p-5 bg-white dark:bg-slate-900/80 rounded-xl border-2 border-blue-200 dark:border-cyan-800/70 shadow-md space-y-3">
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex items-center gap-2 text-blue-900 dark:text-cyan-300 font-bold text-base">
                                        <svg className="w-5 h-5 text-blue-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                        </svg>
                                        <span>Evidencia y Fuentes de Búsqueda (Grounding)</span>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {finalDiagnosis.sources.length} {finalDiagnosis.sources.length === 1 ? 'fuente consultada' : 'fuentes consultadas'}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2.5 pt-1">
                                    {finalDiagnosis.sources.map((source, idx) => {
                                        if (!source.uri) return null;
                                        const citationNumber = idx + 1;
                                        const title = getLinkText(source);
                                        return (
                                            <a key={idx} href={source.uri} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-medium rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-cyan-300 dark:border-cyan-700/60 shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer no-underline">
                                                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 dark:bg-cyan-500 text-white dark:text-slate-950 text-xs font-bold shadow-xs">
                                                    {citationNumber}
                                                </span>
                                                <span className="max-w-[200px] md:max-w-xs truncate font-medium">{title}</span>
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {infoSources && (
                            <details className="pt-2 border-t dark:border-slate-700">
                                <summary className="font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 list-inside text-sm">
                                    Ver desglose textual de referencias bibliográficas
                                </summary>
                                <div 
                                    className="mt-2 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 prose max-w-none dark:prose-invert dark:bg-slate-800 dark:border-slate-700"
                                    dangerouslySetInnerHTML={{ __html: renderDiagnosisHtml(infoSources, finalDiagnosis.sources) }}
                                />
                            </details>
                        )}
                    </div>
                );
            })()}
         </div>;
    };

    return <Card className="max-w-4xl mx-auto">
        {showApiKeyModal && (
            <div className="fixed inset-0 bg-black/60 z-[70] flex justify-center items-center p-4 backdrop-blur-sm">
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl border-2 border-blue-500">
                    <h3 className="text-xl font-bold mb-4">Clave de API Requerida</h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        Para generar imágenes médicas detalladas, se requiere una clave de API con facturación habilitada (Plan Pay-as-you-go).
                    </p>
                    <div className="flex flex-col gap-3">
                        <button onClick={handleRetryImage} className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700">
                            Seleccionar Clave y Reintentar
                        </button>
                        <button onClick={() => setShowApiKeyModal(false)} className="w-full bg-gray-200 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-300 dark:bg-slate-700 dark:text-gray-300">
                            Continuar sin Imagen
                        </button>
                    </div>
                    <p className="mt-4 text-xs text-gray-500 text-center">
                        Más información en <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">ai.google.dev/gemini-api/docs/billing</a>
                    </p>
                </div>
            </div>
        )}
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