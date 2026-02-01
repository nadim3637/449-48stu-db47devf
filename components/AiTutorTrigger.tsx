import React from 'react';
import { Bot } from 'lucide-react';

interface Props {
    onClick: () => void;
}

export const AiTutorTrigger: React.FC<Props> = ({ onClick }) => {
    return (
        <button 
            onClick={onClick}
            className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-indigo-600 transition-colors animate-in zoom-in duration-300"
        >
            <Bot size={24} />
            <span className="text-[10px] font-bold mt-1">AI Tutor</span>
        </button>
    );
};
