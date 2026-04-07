import React from 'react';

interface CardProps {
    children: React.ReactNode;
    className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
    return (
        <div className={`bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm rounded-2xl shadow-xl p-6 md:p-8 border-2 border-blue-300 dark:border-cyan-500/50 ring-1 ring-blue-100 dark:ring-cyan-900/50 ${className}`}>
            {children}
        </div>
    );
};

export default Card;