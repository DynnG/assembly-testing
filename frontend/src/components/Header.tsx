import React from 'react';
import { MessageSquareHeart, ShieldCheck } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
                <MessageSquareHeart className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Articula <span className="text-teal-400 font-medium">Conversation Companion</span>
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-teal-950/80 border border-teal-500/30 text-teal-300 font-medium">
                Your Space to Speak, Express, and Grow
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              A judgment-free space to practice expressing your thoughts, opinions, and experiences in English. <span className="text-slate-300 italic">"English is not just something you study. It is something you practice by using it."</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/70 border border-slate-700/60 px-3 py-1.5 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Judgment-Free • Zero Permanent Audio Storage</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
