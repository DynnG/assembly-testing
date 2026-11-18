import React, { useState } from 'react';
import { ShieldAlert, ChevronDown, ChevronUp, AlertCircle, Info } from 'lucide-react';

export const ResearchLimitationsCard: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 mt-0.5 shrink-0">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-amber-300">
                Research Scope & Measurement Limitations (Articula Thesis)
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Evaluation Protocol
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1">
              This application evaluates the technical accuracy of AssemblyAI as an ASR component. It is a supplementary practice tool evaluation, not an official language assessment system.
            </p>
          </div>
        </div>

        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1 shrink-0"
        >
          <span>{expanded ? 'Hide Guidelines' : 'View Guidelines'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-300 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>ASR Accuracy != Pronunciation Quality</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Word Error Rate (WER) measures transcription alignment with the reference. Low WER indicates agreement with the target text, but does not independently establish native-like phonological pronunciation or proficiency.
              </p>
            </div>

            <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Provider Confidence != Speaker Proficiency</span>
              </div>
              <p className="text-[11px] text-slate-400">
                AssemblyAI word confidence scores represent the acoustic model's internal statistical decoding confidence, not the learner's conversational confidence, fluency, or English mastery.
              </p>
            </div>

            <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Signal Silence != Timestamp Gaps</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Gaps between word timestamps in ASR output are only candidate pauses. In this prototype, silent pauses are validated directly against the acoustic audio signal (RMS dBFS) using documented event thresholds.
              </p>
            </div>

            <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                <span>No High-Stakes Standardized Scores</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Articula does not generate CEFR levels, IELTS bands, TOEFL equivalents, or infer user emotions, anxiety, or personality traits from voice acoustics.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
