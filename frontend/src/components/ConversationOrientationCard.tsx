import React, { useState } from 'react';
import { Sparkles, MessageSquareHeart, HelpCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';

export const ConversationOrientationCard: React.FC = () => {
  const [expanded, setExpanded] = useState<boolean>(false);

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-teal-950/30 border border-teal-500/20 rounded-xl p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400 mt-0.5 shrink-0">
            <MessageSquareHeart className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Articula: Your Space to Speak, Express, and Grow
              </h3>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30">
                AI English Companion
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-3xl leading-relaxed">
              Welcome! The goal of Articula is not to judge how good your English is—the goal is to give you someone to talk to in English. Practice expressing your ideas, discover natural phrases, and build speaking comfort in a judgment-free space.
            </p>
          </div>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1 shrink-0"
        >
          <span>{expanded ? 'Simple View' : 'Our Philosophy'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-300 space-y-3">
          <div className="p-3 bg-teal-950/20 border border-teal-500/20 rounded-lg">
            <p className="italic text-teal-200 font-medium">
              "English is not just something you study. It is something you practice by using it."
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                <span>1. Natural Conversations</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Choose from Everyday Life, School, Work, Discussions, or Storytelling. Your AI companion listens actively and responds with thoughtful follow-up questions.
              </p>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>2. Expression Support</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Stuck on a word or idea? Use "How else can I say this?" or "Help me express this" anytime to get instant natural phrasing and vocabulary suggestions.
              </p>
            </div>

            <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>3. Thoughtful Reflection</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                When you wrap up, receive a supportive summary celebrating your ideas, useful expressions to keep, and encouraging reflection questions. Zero scores, zero grades.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
