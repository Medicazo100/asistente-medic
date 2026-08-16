import React, { useState } from 'react';
import { Section } from '../../constants';
import DisclaimerModal from '../ui/DisclaimerModal';

interface SidebarProps {
    activeSection: Section;
    onSectionChange: (section: Section) => void;
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

const navItems = [
    { id: Section.Welcome, title: 'Inicio', icon: '🏠' },
    { id: Section.Simulator, title: 'Simulador Médico', icon: '🩺' },
    { id: Section.ArticleAnalyzer, title: 'Analizador Artículos', icon: '📄' },
    { id: Section.Quiz, title: 'Quizzes Interactivos', icon: '🧠' },
    { id: Section.Scores, title: 'Scores & Cálculos', icon: '🧮' },
    { id: Section.Notes, title: 'Guías para Notas', icon: '📝' },
    { id: Section.Guides, title: 'Guías Rápidas', icon: '📚' },
    { id: Section.ChatBot, title: 'DoctorIA', icon: '💬' },
];

const Sidebar: React.FC<SidebarProps> = ({ activeSection, onSectionChange, isOpen, setIsOpen }) => {
    const [showDisclaimer, setShowDisclaimer] = useState(false);

    const handleSectionClick = (section: Section) => {
        onSectionChange(section);
        // Close sidebar on mobile after navigation
        if (window.innerWidth < 768) { 
            setIsOpen(false);
        }
    };
    
    return (
        <>
            {/* Overlay for mobile */}
            <div 
                className={`fixed inset-0 bg-black/50 z-30 md:hidden transition-opacity ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={() => setIsOpen(false)}
                aria-hidden="true"
            ></div>

            <aside className={`fixed top-0 left-0 h-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-2xl border-r border-gray-200 dark:border-slate-700 w-64 z-40 transform transition-transform md:relative md:translate-x-0 md:shadow-lg flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 flex items-center justify-center gap-3 border-b border-gray-200 dark:border-slate-700 cursor-pointer h-[65px] flex-shrink-0" onClick={() => handleSectionClick(Section.Welcome)}>
                     <button 
                        onClick={(e) => {
                            e.stopPropagation(); // Prevenir navegación al home
                            setShowDisclaimer(true);
                        }}
                        className="hover:scale-105 transition-transform cursor-help flex-shrink-0" 
                        aria-label="Aviso Legal Médico"
                        title="Ver Aviso Legal"
                     >
                        <img src="/icon-192.png" alt="Logo Asistente Médico" className="w-8 h-8 rounded-lg shadow-md object-cover border border-blue-200 dark:border-slate-600" />
                     </button>
                     <h2 className="text-lg font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-teal-600 dark:from-cyan-300 dark:to-purple-400">Asistente Médico</h2>
                </div>
                
                <nav className="p-3 flex-1 overflow-y-auto overflow-x-hidden pb-24 scrollbar-thin scrollbar-thumb-blue-200 dark:scrollbar-thumb-slate-700">
                    <ul className="space-y-2">
                        {navItems.map(item => (
                            <li key={item.id}>
                                <a
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleSectionClick(item.id);
                                    }}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group relative ${
                                        activeSection === item.id
                                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/40 dark:from-pink-600 dark:to-purple-600 dark:shadow-purple-500/40 transform scale-[1.02] font-bold border-2 border-transparent'
                                            : 'text-gray-600 dark:text-gray-400 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md hover:shadow-blue-100/50 hover:scale-[1.02] dark:hover:bg-slate-800 dark:hover:text-cyan-300 dark:hover:shadow-cyan-900/30 border-2 border-transparent hover:border-blue-300 dark:hover:border-cyan-500/50 font-medium'
                                    }`}
                                >
                                    <span className={`text-2xl w-8 text-center transition-transform duration-300 ${activeSection === item.id ? 'scale-110' : 'group-hover:scale-125 group-hover:rotate-6'}`}>{item.icon}</span>
                                    <span className="tracking-wide">{item.title}</span>
                                    {activeSection === item.id && (
                                        <div className="absolute right-3 w-2 h-2 rounded-full bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
                                    )}
                                </a>
                            </li>
                        ))}
                    </ul>
                </nav>
                
                {/* Decorative bottom element */}
                <div className="absolute bottom-0 left-0 w-full p-4 pointer-events-none opacity-10 dark:opacity-5 z-10">
                    <div className="h-32 bg-gradient-to-t from-blue-500 to-transparent rounded-t-3xl"></div>
                </div>
            </aside>

            {showDisclaimer && <DisclaimerModal onClose={() => setShowDisclaimer(false)} />}
        </>
    );
};

export default Sidebar;