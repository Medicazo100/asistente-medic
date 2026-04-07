import React, { useState, useRef } from 'react';
import { analyzeMedicalArticle } from '../services/geminiService';
import Card from './ui/Card';
import LoadingSpinner from './ui/LoadingSpinner';
import { marked } from 'marked';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import useLocalStorage from '../hooks/useLocalStorage';

// Configurar el worker de PDF.js.
// Usamos unpkg como fallback confiable.
const pdfJsVersion = pdfjsLib.version || '4.4.168';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfJsVersion}/build/pdf.worker.min.mjs`;

const ArticleAnalyzer: React.FC = () => {
    // Persisted State
    const [analysis, setAnalysis] = useLocalStorage<string | null>('analyzer_result', null);
    const [textInput, setTextInput] = useLocalStorage<string>('analyzer_text', '');
    
    // Transient State
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Analizando artículo con IA...');
    const [error, setError] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [inputType, setInputType] = useState<'upload' | 'text'>('upload');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isGeneratingWord, setIsGeneratingWord] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const analysisRef = useRef<HTMLDivElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
            setAnalysis(null);
        }
    };

    const convertFileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    };

    const extractTextFromDocx = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    };

    const convertPdfToImages = async (file: File): Promise<string[]> => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            // Limitamos a las primeras 5 páginas para evitar sobrecarga de memoria en el navegador
            // y para mantener el payload razonable para la API.
            const numPages = Math.min(pdf.numPages, 5);
            const images: string[] = [];

            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                // Escala 1.5 ofrece buen balance entre calidad para OCR y tamaño
                const viewport = page.getViewport({ scale: 1.5 });
                
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                if (context) {
                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    // Convertir a JPEG calidad 0.8 para comprimir un poco y facilitar la subida
                    const base64Url = canvas.toDataURL('image/jpeg', 0.8);
                    images.push(base64Url.split(',')[1]);
                }
            }
            return images;
        } catch (e: any) {
            console.error("Error converting PDF to images:", e);
            throw new Error("No se pudo convertir el PDF a imágenes para OCR. El archivo podría estar dañado.");
        }
    };

    const extractTextFromPdf = async (file: File): Promise<string | null> => {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;
            
            let fullText = '';
            const numPages = pdf.numPages;
            
            // Iterar sobre todas las páginas (o hasta un límite razonable)
            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                
                const pageText = textContent.items
                    .filter((item: any) => 'str' in item && item.str.trim().length > 0)
                    .map((item: any) => item.str)
                    .join(' ');
                
                if (pageText.trim()) {
                    fullText += `\n\n--- Página ${i} ---\n${pageText}`;
                }
            }
            
            // Lógica de detección de escaneo:
            // Si el texto extraído es muy corto (< 200 caracteres) a pesar de tener páginas,
            // asumimos que es un PDF escaneado o una imagen incrustada sin capa de texto.
            // Retornamos null para activar el fallback de imágenes.
            if (fullText.trim().length < 200 && numPages > 0) {
                console.log("Texto insuficiente detectado. Probable PDF escaneado.");
                return null; 
            }
            
            return fullText;
        } catch (error: any) {
            console.error("PDF Extraction Error:", error);
            if (error.name === 'PasswordException') {
                throw new Error("El PDF está protegido con contraseña. Por favor, desbloquéalo primero.");
            }
            // Si falla la lectura de texto por cualquier otra razón, devolvemos null 
            // para intentar el fallback de imagen de manera robusta.
            return null;
        }
    };

    const handleAnalyze = async () => {
        setIsLoading(true);
        setLoadingMessage('Analizando artículo con IA...');
        setError(null);
        setAnalysis(null);

        try {
            let contentToAnalyze: string | string[] = '';
            let mimeType = 'text/plain';

            if (inputType === 'text') {
                if (!textInput.trim()) throw new Error("Por favor, pega el texto del artículo.");
                contentToAnalyze = textInput;
            } else {
                if (!file) throw new Error("Por favor, selecciona un archivo.");
                
                if (file.type === 'application/pdf') {
                    // 1. Intentar extraer texto primero (más rápido y barato)
                    setLoadingMessage('Leyendo documento...');
                    const extractedText = await extractTextFromPdf(file);
                    
                    if (extractedText) {
                        contentToAnalyze = extractedText;
                        mimeType = 'text/plain';
                    } else {
                        // 2. Fallback: PDF escaneado o imagen dentro de PDF -> OCR con IA
                        // Si extractTextFromPdf retorna null, procedemos a convertir a imágenes.
                        setLoadingMessage('Documento escaneado detectado. Procesando imágenes para lectura visual...');
                        contentToAnalyze = await convertPdfToImages(file);
                        mimeType = 'image/jpeg'; // Tratamos las páginas como imágenes para la API
                    }
                } else if (file.type.startsWith('image/')) {
                    setLoadingMessage('Procesando infografía/imagen con IA...');
                    contentToAnalyze = await convertFileToBase64(file);
                    mimeType = file.type;
                } else if (
                    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                    file.name.endsWith('.docx')
                ) {
                    contentToAnalyze = await extractTextFromDocx(file);
                    mimeType = 'text/plain';
                } else if (file.type === 'text/plain') {
                    contentToAnalyze = await file.text();
                    mimeType = 'text/plain';
                } else {
                    throw new Error("Formato de archivo no soportado. Usa PDF, Word (.docx), Imagen o Texto.");
                }
            }

            setLoadingMessage('Generando análisis clínico...');
            const result = await analyzeMedicalArticle(contentToAnalyze, mimeType);
            setAnalysis(result);

        } catch (e: any) {
            console.error(e);
            let msg = "Ocurrió un error al analizar el artículo.";
            if (e.message) msg = e.message;
            if (msg.includes("413")) msg = "El archivo es demasiado grande. Intenta con un archivo más pequeño.";
            setError(msg);
        } finally {
            setIsLoading(false);
            setLoadingMessage('Analizando artículo con IA...');
        }
    };

    const handleReset = () => {
        setFile(null);
        setAnalysis(null);
        setError(null);
        setTextInput('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const getPdfOptions = () => {
        const timestamp = new Date().toISOString().split('T')[0];
        return {
            margin: [5, 5, 5, 5], // Márgenes de 5mm para maximizar espacio
            filename: `Analisis_Medico_${timestamp}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, 
                useCORS: true,
                letterRendering: true,
                scrollY: 0,
                // windowWidth eliminado para evitar problemas de centrado
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };
    };

    const handleDownloadPDF = async () => {
        if (!analysisRef.current) return;
        setIsGeneratingPdf(true);
        
        const html = document.documentElement;
        const wasDark = html.classList.contains('dark');
        const originalStyle = analysisRef.current.getAttribute('style');
        
        // Guardar estilos originales de elementos hijos modificados para restaurarlos
        const modifiedElements: { element: HTMLElement, originalStyle: string | null }[] = [];
        const forceStyle = (el: HTMLElement, styles: Partial<CSSStyleDeclaration>) => {
            modifiedElements.push({ element: el, originalStyle: el.getAttribute('style') });
            Object.assign(el.style, styles);
        };

        try {
            // 1. Forzar Modo Claro: Eliminar clase dark para que Tailwind aplique estilos light
            if (wasDark) {
                html.classList.remove('dark');
            }

            // 2. Forzar Estilos de Contenedor:
            Object.assign(analysisRef.current.style, {
                backgroundColor: '#ffffff',
                color: '#000000', // Negro absoluto
                width: '760px', // Ancho ajustado a ~200mm (A4 menos márgenes de 5mm)
                maxWidth: '760px',
                minWidth: '760px',
                margin: '0 auto',
                padding: '20px',
                boxSizing: 'border-box',
                fontSize: '12px', 
                lineHeight: '1.4'
            });

            // 3. INYECCIÓN AGRESIVA DE ESTILOS PARA ALTO CONTRASTE
            
            // Forzar texto negro en bloques de prosa
            const proseDivs = analysisRef.current.querySelectorAll('.prose');
            proseDivs.forEach((el) => {
                const htmlEl = el as HTMLElement;
                forceStyle(htmlEl, { color: '#000000' });
                htmlEl.classList.remove('dark:prose-invert'); // Quitar inversión de color de Tailwind
            });

             // Compactar tarjetas verticalmente
            const cards = analysisRef.current.querySelectorAll('.rounded-xl.border-2');
            cards.forEach((el) => {
                const htmlEl = el as HTMLElement;
                forceStyle(htmlEl, { marginBottom: '10px' });
            });

            // Forzar encabezados de tablas (Fondo gris claro, texto negro, bordes oscuros)
            const ths = analysisRef.current.querySelectorAll('th');
            ths.forEach((el) => {
                 forceStyle(el as HTMLElement, { 
                     color: '#000000', 
                     borderColor: '#333333', 
                     backgroundColor: '#e5e7eb' 
                 });
            });

            // Forzar celdas de tablas (Texto negro, bordes grises)
            const tds = analysisRef.current.querySelectorAll('td');
            tds.forEach((el) => {
                forceStyle(el as HTMLElement, { 
                    color: '#000000', 
                    borderColor: '#cccccc',
                    backgroundColor: 'transparent'
                });
            });
            
             // Forzar negritas (Strong) a negro puro
            const strongs = analysisRef.current.querySelectorAll('strong');
            strongs.forEach((el) => {
                forceStyle(el as HTMLElement, { color: '#000000' });
            });

            // 4. Espera extendida para repintado
            await new Promise(resolve => setTimeout(resolve, 800));

            // @ts-ignore
            if (typeof window.html2pdf === 'undefined') {
                throw new Error("Librería PDF no cargada. Por favor recarga la página.");
            }
            
            const element = analysisRef.current;
            const opt = getPdfOptions();
            
            // @ts-ignore
            await window.html2pdf().set(opt).from(element).save();
        } catch (e: any) {
            console.error(e);
            setError("Error al generar el PDF: " + e.message);
        } finally {
            // Restaurar tema
            if (wasDark) {
                html.classList.add('dark');
            }
            // Restaurar estilos del contenedor principal
            if (originalStyle) {
                analysisRef.current.setAttribute('style', originalStyle);
            } else {
                analysisRef.current.removeAttribute('style');
            }
            
            // Restaurar estilos de elementos hijos modificados
            modifiedElements.forEach(({ element, originalStyle }) => {
                if (originalStyle !== null) {
                    element.setAttribute('style', originalStyle);
                } else {
                    element.removeAttribute('style');
                }
            });

            setIsGeneratingPdf(false);
        }
    };

    const handleDownloadWord = () => {
        if (!analysis) return;
        setIsGeneratingWord(true);
        try {
            // Limpiar markdown antes de convertir (corrigiendo tablas)
            const cleanedMarkdown = analysis.replace(/(\|)\s*(\|[:\-]*-+)/g, '$1\n$2');
            
            // Convertir Markdown a HTML
            // @ts-ignore
            const contentHtml = marked.parse(cleanedMarkdown);

            // Construir documento HTML compatible con Word
            // Incluimos estilos básicos para que Word renderice bien las tablas y tipografía
            const header = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head>
                    <meta charset='utf-8'>
                    <title>Análisis Médico</title>
                    <style>
                        body { font-family: 'Calibri', 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; color: #000000; }
                        h1 { font-size: 18pt; font-weight: bold; color: #1e3a8a; text-align: center; margin-bottom: 20px; }
                        h2 { font-size: 14pt; font-weight: bold; color: #1e40af; margin-top: 15px; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
                        h3 { font-size: 12pt; font-weight: bold; color: #374151; margin-top: 10px; }
                        p { margin-bottom: 10px; text-align: justify; }
                        ul { margin-bottom: 10px; }
                        li { margin-bottom: 5px; }
                        strong { color: #000000; font-weight: bold; }
                        /* Estilos específicos para Tablas en Word */
                        table { border-collapse: collapse; width: 100%; margin-bottom: 15px; margin-top: 10px; border: 1px solid #000000; }
                        th { background-color: #e5e7eb; border: 1px solid #000000; padding: 8px; font-weight: bold; text-align: left; }
                        td { border: 1px solid #000000; padding: 8px; vertical-align: top; }
                    </style>
                </head>
                <body>
                    <h1>Análisis de Artículo Médico</h1>
                    <p style="text-align: center; color: #666; font-size: 10pt;">Generado por Asistente Médico IA - ${new Date().toLocaleDateString()}</p>
                    <hr/>
                    ${contentHtml}
                </body>
                </html>
            `;

            // Crear Blob con tipo MIME para Microsoft Word
            const blob = new Blob(['\ufeff', header], {
                type: 'application/msword'
            });

            // Crear enlace de descarga
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const timestamp = new Date().toISOString().split('T')[0];
            link.href = url;
            link.download = `Analisis_Medico_${timestamp}.doc`; // .doc es más compatible con este método HTML-to-Word
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

        } catch (e: any) {
            console.error(e);
            setError("Error al generar el documento Word: " + e.message);
        } finally {
            setIsGeneratingWord(false);
        }
    };

    // Helper to render sections
    const renderAnalysisSections = (markdown: string) => {
        // CORRECCIÓN DE FORMATO DE TABLAS:
        // Detecta el patrón "| Header ||---" o "| Header ||:---" (doble pipe y guiones sin salto de línea)
        // e inserta un salto de línea para que Marked.js pueda renderizar la tabla correctamente.
        const cleanedMarkdown = markdown.replace(/(\|)\s*(\|[:\-]*-+)/g, '$1\n$2');

        // Split markdown by H2 headers to create distinct cards
        const sections = cleanedMarkdown.split(/\n(?=## )/g);
        
        return sections.map((section, index) => (
            // COMPACTACIÓN VERTICAL:
            // p-6 para mejor lectura (optimizado vs responsivo variable)
            <div key={index} className="bg-white dark:bg-slate-800 rounded-xl border-2 border-blue-400 dark:border-pink-500 overflow-hidden shadow-lg shadow-blue-100 dark:shadow-pink-900/30 transition-all mb-3 break-inside-avoid w-full">
                <div className="p-6 prose max-w-none dark:prose-invert prose-blue prose-headings:font-bold prose-h1:text-center prose-img:rounded-xl text-justify leading-snug prose-p:my-1 prose-headings:mt-2 prose-headings:mb-1 prose-ul:my-1 prose-li:my-0 prose-hr:my-2"
                    dangerouslySetInnerHTML={{ __html: marked.parse(section) }} 
                />
            </div>
        ));
    };

    return (
        <div className="max-w-5xl mx-auto">
             {!analysis && (
                <Card className="mb-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-blue-800 dark:text-cyan-300">📄 Analizador de Artículos Médicos (Tutor MBE)</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Sube un paper (PDF, Texto o Imagen) y aprende a analizarlo. <span className="text-pink-600 dark:text-pink-400 font-bold text-xs bg-pink-100 dark:bg-pink-900/30 px-2 py-0.5 rounded-full ml-2 border border-pink-300 dark:border-pink-600">OCR Activado</span></p>
                        </div>
                    </div>

                    <div className="space-y-6 animate-fade-in">
                        <div className="flex space-x-4 mb-4">
                            <button 
                                onClick={() => setInputType('upload')}
                                className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors border-2 ${inputType === 'upload' ? 'bg-blue-100 text-blue-700 border-blue-400 dark:bg-slate-700 dark:text-blue-300 dark:border-blue-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700'}`}
                            >
                                📂 Subir Archivo
                            </button>
                            <button 
                                onClick={() => setInputType('text')}
                                className={`flex-1 py-2 px-4 rounded-lg font-semibold transition-colors border-2 ${inputType === 'text' ? 'bg-blue-100 text-blue-700 border-blue-400 dark:bg-slate-700 dark:text-blue-300 dark:border-blue-500' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100 dark:bg-slate-800 dark:text-gray-400 dark:border-slate-700'}`}
                            >
                                ✏️ Pegar Texto
                            </button>
                        </div>

                        {inputType === 'upload' ? (
                            <div 
                                className="border-2 border-dashed border-blue-300 dark:border-cyan-500/50 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 dark:hover:border-cyan-400 transition-colors bg-blue-50/50 dark:bg-slate-800/50"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    className="hidden" 
                                    accept=".pdf,.docx,.doc,.txt,image/*" 
                                />
                                <div className="text-5xl mb-4">📄</div>
                                {file ? (
                                    <div>
                                        <p className="font-semibold text-green-600 dark:text-green-400 text-lg">{file.name}</p>
                                        <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                        <p className="text-xs text-gray-400 mt-2">Haz clic para cambiar de archivo</p>
                                    </div>
                                ) : (
                                    <div>
                                        <p className="text-lg font-medium text-gray-700 dark:text-gray-300">Arrastra un archivo aquí o haz clic para subir</p>
                                        <p className="text-sm text-gray-500 mt-2">Soporta: PDF (texto/escaneado), Word, Imágenes (Infografías)</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <textarea
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                placeholder="Pega aquí el contenido completo del artículo (Título, Abstract, Intro, Resultados, Discusión...)"
                                className="w-full h-64 p-4 rounded-xl border-2 border-blue-300 dark:border-cyan-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                            />
                        )}

                        {error && <div className="bg-red-100 border-2 border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">{error}</div>}

                        <button 
                            onClick={handleAnalyze} 
                            disabled={isLoading || (inputType === 'upload' && !file) || (inputType === 'text' && !textInput.trim())}
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold py-4 px-6 rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg transform hover:scale-[1.01] border-2 border-transparent hover:border-white/20"
                        >
                            {isLoading ? loadingMessage : '🔍 Analizar Artículo'}
                        </button>
                        {isLoading && (
                            <div className="flex flex-col items-center justify-center">
                                <LoadingSpinner />
                                <p className="text-sm text-gray-500 animate-pulse mt-2">{loadingMessage}</p>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {analysis && (
                <div className="animate-fade-in space-y-8">
                    {/* Botones de Acción (Arriba) */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 p-4 bg-gray-100 dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">Resultado del Análisis</h3>
                        <div className="flex gap-2 flex-wrap">
                             <button 
                                onClick={handleDownloadWord} 
                                disabled={isGeneratingWord}
                                className="flex items-center gap-2 bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 shadow-md transition-colors disabled:bg-gray-400"
                             >
                                {isGeneratingWord ? 'Generando...' : '📄 Descargar Word'}
                            </button>
                             <button 
                                onClick={handleDownloadPDF} 
                                disabled={isGeneratingPdf}
                                className="flex items-center gap-2 bg-emerald-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-emerald-700 shadow-md transition-colors disabled:bg-gray-400"
                             >
                                {isGeneratingPdf ? 'Generando...' : '🖨️ Descargar PDF'}
                            </button>
                        </div>
                    </div>

                    {/* Contenedor Ref para el PDF. Se asegura width 100% y centrado. */}
                    <div ref={analysisRef} className="w-full mx-auto bg-white dark:bg-slate-900">
                        {/* Cabecera solo visible en el PDF */}
                        <div className="p-2 rounded-xl mb-2 text-center border-b-2 border-gray-100 dark:border-slate-700">
                             <h1 className="text-2xl font-bold text-blue-900 dark:text-blue-300">Análisis de Artículo Médico</h1>
                             <p className="text-sm text-gray-500">Generado por Asistente Médico IA</p>
                             <p className="text-xs text-gray-400 mt-1">{new Date().toLocaleDateString()}</p>
                        </div>
                        {renderAnalysisSections(analysis)}
                    </div>
                    
                    <div className="mt-8 text-center pb-8 border-t dark:border-slate-700 pt-8">
                         <button onClick={handleReset} className="bg-blue-600 text-white font-bold py-3 px-8 rounded-lg hover:bg-blue-700 dark:bg-purple-600 dark:hover:bg-purple-700 shadow-lg border-2 border-transparent hover:border-blue-300 dark:hover:border-purple-300 transform hover:scale-105 transition-all">
                            Analizar otro artículo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArticleAnalyzer;