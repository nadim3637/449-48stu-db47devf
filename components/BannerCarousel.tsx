import React, { useState } from 'react';
import { ArrowRight, ChevronRight, X } from 'lucide-react';

interface Props {
    banners: React.ReactNode[];
}

export const BannerCarousel: React.FC<Props> = ({ banners }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    if (!banners || banners.length === 0) return null;

    // Filter out null/undefined banners (in case conditional rendering passed nulls)
    const validBanners = banners.filter(b => b);

    if (validBanners.length === 0) return null;

    const handleNext = () => {
        setCurrentIndex((prev) => (prev + 1) % validBanners.length);
    };

    return (
        <div className="relative mx-1 mb-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="overflow-hidden rounded-2xl shadow-lg border border-slate-200 bg-white relative">
                {/* Banner Content */}
                <div className="relative min-h-[160px] flex items-stretch">
                    <div className="w-full">
                        {validBanners[currentIndex]}
                    </div>
                </div>

                {/* Navigation Overlay */}
                <div className="absolute bottom-2 right-2 flex items-center gap-2 z-20">
                    {/* Dots */}
                    <div className="flex gap-1 mr-2 bg-black/20 backdrop-blur-sm px-2 py-1 rounded-full">
                        {validBanners.map((_, idx) => (
                            <div 
                                key={idx} 
                                className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentIndex ? 'bg-white scale-125' : 'bg-white/50'}`} 
                            />
                        ))}
                    </div>

                    <button 
                        onClick={handleNext}
                        className="bg-white/90 hover:bg-white text-slate-800 text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm flex items-center gap-1 transition-transform active:scale-95"
                    >
                        SKIP <ChevronRight size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
};
