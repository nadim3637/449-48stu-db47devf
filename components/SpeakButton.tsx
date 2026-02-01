import React, { useState } from 'react';
import { Volume2, StopCircle } from 'lucide-react';
import { speakText, stopSpeech } from '../utils/textToSpeech';

interface Props {
    text: string;
    className?: string;
    iconSize?: number;
}

export const SpeakButton: React.FC<Props> = ({ text, className, iconSize = 18 }) => {
    const [isSpeaking, setIsSpeaking] = useState(false);

    const handleSpeak = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isSpeaking) {
            stopSpeech();
            setIsSpeaking(false);
        } else {
            // speakText handles voice selection internally based on language detection
            await speakText(text); 
            setIsSpeaking(true);
            
            // Auto reset state after estimate (rough heuristic)
            setTimeout(() => setIsSpeaking(false), 5000); 
        }
    };

    return (
        <button 
            onClick={handleSpeak}
            className={`p-2 rounded-full hover:bg-slate-100 transition-colors ${className} ${isSpeaking ? 'text-blue-600 animate-pulse' : 'text-slate-400'}`}
            title={isSpeaking ? "Stop Speaking" : "Read Aloud"}
        >
            {isSpeaking ? <StopCircle size={iconSize} /> : <Volume2 size={iconSize} />}
        </button>
    );
};
