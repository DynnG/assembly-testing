import React from 'react';
import {
  Mic,
  CheckCircle2,
  Loader2,
  FileText,
  Activity,
  Headphones,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ProcessingStage } from '../types';

interface PostConversationProgressCardProps {
  currentStage: ProcessingStage;
  stageMessage: string;
  progressPercent: number;
}

interface StageStep {
  key: ProcessingStage;
  label: string;
  description: string;
  icon: React.ElementType;
}

const STAGES: StageStep[] = [
  { key: 'recording', label: 'Recording', description: 'Active dialogue', icon: Mic },
  { key: 'session_ended', label: 'Session Ended', description: 'Conversation closed', icon: CheckCircle2 },
  { key: 'transcribing', label: 'Transcribing', description: 'AssemblyAI STT', icon: FileText },
  { key: 'analyzing_fluency', label: 'Fluency', description: 'Rate & pause timing', icon: Activity },
  { key: 'analyzing_pronunciation', label: 'Pronunciation', description: 'Acoustic Wav2Vec2', icon: Headphones },
  { key: 'validating_evidence', label: 'Validation', description: 'Evidence constraints', icon: ShieldCheck },
  { key: 'generating_feedback', label: 'Feedback', description: 'Formative report', icon: Sparkles },
  { key: 'completed', label: 'Completed', description: 'Report ready', icon: CheckCircle2 },
];

export const PostConversationProgressCard: React.FC<PostConversationProgressCardProps> = ({
  currentStage,
  stageMessage,
  progressPercent,
}) => {
  const getStageStatus = (stageKey: ProcessingStage): 'completed' | 'active' | 'pending' | 'error' => {
    if (currentStage === 'error') return 'error';
    const currentIndex = STAGES.findIndex((s) => s.key === currentStage);
    const stageIndex = STAGES.findIndex((s) => s.key === stageKey);

    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white tracking-wide">
              Post-Conversation Assessment Pipeline
            </h3>
            <span className="bg-blue-500/10 text-blue-400 text-[10px] font-mono px-2 py-0.5 rounded border border-blue-500/20">
              Real Backend Stages
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {stageMessage || 'Sequential processing in progress...'}
          </p>
        </div>

        {/* Real Progress Percentage */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs font-mono font-bold text-teal-400">
              {progressPercent}%
            </span>
          </div>
          <div className="w-24 sm:w-32 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-teal-500 to-cyan-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stepper Sequence */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {STAGES.map((s) => {
          const status = getStageStatus(s.key);
          const Icon = s.icon;

          let badgeBg = 'bg-slate-950/60 border-slate-800/80 text-slate-500';
          let iconColor = 'text-slate-600';

          if (status === 'completed') {
            badgeBg = 'bg-teal-950/30 border-teal-500/40 text-teal-300 shadow-sm';
            iconColor = 'text-teal-400';
          } else if (status === 'active') {
            badgeBg = 'bg-cyan-950/40 border-cyan-400 text-cyan-200 ring-1 ring-cyan-400/30';
            iconColor = 'text-cyan-300';
          } else if (status === 'error') {
            badgeBg = 'bg-red-950/30 border-red-500/40 text-red-300';
            iconColor = 'text-red-400';
          }

          return (
            <div
              key={s.key}
              className={`p-2.5 rounded-lg border flex flex-col items-center text-center transition-all ${badgeBg}`}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 border border-slate-800 mb-1.5 relative">
                {status === 'active' ? (
                  <Loader2 className={`w-4 h-4 animate-spin ${iconColor}`} />
                ) : status === 'completed' ? (
                  <CheckCircle2 className={`w-4 h-4 ${iconColor}`} />
                ) : (
                  <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
                )}
              </div>
              <span className="text-[11px] font-semibold tracking-tight">{s.label}</span>
              <span className="text-[9px] text-slate-400 leading-tight mt-0.5 line-clamp-1">
                {s.description}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
