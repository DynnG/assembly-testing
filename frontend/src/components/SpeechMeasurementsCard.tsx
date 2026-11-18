import React from 'react';
import { Gauge, Clock, Volume2 } from 'lucide-react';
import type {
  SpeechRateResult,
  PauseMetricsResult,
  RepetitionRateResult,
  SelfCorrectionCandidate,
  SilencePauseEvent,
} from '../types';

interface SpeechMeasurementsCardProps {
  audioDurationSeconds?: number;
  responseIntervalSeconds: number;
  onResponseIntervalChange: (interval: number) => void;
  recognizedWordCount: number;
  speechRateResult: SpeechRateResult | null;
  pauseMetricsResult: PauseMetricsResult | null;
  repetitionRateResult: RepetitionRateResult | null;
  selfCorrectionCandidates: SelfCorrectionCandidate[];
  detectedPauses: SilencePauseEvent[];
  isProcessing: boolean;
}

export const SpeechMeasurementsCard: React.FC<SpeechMeasurementsCardProps> = ({
  audioDurationSeconds: _audioDurationSeconds,
  responseIntervalSeconds,
  onResponseIntervalChange,
  recognizedWordCount,
  speechRateResult,
  pauseMetricsResult,
  repetitionRateResult,
  selfCorrectionCandidates,
  detectedPauses,
  isProcessing,
}) => {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Speech Measurements & Fluency Indicators</h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 border border-slate-700">
                Thesis Formulas
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Quantitative indicators derived from recognized speech words, active response interval, and acoustic signal
            </p>
          </div>
        </div>

        {/* Configurable Response Interval T */}
        <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Response Interval T:</span>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={responseIntervalSeconds || ''}
            onChange={(e) => onResponseIntervalChange(parseFloat(e.target.value) || 0)}
            disabled={isProcessing}
            className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-center focus:border-teal-500"
          />
          <span className="text-slate-400">sec</span>
        </div>
      </div>

      {/* Grid of Measurements */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Speech Rate WPM */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-teal-300 font-semibold uppercase tracking-wider">
              Speech Rate
            </span>
            <span className="text-[10px] text-slate-500 font-mono">60 * W / T</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {speechRateResult?.speech_rate_wpm !== null && speechRateResult?.speech_rate_wpm !== undefined
              ? `${speechRateResult.speech_rate_wpm} WPM`
              : 'Unavailable'}
          </div>
          <div className="text-[11px] text-slate-400">
            W = {recognizedWordCount} words, T = {responseIntervalSeconds}s
          </div>
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            Includes internal pauses, excludes prompts
          </div>
        </div>

        {/* Metric 2: Pause Frequency & Count */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-cyan-300 font-semibold uppercase tracking-wider">
              Pause Frequency
            </span>
            <span className="text-[10px] text-slate-500 font-mono">P / T</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {pauseMetricsResult?.pauses_per_minute !== null && pauseMetricsResult?.pauses_per_minute !== undefined
              ? `${pauseMetricsResult.pauses_per_minute} /min`
              : 'Unavailable'}
          </div>
          <div className="text-[11px] text-slate-400">
            P = {pauseMetricsResult?.pause_count ?? detectedPauses.length} pauses ({pauseMetricsResult?.pause_frequency ?? 0}/sec)
          </div>
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            Acoustically validated silence signal
          </div>
        </div>

        {/* Metric 3: Mean Pause Duration */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-indigo-300 font-semibold uppercase tracking-wider">
              Mean Pause Duration
            </span>
            <span className="text-[10px] text-slate-500 font-mono">sum(dur) / P</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {pauseMetricsResult?.mean_pause_duration_seconds !== null && pauseMetricsResult?.mean_pause_duration_seconds !== undefined
              ? `${pauseMetricsResult.mean_pause_duration_seconds}s`
              : 'Undefined (P=0)'}
          </div>
          <div className="text-[11px] text-slate-400">
            Total silence: {pauseMetricsResult?.total_pause_duration_seconds ?? 0}s
          </div>
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            Threshold: &gt;= 0.25s silence
          </div>
        </div>

        {/* Metric 4: Repetition Rate & Self-Corrections */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-purple-300 font-semibold uppercase tracking-wider">
              Repetition Rate
            </span>
            <span className="text-[10px] text-slate-500 font-mono">100 * R / W</span>
          </div>
          <div className="text-2xl font-bold font-mono text-white">
            {repetitionRateResult?.repetition_rate_percent !== null && repetitionRateResult?.repetition_rate_percent !== undefined
              ? `${repetitionRateResult.repetition_rate_percent}%`
              : 'Unavailable'}
          </div>
          <div className="text-[11px] text-slate-400">
            R = {repetitionRateResult?.repetition_event_count ?? 0} events | Self-corrections: {selfCorrectionCandidates.length}
          </div>
          <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80">
            Operational repetition measure
          </div>
        </div>
      </div>

      {/* Disfluency Event Inspector Chips */}
      {(detectedPauses.length > 0 || selfCorrectionCandidates.length > 0) && (
        <div className="p-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs space-y-2">
          <div className="font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Acoustic Pause Breakdown ({detectedPauses.length} intervals)</span>
            </span>
            <span className="text-[11px] text-slate-500">Signal-validated silences (&gt;= 0.25s)</span>
          </div>

          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
            {detectedPauses.map((p, i) => (
              <span
                key={i}
                className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300 font-mono text-[11px] flex items-center gap-1"
              >
                <span className="text-cyan-400 font-bold">P{i + 1}:</span>
                <span>{p.start_seconds}s - {p.end_seconds}s</span>
                <span className="text-slate-400 text-[10px]">({p.duration_seconds}s)</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
