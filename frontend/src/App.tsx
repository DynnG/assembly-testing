import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { ApiStatusCard } from './components/ApiStatusCard';
import { AudioInputCard } from './components/AudioInputCard';
import { DisfluencyTestCard } from './components/DisfluencyTestCard';
import { TranscriptionResultsCard } from './components/TranscriptionResultsCard';
import { SessionHistoryCard } from './components/SessionHistoryCard';
import { getHealth, testConnection, transcribeAudio } from './services/api';
import type {
  DisfluencyPrompt,
  HistoryItem,
  TestConnectionResponse,
  TranscriptionResponse,
} from './types';
import { Play, AlertCircle, ToggleRight, ToggleLeft } from 'lucide-react';

export const App: React.FC = () => {
  // Backend & API Key state
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState<boolean>(false);
  const [connectionTestResult, setConnectionTestResult] = useState<TestConnectionResponse | null>(null);

  // Audio input state
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [audioDurationSec, setAudioDurationSec] = useState<number | null>(null);
  const [audioSourceLabel, setAudioSourceLabel] = useState<string>('');

  // Transcription configuration
  const [disfluenciesEnabled, setDisfluenciesEnabled] = useState<boolean>(true);

  // Transcription execution state
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [transcriptionElapsedSec, setTranscriptionElapsedSec] = useState<number>(0);
  const [currentResult, setCurrentResult] = useState<TranscriptionResponse | null>(null);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const elapsedTimerRef = useRef<number | null>(null);

  // Disfluency experiment state
  const [selectedPrompt, setSelectedPrompt] = useState<DisfluencyPrompt | null>(null);

  // Session history state (in-memory, resets on page reload)
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Initial health check on mount
  const checkHealth = async () => {
    try {
      const data = await getHealth();
      setBackendOnline(data.status === 'ok');
      setApiKeyConfigured(data.api_key_configured);
    } catch {
      setBackendOnline(false);
      setApiKeyConfigured(null);
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

  // Handler for testing AssemblyAI connection
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

  // Handler when audio file or recording is ready
  const handleAudioReady = (file: File | null, durationSec: number | null, sourceLabel: string) => {
    setSelectedAudioFile(file);
    setAudioDurationSec(durationSec);
    setAudioSourceLabel(sourceLabel);
    setTranscriptionError(null);
  };

  // Handler for submitting transcription
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
      const result = await transcribeAudio(
        selectedAudioFile,
        selectedAudioFile.name,
        disfluenciesEnabled
      );

      setCurrentResult(result);

      // Record to session history
      const historyEntry: HistoryItem = {
        id: result.id || `test-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        filename: selectedAudioFile.name || audioSourceLabel,
        status: 'completed',
        processingTimeSec: result.processing_time_sec,
        audioDurationSec: result.audio_duration || audioDurationSec || undefined,
        transcriptText: result.text,
        confidence: result.confidence,
        words: result.words,
        expectedPrompt: selectedPrompt?.phrase,
        disfluenciesEnabled: result.disfluencies_enabled,
        rawMetadata: result.raw_metadata,
      };

      setHistory((prev) => [historyEntry, ...prev]);
    } catch (err: any) {
      const msg = err.message || 'Transcription failed';
      setTranscriptionError(msg);

      // Record failed run to history
      const failedEntry: HistoryItem = {
        id: `failed-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        filename: selectedAudioFile.name || audioSourceLabel,
        status: 'failed',
        errorMessage: msg,
        expectedPrompt: selectedPrompt?.phrase,
        disfluenciesEnabled,
      };
      setHistory((prev) => [failedEntry, ...prev]);
    } finally {
      if (elapsedTimerRef.current) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }
      setIsTranscribing(false);
    }
  };

  // Load history item into main view
  const handleSelectHistoryItem = (item: HistoryItem) => {
    if (item.status === 'completed' && item.transcriptText !== undefined) {
      setCurrentResult({
        success: true,
        id: item.id,
        status: 'completed',
        text: item.transcriptText,
        confidence: item.confidence ?? null,
        audio_duration: item.audioDurationSec ?? null,
        words: item.words || [],
        disfluencies_enabled: item.disfluenciesEnabled ?? true,
        processing_time_sec: item.processingTimeSec ?? 0,
        filename: item.filename,
        raw_metadata: item.rawMetadata || {},
      });
    }
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col selection:bg-teal-500 selection:text-white">
      {/* App Header */}
      <Header />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Section 1: API Connection Status */}
        <ApiStatusCard
          backendOnline={backendOnline}
          apiKeyConfigured={apiKeyConfigured}
          onRefreshHealth={checkHealth}
          onTestConnection={handleTestConnection}
          isTesting={isTestingConnection}
          testResult={connectionTestResult}
        />

        {/* Section 2: Audio Input (Upload & Record) */}
        <AudioInputCard
          onAudioReady={handleAudioReady}
          isProcessing={isTranscribing}
          selectedPromptText={selectedPrompt?.phrase}
        />

        {/* Section 3: Transcription Controls & Disfluency Parameter */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Disfluency Toggle */}
            <div className="flex items-start sm:items-center gap-3">
              <button
                type="button"
                onClick={() => setDisfluenciesEnabled((prev) => !prev)}
                className="text-teal-400 hover:text-teal-300 transition-colors mt-0.5 sm:mt-0"
              >
                {disfluenciesEnabled ? (
                  <ToggleRight className="w-8 h-8 text-teal-400" />
                ) : (
                  <ToggleLeft className="w-8 h-8 text-slate-500" />
                )}
              </button>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white">
                    Preserve Speech Disfluencies <code className="text-xs font-mono text-teal-400 bg-slate-950 px-1 py-0.5 rounded border border-slate-800">disfluencies={String(disfluenciesEnabled)}</code>
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/30">
                    Articula Evaluation
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 max-w-xl">
                  {disfluenciesEnabled
                    ? 'Enabled: Requests AssemblyAI to retain filler words ("um", "uh") and speech pauses instead of automatically smoothing them.'
                    : 'Disabled: AssemblyAI will apply default cleanup, removing fillers and verbal pauses from the transcript.'}
                </p>
              </div>
            </div>

            {/* Transcribe Button */}
            <div className="flex items-center gap-3 self-end sm:self-center">
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
                    <span>Transcribing ({transcriptionElapsedSec.toFixed(1)}s)...</span>
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

          {/* Transcription Error Banner */}
          {transcriptionError && (
            <div className="mt-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold">Transcription Request Failed:</span>
                <p className="text-slate-200">{transcriptionError}</p>
                <p className="text-[11px] text-slate-400">
                  Verify your AssemblyAI API key in <code className="font-mono bg-slate-950 px-1 py-0.5 rounded">backend/.env</code>, check audio duration/size, and verify internet connectivity.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Transcription Results Panel */}
        <TranscriptionResultsCard
          result={currentResult}
          isProcessing={isTranscribing}
          elapsedSec={transcriptionElapsedSec}
        />

        {/* Section 5: Articula Disfluency & Fluency Experiment */}
        <DisfluencyTestCard
          selectedPrompt={selectedPrompt}
          onSelectPrompt={(prompt) => setSelectedPrompt(prompt)}
          actualTranscriptText={currentResult?.text || ''}
        />

        {/* Section 6: Session Test History */}
        <SessionHistoryCard
          history={history}
          onClearHistory={handleClearHistory}
          onSelectHistoryItem={handleSelectHistoryItem}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/70 text-slate-500 text-xs py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Articula Thesis Project — Standalone AssemblyAI ASR Testing Prototype
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
