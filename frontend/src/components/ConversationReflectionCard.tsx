import React, { useState } from 'react';
import {
  Sparkles,
  BookOpen,
  Lightbulb,
  MessageCircle,
  Heart,
  ArrowRight,
  CheckCircle2,
  Copy,
  Check,
  Compass,
} from 'lucide-react';
import type { ConversationReflection } from '../types';

interface ConversationReflectionCardProps {
  reflection: ConversationReflection;
  topic?: string;
  turnCount?: number;
  durationSeconds?: number;
}

export const ConversationReflectionCard: React.FC<ConversationReflectionCardProps> = ({
  reflection,
  topic,
  turnCount,
  durationSeconds,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopyExpression = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-white tracking-wide">
              Conversation Reflection
            </h2>
            {topic && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-teal-300 font-medium capitalize border border-slate-700">
                {topic.replace(/_/g, ' ')}
              </span>
            )}
            <span className="bg-teal-500/10 text-teal-300 text-xs px-2.5 py-0.5 rounded-full border border-teal-500/20 font-medium">
              Judgment-Free Practice
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Reflect on what you expressed, discover natural phrases, and celebrate sharing your thoughts.
          </p>
        </div>

        {/* Quick Session Stats (Encouraging, Non-evaluative) */}
        <div className="flex items-center gap-3 text-xs">
          {turnCount !== undefined && (
            <div className="bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg text-slate-300">
              <span className="text-teal-400 font-semibold">{turnCount}</span> Spoken Turns
            </div>
          )}
          {durationSeconds !== undefined && durationSeconds > 0 && (
            <div className="bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg text-slate-300">
              <span className="text-teal-400 font-semibold">{Math.round(durationSeconds)}s</span> Conversation Time
            </div>
          )}
        </div>
      </div>

      {/* SECTION 1: Conversation Summary */}
      <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <MessageCircle className="w-4 h-4 text-teal-400" />
          <span>1. Conversation Summary & Themes</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
          {reflection.conversation_summary}
        </p>

        {reflection.topics_covered && reflection.topics_covered.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2">
            {reflection.topics_covered.map((t, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-1 rounded-md bg-teal-950/60 text-teal-300 border border-teal-500/20"
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 2: Useful Expressions & Natural Alternatives */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span>2. Useful Expressions & Natural Alternatives</span>
          </div>
          <span className="text-xs text-slate-400">Phrases to add to your everyday English</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {reflection.useful_expressions.map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-800/60 border border-slate-700/70 rounded-lg p-3.5 flex flex-col justify-between space-y-2 hover:border-slate-600 transition-all"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300">
                    "{item.phrase}"
                  </span>
                  <button
                    onClick={() => handleCopyExpression(item.natural_alternative || item.phrase, idx)}
                    title="Copy natural alternative"
                    className="text-slate-400 hover:text-slate-200 p-1 rounded bg-slate-700/50"
                  >
                    {copiedIndex === idx ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>

                {item.natural_alternative && (
                  <div className="bg-emerald-950/30 border border-emerald-500/20 rounded p-2 text-xs">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Natural Alternative:</span>
                    <span className="text-emerald-300 font-medium">"{item.natural_alternative}"</span>
                  </div>
                )}

                <p className="text-xs text-slate-400 italic">
                  {item.context_note}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-700/50 text-xs text-slate-300 bg-slate-900/40 p-2 rounded">
                <span className="text-slate-400 block text-[10px]">Example in dialogue:</span>
                "{item.example_sentence}"
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 3: Thought Development Highlights */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Heart className="w-4 h-4 text-rose-400" />
          <span>3. Thought Development & Expression Highlights</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reflection.thought_development.map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-800/40 border border-slate-800 rounded-lg p-3.5 space-y-1.5"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                <h4 className="text-xs sm:text-sm font-semibold text-slate-200">
                  {item.point_expressed}
                </h4>
              </div>
              <p className="text-xs text-slate-400 pl-6 leading-relaxed">
                {item.why_it_stood_out}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION 4: Further Practice & Topics */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Compass className="w-4 h-4 text-cyan-400" />
          <span>4. Next Steps & Ideas for Further Practice</span>
        </div>

        <div className="bg-slate-800/30 border border-slate-800 rounded-lg p-4 space-y-2">
          <p className="text-xs text-slate-400">
            Here are ideas and questions you can explore in your next conversation:
          </p>
          <ul className="space-y-2">
            {reflection.further_practice_topics.map((topicItem, idx) => (
              <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-300">
                <ArrowRight className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>{topicItem}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* SECTION 5: Personal Reflection Prompts */}
      <div className="bg-gradient-to-br from-slate-900 to-teal-950/20 border border-teal-500/20 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-teal-300">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span>5. Personal Reflection & Confidence Check</span>
        </div>
        <p className="text-xs text-slate-300">
          Take a quiet moment to ask yourself these questions about how you felt speaking today:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {reflection.personal_reflection_prompts.map((prompt, idx) => (
            <div
              key={idx}
              className="bg-slate-900/80 border border-slate-800 p-3 rounded-lg flex flex-col justify-between text-xs text-slate-300 space-y-2"
            >
              <div className="flex items-center gap-1.5 text-teal-400 font-medium">
                <span>Prompt {idx + 1}</span>
              </div>
              <p className="italic text-slate-300 font-serif">"{prompt}"</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
