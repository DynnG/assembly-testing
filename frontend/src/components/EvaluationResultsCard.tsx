import React from 'react';
import { Target, CheckCircle2 } from 'lucide-react';
import type { EvaluationResponse } from '../types';

interface EvaluationResultsCardProps {
  evaluationResult: EvaluationResponse | null;
  hasReferenceData?: boolean;
}

export const EvaluationResultsCard: React.FC<EvaluationResultsCardProps> = ({
  evaluationResult,
  hasReferenceData: _hasReferenceData,
}) => {
  if (!evaluationResult) {
    return null;
  }

  const { alignment, speech_rate, quantitative_errors, event_evaluations } = evaluationResult;
  const pauseEval = event_evaluations?.pause_detection;
  const repEval = event_evaluations?.repetition_detection;
  const srError = quantitative_errors?.speech_rate_wpm;
  const durError = quantitative_errors?.response_duration_seconds;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Quantitative Evaluation & Error Analysis</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-emerald-300 font-mono border border-slate-700">
                Paired Metrics
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Assesses agreement between automated ASR measurements and manually verified reference ground-truth
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Results */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Card 1: Quantitative Speech Rate Errors */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <span className="text-xs font-semibold text-slate-200">
              Speech Rate Error (WPM)
            </span>
            <span className="text-[10px] text-slate-500 font-mono">Auto vs Reference</span>
          </div>

          {srError && srError.status === 'valid' ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">MAE</div>
                <div className="text-lg font-bold font-mono text-white mt-0.5">
                  {srError.mean_absolute_error} WPM
                </div>
                <div className="text-[9px] text-slate-500">Mean Abs Error</div>
              </div>

              <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Median AE</div>
                <div className="text-lg font-bold font-mono text-white mt-0.5">
                  {srError.median_absolute_error} WPM
                </div>
                <div className="text-[9px] text-slate-500">Median Abs Error</div>
              </div>

              <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Signed Diff</div>
                <div
                  className={`text-lg font-bold font-mono mt-0.5 ${
                    (srError.mean_signed_difference ?? 0) >= 0 ? 'text-teal-400' : 'text-rose-400'
                  }`}
                >
                  {(srError.mean_signed_difference ?? 0) >= 0 ? '+' : ''}
                  {srError.mean_signed_difference} WPM
                </div>
                <div className="text-[9px] text-slate-500">Auto - Ref</div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-900/40 rounded border border-slate-800/80 text-xs text-slate-500 text-center">
              Awaiting reference speech rate annotation in test case metadata.
            </div>
          )}

          {durError && durError.status === 'valid' && (
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
              <span>Duration Signed Diff:</span>
              <span className="font-mono text-slate-200">
                {(durError.mean_signed_difference ?? 0) >= 0 ? '+' : ''}
                {durError.mean_signed_difference}s
              </span>
            </div>
          )}
        </div>

        {/* Card 2: Event Detection (Pause Detection Precision / Recall / F1) */}
        <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
            <span className="text-xs font-semibold text-slate-200">
              Silent Pause Detection Evaluation
            </span>
            <span className="text-[10px] text-slate-500 font-mono">1-to-1 Temporal Match (0.25s)</span>
          </div>

          {pauseEval && pauseEval.status === 'valid' ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Precision</div>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                    {pauseEval.precision !== null ? `${(pauseEval.precision * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                  <div className="text-[9px] text-slate-500">TP / (TP + FP)</div>
                </div>

                <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Recall</div>
                  <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                    {pauseEval.recall !== null ? `${(pauseEval.recall * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                  <div className="text-[9px] text-slate-500">TP / (TP + FN)</div>
                </div>

                <div className="p-2 bg-slate-900 border border-slate-800 rounded">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">F1 Score</div>
                  <div className="text-lg font-bold font-mono text-teal-400 mt-0.5">
                    {pauseEval.f1_score !== null ? `${(pauseEval.f1_score * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                  <div className="text-[9px] text-slate-500">Harmonic Mean</div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                <span>Matching Breakdown:</span>
                <span className="font-mono text-slate-300">
                  TP: {pauseEval.true_positives} | FP: {pauseEval.false_positives} | FN: {pauseEval.false_negatives}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-900/40 rounded border border-slate-800/80 text-xs text-slate-500 text-center">
              Awaiting reference pause annotations for temporal matching evaluation.
            </div>
          )}
        </div>
      </div>

      {/* Repetition Detection Evaluation if available */}
      {repEval && repEval.status === 'valid' && (
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs space-y-1">
          <div className="font-semibold text-slate-300 flex items-center justify-between">
            <span>Repetition Detection Evaluation:</span>
            <span className="font-mono text-purple-300">
              F1: {repEval.f1_score !== null ? `${(repEval.f1_score * 100).toFixed(1)}%` : 'N/A'} (Precision: {repEval.precision !== null ? `${(repEval.precision * 100).toFixed(1)}%` : 'N/A'}, Recall: {repEval.recall !== null ? `${(repEval.recall * 100).toFixed(1)}%` : 'N/A'})
            </span>
          </div>
        </div>
      )}

      {/* Sample Eligibility Breakdown */}
      <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg text-xs flex flex-wrap items-center justify-between gap-2 text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          <span>Eligible Sample Status: <strong>Eligible & Complete</strong></span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          WER: {alignment.word_error_rate_percent}% | Speech Rate: {speech_rate.speech_rate_wpm ?? 'N/A'} WPM
        </div>
      </div>
    </div>
  );
};
