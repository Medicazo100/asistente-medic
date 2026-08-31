import React, { useState } from 'react';
import ThemeToggle from '../ui/ThemeToggle';
import QrModal from '../ui/QrModal';
import DisclaimerModal from '../ui/DisclaimerModal';

interface HeaderProps {
    onNavigateHome: () => void;
    onToggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ onNavigateHome, onToggleSidebar }) => {
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [showDisclaimer, setShowDisclaimer] = useState(false);

    return (
        <>
            <header className="bg-gradient-to-r from-[#00c79e] via-[#00b894] to-[#00a884] dark:from-purple-700 dark:to-pink-600 shadow-md sticky top-0 z-20 text-white">
                <div className="container mx-auto px-4 py-2.5 flex items-center justify-between min-h-[68px]">
                     <div className="flex items-center gap-2">
                        {/* Hamburger menu for mobile */}
                        <button
                            onClick={onToggleSidebar}
                            className="md:hidden p-2 -ml-2 rounded-full hover:bg-white/20"
                            aria-label="Abrir menú"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </button>
                        <ThemeToggle />
                    </div>
                    <div className="flex items-center justify-center gap-3 cursor-pointer flex-grow text-center" onClick={onNavigateHome}>
                         <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowDisclaimer(true);
                            }}
                            className="hover:scale-105 transition-transform cursor-help flex-shrink-0" 
                            aria-label="Aviso Legal Médico"
                            title="Ver Aviso Legal"
                         >
                            <img src="/icon-192.png" alt="Logo AICLINIC" className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl shadow-lg object-cover" />
                         </button>
                        <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
                            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.35)] flex items-center gap-2 select-none leading-none">
                                <span>AI</span>
                                <span>CLINIC</span>
                            </h1>
                            <p className="text-xs sm:text-sm text-white/95 font-medium tracking-wide drop-shadow-sm mt-0.5 leading-tight">Hospital General de Apatzingán</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsQrModalOpen(true)}
                        className="w-10 h-10 rounded-full bg-[#f43f5e] hover:bg-[#e11d48] dark:bg-pink-500 dark:hover:bg-pink-600 text-white flex items-center justify-center font-bold text-sm focus:outline-none focus:ring-2 focus:ring-white transition-all transform hover:scale-105 shadow-md flex-shrink-0 border-2 border-white/80"
                        aria-label="Mostrar QR"
                    >
                        QR
                    </button>
                </div>
            </header>
            {isQrModalOpen && <QrModal onClose={() => setIsQrModalOpen(false)} />}
            {showDisclaimer && <DisclaimerModal onClose={() => setShowDisclaimer(false)} />}
        </>
    );
};

export default Header;