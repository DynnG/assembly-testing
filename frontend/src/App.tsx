import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ResearchLimitationsCard } from './components/ResearchLimitationsCard';
import { ApiStatusCard } from './components/ApiStatusCard';
import { TestCaseSelectorCard } from './components/TestCaseSelectorCard';
import { AudioInputCard } from './components/AudioInputCard';
import { TranscriptionResultsCard } from './components/TranscriptionResultsCard';
import { ReferenceAndWerCard } from './components/ReferenceAndWerCard';
import { SpeechMeasurementsCard } from './components/SpeechMeasurementsCard';
import { WordDiagnosticCard } from './components/WordDiagnosticCard';
import { AiAnalysisSummaryCard } from './components/AiAnalysisSummaryCard';
import { EvaluationResultsCard } from './components/EvaluationResultsCard';
import { ExportCard } from './components/ExportCard';
import { SessionHistoryCard } from './components/SessionHistoryCard';
import { ConversationRecorderCard } from './components/ConversationRecorderCard';
import { PostConversationProgressCard } from './components/PostConversationProgressCard';
import { PostConversationReportCard } from './components/PostConversationReportCard';

import {
  getHealth,
  testConnection,
  testGeminiConnection,
  transcribeAudio,
  evaluateMetrics,
  analyzeConversationSessionStream,
} from './services/api';
import { analyzeAudioSilence } from './services/audioAnalysis';
import { STANDARD_TEST_SCENARIOS } from './data/testScenarios';
import type {
  EvaluationResponse,
  SilencePauseEvent,
  TestCaseScenario,
  TestConnectionResponse,
  TestSessionRecord,
  TranscriptionResponse,
  ConversationTurn,
  PostConversationReport,
  ProcessingStage,
  ConversationSessionRecord,
} from './types';
import { Play, AlertCircle, ToggleRight, ToggleLeft, Volume2, MessageSquare, FileAudio } from 'lucide-react';

