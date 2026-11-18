import React from 'react';
import { Mic, ShieldCheck, Info } from 'lucide-react';

export const Header: React.FC = () => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
                <Mic className="w-5 h-5" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Articula <span className="text-teal-400 font-medium">ASR Testing Web App</span>
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono">
                AssemblyAI Prototype
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
              Standalone evaluation prototype for Articula: <span className="text-slate-300 italic">"An AI-Based Speech Coach for Clear and Effective English Communication Through Conversational Voice Analysis."</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/70 border border-slate-700/60 px-3 py-1.5 rounded-lg">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Zero Server Audio Storage</span>
            </div>
          </div>
        </div>

        {/* Data processing notice */}
        <div className="mt-3 flex items-start gap-2 bg-slate-800/40 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-400">
          <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <p>
            <strong className="text-slate-300">Privacy & Processing:</strong> Audio submitted is transmitted to AssemblyAI’s official Speech-to-Text API for transcription. The backend holds no persistent database and clears temporary memory buffers immediately after each request. Provider retention is governed by AssemblyAI's account settings.
          </p>
        </div>
      </div>
    </header>
  );
};
