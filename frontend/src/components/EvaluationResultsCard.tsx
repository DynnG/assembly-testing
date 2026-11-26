import React, { useState } from 'react';
import { Target, CheckCircle2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import type { EvaluationResponse } from '../types';

interface EvaluationResultsCardProps {
  evaluationResult: EvaluationResponse | null;
  hasReferenceData?: boolean;
}

export const EvaluationResultsCard: React.FC<EvaluationResultsCardProps> = ({
  evaluationResult,
  hasReferenceData: _hasReferenceData,
}) => {
  const [showMatchingDetails, setShowMatchingDetails] = useState(false);

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
            <div className="space-y-2.5">
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

              {/* Sample Note */}
              {srError.sample_note && (
                <div className="flex items-start gap-1.5 p-2 bg-slate-900/60 rounded border border-slate-800/70 text-[10px] text-slate-400">
                  <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <span>{srError.sample_note}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-slate-900/40 rounded border border-slate-800/80 text-xs text-slate-500 text-center">
              Awaiting reference speech rate annotation in test case metadata.
            </div>
          )}

          {durError && durError.status === 'valid' && (
            <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-800/60">
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
            <span className="text-[10px] text-slate-500 font-mono">1-to-1 Match (&plusmn;0.25s)</span>
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
                  <div
                    className={`text-lg font-bold font-mono mt-0.5 ${
                      pauseEval.f1_score !== null && pauseEval.f1_score > 0
                        ? 'text-teal-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {pauseEval.f1_score !== null ? `${(pauseEval.f1_score * 100).toFixed(1)}%` : 'N/A'}
                  </div>
                  <div className="text-[9px] text-slate-500">Harmonic Mean</div>
                </div>
              </div>

              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                <span>Matching Breakdown:</span>
                <span className="font-mono text-slate-300">
                  TP: <span className="text-emerald-400">{pauseEval.true_positives}</span> | FP:{' '}
                  <span className="text-amber-400">{pauseEval.false_positives}</span> | FN:{' '}
                  <span className="text-rose-400">{pauseEval.false_negatives}</span>
                </span>
              </div>

              {/* Toggle Temporal Matching Details */}
              {pauseEval.matching_details && pauseEval.matching_details.length > 0 && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowMatchingDetails((prev) => !prev)}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
                  >
                    {showMatchingDetails ? (
                      <ChevronDown className="w-3 h-3" />
                    ) : (
                      <ChevronRight className="w-3 h-3" />
                    )}
                    <span>
                      {showMatchingDetails ? 'Hide' : 'Inspect'} 1-to-1 Matching Details (
                      {pauseEval.matching_details.length} events)
                    </span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-slate-900/40 rounded border border-slate-800/80 text-xs text-slate-500 text-center">
              Awaiting reference pause annotations for temporal matching evaluation.
            </div>
          )}
        </div>
      </div>

      {/* Expandable 1-to-1 Pause Matching Details */}
      {showMatchingDetails && pauseEval?.matching_details && (
        <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-lg space-y-2 text-xs">
          <span className="font-semibold text-slate-200">
            Pause Temporal Matching Diagnostics (Greedy 1-to-1 Matching within &plusmn;0.25s):
          </span>
          <div className="overflow-x-auto max-h-48 overflow-y-auto">
            <table className="w-full text-left text-[11px] font-mono">
              <thead className="bg-slate-900 text-slate-400 sticky top-0">
                <tr>
                  <th className="p-1.5">Type</th>
                  <th className="p-1.5">Detected (s)</th>
                  <th className="p-1.5">Reference (s)</th>
                  <th className="p-1.5">&Delta; Time</th>
                  <th className="p-1.5">&Delta; Dur</th>
                  <th className="p-1.5 font-sans">Reason / Annotation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {pauseEval.matching_details.map((m, idx) => {
                  const matchType = m.match_type || m.classification || 'TP';
                  return (
                    <tr key={idx} className="hover:bg-slate-900/40">
                      <td className="p-1.5 font-bold">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            matchType === 'TP'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : matchType === 'FP'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {matchType}
                        </span>
                      </td>
                      <td className="p-1.5">
                        {m.detected_start != null && m.detected_end != null
                          ? `${m.detected_start.toFixed(2)}-${m.detected_end.toFixed(2)}s`
                          : '&mdash;'}
                      </td>
                      <td className="p-1.5">
                        {m.reference_start != null && m.reference_end != null
                          ? `${m.reference_start.toFixed(2)}-${m.reference_end.toFixed(2)}s`
                          : '&mdash;'}
                      </td>
                      <td className="p-1.5">
                        {m.time_difference_sec != null ? `${m.time_difference_sec.toFixed(2)}s` : '&mdash;'}
                      </td>
                      <td className="p-1.5">
                        {m.duration_difference_sec != null
                          ? `${m.duration_difference_sec > 0 ? '+' : ''}${m.duration_difference_sec.toFixed(2)}s`
                          : '&mdash;'}
                      </td>
                      <td className="p-1.5 font-sans text-slate-400">{m.reason || m.explanation || ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Repetition Detection Evaluation if available */}
      {repEval && repEval.status === 'valid' && (
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs space-y-1">
          <div className="font-semibold text-slate-300 flex items-center justify-between">
            <span>Repetition Detection Evaluation:</span>
            <span className="font-mono text-purple-300">
              F1: {repEval.f1_score !== null ? `${(repEval.f1_score * 100).toFixed(1)}%` : '0.0%'} (Precision:{' '}
              {repEval.precision !== null ? `${(repEval.precision * 100).toFixed(1)}%` : '0.0%'}, Recall:{' '}
              {repEval.recall !== null ? `${(repEval.recall * 100).toFixed(1)}%` : '0.0%'})
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
