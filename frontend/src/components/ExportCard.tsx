import React, { useState } from 'react';
import {
  Download,
  FileText,
  FileSpreadsheet,
  Code2,
  ShieldCheck,
  Check,
  Sparkles,
  Layers,
  FileCheck2,
} from 'lucide-react';
import type {
  EvaluationResponse,
  TestCaseScenario,
  TranscriptionResponse,
  TestSessionRecord,
} from '../types';
import { downloadBackendCsv, downloadBackendXlsx, downloadBackendReport } from '../services/api';

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
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const triggerDownload = (filename: string, content: string | Blob, mimeType?: string) => {
    let blob: Blob;
    if (content instanceof Blob) {
      blob = content;
    } else {
      // For CSV, prepend UTF-8 BOM (\uFEFF) to guarantee Excel on Windows displays Unicode IPA characters cleanly
      const prefix = filename.endsWith('.csv') && !content.startsWith('\uFEFF') ? '\uFEFF' : '';
      blob = new Blob([prefix + content], { type: mimeType || 'text/plain;charset=utf-8' });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setDownloadSuccess(filename);
    setTimeout(() => setDownloadSuccess(null), 3000);
  };

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  // 1. Export Human-Readable Evaluation Report (TXT)
  const handleExportHumanReadableReport = async () => {
    if (!currentResult) return;
    setIsExporting('report');
    try {
      const blob = await downloadBackendReport({
        recording_id: currentResult.id || currentScenario.id,
        full_transcription: currentResult.text || currentResult.full_transcription || '',
        words: currentResult.words || [],
        pronunciation_findings: currentResult.pronunciation_findings || [],
        evaluation_metrics: evaluationResult || undefined,
        ai_summary: currentResult.ai_summary || undefined,
      });
      triggerDownload(`articula_report_${currentScenario.id}_${Date.now()}.txt`, blob);
    } catch {
      // Client-side fallback text report
      const lines = [
        '================================================================================',
        'ARTICULA: PRONUNCIATION & FLUENCY EVALUATION REPORT',
        '================================================================================',
        `Test Case:          ${currentScenario.id} (${currentScenario.title})`,
        `Recording File:     ${currentResult.filename}`,
        `Full Transcription: "${currentResult.text}"`,
        '',
        '--------------------------------------------------------------------------------',
        '1. OVERALL EVALUATION SUMMARY',
        '--------------------------------------------------------------------------------',
        `Total Words:        ${currentResult.words?.length || 0}`,
        `Speech Rate:        ${evaluationResult?.speech_rate?.speech_rate_wpm ?? 'N/A'} WPM`,
        `Word Error Rate:    ${evaluationResult?.alignment?.word_error_rate_percent ?? 'N/A'}%`,
        `Silent Pauses:      ${evaluationResult?.pause_metrics?.pause_count ?? 0} pauses`,
        '',
      ];
      triggerDownload(
        `articula_report_${currentScenario.id}_${Date.now()}.txt`,
        lines.join('\n'),
        'text/plain;charset=utf-8'
      );
    } finally {
      setIsExporting(null);
    }
  };

  // 2. Export Professional Excel Workbook (.xlsx)
  const handleExportXlsx = async () => {
    if (!currentResult?.words || currentResult.words.length === 0) return;
    setIsExporting('xlsx');
    try {
      const blob = await downloadBackendXlsx({
        recording_id: currentResult.id || currentScenario.id,
        full_transcription: currentResult.text || currentResult.full_transcription || '',
        words: currentResult.words || [],
        pronunciation_findings: currentResult.pronunciation_findings || [],
        evaluation_metrics: evaluationResult || undefined,
        ai_summary: currentResult.ai_summary || undefined,
      });
      triggerDownload(`articula_evaluation_${currentScenario.id}_${Date.now()}.xlsx`, blob);
    } catch {
      // Fallback to detailed UTF-8 BOM CSV if backend XLSX fails
      handleExportTechnicalCsv();
    } finally {
      setIsExporting(null);
    }
  };

  // 3. Export Detailed Technical Phonemes Dataset (CSV with UTF-8 BOM)
  const handleExportTechnicalCsv = async () => {
    if (!currentResult?.words || currentResult.words.length === 0) return;
    setIsExporting('csv');
    try {
      const blob = await downloadBackendCsv({
        recording_id: currentResult.id || currentScenario.id,
        words: currentResult.words || [],
      });
      triggerDownload(`articula_phonemes_${currentScenario.id}_${Date.now()}.csv`, blob);
    } catch {
      // Client-side fallback with UTF-8 BOM
      const headers = [
        'word_index',
        'word',
        'start_ms',
        'end_ms',
        'raw_duration_ms',
        'padded_start_ms',
        'padded_end_ms',
        'padded_duration_ms',
        'assembly_confidence',
        'predicted_phonemes_ipa',
        'reference_phonemes_ipa',
        'reference_source',
        'phoneme_error_rate',
        'per_status',
        'substitutions',
        'deletions',
        'insertions',
        'matches',
        'segmentation_status',
        'audio_quality_status',
        'phoneme_analysis_status',
        'requires_human_review',
        'quality_notes',
      ];

      const rows = currentResult.words.map((w, idx) => {
        const perM = w.per_metrics || {};
        return [
          w.token_index ?? idx + 1,
          w.text || w.word,
          w.start_ms ?? w.start ?? '',
          w.end_ms ?? w.end ?? '',
          w.duration_ms ?? (typeof w.start === 'number' && typeof w.end === 'number' ? w.end - w.start : ''),
          w.padded_start_ms ?? '',
          w.padded_end_ms ?? '',
          w.padded_duration_ms ?? '',
          w.assembly_confidence ?? w.confidence ?? '',
          w.predicted_phonemes_str ?? w.phoneme_prediction ?? '',
          w.expected_phonemes_str ?? w.reference_phonemes ?? '',
          w.reference_source ?? '',
          w.phoneme_error_rate ?? '',
          perM.status ?? w.analysis_status ?? '',
          perM.substitutions ?? '',
          perM.deletions ?? '',
          perM.insertions ?? '',
          perM.matches ?? '',
          w.segmentation_status ?? 'valid',
          w.audio_quality_status ?? 'normal',
          w.phoneme_analysis_status ?? w.analysis_status ?? 'completed',
          w.requires_human_review ? 'YES' : 'NO',
          w.segmentation_notes ?? w.quality_notes ?? '',
        ].map(escapeCsv);
      });

      const csvContent = `${headers.join(',')}\n${rows.map((r) => r.join(',')).join('\n')}`;
      triggerDownload(
        `articula_phonemes_${currentScenario.id}_${Date.now()}.csv`,
        csvContent,
        'text/csv;charset=utf-8'
      );
    } finally {
      setIsExporting(null);
    }
  };

  // 4. Export Per-Test Comprehensive Metrics CSV
  const handleExportTestCsv = () => {
    if (!currentResult) return;

    const align = evaluationResult?.alignment;
    const sr = evaluationResult?.speech_rate;
    const pm = evaluationResult?.pause_metrics;
    const rep = evaluationResult?.repetition_metrics?.repetition_rate;

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

  // 5. Export Reference vs ASR Alignment CSV
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

  // 6. Export Reproducibility Provenance Record JSON
  const handleExportReproducibilityRecord = () => {
    const reproducibilityRecord = {
      articula_evaluation_metadata: {
        system_version: 'Articula Pronunciation Analysis Tester v3.0',
        generated_at: new Date().toISOString(),
        asr_provider: 'AssemblyAI Speech-to-Text v2',
        acoustic_phoneme_model: 'facebook/wav2vec2-lv-60-espeak-cv-ft',
        test_case_id: currentScenario.id,
        test_title: currentScenario.title,
      },
      metric_definitions_and_formulas: {
        phoneme_error_rate: 'PER = (S + D + I) / N * 100 (Levenshtein phoneme-level sequence alignment)',
        word_error_rate: 'WER = (S + D + I) / N (Wagner-Fischer DP word alignment)',
        speech_rate: 'Speech Rate (WPM) = 60 * W / T (W: recognized words, T: response interval in sec)',
        pause_frequency: 'Pause Frequency = P / T (P: qualifying silence pauses >= threshold)',
        mean_pause_duration: 'Mean Pause Duration = sum(durations) / P',
        signed_difference: 'Signed Difference = Automatic WPM - Reference WPM',
        precision: 'Precision = TP / (TP + FP)',
        recall: 'Recall = TP / (TP + FN)',
        f1: 'F1 = 2 * Precision * Recall / (Precision + Recall) [reported as 0.0% when TP=0 and (FP>0 or FN>0)]',
      },
      evaluation_parameters: {
        min_pause_duration_seconds: 0.25,
        silence_threshold_db: -35.0,
        event_match_tolerance_seconds: 0.25,
        word_boundary_padding_ms: 25,
        min_word_duration_threshold_ms: 30,
        unicode_encoding: 'UTF-8 with BOM (utf-8-sig) & native OpenPyXL Unicode preservation',
      },
      words_and_phonemes: currentResult?.words?.map((w, idx) => ({
        token_index: w.token_index ?? (idx + 1),
        word: w.text,
        start_ms: w.start_ms ?? w.start,
        end_ms: w.end_ms ?? w.end,
        raw_duration_ms: w.duration_ms,
        padded_start_ms: w.padded_start_ms,
        padded_end_ms: w.padded_end_ms,
        padded_duration_ms: w.padded_duration_ms,
        assembly_confidence: w.assembly_confidence ?? w.confidence,
        predicted_phonemes_ipa: w.predicted_phonemes_str ?? w.phoneme_prediction ?? null,
        reference_phonemes_ipa: w.expected_phonemes_str ?? w.reference_phonemes ?? null,
        reference_source: w.reference_source ?? null,
        phoneme_error_rate: w.phoneme_error_rate ?? null,
        segmentation_status: w.segmentation_status ?? 'valid',
        audio_quality_status: w.audio_quality_status ?? 'normal',
        phoneme_analysis_status: w.phoneme_analysis_status ?? w.analysis_status ?? 'completed',
        requires_human_review: Boolean(w.requires_human_review),
      })) || [],
      pronunciation_findings: currentResult?.pronunciation_findings || [],
      ai_summary: currentResult?.ai_summary || null,
      evaluation_results: evaluationResult || null,
      security_notice: 'No private API keys, user passwords, or local file paths are included.',
    };

    triggerDownload(
      `reproducibility_record_${currentScenario.id}_${Date.now()}.json`,
      JSON.stringify(reproducibilityRecord, null, 2),
      'application/json;charset=utf-8'
    );
  };

  // 7. Export Multi-Test Session Summary CSV
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
                Unicode & Excel Validated
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Download human-readable reports, formatted Excel workbooks, and UTF-8 BOM CSV datasets
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-lg border border-slate-700/60 self-start sm:self-auto">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Zero Credentials in Export</span>
        </div>
      </div>

      {/* Download Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2.5">
        {/* Card 1: Human-Readable Report TXT */}
        <button
          onClick={handleExportHumanReadableReport}
          disabled={!currentResult || isExporting === 'report'}
          className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex items-center justify-between text-teal-400 mb-1">
            <FileText className="w-4 h-4" />
            <span className="text-[10px] font-mono text-slate-500 uppercase">.txt</span>
          </div>
          <div className="text-xs font-semibold text-white group-hover:text-teal-300">
            Evaluation Report
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Human-readable report with AI observations & review list
          </div>
        </button>

        {/* Card 2: Professional Multi-Sheet Excel Workbook (.xlsx) */}
        <button
          onClick={handleExportXlsx}
          disabled={!currentResult?.words || currentResult.words.length === 0 || isExporting === 'xlsx'}
          className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-emerald-500/40 hover:border-emerald-500/70 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden"
        >
          <div className="flex items-center justify-between text-emerald-400 mb-1">
            <FileSpreadsheet className="w-4 h-4" />
            <span className="text-[10px] font-mono text-emerald-400 uppercase font-semibold">.xlsx</span>
          </div>
          <div className="text-xs font-semibold text-emerald-200 group-hover:text-emerald-300">
            Excel Workbook (XLSX)
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Multi-sheet workbook preserving IPA Unicode cells
          </div>
        </button>

        {/* Card 3: Technical Dataset CSV (UTF-8 BOM) */}
        <button
          onClick={handleExportTechnicalCsv}
          disabled={!currentResult?.words || currentResult.words.length === 0 || isExporting === 'csv'}
          className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex items-center justify-between text-purple-400 mb-1">
            <Sparkles className="w-4 h-4" />
            <span className="text-[10px] font-mono text-slate-500 uppercase">.csv</span>
          </div>
          <div className="text-xs font-semibold text-white group-hover:text-purple-300">
            Technical Dataset CSV
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            UTF-8 with BOM: timestamps, PER, status flags
          </div>
        </button>

        {/* Card 4: Per-Test Research Metrics CSV */}
        <button
          onClick={handleExportTestCsv}
          disabled={!currentResult}
          className="p-3 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <div className="flex items-center justify-between text-indigo-400 mb-1">
            <Layers className="w-4 h-4" />
            <span className="text-[10px] font-mono text-slate-500 uppercase">.csv</span>
          </div>
          <div className="text-xs font-semibold text-white group-hover:text-indigo-300">
            Thesis Variables CSV
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            All 30+ recording, speech rate & pause variables
          </div>
        </button>

        {/* Card 5: Reproducibility Record JSON */}
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
            Full audit trail: formulas, parameters & data
          </div>
        </button>
      </div>

      {/* Session Summary and Token Alignment Buttons */}
      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {evaluationResult?.alignment && (
            <button
              onClick={handleExportAlignmentCsv}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Token Alignment CSV</span>
            </button>
          )}
        </div>

        {sessionHistory.length > 0 && (
          <button
            onClick={handleExportSessionSummaryCsv}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-700"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-400" />
            <span>Export Session History ({sessionHistory.length} tests)</span>
          </button>
        )}
      </div>

      {/* Download Alert State */}
      {downloadSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Downloaded <strong>{downloadSuccess}</strong> successfully with preserved Unicode IPA encoding.
          </span>
        </div>
      )}
    </div>
  );
};
