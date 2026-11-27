import React, { useState } from 'react';
import { FileCheck, Sliders, AlertTriangle, ShieldCheck, Sparkles, Info } from 'lucide-react';
import type { WordAlignmentResult } from '../types';

interface ReferenceAndWerCardProps {
  referenceTranscript: string;
  onReferenceChange: (text: string) => void;
  alignmentResult: WordAlignmentResult | null;
  onRecalculateAlignment: () => void;
  isProcessing: boolean;
  recordingId?: string;
  referenceRecordingId?: string | null;
  scenarioTitle?: string;
}

export const ReferenceAndWerCard: React.FC<ReferenceAndWerCardProps> = ({
  referenceTranscript,
  onReferenceChange,
  alignmentResult,
  onRecalculateAlignment,
  isProcessing,
  recordingId,
  referenceRecordingId,
  scenarioTitle,
}) => {
  const [showNormalizationPolicy, setShowNormalizationPolicy] = useState(false);

  const isMismatch = Boolean(
    recordingId &&
    referenceRecordingId &&
    recordingId.trim() !== '' &&
    referenceRecordingId.trim() !== '' &&
    recordingId !== referenceRecordingId
  );

  const isReferenceEmpty = !referenceTranscript.trim();
  const isWerAvailable = Boolean(
    alignmentResult &&
    alignmentResult.status === 'valid' &&
    alignmentResult.word_error_rate_percent !== null &&
    !isMismatch &&
    !isReferenceEmpty
  );

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
              <h2 className="text-base font-semibold text-white">
                Pipeline A: ASR Transcription Accuracy & Word Error Rate (WER)
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-indigo-300 border border-slate-700">
                WER = (S + D + I) / N
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Evaluates AssemblyAI acoustic transcription against human-verified ground-truth for this specific recording
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

      {/* Recording Association Provenance Banner */}
      <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-slate-300">
            Active Recording Target:{' '}
            <strong className="text-white font-mono">{recordingId || 'current_recording'}</strong>
          </span>
          {scenarioTitle && (
            <span className="text-[11px] text-slate-400 hidden md:inline">({scenarioTitle})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-slate-400">Reference Provenance:</span>
          {referenceRecordingId ? (
            <span
              className={`font-mono px-2 py-0.5 rounded ${
                isMismatch
                  ? 'bg-rose-950/40 text-rose-300 border border-rose-800'
                  : 'bg-indigo-950/40 text-indigo-300 border border-indigo-800'
              }`}
            >
              Paired to: {referenceRecordingId}
            </span>
          ) : (
            <span className="font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
              Unverified / Custom Audio
            </span>
          )}
        </div>
      </div>

      {/* Data Integrity Warning Banners */}
      {isMismatch && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Reference Transcript Mismatch Detected:</span>
            <p className="text-slate-200">
              The reference transcript belongs to recording <code>{referenceRecordingId}</code>, but the active audio is <code>{recordingId}</code>. Cross-recording reference reuse is strictly prohibited to prevent misleading WER results.
            </p>
          </div>
        </div>
      )}

      {isReferenceEmpty && !isMismatch && (
        <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs text-amber-300 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">WER Unavailable (No Reference Transcript):</span>
            <p className="text-slate-300">
              Word Error Rate requires a human-verified ground-truth transcript specifically paired with this recording. Stale reference transcripts from prior sessions are automatically cleared.
            </p>
          </div>
        </div>
      )}

      {/* Methodological Scope Clarification */}
      <div className="p-2.5 bg-slate-950/40 border border-slate-800/80 rounded-lg text-[11px] text-slate-400 flex items-center gap-2">
        <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span>
          <strong className="text-slate-200">Independence Guarantee:</strong> This reference transcript is used exclusively to benchmark AssemblyAI word recognition accuracy. It is never used as the expected pronunciation reference in phonetic assessment.
        </span>
      </div>

      {/* Editable Reference Transcript Input */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
            Verified Reference Transcript for Active Recording (N words):
          </label>
          <span className="text-[11px] text-slate-500">
            Word count: {referenceTranscript.trim() ? referenceTranscript.trim().split(/\s+/).length : 0}
          </span>
        </div>
        <textarea
          rows={3}
          value={referenceTranscript}
          onChange={(e) => onReferenceChange(e.target.value)}
          placeholder="Paste or type verified ground-truth transcript for this exact audio recording..."
          disabled={isProcessing}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono leading-relaxed"
        />
        <div className="flex justify-end mt-1.5">
          <button
            onClick={onRecalculateAlignment}
            disabled={isProcessing || !referenceTranscript.trim()}
            className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3 text-indigo-400" />
            <span>Verify & Calculate WER for this Recording</span>
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          {/* Word Error Rate Percent */}
          <div
            className={`col-span-2 sm:col-span-1 rounded-lg p-3 border ${
              isWerAvailable
                ? 'bg-indigo-950/30 border-indigo-500/40'
                : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div className="text-[11px] text-indigo-300 font-semibold mb-1">
              Word Error Rate (WER)
            </div>
            <div className="text-2xl font-bold font-mono text-white">
              {isWerAvailable && alignmentResult && alignmentResult.word_error_rate_percent !== null
                ? `${alignmentResult.word_error_rate_percent}%`
                : 'WER Unavailable'}
            </div>
            <div className="text-[10px] text-indigo-400 font-mono mt-0.5">
              {isWerAvailable && alignmentResult && alignmentResult.word_error_rate !== null
                ? `WER: ${alignmentResult.word_error_rate}`
                : isMismatch
                ? 'Recording Mismatch'
                : 'Requires Verified Ref'}
            </div>
          </div>

          {/* Substitutions (S) */}
          <div className="bg-slate-950/60 border border-amber-500/30 rounded-lg p-3">
            <div className="text-[11px] text-amber-300 font-medium mb-1">Substitutions (S)</div>
            <div className="text-xl font-bold font-mono text-amber-400">
              {isWerAvailable ? alignmentResult?.substitution_count ?? 0 : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Mismatched words</div>
          </div>

          {/* Deletions (D) */}
          <div className="bg-slate-950/60 border border-rose-500/30 rounded-lg p-3">
            <div className="text-[11px] text-rose-300 font-medium mb-1">Deletions (D)</div>
            <div className="text-xl font-bold font-mono text-rose-400">
              {isWerAvailable ? alignmentResult?.deletion_count ?? 0 : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Missing in ASR</div>
          </div>

          {/* Insertions (I) */}
          <div className="bg-slate-950/60 border border-cyan-500/30 rounded-lg p-3">
            <div className="text-[11px] text-cyan-300 font-medium mb-1">Insertions (I)</div>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {isWerAvailable ? alignmentResult?.insertion_count ?? 0 : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Extra in ASR</div>
          </div>

          {/* Total Errors */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-medium mb-1">Errors (S+D+I)</div>
            <div className="text-xl font-bold font-mono text-white">
              {isWerAvailable ? alignmentResult?.total_errors ?? 0 : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Numerator</div>
          </div>

          {/* Reference Words (N) */}
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3">
            <div className="text-[11px] text-slate-400 font-medium mb-1">Ref Words (N)</div>
            <div className="text-xl font-bold font-mono text-white">
              {isWerAvailable ? alignmentResult?.reference_word_count ?? 0 : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Denominator</div>
          </div>
        </div>

        {/* Visual Word Alignment Sequence */}
        {isWerAvailable && alignmentResult?.aligned_pairs && alignmentResult.aligned_pairs.length > 0 && (
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

            <div className="flex flex-wrap gap-1.5 pt-1">
              {alignmentResult.aligned_pairs.map((pair, idx) => {
                if (pair.type === 'match') {
                  return (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-xs"
                      title="Exact Match"
                    >
                      {pair.ref_token}
                    </span>
                  );
                }
                if (pair.type === 'substitution') {
                  return (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/40 text-amber-300 font-mono text-xs"
                      title={`Substitution: Expected '${pair.ref_token}', recognized '${pair.hyp_token}'`}
                    >
                      <span className="line-through text-amber-400/60 mr-1">{pair.ref_token}</span>
                      <span>&rarr; {pair.hyp_token}</span>
                    </span>
                  );
                }
                if (pair.type === 'deletion') {
                  return (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-xs"
                      title={`Deletion: '${pair.ref_token}' missing in ASR transcript`}
                    >
                      -{pair.ref_token}
                    </span>
                  );
                }
                if (pair.type === 'insertion') {
                  return (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-xs"
                      title={`Insertion: '${pair.hyp_token}' extra in ASR transcript`}
                    >
                      +{pair.hyp_token}
                    </span>
                  );
                }
                return null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
