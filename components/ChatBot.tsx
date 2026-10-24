import React, { useState, useEffect, useRef } from 'react';
import { createChat, cleanMedicalMarkdown } from '../services/geminiService';
import { ChatMessage, DoctoriaLibraryPayload, StudyLibraryRecord, BoosterClinicoResult } from '../types';
import Card from './ui/Card';
import { BoosterClinicoButton, BoosterClinicoCard } from './BoosterClinico';
import { ConsultaBasicaButton } from './ConsultaBasicaButton';
import { optimizarPreguntaClinica } from '../services/doctorIaService';
import { marked } from 'marked';
import { Chat } from '@google/genai';
import useLocalStorage from '../hooks/useLocalStorage';
import {
    buildStudyRecord,
    createStudyRecordId,
    findStudyRecord,
    markStudyViewed,
    saveStudyRecord,
} from '../services/studyLibrary';

const ChatBot: React.FC = () => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useLocalStorage<ChatMessage[]>('chat_messages', []);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOptimizingBooster, setIsOptimizingBooster] = useState(false);
    const [isSendingBasica, setIsSendingBasica] = useState(false);
    const [boosterResult, setBoosterResult] = useState<BoosterClinicoResult | null>(null);
    const [boosterOriginalText, setBoosterOriginalText] = useState('');
    const [boosterError, setBoosterError] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isUserScrollingRef = useRef<boolean>(false);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        // Si el usuario está a más de 120px del final, detectamos que ha subido para leer
        const isScrolledUp = scrollHeight - scrollTop - clientHeight > 120;
        isUserScrollingRef.current = isScrolledUp;
        setShowScrollBottom(isScrolledUp);
    };

    const scrollToBottom = () => {
        isUserScrollingRef.current = false;
        setShowScrollBottom(false);
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleOptimizeBooster = async () => {
        const currentPrompt = input.trim();
        if (!currentPrompt) {
            textareaRef.current?.focus();
            return;
        }
        if (isOptimizingBooster || isLoading) return;

        setIsOptimizingBooster(true);
        setBoosterError(null);

        try {
            const data = await optimizarPreguntaClinica(currentPrompt);
            setBoosterOriginalText(currentPrompt);
            setBoosterResult(data);
        } catch (error: any) {
            console.error('Error al optimizar con Booster Clínico:', error);
            setBoosterError('No pudimos optimizar tu duda en este momento. Inténtalo de nuevo.');
        } finally {
            setIsOptimizingBooster(false);
        }
    };

    const handleDiscardBooster = () => {
        setBoosterResult(null);
        setBoosterError(null);
    };

    const handleApplyBooster = () => {
        if (!boosterResult) return;
        setInput(boosterResult.preguntaOptimizada);
        setBoosterResult(null);
        setBoosterError(null);
        setTimeout(() => textareaRef.current?.focus(), 50);
    };

    const handleSendNowBooster = () => {
        if (!boosterResult) return;
        const text = boosterResult.preguntaOptimizada;
        setBoosterResult(null);
        setBoosterError(null);
        setInput('');
        void handleSend(text);
    };

    const handleSendBasica = async () => {
        const currentPrompt = input.trim();
        if (!currentPrompt) {
            textareaRef.current?.focus();
            return;
        }
        if (isLoading || isSendingBasica) return;

        setBoosterResult(null);
        setBoosterError(null);
        setIsSendingBasica(true);
        try {
            await handleSend(currentPrompt, { mode: 'basica' });
        } finally {
            setIsSendingBasica(false);
        }
    };

    const startNewChat = () => {
        setChat(createChat());
        setMessages([{ role: 'model', text: '¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?' }]);
        setInput('');
        setIsLoading(false);
        setIsSendingBasica(false);
        setBoosterResult(null);
        setBoosterError(null);
    };

    useEffect(() => {
        // Only start a new chat if there are no persisted messages
        // or if we need to re-initialize the chat instance (which is always required on reload)
        const newChat = createChat();
        setChat(newChat);
        
        if (messages.length === 0) {
             setMessages([{ role: 'model', text: '¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy?' }]);
        }
        // Note: The new chat instance won't have context of previous messages unless we feed it back.
        // For simple usage, we just persist the visual history. 
        // A full context restoration would require sending history to Gemini again, which costs tokens.
    }, []);

    useEffect(() => {
        // Solo auto-desplazar al fondo si el usuario NO ha scrolleado hacia arriba a leer
        if (!isUserScrollingRef.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    useEffect(() => {
        const restoreSavedResponse = (event: Event) => {
            const record = (event as CustomEvent<StudyLibraryRecord<DoctoriaLibraryPayload>>).detail;
            if (!record?.payload?.response) return;
            setMessages(prev => [
                ...prev,
                { role: 'user', text: record.payload.question },
                { role: 'model', text: record.payload.response },
            ]);
            void markStudyViewed(record.id);
        };

        window.addEventListener('aiclinic:restore-doctoria', restoreSavedResponse);

        const checkPendingDoctoria = () => {
            try {
                const pending = sessionStorage.getItem('aiclinic:pending-doctoria');
                if (pending) {
                    sessionStorage.removeItem('aiclinic:pending-doctoria');
                    restoreSavedResponse(new CustomEvent('restore', { detail: JSON.parse(pending) }));
                }
            } catch (err) {
                console.warn('Error al restaurar DoctorIA pendiente:', err);
            }
        };

        checkPendingDoctoria();
        window.addEventListener('focus', checkPendingDoctoria);

        return () => {
            window.removeEventListener('aiclinic:restore-doctoria', restoreSavedResponse);
            window.removeEventListener('focus', checkPendingDoctoria);
        };
    }, [setMessages]);

    const handleSend = async (textToSend?: string | unknown, options?: { mode?: 'basica' | 'normal' }) => {
        const messageToSend = (typeof textToSend === 'string' ? textToSend : input).trim();
        if (!messageToSend) return;

        let activeChat = chat;
        if (!activeChat) {
            activeChat = createChat();
            setChat(activeChat);
        }

        const question = messageToSend;
        const isBasica = options?.mode === 'basica';
        const userMessage: ChatMessage = { 
            role: 'user', 
            text: question,
            mode: isBasica ? 'basica' : 'normal'
        };
        setMessages(prev => [...prev, userMessage, { role: 'model', text: '' }]);
        setInput('');
        setIsLoading(true);
        isUserScrollingRef.current = false;
        setShowScrollBottom(false);

        const promptForGemini = isBasica
            ? `[CONSULTA BÁSICA: Responde directo y al grano limitándote estrictamente a lo que se pregunta como cualquier modelo de lenguaje general, con claridad pedagógica y amabilidad, sin sermones, sin exigir variables semiológicas ni forzar el uso del booster]: ${question}`
            : question;

        try {
            // Send message to Gemini with active session and fallback
            let result;
            try {
                result = await activeChat.sendMessageStream({ message: promptForGemini });
            } catch (initialErr) {
                console.warn("[DoctorIA] Intento inicial en chat falló, reintentando con sesión fresca:", initialErr);
                activeChat = createChat();
                setChat(activeChat);
                result = await activeChat.sendMessageStream({ message: promptForGemini });
            }

            let text = '';
            for await (const chunk of result) {
                 text += chunk.text;
                 const cleanedText = cleanMedicalMarkdown(text);
                 setMessages(prev => {
                     const newMessages = [...prev];
                     if (newMessages.length > 0) {
                        newMessages[newMessages.length - 1].text = cleanedText;
                     }
                     return newMessages;
                 });
            }

            const finalText = cleanMedicalMarkdown(text);
            if (finalText.trim()) {
                await saveStudyRecord(buildStudyRecord({
                    id: createStudyRecordId('doctoria', question),
                    kind: 'doctoria',
                    title: question,
                    topic: question,
                    payload: { question, response: finalText },
                }));
            }
        } catch (error) {
            console.error("Chat error:", error);
            setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages.length > 0) {
                    newMessages[newMessages.length - 1].text = 'Lo siento, ocurrió un error al procesar tu solicitud.';
                }
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <Card className="max-w-3xl mx-auto flex flex-col h-[85vh] sm:h-[88vh] !p-3.5 sm:!p-5 overflow-hidden">
            {/* Encabezado con Booster Clínico y Consulta Básica apilados a la izquierda, Título centrado y Reiniciar a la derecha */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3 border-b pb-2.5 dark:border-slate-700 shrink-0">
                {/* Lado Izquierdo: Botones apilados verticalmente con alto contraste y bordes definidos */}
                <div className="flex flex-col items-start justify-center gap-1 sm:gap-1.5">
                    <BoosterClinicoButton
                        onClick={handleOptimizeBooster}
                        disabled={isLoading || isOptimizingBooster}
                        isOptimizing={isOptimizingBooster}
                    />
                    <ConsultaBasicaButton
                        onClick={handleSendBasica}
                        disabled={isLoading || isSendingBasica}
                        isLoading={isSendingBasica}
                    />
                </div>

                {/* Centro: Título DoctorIA y leyenda inferior perfectamente centrada */}
                <div className="flex flex-col items-center justify-center text-center px-1">
                    <h2 className="text-xl sm:text-2xl font-bold text-blue-800 dark:text-cyan-300 leading-tight">
                        💬 DoctorIA
                    </h2>
                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">
                        Un Médico virtual apoyando a un médico real
                    </p>
                </div>

                {/* Lado Derecho: Botón Reiniciar en el costado opuesto para evitar presiones accidentales */}
                <div className="flex items-center justify-end">
                    <button
                        onClick={startNewChat}
                        title="Reiniciar conversación y comenzar nuevo caso"
                        className="text-xs font-bold py-1.5 px-2.5 sm:px-3 rounded-lg transition-all duration-200 flex items-center gap-1.5 shadow-sm border bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-800 border-slate-300 hover:border-sky-400 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-cyan-300 dark:border-cyan-500/60 dark:hover:border-cyan-400 cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.75a.75.75 0 0 0-.75.75v4.482a.75.75 0 0 0 1.5 0v-2.05l.435.435a7 7 0 1 0 1.942-8.91.75.75 0 0 0-.966 1.144 5.5 5.5 0 0 1 9.391 3.494Z" clipRule="evenodd" />
                        </svg>
                        <span className="hidden sm:inline">Reiniciar</span>
                        <span className="sm:hidden">Reset</span>
                    </button>
                </div>
            </div>
            <div 
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 min-h-0 overflow-y-auto pr-2 sm:pr-3 space-y-4 scroll-smooth"
            >
                {messages.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xl sm:max-w-2xl p-3 sm:p-3.5 rounded-2xl ${msg.role === 'user' ? 'bg-blue-500 text-white rounded-br-none' : 'bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-gray-200 rounded-bl-none'}`}>
                           {msg.role === 'user' && msg.mode === 'basica' && (
                                <div className="flex items-center gap-1 mb-1.5">
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/20 text-white border border-white/30 inline-flex items-center gap-1 backdrop-blur-xs select-none">
                                        <span>💡</span> Consulta básica
                                    </span>
                                </div>
                           )}
                           {msg.role === 'model' && msg.text === '' ? (
                                <div className="flex items-center space-x-2">
                                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                                    <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse"></div>
                                </div>
                           ) : (
                                <>
                                    <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed" dangerouslySetInnerHTML={{ __html: marked.parse(cleanMedicalMarkdown(msg.text)) }}></div>
                                    {msg.role === 'model' && msg.text.toLowerCase().includes('booster') && index > 0 && messages[index - 1]?.role === 'user' && messages[index - 1]?.mode !== 'basica' && (
                                        <div className="mt-3 pt-2.5 border-t border-slate-300 dark:border-slate-600 flex items-center justify-between gap-2 flex-wrap">
                                            <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                                                ¿Quieres reformular esta duda con rigor médico?
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const prevQuestion = messages[index - 1].text;
                                                    setInput(prevQuestion);
                                                    setTimeout(() => {
                                                        textareaRef.current?.focus();
                                                    }, 50);
                                                }}
                                                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white shadow-sm transition-all cursor-pointer"
                                                title="Carga tu duda en el cuadro de texto para usar el Booster Clínico"
                                            >
                                                <span>⚡ Cargar en Booster Clínico</span>
                                            </button>
                                        </div>
                                    )}
                                </>
                           )}
                        </div>
                    </div>
                ))}
                 <div ref={messagesEndRef} />
            </div>
            {showScrollBottom && (
                <div className="flex justify-center -mt-8 mb-2 z-20 animate-fade-in relative pointer-events-none">
                    <button
                        onClick={scrollToBottom}
                        className="pointer-events-auto px-3.5 py-1.5 rounded-full bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-lg hover:shadow-xl flex items-center gap-1.5 transition-all cursor-pointer border border-sky-300/60 backdrop-blur-xs"
                        title="Bajar al final de la respuesta"
                    >
                        <span>↓</span>
                        <span>Bajar al final</span>
                    </button>
                </div>
            )}
            <div className="mt-2 sm:mt-2.5 pt-2 sm:pt-2.5 border-t dark:border-slate-700 shrink-0">
                <BoosterClinicoCard
                    result={boosterResult}
                    originalText={boosterOriginalText}
                    errorMessage={boosterError}
                    onClearError={() => setBoosterError(null)}
                    onDiscard={handleDiscardBooster}
                    onApply={handleApplyBooster}
                    onSendNow={handleSendNowBooster}
                />
                <div className="flex items-end gap-2">
                    <textarea
                        ref={textareaRef}
                        rows={2}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        placeholder="Escribe tu pregunta o duda clínica aquí..."
                        className="w-full px-3.5 sm:px-4 py-2 sm:py-2.5 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-sky-500 text-sm leading-relaxed"
                        onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                if (!isLoading && input.trim()) {
                                    handleSend();
                                }
                            }
                        }}
                        disabled={isLoading}
                    />
                    <button
                        onClick={() => handleSend()}
                        disabled={isLoading || !input.trim()}
                        title="Enviar a DoctorIA"
                        className="bg-blue-600 text-white font-bold p-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-400 dark:disabled:bg-slate-600 transition-colors dark:bg-purple-600 dark:hover:bg-purple-700 shrink-0 h-[46px] w-[46px] flex items-center justify-center shadow-sm cursor-pointer"
                    >
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                        </svg>
                    </button>
                </div>
            </div>
        </Card>
    );
};

export default ChatBot;
