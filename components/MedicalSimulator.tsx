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

    // Transient State (UI only)
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [userQuestion, setUserQuestion] = useState('');
    const [customLab, setCustomLab] = useState('');
    const [customImaging, setCustomImaging] = useState('');
    const [loadingStudies, setLoadingStudies] = useState(new Set<string>());

    const anamnesisEndRef = useRef<HTMLDivElement>(null);
    const resultsEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (labResults.length > 0 || imagingResults.length > 0) {
             setTimeout(() => resultsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
    }, [labResults, imagingResults]);
    
    const handleStartSimulation = async () => {
        if (!topic.trim()) { setError('Por favor, ingresa un signo, síntoma o patología.'); return; }
        setIsLoading(true); setError(null);
        try {
            const caseData = await generateClinicalCase(topic, difficulty);
            setClinicalCase(caseData); setStep(1);
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
    
    const getFullCaseSummaryForDiagnosis = () => {
        if (!clinicalCase) return '';
        const vitalSignsLabels: {[key: string]: string} = { presionArterial: 'Presión Arterial', frecuenciaCardiaca: 'Frecuencia Cardiaca', frecuenciaRespiratoria: 'Frecuencia Respiratoria', temperatura: 'Temperatura', saturacionOxigeno: 'Saturación de Oxígeno' };
        let summary = `**CASO CLÍNICO INICIAL**\n- Título: ${clinicalCase.caseTitle}\n- Perfil: ${clinicalCase.patientProfile}\n- Padecimiento: ${clinicalCase.historyOfPresentIllness}\n- Signos Vitales:\n${Object.entries(clinicalCase.vitalSigns).map(([k, v]) => `  - ${vitalSignsLabels[k] || k}: ${v}`).join('\n')}\n- Examen Físico: ${clinicalCase.physicalExam}\n\n`;
        summary += `**ANAMNESIS DIRIGIDA**\n${anamnesisHistory.length > 0 ? anamnesisHistory.map(t => `- Médico: ${t.question}\n- Paciente: ${t.patientResponse}\n`).join('\n') : 'No se realizó anamnesis adicional.\n'}\n`;
        summary += `**RESULTADOS DE ESTUDIOS**\nLaboratorios:\n${labResults.length > 0 ? labResults.map(l => `- ${l.study}: ${l.interpretation}\n`).join('') : 'No se solicitaron.\n'}\nImagen:\n${imagingResults.length > 0 ? imagingResults.map(i => `- ${i.study}: ${i.findings}\n`).join('') : 'No se solicitaron.\n'}`;
        return summary;
    };

    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [pendingImageRequest, setPendingImageRequest] = useState<{study: string, findings: string} | null>(null);

    const handleStudySelection = async (type: 'labs' | 'imaging', study: string, checked: boolean) => {
        const isAlreadySelected = selectedStudies[type].includes(study);
        if (checked === isAlreadySelected) return;

        setSelectedStudies(prev => ({ ...prev, [type]: checked ? [...prev[type], study] : prev[type].filter(s => s !== study) }));

        if (!checked) {
            if (type === 'labs') setLabResults(prev => prev.filter(r => r.study !== study));
            else setImagingResults(prev => prev.filter(r => r.study !== study));
            return;
        }

        setLoadingStudies(prev => new Set(prev).add(study));
        setError(null);
        try {
            const request = type === 'labs' ? { labs: [study], imaging: [] } : { labs: [], imaging: [study] };
            const tempContext = `Caso: ${clinicalCase?.historyOfPresentIllness}. Anamnesis: ${anamnesisHistory.map(h => h.patientResponse).join(' ')}`;
            const resultData = await generateStudyResults(tempContext, request);
            if (type === 'labs' && resultData.labs.length > 0) {
                setLabResults(prev => [...prev.filter(r => r.study !== study), ...resultData.labs]);
            } else if (type === 'imaging' && resultData.imaging.length > 0) {
                const result = resultData.imaging[0];
                let imageUrl: string | undefined;
                try {
                    imageUrl = await generateImage(result.study, result.findings);
                } catch (imgErr: any) { 
                    console.error("Error generating medical image:", imgErr);
                    let errorMessage = '';
                    if (typeof imgErr === 'string') errorMessage = imgErr;
                    else if (imgErr?.error?.message) errorMessage = imgErr.error.message;
                    else if (imgErr?.message) errorMessage = imgErr.message;
                    else errorMessage = JSON.stringify(imgErr);

                    if (errorMessage.includes('PERMISSION_DENIED') || errorMessage.includes('403') || errorMessage.includes('does not have permission') || errorMessage.includes('Requested entity was not found')) {
                         setPendingImageRequest({ study: result.study, findings: result.findings });
                         setShowApiKeyModal(true);
                         setError("Se requiere una clave de API válida para generar imágenes médicas de alta calidad.");
                    } else {
                        setError("Ocurrió un error inesperado al generar la imagen médica.");
                    }
                }
                setImagingResults(prev => [...prev.filter(r => r.study !== study), { ...result, imageUrl }]);
            }
        } catch (e) {
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
        setIsLoading(true); setError(null);
        try {
            const fullContext = getFullCaseSummaryForDiagnosis();
            if (!fullContext) { setError('No hay suficiente información.'); setIsLoading(false); return; }
            const diagnosisData = await getFinalDiagnosis(fullContext);
            setFinalDiagnosis(diagnosisData); setStep(3);
        } catch(e) { setError('Error al generar el diagnóstico.'); console.error(e); }
        setIsLoading(false);
    };
    
    const resetSimulator = () => {
        setTopic(''); setStep(0); setClinicalCase(null); setAnamnesisHistory([]); 
        setAllAvailableStudies({ labs: [], imaging: [] }); setSelectedStudies({ labs: [], imaging: [] }); 
        setLabResults([]); setImagingResults([]); setFinalDiagnosis(null); setError(null);
        setDifficulty('Interno');
    };

    const handleProceedToStudies = async () => {
        setIsLoading(true);
        setError(null);
        if (!clinicalCase) { setError('Error: no hay caso clínico cargado.'); setIsLoading(false); return; }
        try {
            const suggestions = await getSuggestedStudies(clinicalCase);
            setAllAvailableStudies({ labs: suggestions.suggestedLabs, imaging: suggestions.suggestedImaging });
            setStep(2);
        } catch (e) { setError('Error al obtener sugerencias de estudios.'); console.error(e); }
        setIsLoading(false);
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
            <h4 className="font-semibold mb-3 text-lg">{title}</h4>
            {studies.map(study => <div key={study}>
                <label className="flex items-center cursor-pointer p-2.5 bg-white dark:bg-slate-800 rounded-lg border-2 border-gray-200 dark:border-slate-600 hover:border-blue-300 dark:hover:border-purple-400 transition-colors">
                    <input type="checkbox" onChange={e => handleStudySelection(type, study, e.target.checked)} checked={selectedStudies[type].includes(study)} disabled={loadingStudies.has(study)} className="h-5 w-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500" />
                    <span className="ml-3 text-sm font-medium">{study}</span>
                    {loadingStudies.has(study) && <div className="ml-auto animate-spin rounded-full h-4 w-4 border-b-2 border-t-2 border-blue-500" />}
                </label>
            </div>)}
             <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-400 mb-1">¿Necesitas otro estudio?</label>
                 <div className="flex items-center gap-2">
                    <input type="text" value={type === 'labs' ? customLab : customImaging} onChange={e => type === 'labs' ? setCustomLab(e.target.value) : setCustomImaging(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddCustomStudy(type)} placeholder={type === 'labs' ? "Otro laboratorio..." : "Otro estudio de imagen..."} className="flex-grow px-3 py-2 bg-white dark:bg-slate-700 border-2 border-gray-300 dark:border-slate-600 rounded-md text-sm focus:border-blue-500" />
                    <button onClick={() => handleAddCustomStudy(type)} className="bg-gray-200 dark:bg-slate-600 hover:bg-gray-300 dark:hover:bg-slate-500 text-sm font-semibold py-2 px-4 rounded-md border-2 border-transparent">Añadir</button>
                </div>
            </div>
        </div>;

        const renderResultsPanel = () => <div className="space-y-6">
            {labResults.length > 0 && <div>
                <h3 className="font-bold text-xl mb-3 text-blue-900 dark:text-cyan-300 border-b-2 border-blue-200 dark:border-cyan-800 pb-1 inline-block">Resultados de Laboratorio</h3>
                <div className="space-y-4">{labResults.map(result => 
                    <div key={result.study} className="p-4 bg-white dark:bg-slate-800 rounded-xl border-2 border-blue-300 dark:border-emerald-500 shadow-md animate-fade-in">
                        <h4 className="font-semibold mb-2 text-lg text-blue-800 dark:text-emerald-300">{result.study}</h4>
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-600">
                            <table className="min-w-full text-xs md:text-sm !border-none !shadow-none !m-0">
                                <thead className="bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200">
                                    <tr>
                                        <th scope="col" className="px-3 py-2 text-left font-bold !border-b-2 !border-gray-300 dark:!border-slate-500">Parámetro</th>
                                        <th scope="col" className="px-3 py-2 text-left font-bold !border-b-2 !border-gray-300 dark:!border-slate-500">Resultado</th>
                                        <th scope="col" className="px-3 py-2 text-left font-bold hidden sm:table-cell !border-b-2 !border-gray-300 dark:!border-slate-500">Unidades</th>
                                        <th scope="col" className="px-3 py-2 text-left font-bold !border-b-2 !border-gray-300 dark:!border-slate-500">Rango</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-slate-600">
                                    {result.components?.map(comp => <tr key={comp.parameter} className={`${comp.isAbnormal ? "bg-red-50 dark:bg-red-900/30" : "odd:bg-white even:bg-gray-50 dark:odd:bg-slate-800 dark:even:bg-slate-800/50"}`}>
                                        <td className="px-3 py-2 !border-b border-gray-200 dark:border-slate-700 font-medium text-gray-900 dark:text-gray-100">{comp.parameter}</td>
                                        <td className={`px-3 py-2 font-bold !border-b border-gray-200 dark:border-slate-700 ${comp.isAbnormal ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-gray-200'}`}>{comp.value}</td>
                                        <td className="px-3 py-2 hidden sm:table-cell !border-b border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400">{comp.units}</td>
                                        <td className="px-3 py-2 !border-b border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-400">{comp.referenceRange}</td>
                                    </tr>)}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 text-sm italic p-2 bg-blue-50 dark:bg-slate-700/50 rounded border border-blue-100 dark:border-slate-600"><strong>Interpretación: </strong>{result.interpretation}</p>
                    </div>)}
                </div>
            </div>}
            {imagingResults.length > 0 && <div>
                <h3 className="font-bold text-xl mb-3 text-blue-900 dark:text-cyan-300 border-b-2 border-blue-200 dark:border-cyan-800 pb-1 inline-block">Resultados de Imagen</h3>
                <div className="space-y-4">{imagingResults.map(result => 
                    <div key={result.study} className="p-4 bg-white dark:bg-slate-800 rounded-xl border-2 border-blue-300 dark:border-purple-500 shadow-md animate-fade-in">
                        <h4 className="font-semibold mb-2 text-lg text-blue-800 dark:text-purple-300">{result.study}</h4>
                        {result.imageUrl && <img src={result.imageUrl} alt={`Imagen de ${result.study}`} className="rounded-lg shadow-md w-full max-w-md mx-auto border-2 border-gray-200 dark:border-slate-600" />}
                        {result.findings && (
                            <div className="mt-4 p-3 bg-gray-50 dark:bg-slate-900/50 rounded-md border border-gray-200 dark:border-slate-600">
                                <h5 className="font-semibold text-sm text-gray-800 dark:text-gray-300 mb-1">Informe Radiológico</h5>
                                <p className="text-sm text-gray-700 dark:text-gray-400 whitespace-pre-wrap">{result.findings}</p>
                            </div>
                        )}
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
                    <div className="mt-6 animate-fade-in space-y-4">
                        <h3 className="font-bold text-2xl text-blue-900 dark:text-cyan-300">Diagnóstico y Desglose</h3>
                        <div className="p-6 bg-green-50/50 dark:bg-slate-800 rounded-xl border-2 border-green-500 dark:border-pink-500 shadow-lg prose max-w-none dark:prose-invert"
                            dangerouslySetInnerHTML={{ __html: marked.parse(mainDiagnosis) }} />
                        
                        {infoSources && (
                            <details className="pt-4 border-t dark:border-slate-700">
                                <summary className="font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 list-inside">
                                    Fuentes de Información
                                </summary>
                                <div className="mt-2 p-4 bg-gray-50 rounded-lg border-2 border-gray-200 prose max-w-none dark:prose-invert dark:bg-slate-800 dark:border-slate-700"
                                    dangerouslySetInnerHTML={{ __html: marked.parse(infoSources) }}
                                />
                            </details>
                        )}

                        {finalDiagnosis.sources.length > 0 && (
                            <details className="pt-4 border-t dark:border-slate-700">
                                <summary className="font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-gray-100 list-inside">
                                    Fuentes de Google Search
                                </summary>
                                <ul className="list-disc list-inside text-sm mt-2 space-y-1 pl-4">
                                    {finalDiagnosis.sources.map((source, i) => source.uri && 
                                        <li key={i}>
                                            <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline dark:text-blue-400 break-all">
                                                {getLinkText(source)}
                                            </a>
                                        </li>
                                    )}
                                </ul>
                            </details>
                        )}
                    </div>
                );
            })()}
         </div>;
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
        } catch (e) {
            console.error("Retry failed", e);
            setError("No se pudo generar la imagen. Asegúrate de haber seleccionado una clave válida.");
        } finally {
            setIsLoading(false);
        }
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