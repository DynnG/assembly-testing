import React, { useState } from 'react';
import {
  FileText,
  Activity,
  Headphones,
  ShieldAlert,
  Sparkles,
  Volume2,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronUp,
  Award,
  Target,
  BookOpen,
  Code2,
} from 'lucide-react';
import type { PostConversationReport } from '../types';

interface PostConversationReportCardProps {
  report: PostConversationReport;
}

export const PostConversationReportCard: React.FC<PostConversationReportCardProps> = ({ report }) => {
  const [playingClip, setPlayingClip] = useState<string | null>(null);
  const [showTechnicalDiagnostics, setShowTechnicalDiagnostics] = useState<boolean>(false);

  // Redesigned Sections (or fallback to original structure)
  const secA = report.section_a_speaking_session || {
    overall_recording_assessment: `You completed ${report.section_a_transcription_and_timing.turn_count} conversational turn(s) with an active speaking interval of ${report.section_b_fluency_analysis.total_response_interval_seconds.toFixed(1)}s.`,
    asr_transcription_and_reliability: `Speech recognition transcribed ${report.section_a_transcription_and_timing.word_timestamps_count} words with ${Math.round((report.section_a_transcription_and_timing.asr_average_confidence || 0.9) * 100)}% average decoding certainty.`,
    full_transcript: report.section_a_transcription_and_timing.full_transcript,
    turn_count: report.section_a_transcription_and_timing.turn_count,
    total_recognized_words: report.section_a_transcription_and_timing.word_timestamps_count,
    total_response_interval_seconds: report.section_b_fluency_analysis.total_response_interval_seconds,
    asr_average_confidence: report.section_a_transcription_and_timing.asr_average_confidence,
    turns: report.section_a_transcription_and_timing.turns,
    transcription_limitations: report.section_a_transcription_and_timing.transcription_limitations,
  };

  const secB = report.section_b_fluency_measurements || {
    speech_rate_wpm: report.section_b_fluency_analysis.speech_rate_wpm,
    silent_pause_frequency: report.section_b_fluency_analysis.silent_pause_frequency,
    pauses_per_minute: report.section_b_fluency_analysis.pauses_per_minute,
    mean_silent_pause_duration_seconds: report.section_b_fluency_analysis.mean_silent_pause_duration_seconds,
    repetition_rate_percent: report.section_b_fluency_analysis.repetition_rate_percent,
    total_response_interval_seconds: report.section_b_fluency_analysis.total_response_interval_seconds,
    total_recognized_words: report.section_b_fluency_analysis.total_recognized_words,
    pause_count: report.section_b_fluency_analysis.pause_count,
    repetition_event_count: report.section_b_fluency_analysis.repetition_event_count,
    measurement_protocol: report.section_b_fluency_analysis.measurement_protocol,
    fluency_summary: `Speech rate was ${report.section_b_fluency_analysis.speech_rate_wpm} WPM. Silent pauses averaged ${report.section_b_fluency_analysis.mean_silent_pause_duration_seconds?.toFixed(2) || '0.00'}s.`,
    fluency_observations: [
      `Speech rate: ${report.section_b_fluency_analysis.speech_rate_wpm} WPM.`,
      `Pause frequency: ${report.section_b_fluency_analysis.pauses_per_minute || 0} pauses/min.`,
      `Repetition rate: ${report.section_b_fluency_analysis.repetition_rate_percent || 0.0}%.`,
    ],
  };

  const secC = report.section_c_pronunciation_observations;
  const secD = report.section_d_recording_quality_and_evidence || {
    recording_quality_limitations: report.section_d_evidence_and_quality_checks.asr_reliability_limitations,
    insufficient_audio_count: report.section_d_evidence_and_quality_checks.insufficient_audio_count,
    insufficient_audio_segments: report.section_d_evidence_and_quality_checks.insufficient_audio_segments,
    unvalidated_observations_count: report.section_d_evidence_and_quality_checks.unvalidated_observations_count,
    candidate_differences_count: report.section_c_pronunciation_observations.candidate_differences?.length || 0,
    policy_note: 'Candidate differences observed in spontaneous speech require multi-utterance confirmation and are not treated as confirmed learner errors.',
    asr_reliability_limitations: report.section_d_evidence_and_quality_checks.asr_reliability_limitations,
  };

  const secE = report.section_e_what_you_did_well || report.section_e_formative_feedback.evidence_supported_strengths;
  const secF = report.section_f_what_to_practice_next || report.section_e_formative_feedback.priority_practice_areas;
  const secG = report.section_g_recommended_practice || report.section_e_formative_feedback.actionable_recommendations;

  const validatedObs = secC.validated_observations || [];
  const candidateDiffs = secC.candidate_differences || [];
  const rawPredictions = secC.raw_predictions || [];
  const underlyingDiagnostics = secC.underlying_diagnostic_data || [];

  const playAudio = (clipUri: string) => {
    if (!clipUri) return;
    const audio = new Audio(clipUri);
    setPlayingClip(clipUri);
    audio.onended = () => setPlayingClip(null);
    audio.onerror = () => setPlayingClip(null);
    audio.play().catch(() => setPlayingClip(null));
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-6">
      {/* Report Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-teal-400" />
            <h2 className="text-lg font-bold text-white tracking-wide">
              Post-Conversation Feedback Report
            </h2>
            <span className="bg-teal-500/10 text-teal-400 text-xs px-2.5 py-0.5 rounded-full border border-teal-500/20 font-mono">
              7-Section Learner Review
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
            <span>Session: <code className="text-slate-300 font-mono">{report.session_id}</code></span>
            <span>•</span>
            <span>Created: {new Date(report.created_at).toLocaleTimeString()}</span>
            <span>•</span>
            <span>Model: <code className="text-cyan-400 font-mono">{report.generation_method}</code></span>
          </div>
        </div>
      </div>

      {/* SECTION A: Your Speaking Session */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-teal-400 font-semibold text-sm border-b border-slate-800 pb-2">
          <FileText className="w-4 h-4" />
          <span>Section A: Your Speaking Session</span>
        </div>

        {/* Overall Recording Assessment */}
        <div className="bg-slate-900/80 border border-teal-500/20 p-4 rounded-lg space-y-1">
          <div className="text-[11px] font-semibold text-teal-400 uppercase tracking-wider">
            Overall Recording Assessment
          </div>
          <p className="text-sm text-slate-100 font-medium leading-relaxed">
            {secA.overall_recording_assessment}
          </p>
        </div>

        {/* Full Utterance Transcript */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-lg space-y-1.5">
          <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
            Recognized Learner Speech ({secA.turn_count} turns)
          </div>
          <p className="text-sm text-slate-200 italic leading-relaxed">
            "{secA.full_transcript || 'No speech detected.'}"
          </p>
        </div>

        {/* Session Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-slate-900/60 border border-slate-800/70 p-3 rounded-lg text-xs">
            <span className="text-slate-400">Total Response Duration:</span>
            <div className="text-sm font-semibold text-white font-mono mt-0.5">
              {secA.total_response_interval_seconds.toFixed(1)}s
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/70 p-3 rounded-lg text-xs">
            <span className="text-slate-400">Total Spoken Words:</span>
            <div className="text-sm font-semibold text-white font-mono mt-0.5">
              {secA.total_recognized_words} words
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/70 p-3 rounded-lg text-xs">
            <span className="text-slate-400">ASR Decoding Certainty:</span>
            <div className="text-sm font-semibold text-teal-400 font-mono mt-0.5">
              {secA.asr_average_confidence != null ? `${Math.round(secA.asr_average_confidence * 100)}% reliability` : 'Standard'}
            </div>
          </div>
        </div>

        {/* ASR Decoupling & Limits */}
        <div className="text-[11px] text-slate-400 bg-slate-900/40 border border-slate-800/50 p-2.5 rounded-lg flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
          <span>{secA.asr_transcription_and_reliability}</span>
        </div>
      </div>

      {/* SECTION B: Fluency Measurements */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm border-b border-slate-800 pb-2">
          <Activity className="w-4 h-4" />
          <span>Section B: Fluency Measurements</span>
        </div>

        {/* The 4 Core Defined Fluency Measures */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Measure 1: Speech Rate */}
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-lg space-y-1">
            <span className="text-xs text-slate-400">Speech Rate</span>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {secB.speech_rate_wpm !== null ? `${secB.speech_rate_wpm} WPM` : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Words per minute in active turns</div>
          </div>

          {/* Measure 2: Pause Frequency */}
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-lg space-y-1">
            <span className="text-xs text-slate-400">Silent-Pause Frequency</span>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {secB.pauses_per_minute !== null ? `${secB.pauses_per_minute}/min` : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {secB.pause_count || 0} qualifying pauses detected
            </div>
          </div>

          {/* Measure 3: Mean Pause Duration */}
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-lg space-y-1">
            <span className="text-xs text-slate-400">Mean Pause Duration</span>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {secB.mean_silent_pause_duration_seconds !== null
                ? `${secB.mean_silent_pause_duration_seconds.toFixed(2)}s`
                : 'None detected'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Average length of silent pauses</div>
          </div>

          {/* Measure 4: Repetition Rate */}
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-lg space-y-1">
            <span className="text-xs text-slate-400">Repetition Rate</span>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {secB.repetition_rate_percent !== null ? `${secB.repetition_rate_percent}%` : '0.0%'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Repeated words or phrases</div>
          </div>
        </div>

        {/* Evidence-Supported Fluency Observations */}
        {secB.fluency_observations && secB.fluency_observations.length > 0 && (
          <div className="bg-slate-900/60 border border-slate-800 p-3.5 rounded-lg space-y-1 text-xs">
            <div className="font-semibold text-slate-300">Fluency Dynamics:</div>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400 text-[11px]">
              {secB.fluency_observations.map((obs, i) => (
                <li key={i}>{obs}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Inter-turn silence exclusion note */}
        <div className="text-[11px] text-slate-400 bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
          <span>{secB.measurement_protocol}</span>
        </div>
      </div>

      {/* SECTION C: Pronunciation Observations */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between text-purple-400 font-semibold text-sm border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4" />
            <span>Section C: Pronunciation Observations (Validated Evidence Only)</span>
          </div>
          <span className="text-xs text-slate-400 font-normal">
            {validatedObs.length} validated finding(s)
          </span>
        </div>

        {validatedObs.length === 0 ? (
          <div className="p-4 rounded-lg bg-slate-900/40 border border-teal-500/20 text-xs text-slate-300 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-white">
                {secC.insufficient_evidence_message || "There was insufficient evidence to identify a reliable pronunciation concern."}
              </div>
              <p className="text-slate-400 text-[11px] mt-0.5">
                Under Articula's strict evidence rules, candidate discrepancies from spontaneous speech require multi-utterance confirmation before being flagged as learner errors.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs font-semibold text-teal-400 uppercase tracking-wider">
              Validated Contrastive Pronunciation Targets
            </div>
            {validatedObs.map((obs, idx) => (
              <div
                key={idx}
                className="bg-slate-900 border border-teal-500/30 rounded-lg p-3.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white text-sm">"{obs.word}"</span>
                    <span className="font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/40">
                      Target: /{obs.expected_phoneme}/
                    </span>
                    <span className="text-slate-400">→</span>
                    <span className="font-mono text-teal-300 bg-teal-950/60 px-2 py-0.5 rounded border border-teal-800/40">
                      Observed: [{obs.observed_phonetic_evidence}]
                    </span>
                    <span className="bg-teal-500/10 text-teal-400 text-[10px] px-2 py-0.5 rounded border border-teal-500/20 font-medium">
                      High Acoustic Evidence
                    </span>
                  </div>

                  {obs.audio_playback_reference && (
                    <button
                      onClick={() => playAudio(obs.audio_playback_reference!)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-teal-400 font-medium text-[11px] flex items-center gap-1.5 transition-colors"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>{playingClip === obs.audio_playback_reference ? 'Playing...' : 'Play Audio'}</span>
                    </button>
                  )}
                </div>

                {obs.recommendation && (
                  <div className="text-slate-200 text-xs leading-relaxed">
                    {obs.recommendation}
                  </div>
                )}

                {obs.practice_words && obs.practice_words.length > 0 && (
                  <div className="text-[11px] text-teal-300 font-mono">
                    Practice words: {obs.practice_words.join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION D: Recording Quality and Evidence */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm border-b border-slate-800 pb-2">
          <ShieldAlert className="w-4 h-4" />
          <span>Section D: Recording Quality and Evidence Guardrails</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-lg space-y-1.5">
            <span className="font-semibold text-slate-300">Excluded Brief Segments:</span>
            <div className="text-sm font-mono text-amber-400">
              {secD.insufficient_audio_count} word tokens (&lt;80ms or low energy)
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              These tokens were excluded from articulatory instruction to eliminate false positives caused by acoustic boundary truncation.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-lg space-y-1.5">
            <span className="font-semibold text-slate-300">Candidate Spontaneous Differences:</span>
            <div className="text-sm font-mono text-blue-400">
              {secD.candidate_differences_count || secD.unvalidated_observations_count} items withheld
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Under strict evidence rules, candidate acoustic differences from spontaneous speech are held back from automated correction without multi-utterance proof.
            </p>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/50 p-3 rounded-lg text-xs space-y-1">
          <span className="font-semibold text-slate-400">Research & Evidence Decoupling Guarantees:</span>
          <ul className="list-disc list-inside space-y-0.5 text-slate-400 text-[11px]">
            <li>ASR confidence represents acoustic-lexical match probability, not phonological accuracy.</li>
            <li>No CEFR levels, broad proficiency grades, or ungrounded evaluations are assigned.</li>
            <li>Grammar and vocabulary are strictly excluded to preserve focus on speech timing and acoustic targets.</li>
          </ul>
        </div>
      </div>

      {/* SECTION E: What You Did Well */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-teal-400 font-semibold text-sm border-b border-slate-800 pb-2">
          <Award className="w-4 h-4" />
          <span>Section E: What You Did Well</span>
        </div>

        <div className="space-y-2 text-xs">
          {secE.map((strength, idx) => (
            <div
              key={idx}
              className="bg-slate-900 border border-teal-500/20 p-3 rounded-lg text-slate-200 flex items-start gap-2.5"
            >
              <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <span>{strength}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION F: What to Practice Next */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-purple-400 font-semibold text-sm border-b border-slate-800 pb-2">
          <Target className="w-4 h-4" />
          <span>Section F: What to Practice Next</span>
        </div>

        <div className="space-y-2 text-xs">
          {secF.map((priority, idx) => (
            <div
              key={idx}
              className="bg-slate-900 border border-purple-500/20 p-3 rounded-lg text-slate-200 flex items-start gap-2.5"
            >
              <Target className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>{priority}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SECTION G: Recommended Practice */}
      <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm border-b border-slate-800 pb-2">
          <BookOpen className="w-4 h-4" />
          <span>Section G: Recommended Practice</span>
        </div>

        <div className="space-y-2 text-xs">
          {secG.map((recommendation, idx) => (
            <div
              key={idx}
              className="bg-slate-900 border border-cyan-500/20 p-3 rounded-lg text-slate-200 flex items-start gap-2.5"
            >
              <BookOpen className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>{recommendation}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Expandable Technical Diagnostics & Research View */}
      <div className="pt-2 border-t border-slate-800">
        <button
          onClick={() => setShowTechnicalDiagnostics(!showTechnicalDiagnostics)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 bg-slate-950/80 border border-slate-800 p-3.5 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2 font-mono">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <span>Research & Technical Diagnostics View (Underlying Acoustic Data)</span>
          </div>
          {showTechnicalDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showTechnicalDiagnostics && (
          <div className="mt-3 bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-4 text-xs font-mono">
            <div className="text-slate-400 text-[11px] leading-relaxed">
              Diagnostic dataset preserved for speech science evaluation and acoustic alignment verification. Raw candidate differences below are decoupled from learner-facing feedback.
            </div>

            {/* Candidate differences partition */}
            <div className="space-y-2">
              <span className="font-semibold text-amber-400">
                Spontaneous Candidate Differences ({candidateDiffs.length} items):
              </span>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {candidateDiffs.slice(0, 15).map((cd, i) => (
                  <div key={i} className="bg-slate-900/80 p-2 rounded border border-slate-800 text-[11px] text-slate-300">
                    "{cd.word}": Expected /{cd.expected_phoneme}/ vs Observed [{cd.observed_phonetic_evidence}] ({cd.validation_status})
                  </div>
                ))}
                {candidateDiffs.length > 15 && (
                  <div className="text-[10px] text-slate-500 italic">
                    +{candidateDiffs.length - 15} additional candidate differences preserved in backend diagnostic dataset.
                  </div>
                )}
              </div>
            </div>

            {/* Raw acoustic phoneme predictions */}
            {rawPredictions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <span className="font-semibold text-teal-400">
                  Raw Wav2Vec2 Acoustic Phoneme Predictions ({rawPredictions.length} words):
                </span>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {rawPredictions.slice(0, 10).map((rp, i) => (
                    <div key={i} className="bg-slate-900/60 p-2 rounded text-[11px] text-slate-300 flex justify-between">
                      <span className="font-bold text-white">"{rp.word}"</span>
                      <span className="text-cyan-300">[{rp.raw_prediction}]</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Underlying Diagnostic Dataset Metadata */}
            <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between">
              <span>Total Word Tokens Processed: {underlyingDiagnostics.length || secA.total_recognized_words}</span>
              <span>Evidence Model: Wav2Vec2-Phoneme + CMUDict + AssemblyAI</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
