import React, { useState } from 'react';
import {
  Sparkles,
  AlertTriangle,
  Clock,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  HelpCircle,
  Lightbulb,
} from 'lucide-react';
import type { AiAnalysisSummary, EvaluationResponse, TranscriptionResponse } from '../types';
import { generateAiSummary } from '../services/api';

interface AiAnalysisSummaryCardProps {
  currentResult: TranscriptionResponse | null;
  evaluationResult: EvaluationResponse | null;
  preferredAccent?: string;
  onAiSummaryGenerated?: (summary: AiAnalysisSummary) => void;
}

export const AiAnalysisSummaryCard: React.FC<AiAnalysisSummaryCardProps> = ({
  currentResult,
  evaluationResult,
  preferredAccent = 'General English',
  onAiSummaryGenerated,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [customSummary, setCustomSummary] = useState<AiAnalysisSummary | null>(null);
  const [expandedObsIndex, setExpandedObsIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active summary is either manually re-generated or from initial transcription
  const summary: AiAnalysisSummary | null =
    customSummary ||
    (currentResult?.ai_summary as AiAnalysisSummary | null) ||
    null;

  if (!currentResult || !currentResult.words || currentResult.words.length === 0) {
    return null;
  }

  const handleRegenerateSummary = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const res = await generateAiSummary({
        full_transcription: currentResult.text || currentResult.full_transcription || '',
        words: currentResult.words || [],
        pronunciation_findings: currentResult.pronunciation_findings || [],
        evaluation_metrics: evaluationResult || undefined,
        preferred_accent: preferredAccent,
      });
      if (res && res.overall_summary) {
        setCustomSummary(res);
        if (onAiSummaryGenerated) {
          onAiSummaryGenerated(res);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate AI analysis summary');
    } finally {
      setIsGenerating(false);
    }
  };

  const observations = summary?.pronunciation_observations || [];
  const timingObs = summary?.speech_timing_observations || [];
  const qualityWarnings = summary?.audio_quality_warnings || [];
  const limitations = summary?.limitations || [];
  const reviewRecs = summary?.human_review_recommendations || [];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400">
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">
                AI-Assisted Pronunciation & Fluency Interpretation
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-950/70 text-purple-300 font-mono border border-purple-800/80 flex items-center gap-1">
                Evidence-Constrained
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Plain-language explanation grounded strictly in validated phonetic alignments and acoustic measurements
            </p>
          </div>
        </div>

        <button
          onClick={handleRegenerateSummary}
          disabled={isGenerating}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 self-start sm:self-auto border border-slate-700"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${isGenerating ? 'animate-spin' : ''}`} />
          <span>{isGenerating ? 'Analyzing Evidence...' : 'Re-analyze Summary'}</span>
        </button>
      </div>

      {errorMessage && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      {/* A. Overall Summary Card */}
      <div className="p-4 bg-gradient-to-r from-slate-950 to-slate-900 border border-slate-800 rounded-xl space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-300 uppercase tracking-wider">
          <BookOpen className="w-4 h-4 text-purple-400" />
          <span>Overall Recording Assessment</span>
        </div>
        <p className="text-xs text-slate-200 leading-relaxed">
          {summary?.overall_summary ||
            'Processing speech segments and phonetic alignment baseline... Click "Re-analyze Summary" to generate interpretation.'}
        </p>
      </div>

      {/* B. Pronunciation Observations & Practice Guidance */}
      {observations.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Lightbulb className="w-4 h-4 text-amber-400" />
              <span>Targeted Pronunciation Observations ({observations.length})</span>
            </span>
            <span className="text-[11px] text-slate-500 font-mono">
              Phonetic Differences vs Reference
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {observations.map((obs, idx) => {
              const isExpanded = expandedObsIndex === idx;
              return (
                <div
                  key={idx}
                  className="p-3.5 bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-lg space-y-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-xs flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-cyan-300">
                        {obs.word}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        Target /{obs.target_phoneme}/ recognized as /{obs.predicted_phoneme}/
                      </span>
                    </span>
                    <button
                      onClick={() => setExpandedObsIndex(isExpanded ? null : idx)}
                      className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-normal">{obs.observation}</p>

                  {/* Expandable articulatory breakdown */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-xs">
                      {obs.possible_articulation_explanation && (
                        <div className="text-[11px] text-slate-400">
                          <strong className="text-slate-300">Articulatory Focus:</strong>{' '}
                          {obs.possible_articulation_explanation}
                        </div>
                      )}

                      {obs.practice_recommendation && obs.practice_recommendation.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          <span className="text-[10px] text-amber-400 font-semibold uppercase">Practice Words:</span>
                          {obs.practice_recommendation.map((pw, pIdx) => (
                            <span
                              key={pIdx}
                              className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px]"
                            >
                              {pw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* C. Speech Timing & Quality Warnings Side-by-Side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Timing Observations */}
        {timingObs.length > 0 && (
          <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-300">
              <Clock className="w-4 h-4 text-teal-400" />
              <span>Speech Timing & Rate Insights</span>
            </div>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {timingObs.map((t, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-teal-400 font-bold">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Audio Quality Warnings */}
        <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-lg space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Acoustic Quality & Segmentation Warnings</span>
          </div>
          {qualityWarnings.length > 0 ? (
            <ul className="space-y-1.5 text-xs text-slate-300 max-h-36 overflow-y-auto">
              {qualityWarnings.map((w, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-amber-400 font-bold">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>All word audio slices met minimum duration and energy criteria.</span>
            </p>
          )}
        </div>
      </div>

      {/* D. Human Review Recommendations & Scientific Limitations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
        {/* Tokens for Review */}
        {reviewRecs.length > 0 && (
          <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg space-y-1.5">
            <div className="text-xs font-semibold text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
              <span>Recommended Tokens for Human Review ({reviewRecs.length})</span>
            </div>
            <ul className="space-y-1 text-[11px] text-slate-300 max-h-28 overflow-y-auto">
              {reviewRecs.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className="text-rose-400">•</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Limitations */}
        <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg space-y-1.5">
          <div className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>Important Evaluation Limitations</span>
          </div>
          <ul className="space-y-1 text-[11px] text-slate-400">
            {limitations.map((lim, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-slate-500">•</span>
                <span>{lim}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};