export const App: React.FC = () => {
  // Mode: 'conversation' (Conversation-First Post-Assessment) vs 'benchmark' (Test Bench)
  const [appMode, setAppMode] = useState<'conversation' | 'benchmark'>('conversation');

  // Conversational Assessment state
  const [conversationStage, setConversationStage] = useState<ProcessingStage>('recording');
  const [conversationStageMsg, setConversationStageMsg] = useState<string>('Ready for conversational turns');
  const [conversationProgress, setConversationProgress] = useState<number>(0);
  const [isConversationAssessing, setIsConversationAssessing] = useState<boolean>(false);
  const [activeConversationReport, setActiveConversationReport] = useState<PostConversationReport | null>(null);
  const [conversationHistory, setConversationHistory] = useState<ConversationSessionRecord[]>([]);

  // Backend & API Key state
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [geminiModel, setGeminiModel] = useState<string>('gemini-3.5-flash-lite');
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [isTestingGemini, setIsTestingGemini] = useState<boolean>(false);
  const [connectionTestResult, setConnectionTestResult] = useState<TestConnectionResponse | null>(null);
  const [geminiTestResult, setGeminiTestResult] = useState<{
    success: boolean;
    message: string;
    model?: string;
    error?: string;
  } | null>(null);

  // Test Case Scenario & Metadata state
  const [currentScenario, setCurrentScenario] = useState<TestCaseScenario>(STANDARD_TEST_SCENARIOS[0]);
  const [referenceTranscript, setReferenceTranscript] = useState<string>(
    STANDARD_TEST_SCENARIOS[0].reference_transcript
  );
  const [responseIntervalSeconds, setResponseIntervalSeconds] = useState<number>(
    STANDARD_TEST_SCENARIOS[0].reference_response_duration_seconds
  );
  const [recordingSessionId, setRecordingSessionId] = useState<string>(STANDARD_TEST_SCENARIOS[0].id);
  const [referenceRecordingId, setReferenceRecordingId] = useState<string | null>(STANDARD_TEST_SCENARIOS[0].id);

  // Speaking Practice Scenario state (Prompted target word vs Spontaneous speech)
  const [speakingMode, setSpeakingMode] = useState<'prompted' | 'spontaneous'>('prompted');
  const [promptTarget, setPromptTarget] = useState<string>('think');

  // Audio input state
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);
  const [audioSourceLabel, setAudioSourceLabel] = useState<string>('');

  // Silence detection parameters
  const [minPauseDuration, setMinPauseDuration] = useState<number>(0.25);
  const [silenceThresholdDb, setSilenceThresholdDb] = useState<number>(-35.0);

  // Transcription configuration
  const [disfluenciesEnabled, setDisfluenciesEnabled] = useState<boolean>(true);

  // Execution state
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionElapsedSec, setTranscriptionElapsedSec] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<TranscriptionResponse | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [detectedPauses, setDetectedPauses] = useState<SilencePauseEvent[]>([]);
  const [evaluationResult, setEvaluationResult] = useState<EvaluationResponse | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  // Session history state (in-memory, resets on page reload)
  const [sessionHistory, setSessionHistory] = useState<TestSessionRecord[]>([]);

  // Health check on mount
  const checkHealth = async () => {
    try {
      const data = await getHealth();
      setBackendOnline(data.status === 'ok');
      setApiKeyConfigured(data.api_key_configured);
      setGeminiConfigured(data.gemini_api_key_configured ?? false);
      setGeminiModel(data.gemini_model || 'gemini-3.5-flash-lite');
    } catch {
      setBackendOnline(false);
      setApiKeyConfigured(null);
      setGeminiConfigured(null);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  // Cleanup elapsed timer on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimerRef.current) {
        window.clearInterval(elapsedTimerRef.current);
      }
    };
  }, []);

  // Test AssemblyAI Connection
  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    setConnectionTestResult(null);
    try {
      const result = await testConnection();
      setConnectionTestResult(result);
      if (result.success) {
        setApiKeyConfigured(true);
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  // Test Gemini 3.5 Flash-Lite Connection
  const handleTestGeminiConnection = async () => {
    setIsTestingGemini(true);
    setGeminiTestResult(null);
    try {
      const result = await testGeminiConnection();
      setGeminiTestResult(result);
      if (result.success) {
        setGeminiConfigured(true);
      }
    } finally {
      setIsTestingGemini(false);
    }
  };

  // Scenario selection handler
  const handleSelectScenario = (scenario: TestCaseScenario) => {
    setCurrentScenario(scenario);
    setReferenceTranscript(scenario.reference_transcript);
    setReferenceRecordingId(scenario.id);
    setRecordingSessionId(scenario.id);
    setPromptTarget(scenario.reference_transcript);
    setResponseIntervalSeconds(scenario.reference_response_duration_seconds);

    // If current transcript already exists, automatically trigger evaluation recalculation
    if (currentResult?.text) {
      recalculateEvaluation(
        scenario.reference_transcript,
        currentResult.text,
        currentResult.audio_duration || audioDurationSec || scenario.reference_response_duration_seconds,
        scenario.reference_response_duration_seconds,
        detectedPauses,
        scenario,
        scenario.id,
        scenario.id
      );
    }
  };

  const handleUpdateScenarioFields = (fields: Partial<TestCaseScenario>) => {
    setCurrentScenario((prev) => ({ ...prev, ...fields }));
  };

  // Audio selected handler
  const handleAudioReady = (file: File | null, durationSec: number | null, sourceLabel: string) => {
    setSelectedAudioFile(file);
    setAudioDurationSec(durationSec);
    setAudioSourceLabel(sourceLabel);
    setTranscriptionError(null);
    if (durationSec && durationSec > 0) {
      setResponseIntervalSeconds(durationSec);
    }

    // Data Integrity Guard:
    // When a custom or new audio file is loaded, decouple previous reference transcript
    // and clear it to prevent cross-recording reference contamination!
    const newSessionId = file
      ? `rec_${file.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}`
      : `rec_custom_${Date.now()}`;
    setRecordingSessionId(newSessionId);
    setReferenceTranscript(''); // Clear stale reference to prevent false WER!
    setReferenceRecordingId(null);
    setEvaluationResult(null);
  };

  // Recalculate evaluation formulas without re-transcribing
  const recalculateEvaluation = async (
    refText: string,
    hypText: string,
    audioDur: number,
    respInterval: number,
    pauses: SilencePauseEvent[],
    scenario: TestCaseScenario,
    recId?: string,
    refRecId?: string | null
  ) => {
    try {
      const evalRes = await evaluateMetrics({
        reference_transcript: refText,
        assemblyai_transcript: hypText,
        recording_id: recId || recordingSessionId,
        reference_recording_id: refRecId !== undefined ? refRecId : referenceRecordingId,
        audio_duration_seconds: audioDur,
        response_interval_seconds: respInterval,
        detected_pauses: pauses,
        reference_pause_events: scenario.reference_pause_events,
        reference_repetition_events: scenario.reference_repetition_events,
        reference_self_correction_events: scenario.reference_self_correction_events,
        reference_speech_rate_wpm: scenario.reference_speech_rate_wpm,
        reference_response_duration_seconds: scenario.reference_response_duration_seconds,
        min_pause_duration_seconds: minPauseDuration,
        silence_threshold_db: silenceThresholdDb,
        normalize: true,
      });

      setEvaluationResult(evalRes);
      return evalRes;
    } catch (err: any) {
      console.error('Failed to calculate evaluation metrics:', err);
      return null;
    }
  };

  // Main Transcribe & Evaluate Pipeline
  const handleTranscribe = async () => {
    if (!selectedAudioFile || isTranscribing) return;

    setIsTranscribing(true);
    setTranscriptionError(null);
    setTranscriptionElapsedSec(0);

    const startTime = Date.now();
    elapsedTimerRef.current = window.setInterval(() => {
      setTranscriptionElapsedSec(Math.round(((Date.now() - startTime) / 1000) * 10) / 10);
    }, 100);

    try {
      // 1. Send audio to AssemblyAI backend with decoupled speaking mode & prompt target
      const transcriptData = await transcribeAudio(
        selectedAudioFile,
        selectedAudioFile.name,
        disfluenciesEnabled,
        true, // phonemeAnalysis
        speakingMode,
        speakingMode === 'prompted' ? promptTarget : undefined,
        recordingSessionId
      );

      setCurrentResult(transcriptData);

      // 2. Perform independent acoustic silence analysis
      let pauses: SilencePauseEvent[] = [];
      const silenceAnalysis = await analyzeAudioSilence(
        selectedAudioFile,
        minPauseDuration,
        silenceThresholdDb
      );

      if (silenceAnalysis.status === 'valid') {
        pauses = silenceAnalysis.detected_pauses;
      } else if (transcriptData.silence_analysis?.status === 'valid') {
        pauses = transcriptData.silence_analysis.detected_pauses;
      }
      setDetectedPauses(pauses);

      // 3. Compute Articula thesis evaluation formulas with recording provenance check
      const effectiveDuration =
        transcriptData.audio_duration || audioDurationSec || responseIntervalSeconds || 1.0;
      const effectiveInterval = responseIntervalSeconds > 0 ? responseIntervalSeconds : effectiveDuration;

      const evalRes = await recalculateEvaluation(
        referenceTranscript,
        transcriptData.text,
        effectiveDuration,
        effectiveInterval,
        pauses,
        currentScenario,
        recordingSessionId,
        referenceRecordingId
      );

      // 4. Record complete provenance entry to session history
      const historyRecord: TestSessionRecord = {
        test_case_id: currentScenario.id,
        timestamp: new Date().toLocaleTimeString(),
        audio_file: selectedAudioFile.name || audioSourceLabel,
        audio_format: selectedAudioFile.name.split('.').pop()?.toLowerCase() || 'audio',
        audio_duration_seconds: effectiveDuration,
        sample_rate_hz: silenceAnalysis.sample_rate_hz,
        recording_condition: currentScenario.recording_condition,
        background_noise_category: currentScenario.background_noise_category,
        microphone_or_device: currentScenario.microphone_or_device,
        task_type: currentScenario.task_type,
        speaker_or_participant_code: currentScenario.speaker_code,
        annotator_id: currentScenario.annotator_id,
        annotation_notes: currentScenario.annotation_notes,

        reference_transcript: referenceTranscript,
        reference_word_count: evalRes?.alignment.reference_word_count ?? 0,
        reference_response_duration_seconds: currentScenario.reference_response_duration_seconds,
        reference_pause_events: currentScenario.reference_pause_events,
        reference_repetition_events: currentScenario.reference_repetition_events,
        reference_self_correction_events: currentScenario.reference_self_correction_events,

        assemblyai_transcript: transcriptData.text,
        provider_request_id: transcriptData.id,
        transcription_status: transcriptData.status,
        word_timestamps: transcriptData.words,
        provider_confidence_score: transcriptData.confidence,
        request_latency_ms: Math.round(transcriptData.processing_time_sec * 1000),
        disfluencies_enabled: transcriptData.disfluencies_enabled,

        substitution_count: evalRes?.alignment.substitution_count ?? 0,
        deletion_count: evalRes?.alignment.deletion_count ?? 0,
        insertion_count: evalRes?.alignment.insertion_count ?? 0,
        word_error_rate: evalRes?.alignment.word_error_rate ?? null,
        word_error_rate_percent: evalRes?.alignment.word_error_rate_percent ?? null,
        recognized_word_count: evalRes?.alignment.recognized_word_count ?? 0,
        speech_rate_wpm: evalRes?.speech_rate.speech_rate_wpm ?? null,
        detected_pause_events: pauses,
        pause_count: evalRes?.pause_metrics.pause_count ?? pauses.length,
        mean_pause_duration_seconds: evalRes?.pause_metrics.mean_pause_duration_seconds ?? null,
        pause_frequency: evalRes?.pause_metrics.pause_frequency ?? null,
        pauses_per_minute: evalRes?.pause_metrics.pauses_per_minute ?? null,
        detected_repetition_events: evalRes?.repetition_metrics.candidate_repetitions ?? [],
        repetition_rate_percent: evalRes?.repetition_metrics.repetition_rate.repetition_rate_percent ?? null,
        candidate_self_corrections: evalRes?.self_corrections.candidates ?? [],

        speech_rate_mae: evalRes?.quantitative_errors.speech_rate_wpm?.mean_absolute_error,
        speech_rate_signed_diff: evalRes?.quantitative_errors.speech_rate_wpm?.mean_signed_difference,
        pause_precision: evalRes?.event_evaluations.pause_detection?.precision,
        pause_recall: evalRes?.event_evaluations.pause_detection?.recall,
        pause_f1: evalRes?.event_evaluations.pause_detection?.f1_score,

        aligned_pairs: evalRes?.alignment.aligned_pairs ?? [],
        status: 'completed',
      };

      setSessionHistory((prev) => [historyRecord, ...prev]);
    } catch (err: any) {
      const msg = err.message || 'Transcription request failed';
      setTranscriptionError(msg);

      const failedRecord: TestSessionRecord = {
        test_case_id: currentScenario.id,
        timestamp: new Date().toLocaleTimeString(),
        audio_file: selectedAudioFile.name || audioSourceLabel,
        audio_format: selectedAudioFile.name.split('.').pop()?.toLowerCase() || 'audio',
        audio_duration_seconds: audioDurationSec || 0,
        recording_condition: currentScenario.recording_condition,
        background_noise_category: currentScenario.background_noise_category,
        microphone_or_device: currentScenario.microphone_or_device,
        task_type: currentScenario.task_type,
        speaker_or_participant_code: currentScenario.speaker_code,
        annotator_id: currentScenario.annotator_id,
        annotation_notes: currentScenario.annotation_notes,

        reference_transcript: referenceTranscript,
        reference_word_count: 0,
        reference_response_duration_seconds: currentScenario.reference_response_duration_seconds,
        reference_pause_events: currentScenario.reference_pause_events,
        reference_repetition_events: currentScenario.reference_repetition_events,
        reference_self_correction_events: currentScenario.reference_self_correction_events,

        assemblyai_transcript: '',
        transcription_status: 'failed',
        word_timestamps: [],
        disfluencies_enabled: disfluenciesEnabled,

        substitution_count: 0,
        deletion_count: 0,
        insertion_count: 0,
        word_error_rate: null,
        word_error_rate_percent: null,
        recognized_word_count: 0,
        speech_rate_wpm: null,
        detected_pause_events: [],
        pause_count: 0,
        mean_pause_duration_seconds: null,
        pause_frequency: null,
        pauses_per_minute: null,
        detected_repetition_events: [],
        repetition_rate_percent: null,
        candidate_self_corrections: [],
        aligned_pairs: [],
        status: 'failed',
        exclusion_reason: msg,
      };

      setSessionHistory((prev) => [failedRecord, ...prev]);
    } finally {
      if (elapsedTimerRef.current) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      setIsTranscribing(false);
    }
  };

  // Inspect previous history run
  const handleSelectHistoryItem = (item: TestSessionRecord) => {
    if (item.status === 'completed') {
      setCurrentResult({
        success: true,
        id: item.provider_request_id || item.test_case_id,
        status: item.transcription_status,
        text: item.assemblyai_transcript,
        confidence: item.provider_confidence_score,
        audio_duration: item.audio_duration_seconds,
        words: item.word_timestamps || [],
        disfluencies_enabled: item.disfluencies_enabled,
        processing_time_sec: (item.request_latency_ms || 0) / 1000,
        filename: item.audio_file,
        raw_metadata: {},
      });

      setReferenceTranscript(item.reference_transcript);
      setDetectedPauses(item.detected_pause_events || []);
      setResponseIntervalSeconds(item.audio_duration_seconds);

      const scenario = STANDARD_TEST_SCENARIOS.find((s) => s.id === item.test_case_id);
      if (scenario) {
        setCurrentScenario(scenario);
      }

      recalculateEvaluation(
        item.reference_transcript,
        item.assemblyai_transcript,
        item.audio_duration_seconds,
        item.audio_duration_seconds,
        item.detected_pause_events || [],
        scenario || currentScenario
      );
    }
  };

  // Conversational Assessment Handlers
  const handleSessionComplete = async (
    turns: ConversationTurn[],
    mode: 'prompted' | 'spontaneous',
    target?: string
  ) => {
    if (turns.length === 0 || isConversationAssessing) return;

    const sessionId = `session_${Date.now()}`;
    setIsConversationAssessing(true);
    setConversationStage('session_ended');
    setConversationStageMsg('Conversation completed. Starting post-conversation assessment pipeline...');
    setConversationProgress(5);
    setActiveConversationReport(null);

    try {
      const report = await analyzeConversationSessionStream(
        {
          session_id: sessionId,
          speaking_mode: mode,
          prompt_target: target,
          preferred_accent: 'General English',
          min_pause_duration_seconds: minPauseDuration,
          silence_threshold_db: silenceThresholdDb,
          turns: turns.map((t) => ({
            turn_id: t.turn_id,
            audio_base64: t.audio_base64,
            transcript: t.transcript,
            duration_seconds: t.duration_seconds,
            prompt_target: t.prompt_target,
            speaking_mode: t.speaking_mode,
            detected_pauses: t.detected_pauses,
          })),
        },
        (event) => {
          setConversationStage(event.stage);
          setConversationStageMsg(event.message);
          setConversationProgress(event.progress);
          if (event.report) {
            setActiveConversationReport(event.report);
          }
        }
      );

      setActiveConversationReport(report);
      setConversationStage('completed');
      setConversationStageMsg('Post-conversation assessment completed.');
      setConversationProgress(100);

      // Save to Conversation Session History
      const sessionRecord: ConversationSessionRecord = {
        session_id: sessionId,
        timestamp: new Date().toLocaleTimeString(),
        speaking_mode: mode,
        prompt_target: target,
        turn_count: turns.length,
        total_duration_seconds: turns.reduce((acc, t) => acc + t.duration_seconds, 0),
        turns: turns,
        report: report,
        status: 'completed',
      };
      setConversationHistory((prev) => [sessionRecord, ...prev]);
    } catch (err: any) {
      console.error('Session processing error:', err);
      setConversationStage('error');
      setConversationStageMsg(err.message || 'Post-conversation assessment encountered an error.');
    } finally {
      setIsConversationAssessing(false);
    }
  };

  const handleRevisitConversationSession = (session: ConversationSessionRecord) => {
    if (session.report) {
      setActiveConversationReport(session.report);
      setConversationStage('completed');
      setConversationStageMsg(`Reopened completed report for ${session.session_id}`);
      setConversationProgress(100);
      setAppMode('conversation');
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white">
      {/* App Header */}
      <Header />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Research Limitations & Measurement Protocols Banner */}
        <ResearchLimitationsCard />

        {/* API Connection & Backend Status */}
        <ApiStatusCard
          backendOnline={backendOnline}
          apiKeyConfigured={apiKeyConfigured}
          geminiConfigured={geminiConfigured}
          geminiModel={geminiModel}
          onRefreshHealth={checkHealth}
          onTestConnection={handleTestConnection}
          onTestGeminiConnection={handleTestGeminiConnection}
          isTesting={isTestingConnection}
          isTestingGemini={isTestingGemini}
          testResult={connectionTestResult}
          geminiTestResult={geminiTestResult}
        />

        {/* Architecture Mode Navigation: Conversation-First vs Benchmark Test Bench */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-2.5 rounded-xl shadow-lg">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAppMode('conversation')}
              className={`px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all ${
                appMode === 'conversation'
                  ? 'bg-teal-500 text-slate-950 shadow-md shadow-teal-500/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Conversation-First Assessment</span>
              <span className="text-[10px] bg-slate-950/40 px-1.5 py-0.5 rounded-full font-mono">
                Primary Flow
              </span>
            </button>
            <button
              onClick={() => setAppMode('benchmark')}
              className={`px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all ${
                appMode === 'benchmark'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileAudio className="w-4 h-4" />
              <span>Benchmark Test Bench (10 Scenarios)</span>
            </button>
          </div>

          <div className="text-xs text-slate-400 hidden sm:block">
            {appMode === 'conversation'
              ? 'Uninterrupted dialogue with post-conversation sequential assessment'
              : 'Isolated audio upload & reference transcript WER evaluation'}
          </div>
        </div>

        {/* VIEW 1: CONVERSATION-FIRST ASSESSMENT (Primary Flow) */}
        {appMode === 'conversation' && (
          <div className="space-y-6">
            {/* Conversation Multi-Turn Dialogue Card */}
            <ConversationRecorderCard
              onSessionComplete={handleSessionComplete}
              isProcessing={isConversationAssessing}
              speakingMode={speakingMode}
              onSpeakingModeChange={setSpeakingMode}
              promptTarget={promptTarget}
              onPromptTargetChange={setPromptTarget}
            />

            {/* Sequential Real Backend Progress Stepper */}
            {(isConversationAssessing || conversationStage !== 'recording') && (
              <PostConversationProgressCard
                currentStage={conversationStage}
                stageMessage={conversationStageMsg}
                progressPercent={conversationProgress}
              />
            )}

            {/* Consolidated 5-Section Post-Conversation Assessment Report */}
            {activeConversationReport && (
              <PostConversationReportCard report={activeConversationReport} />
            )}

            {/* Conversation Session History */}
            <SessionHistoryCard
              history={sessionHistory}
              conversationHistory={conversationHistory}
              onClearHistory={() => setSessionHistory([])}
              onClearConversationHistory={() => setConversationHistory([])}
              onSelectHistoryItem={handleSelectHistoryItem}
              onSelectConversationSession={handleRevisitConversationSession}
            />
          </div>
        )}

        {/* VIEW 2: BENCHMARK TEST BENCH (Secondary Flow) */}
        {appMode === 'benchmark' && (
          <div className="space-y-6">
            {/* Test Case Manager & 10 Standard Scenarios */}
            <TestCaseSelectorCard
              currentScenario={currentScenario}
              onSelectScenario={handleSelectScenario}
              onUpdateScenarioFields={handleUpdateScenarioFields}
              isProcessing={isTranscribing}
            />

            {/* Section A: Audio Input (Upload & Record) */}
            <AudioInputCard
              onAudioReady={handleAudioReady}
              isProcessing={isTranscribing}
              selectedPromptText={referenceTranscript}
            />

            {/* Section B & Controls: Transcription & Silence Parameters */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Disfluency & Pause Controls */}
                <div className="flex flex-wrap items-center gap-4">
                  {/* Disfluency Toggle */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDisfluenciesEnabled((prev) => !prev)}
                      className="text-teal-400 hover:text-teal-300 transition-colors"
                    >
                      {disfluenciesEnabled ? (
                        <ToggleRight className="w-8 h-8 text-teal-400" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-slate-500" />
                      )}
                    </button>
                    <div>
                      <span className="text-xs font-semibold text-white">
                        Disfluencies <code className="text-[11px] font-mono text-teal-400 bg-slate-950 px-1 py-0.5 rounded">disfluencies={String(disfluenciesEnabled)}</code>
                      </span>
                      <div className="text-[11px] text-slate-400">Preserves "um", "uh", repetitions</div>
                    </div>
                  </div>

                  {/* Min Pause Threshold Config */}
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="text-slate-400">Min Pause:</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="2.0"
                      value={minPauseDuration}
                      onChange={(e) => setMinPauseDuration(parseFloat(e.target.value) || 0.25)}
                      disabled={isTranscribing}
                      className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-center focus:border-teal-500"
                    />
                    <span className="text-slate-400">s</span>
                  </div>

                  {/* Silence Threshold dBFS Config */}
                  <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                    <span className="text-slate-400">Silence dBFS:</span>
                    <input
                      type="number"
                      step="1"
                      max="-10"
                      min="-70"
                      value={silenceThresholdDb}
                      onChange={(e) => setSilenceThresholdDb(parseFloat(e.target.value) || -35.0)}
                      disabled={isTranscribing}
                      className="w-14 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white font-mono text-center focus:border-teal-500"
                    />
                    <span className="text-slate-400">dB</span>
                  </div>
                </div>

                {/* Speaking Scenario Mode (Prompted Practice vs Spontaneous Speech) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs w-full">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-300">Speaking Scenario Mode:</span>
                    <div className="inline-flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                      <button
                        onClick={() => setSpeakingMode('prompted')}
                        className={`px-3 py-1 rounded-md font-medium text-xs transition-all ${
                          speakingMode === 'prompted'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Prompted Practice
                      </button>
                      <button
                        onClick={() => setSpeakingMode('spontaneous')}
                        className={`px-3 py-1 rounded-md font-medium text-xs transition-all ${
                          speakingMode === 'spontaneous'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Spontaneous Speech
                      </button>
                    </div>
                  </div>

                  {speakingMode === 'prompted' && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-[11px] whitespace-nowrap">Prompt Target:</span>
                      <input
                        type="text"
                        value={promptTarget}
                        onChange={(e) => setPromptTarget(e.target.value)}
                        placeholder="e.g. think"
                        className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono focus:outline-none focus:border-purple-500 w-44"
                      />
                    </div>
                  )}
                </div>

                {/* Transcribe Button */}
                <div className="flex items-center gap-3 self-end lg:self-center">
                  <button
                    onClick={handleTranscribe}
                    disabled={!selectedAudioFile || isTranscribing || !backendOnline || apiKeyConfigured === false}
                    className={`px-6 py-2.5 rounded-lg font-semibold text-xs flex items-center gap-2 transition-all shadow-lg ${
                      !selectedAudioFile || isTranscribing || !backendOnline || apiKeyConfigured === false
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50'
                        : 'bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-slate-950 shadow-teal-500/20'
                    }`}
                  >
                    {isTranscribing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                        <span>Transcribing & Evaluating ({transcriptionElapsedSec.toFixed(1)}s)...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-current" />
                        <span>Transcribe Audio</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Error Banner */}
              {transcriptionError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-semibold">Transcription Request Failed:</span>
                    <p className="text-slate-200">{transcriptionError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Section B: Verbatim Transcription Output */}
            <TranscriptionResultsCard
              result={currentResult}
              isProcessing={isTranscribing}
              elapsedSec={transcriptionElapsedSec}
            />

            {/* Section C: Pipeline A: Reference Transcript & Word Error Rate (WER) */}
            <ReferenceAndWerCard
              referenceTranscript={referenceTranscript}
              onReferenceChange={(text) => {
                setReferenceTranscript(text);
                setReferenceRecordingId(recordingSessionId);
              }}
              alignmentResult={evaluationResult?.alignment || null}
              recordingId={recordingSessionId}
              referenceRecordingId={referenceRecordingId}
              scenarioTitle={currentScenario.title}
              onRecalculateAlignment={() => {
                if (currentResult?.text) {
                  recalculateEvaluation(
                    referenceTranscript,
                    currentResult.text,
                    currentResult.audio_duration || audioDurationSec || 1.0,
                    responseIntervalSeconds,
                    detectedPauses,
                    currentScenario,
                    recordingSessionId,
                    recordingSessionId
                  );
                }
              }}
              isProcessing={isTranscribing}
            />

            {/* Section D: Speech Measurements & Fluency Indicators */}
            <SpeechMeasurementsCard
              audioDurationSeconds={currentResult?.audio_duration || audioDurationSec || 0}
              responseIntervalSeconds={responseIntervalSeconds}
              onResponseIntervalChange={(interval) => {
                setResponseIntervalSeconds(interval);
                if (currentResult?.text) {
                  recalculateEvaluation(
                    referenceTranscript,
                    currentResult.text,
                    currentResult.audio_duration || audioDurationSec || interval,
                    interval,
                    detectedPauses,
                    currentScenario
                  );
                }
              }}
              recognizedWordCount={evaluationResult?.alignment.recognized_word_count ?? 0}
              speechRateResult={evaluationResult?.speech_rate || null}
              pauseMetricsResult={evaluationResult?.pause_metrics || null}
              repetitionRateResult={evaluationResult?.repetition_metrics.repetition_rate || null}
              selfCorrectionCandidates={evaluationResult?.self_corrections.candidates || []}
              detectedPauses={detectedPauses}
              isProcessing={isTranscribing}
            />

            {/* Section E: AI-Assisted Analysis Summary & Articulatory Phonetics */}
            {currentResult && (
              <AiAnalysisSummaryCard
                currentResult={currentResult}
                evaluationResult={evaluationResult}
                preferredAccent="General American"
              />
            )}

            {/* Section F: Pipeline B: Word-Level Diagnostic & Pronunciation Characteristics */}
            {currentResult?.words && currentResult.words.length > 0 && (
              <WordDiagnosticCard
                words={currentResult.words}
                fullTranscription={currentResult.full_transcription || currentResult.text}
                audioMetadata={currentResult.audio_metadata}
                minPauseThresholdSeconds={minPauseDuration}
                speakingMode={speakingMode}
                promptTarget={speakingMode === 'prompted' ? promptTarget : undefined}
              />
            )}

            {/* Section F: Quantitative Evaluation Results (MAE, Precision, Recall, F1) */}
            <EvaluationResultsCard
              evaluationResult={evaluationResult}
              hasReferenceData={Boolean(currentScenario.reference_transcript)}
            />

            {/* Section G: Research Data & Reproducibility Exports */}
            <ExportCard
              currentResult={currentResult}
              currentScenario={currentScenario}
              evaluationResult={evaluationResult}
              sessionHistory={sessionHistory}
            />

            {/* Benchmark Session History */}
            <SessionHistoryCard
              history={sessionHistory}
              conversationHistory={conversationHistory}
              onClearHistory={() => setSessionHistory([])}
              onClearConversationHistory={() => setConversationHistory([])}
              onSelectHistoryItem={handleSelectHistoryItem}
              onSelectConversationSession={handleRevisitConversationSession}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/70 text-slate-500 text-xs py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Articula Thesis Project — Standalone AssemblyAI ASR Evaluation Prototype
          </div>
          <div>
            AssemblyAI Docs:{' '}
            <a
              href="https://www.assemblyai.com/docs/"
              target="_blank"
              rel="noreferrer"
              className="text-teal-400 hover:underline"
            >
              https://www.assemblyai.com/docs/
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
