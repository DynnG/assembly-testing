import React, { useState } from 'react';
import { FileCheck, Sliders, AlertCircle, Sparkles } from 'lucide-react';
import type { WordAlignmentResult } from '../types';

interface ReferenceAndWerCardProps {
  referenceTranscript: string;
  onReferenceChange: (text: string) => void;
  alignmentResult: WordAlignmentResult | null;
  onRecalculateAlignment: () => void;
  isProcessing: boolean;
}

export const ReferenceAndWerCard: React.FC<ReferenceAndWerCardProps> = ({
  referenceTranscript,
  onReferenceChange,
  alignmentResult,
  onRecalculateAlignment,
  isProcessing,
}) => {
  const [showNormalizationPolicy, setShowNormalizationPolicy] = useState(false);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Reference Transcript & Word Error Rate (WER)</h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 border border-slate-700">
                WER = (S + D + I) / N
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Manually verified ground truth alignment using Wagner-Fischer dynamic programming
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowNormalizationPolicy((prev) => !prev)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors text-xs flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>{showNormalizationPolicy ? 'Hide Normalization' : 'Normalization Policy'}</span>
        </button>
      </div>

      {/* Editable Reference Transcript Input */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
            Manually Verified Reference Transcript (N words):
          </label>
          <span className="text-[11px] text-slate-500">
            Word count: {referenceTranscript.trim() ? referenceTranscript.trim().split(/\s+/).length : 0}
          </span>
        </div>
        <textarea
          rows={3}
          value={referenceTranscript}
          onChange={(e) => onReferenceChange(e.target.value)}
          placeholder="Paste or type verified ground-truth transcript including fillers..."
          disabled={isProcessing}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
        />
        <div className="flex justify-end mt-1.5">
          <button
            onClick={onRecalculateAlignment}
            disabled={isProcessing || !referenceTranscript.trim()}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Recalculate Alignment & WER</span>
          </button>
        </div>
      </div>

      {/* Normalization Policy Details */}
      {showNormalizationPolicy && (
        <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs space-y-2">
          <div className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" />
            <span>Documented Transcript Normalization Policy</span>
          </div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Both raw and normalized representations are retained. When calculating word alignment:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
            <div className="p-2 bg-slate-900 border border-slate-800 rounded">
              <strong className="text-slate-200">Case & Punctuation:</strong> Lowercased; commas, periods, and terminal marks are stripped.
            </div>
            <div className="p-2 bg-slate-900 border border-slate-800 rounded">
              <strong className="text-slate-200">Filler Words:</strong> Fillers like "um", "uh", "erm" are retained as distinct tokens for fluency inspection.
            </div>
            <div className="p-2 bg-slate-900 border border-slate-800 rounded">
              <strong className="text-slate-200">Stutter Hyphens:</strong> Hyphenated stutters (e.g., "I-I") are preserved to measure repetition preservation.
            </div>
            <div className="p-2 bg-slate-900 border border-slate-800 rounded">
              <strong className="text-slate-200">Contractions:</strong> Contracted tokens (e.g. "I'm", "don't") remain unexpanded to avoid artificial insertions.
            </div>
          </div>
        </div>
      )}

      {/* WER Metrics Cards */}
      {alignmentResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            {/* Word Error Rate Percent */}
            <div className="col-span-2 sm:col-span-1 bg-indigo-950/30 border border-indigo-500/40 rounded-lg p-3">
              <div className="text-[11px] text-indigo-300 font-semibold mb-1">
                Word Error Rate (WER)
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                {alignmentResult.word_error_rate_percent !== null
                  ? `${alignmentResult.word_error_rate_percent}%`
                  : 'Undefined (N=0)'}
              </div>
              <div className="text-[10px] text-indigo-400 font-mono mt-0.5">
                {alignmentResult.word_error_rate !== null ? `WER: ${alignmentResult.word_error_rate}` : 'N=0'}
              </div>
            </div>

            {/* Substitutions (S) */}
            <div className="bg-slate-950/60 border border-amber-500/30 rounded-lg p-3">
              <div className="text-[11px] text-amber-300 font-medium mb-1">
                Substitutions (S)
              </div>
              <div className="text-xl font-bold font-mono text-amber-400">
                {alignmentResult.substitution_count}
              </div>
              <div className="text-[10px] text-slate-500">Mismatched words</div>
            </div>

            {/* Deletions (D) */}
            <div className="bg-slate-950/60 border border-rose-500/30 rounded-lg p-3">
              <div className="text-[11px] text-rose-300 font-medium mb-1">
                Deletions (D)
              </div>
              <div className="text-xl font-bold font-mono text-rose-400">
                {alignmentResult.deletion_count}
              </div>
              <div className="text-[10px] text-slate-500">Missing in ASR</div>
            </div>

            {/* Insertions (I) */}
            <div className="bg-slate-950/60 border border-cyan-500/30 rounded-lg p-3">
              <div className="text-[11px] text-cyan-300 font-medium mb-1">
                Insertions (I)
              </div>
              <div className="text-xl font-bold font-mono text-cyan-400">
                {alignmentResult.insertion_count}
              </div>
              <div className="text-[10px] text-slate-500">Extra in ASR</div>
            </div>

            {/* Total Errors */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400 font-medium mb-1">
                Errors (S+D+I)
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {alignmentResult.total_errors}
              </div>
              <div className="text-[10px] text-slate-500">Numerator</div>
            </div>

            {/* Reference Words (N) */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
              <div className="text-[11px] text-slate-400 font-medium mb-1">
                Ref Words (N)
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {alignmentResult.reference_word_count}
              </div>
              <div className="text-[10px] text-slate-500">Denominator</div>
            </div>
          </div>

          {/* Visual Word Alignment Sequence */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <span>Word-Level Token Alignment Sequence</span>
              <div className="flex items-center gap-2 text-[10px] normal-case">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Match
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Sub
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-400" /> Del
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" /> Ins
                </span>
              </div>
            </div>

            {/* Aligned Chips */}
            <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto p-2 bg-slate-900/60 rounded-lg border border-slate-800/80">
              {alignmentResult.aligned_pairs.map((pair, idx) => {
                if (pair.type === 'match') {
                  return (
                    <div
                      key={idx}
                      className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs flex items-center gap-1"
                      title="Match"
                    >
                      <span>{pair.ref_token}</span>
                    </div>
                  );
                } else if (pair.type === 'substitution') {
                  return (
                    <div
                      key={idx}
                      className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/40 text-amber-300 font-mono text-xs flex items-center gap-1"
                      title={`Substitution: Ref '${pair.ref_token}' -> Hyp '${pair.hyp_token}'`}
                    >
                      <span className="line-through text-slate-400">{pair.ref_token}</span>
                      <span className="text-amber-400 font-bold">→</span>
                      <span>{pair.hyp_token}</span>
                    </div>
                  );
                } else if (pair.type === 'deletion') {
                  return (
                    <div
                      key={idx}
                      className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/40 text-rose-300 font-mono text-xs flex items-center gap-1"
                      title={`Deletion: '${pair.ref_token}' missing from recognized speech`}
                    >
                      <span className="line-through">{pair.ref_token}</span>
                      <span className="text-[10px] text-rose-400 uppercase font-bold">[DEL]</span>
                    </div>
                  );
                } else {
                  return (
                    <div
                      key={idx}
                      className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/40 text-cyan-300 font-mono text-xs flex items-center gap-1"
                      title={`Insertion: '${pair.hyp_token}' inserted by ASR`}
                    >
                      <span>{pair.hyp_token}</span>
                      <span className="text-[10px] text-cyan-400 uppercase font-bold">[INS]</span>
                    </div>
                  );
                }
              })}
            </div>
          </div>

          {/* Thesis Advisory Callout */}
          <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              <strong>Thesis Evaluation Note:</strong> Lower WER indicates greater verbatim word-level alignment with the reference transcript. In Articula, WER does not establish pronunciation quality or overall speaking proficiency.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
