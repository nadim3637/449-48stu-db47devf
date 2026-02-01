
export const getAvailableVoices = (): Promise<SpeechSynthesisVoice[]> => {
    if (!('speechSynthesis' in window)) {
        return Promise.resolve([]);
    }
    
    return new Promise((resolve) => {
        let voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
            return;
        }
        
        window.speechSynthesis.onvoiceschanged = () => {
            voices = window.speechSynthesis.getVoices();
            resolve(voices);
        };
        
        setTimeout(() => {
             resolve(window.speechSynthesis.getVoices());
        }, 2000);
    });
};

export const getCategorizedVoices = async () => {
    const voices = await getAvailableVoices();
    return {
        hindi: voices.filter(v => v.lang.includes('hi') || v.name.toLowerCase().includes('hindi')),
        indianEnglish: voices.filter(v => v.lang === 'en-IN' || (v.lang.includes('en') && v.name.toLowerCase().includes('india'))),
        others: voices.filter(v => !v.lang.includes('hi') && !v.name.toLowerCase().includes('hindi') && v.lang !== 'en-IN' && !v.name.toLowerCase().includes('india'))
    };
};

export const getPreferredVoice = async (lang: 'hi' | 'en') => {
    const voices = await getAvailableVoices();
    
    // Check for user or admin preference stored in localStorage (Settings sync)
    const storedSettings = localStorage.getItem('nst_system_settings');
    let preferredName = '';
    if (storedSettings) {
        const settings = JSON.parse(storedSettings);
        if (settings.voiceConfig) {
            preferredName = lang === 'hi' ? settings.voiceConfig.defaultHindiVoice : settings.voiceConfig.defaultEnglishVoice;
        }
    }

    if (preferredName) {
        const found = voices.find(v => v.name === preferredName);
        if (found) return found;
    }

    // Fallback Heuristics
    if (lang === 'hi') {
        // High Quality Hindi
        return voices.find(v => v.name.includes('Google') && v.name.includes('Hindi')) ||
               voices.find(v => v.lang === 'hi-IN') ||
               voices.find(v => v.lang.includes('hi'));
    } else {
        // High Quality Indian English
        return voices.find(v => v.name.includes('Google') && v.name.includes('India')) ||
               voices.find(v => v.lang === 'en-IN') ||
               voices.find(v => v.name.includes('India')) ||
               voices.find(v => v.lang === 'en-US'); // Ultimate fallback
    }
};

export const speakText = async (text: string, voice?: SpeechSynthesisVoice | null, rate: number = 1.0, lang: string = 'en-US') => {
    if (!('speechSynthesis' in window)) {
        console.warn('Text-to-speech not supported.');
        return;
    }

    window.speechSynthesis.cancel();

    // Auto-detect Language (Basic check)
    const isHindi = /[\u0900-\u097F]/.test(text);
    const targetLang = isHindi ? 'hi' : 'en';
    
    // Get Best Voice if not provided
    const selectedVoice = voice || await getPreferredVoice(targetLang);

    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang;
    } else {
        utterance.lang = isHindi ? 'hi-IN' : 'en-US';
    }
    utterance.rate = rate;
    utterance.pitch = 1.0;

    window.speechSynthesis.speak(utterance);
};

export const stopSpeech = () => {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
};
