import React, { useState } from 'react';
import { Download, FileText, FileSpreadsheet, Code2, ShieldCheck, Check } from 'lucide-react';
import type {
  EvaluationResponse,
  TestCaseScenario,
  TranscriptionResponse,
  TestSessionRecord,
} from '../types';

interface ExportCardProps {
  currentResult: TranscriptionResponse | null;
  currentScenario: TestCaseScenario;
  evaluationResult: EvaluationResponse | null;
  sessionHistory: TestSessionRecord[];
}

export const ExportCard: React.FC<ExportCardProps> = ({
  currentResult,
  currentScenario,
  evaluationResult,
  sessionHistory,
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const triggerDownload = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccess(filename);
    setTimeout(() => setDownloadSuccess(null), 2500);
  };

  // 1. Export Raw Transcript TXT
  const handleExportTxt = () => {
    if (!currentResult?.text) return;
    triggerDownload(
      `articula_transcript_${currentScenario.id}_${Date.now()}.txt`,
      currentResult.text,
      'text/plain;charset=utf-8'
    );
  };

  // 2. Export Per-Test Comprehensive CSV (all required variables)
  const handleExportTestCsv = () => {
    if (!currentResult) return;

    const align = evaluationResult?.alignment;
    const sr = evaluationResult?.speech_rate;
    const pm = evaluationResult?.pause_metrics;
    const rep = evaluationResult?.repetition_metrics.repetition_rate;

    const headers = [
      'test_case_id',
      'task_type',
      'recording_condition',
      'background_noise_category',
      'microphone_or_device',
      'speaker_code',
      'audio_filename',
      'audio_duration_seconds',
      'provider_request_id',
      'transcription_status',
      'disfluencies_enabled',
      'reference_transcript',
      'reference_word_count',
      'assemblyai_transcript',
      'recognized_word_count',
      'substitution_count',
      'deletion_count',
      'insertion_count',
      'word_error_rate',
      'word_error_rate_percent',
      'speech_rate_wpm',
      'pause_count',
      'mean_pause_duration_seconds',
      'pause_frequency',
      'repetition_rate_percent',
      'candidate_self_corrections_count',
      'annotator_id',
    ];

    const escapeCsv = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const row = [
      currentScenario.id,
      currentScenario.task_type,
      currentScenario.recording_condition,
      currentScenario.background_noise_category,
      currentScenario.microphone_or_device,
      currentScenario.speaker_code,
      currentResult.filename,
      currentResult.audio_duration ?? '',
      currentResult.id,
      currentResult.status,
      currentResult.disfluencies_enabled,
      currentScenario.reference_transcript,
      align?.reference_word_count ?? '',
      currentResult.text,
      align?.recognized_word_count ?? '',
      align?.substitution_count ?? '',
      align?.deletion_count ?? '',
      align?.insertion_count ?? '',
      align?.word_error_rate ?? '',
      align?.word_error_rate_percent ?? '',
      sr?.speech_rate_wpm ?? '',
      pm?.pause_count ?? '',
      pm?.mean_pause_duration_seconds ?? '',
      pm?.pause_frequency ?? '',
      rep?.repetition_rate_percent ?? '',
      evaluationResult?.self_corrections.candidate_count ?? '',
      currentScenario.annotator_id,
    ].map(escapeCsv);

    const csvContent = `${headers.join(',')}\n${row.join(',')}`;
    triggerDownload(
      `articula_test_${currentScenario.id}_${Date.now()}.csv`,
      csvContent,
      'text/csv;charset=utf-8'
    );
  };

  // 3. Export Reference vs ASR Alignment CSV
  const handleExportAlignmentCsv = () => {
    if (!evaluationResult?.alignment.aligned_pairs) return;

    const headers = ['token_index', 'alignment_type', 'reference_token', 'hypothesis_token'];
    const rows = evaluationResult.alignment.aligned_pairs.map((p, idx) => [
      idx + 1,
      p.type,
      p.ref_token || '',
      p.hyp_token || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    triggerDownload(
      `alignment_${currentScenario.id}_${Date.now()}.csv`,
      csvContent,
      'text/csv;charset=utf-8'
    );
  };

  // 4. Export Reproducibility Provenance Record JSON
  const handleExportReproducibilityRecord = () => {
    const reproducibilityRecord = {
      articula_evaluation_metadata: {
        system_version: 'Articula ASR Evaluation Prototype v2.0',
        generated_at: new Date().toISOString(),
        asr_provider: 'AssemblyAI Speech-to-Text v2',
        test_case_id: currentScenario.id,
        test_title: currentScenario.title,
      },
      metric_definitions_and_formulas: {
        word_error_rate: 'WER = (S + D + I) / N (Wagner-Fischer DP word alignment)',
        speech_rate: 'Speech Rate (WPM) = 60 * W / T (W: words, T: response interval in sec)',
        pause_frequency: 'Pause Frequency = P / T (P: qualifying silence pauses >= threshold)',
        mean_pause_duration: 'Mean Pause Duration = sum(durations) / P',
        repetition_rate: 'Repetition Rate (%) = 100 * R / W',
        mean_absolute_error: 'MAE = sum(|auto - ref|) / n',
        precision: 'Precision = TP / (TP + FP)',
        recall: 'Recall = TP / (TP + FN)',
        f1: 'F1 = 2 * Precision * Recall / (Precision + Recall)',
      },
      evaluation_parameters: {
        min_pause_duration_seconds: 0.25,
        silence_threshold_db: -35.0,
        event_match_tolerance_seconds: 0.25,
        normalization_policy: {
          lowercase: true,
          remove_punctuation: true,
          preserve_fillers: true,
          preserve_stutter_hyphens: true,
        },
      },
      test_configuration: {
        task_type: currentScenario.task_type,
        recording_condition: currentScenario.recording_condition,
        background_noise_category: currentScenario.background_noise_category,
        microphone_or_device: currentScenario.microphone_or_device,
        speaker_code: currentScenario.speaker_code,
        annotator_id: currentScenario.annotator_id,
        audio_filename: currentResult?.filename,
        audio_duration_seconds: currentResult?.audio_duration,
      },
      evaluation_results: evaluationResult || null,
      security_notice: 'No private API keys, user passwords, or local file paths are included.',
    };

    triggerDownload(
      `reproducibility_record_${currentScenario.id}_${Date.now()}.json`,
      JSON.stringify(reproducibilityRecord, null, 2),
      'application/json;charset=utf-8'
    );
  };

  // 5. Export Multi-Test Session Summary CSV
  const handleExportSessionSummaryCsv = () => {
    if (sessionHistory.length === 0) return;

    const headers = [
      'test_case_id',
      'audio_filename',
      'status',
      'audio_duration_seconds',
      'reference_words',
      'recognized_words',
      'wer_percent',
      'substitutions',
      'deletions',
      'insertions',
      'speech_rate_wpm',
      'pause_count',
      'mean_pause_dur_s',
      'pause_freq_per_min',
      'repetition_rate_pct',
      'recording_condition',
      'task_type',
    ];

    const rows = sessionHistory.map((s) => [
      s.test_case_id,
      s.audio_file,
      s.status,
      s.audio_duration_seconds,
      s.reference_word_count,
      s.recognized_word_count,
      s.word_error_rate_percent ?? 'N/A',
      s.substitution_count,
      s.deletion_count,
      s.insertion_count,
      s.speech_rate_wpm ?? 'N/A',
      s.pause_count,
      s.mean_pause_duration_seconds ?? 'N/A',
      s.pauses_per_minute ?? 'N/A',
      s.repetition_rate_percent ?? 'N/A',
      `"${s.recording_condition}"`,
      `"${s.task_type}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    triggerDownload(
      `articula_session_summary_${Date.now()}.csv`,
      csvContent,
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
            <Download className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Research Data & Reproducibility Export</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 font-mono border border-slate-700">
                Auditable Outputs
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Download transcripts, alignment comparisons, and complete reproducibility audit logs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/60 self-start sm:self-auto">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero Credentials in Export</span>
        </div>
      </div>

      {/* Download Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Button 1: Verbatim Transcript TXT */}
        <button
          onClick={handleExportTxt}
          disabled={!currentResult?.text}
          className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex items-center justify-between text-teal-400 mb-1">
            <FileText className="w-4 h-4" />
            <span className="text-[10px] font-mono text-slate-500 uppercase">.txt</span>
          </div>
          <div className="text-xs font-semibold text-white group-hover:text-teal-300">
            Raw Transcript
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Verbatim AssemblyAI output string
          </div>
        </button>

        {/* Button 2: Per-Test CSV */}
        <button
          onClick={handleExportTestCsv}
          disabled={!currentResult}
          className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="text-[10px] font-mono text-slate-500 uppercase">.csv</span>
          </div>
          <div className="text-xs font-semibold text-white group-hover:text-emerald-300">
            Per-Test Metrics CSV
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            All 30+ recording & evaluation variables
          </div>
        </button>

        {/* Button 3: Alignment Comparison CSV */}
        <button
          onClick={handleExportAlignmentCsv}
          disabled={!evaluationResult?.alignment}
          className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex items-center justify-between text-indigo-400 mb-1">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="text-[10px] font-mono text-slate-500 uppercase">.csv</span>
          </div>
          <div className="text-xs font-semibold text-white group-hover:text-indigo-300">
            Token Alignment CSV
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Ref vs Hyp token pairs with S/D/I
          </div>
        </button>

        {/* Button 4: Reproducibility Record JSON */}
        <button
          onClick={handleExportReproducibilityRecord}
          disabled={!evaluationResult}
          className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex items-center justify-between text-cyan-400 mb-1">
            <Code2 className="w-4 h-4" />
            <span className="text-[10px] font-mono text-slate-500 uppercase">.json</span>
          </div>
          <div className="text-xs font-semibold text-white group-hover:text-cyan-300">
            Reproducibility Record
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Audit trail: formulas, thresholds & config
          </div>
        </button>
      </div>

      {/* Session Summary Button if history has records */}
      {sessionHistory.length > 0 && (
        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Multi-Test Session History: {sessionHistory.length} test records available
          </span>
          <button
            onClick={handleExportSessionSummaryCsv}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
            <span>Export Session Summary ({sessionHistory.length} tests)</span>
          </button>
        </div>
      )}

      {/* Download Alert State */}
      {downloadSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Downloaded <strong>{downloadSuccess}</strong> successfully.</span>
        </div>
      )}
    </div>
  );
};
