import React, { useState } from 'react';
import {
  FileText,
  Copy,
  Download,
  Check,
  Clock,
  Gauge,
  Music,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Code2,
  ShieldAlert,
} from 'lucide-react';
import type { TranscriptionResponse } from '../types';

interface TranscriptionResultsCardProps {
  result: TranscriptionResponse | null;
  isProcessing: boolean;
  elapsedSec: number;
}

export const TranscriptionResultsCard: React.FC<TranscriptionResultsCardProps> = ({
  result,
  isProcessing,
  elapsedSec,
}) => {
  const [copied, setCopied] = useState(false);
  const [showWordDetails, setShowWordDetails] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const handleCopy = () => {
    if (!result?.text) return;
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result?.text) return;
    const blob = new Blob([result.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assemblyai_transcript_${result.id || Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (isProcessing) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-lg shadow-black/20 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
          <Clock className="w-6 h-6 animate-spin text-teal-400" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Transcribing with AssemblyAI...</h3>
          <p className="text-xs text-slate-400 mt-1">
            Uploading audio stream and polling transcription status. Please hold on.
          </p>
        </div>
        <div className="text-2xl font-mono font-bold text-teal-400">
          {elapsedSec.toFixed(1)}s
        </div>
        <div className="max-w-md mx-auto text-[11px] text-slate-500 bg-slate-950/60 p-2.5 rounded border border-slate-800">
          AssemblyAI processes audio asynchronously on their neural ASR cluster. Typical response time is a few seconds for short clips.
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 shadow-lg shadow-black/20 text-center space-y-2">
        <FileText className="w-8 h-8 mx-auto text-slate-600 mb-2" />
        <h3 className="text-sm font-medium text-slate-300">No Transcription Results Yet</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Upload an audio file or record with your microphone, then click Transcribe Audio above to test AssemblyAI.
        </p>
      </div>
    );
  }

  // Calculate average word confidence only if words have confidence
  const hasWordConf = result.words && result.words.length > 0 && typeof result.words[0].confidence === 'number';
  const averageConfidence =
    typeof result.confidence === 'number'
      ? (result.confidence * 100).toFixed(1)
      : hasWordConf
      ? (
          (result.words.reduce((acc, w) => acc + (w.confidence || 0), 0) / result.words.length) *
          100
        ).toFixed(1)
      : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Header and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Transcription Output</h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                {result.status}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Raw transcript returned by AssemblyAI — unchanged and verbatim
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Copy transcript to clipboard"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-teal-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Transcript</span>
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Download transcript as plain text"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download .txt</span>
          </button>
        </div>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Processing Time</span>
          </div>
          <div className="text-sm font-semibold text-white">
            {result.processing_time_sec}s
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
            <Music className="w-3.5 h-3.5 text-slate-500" />
            <span>Audio Duration</span>
          </div>
          <div className="text-sm font-semibold text-white">
            {result.audio_duration ? `${result.audio_duration}s` : 'N/A'}
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
            <Gauge className="w-3.5 h-3.5 text-slate-500" />
            <span>Confidence Score</span>
          </div>
          <div className="text-sm font-semibold text-white">
            {averageConfidence ? `${averageConfidence}%` : 'Not provided'}
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3">
          <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-1">
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Word Count</span>
          </div>
          <div className="text-sm font-semibold text-white">
            {result.text.trim() ? result.text.trim().split(/\s+/).length : 0} words
          </div>
        </div>
      </div>

      {/* Main Transcript Panel */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 sm:p-5">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 mb-2 flex items-center justify-between">
          <span>Verbatim Transcript Text</span>
          <span className="text-slate-500 text-[10px] lowercase">
            disfluencies={String(result.disfluencies_enabled)}
          </span>
        </div>
        <p className="text-white text-sm sm:text-base font-normal leading-relaxed whitespace-pre-wrap select-all">
          {result.text || (
            <span className="text-slate-500 italic">
              [No speech detected or empty transcript returned by provider]
            </span>
          )}
        </p>
      </div>

      {/* Integrity banner */}
      <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <span>
          <strong>ASR Integrity Notice:</strong> The text above reflects the exact output string from AssemblyAI's API. No grammar corrections, filler deletions, punctuation synthesis, or automated summarization have been applied.
        </span>
      </div>

      {/* Accordion 1: Word-level timestamps & confidence */}
      {result.words && result.words.length > 0 && (
        <div className="border border-slate-800 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowWordDetails((prev) => !prev)}
            className="w-full px-4 py-3 bg-slate-950/60 hover:bg-slate-950 flex items-center justify-between text-xs font-medium text-slate-300 transition-colors"
          >
            <span>Word-Level Details & Timestamps ({result.words.length} tokens)</span>
            {showWordDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showWordDetails && (
            <div className="p-4 bg-slate-950/90 border-t border-slate-800 max-h-64 overflow-y-auto space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {result.words.map((w, i) => (
                  <div
                    key={i}
                    className="p-2 bg-slate-900 border border-slate-800 rounded text-center"
                  >
                    <div className="text-xs font-semibold text-teal-300 truncate">
                      {w.text}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {((w.start || 0) / 1000).toFixed(2)}s - {((w.end || 0) / 1000).toFixed(2)}s
                    </div>
                    {typeof w.confidence === 'number' && (
                      <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                        {(w.confidence * 100).toFixed(0)}% conf
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Accordion 2: Raw Speech Recognition Metadata */}
      <div className="border border-slate-800 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowRawJson((prev) => !prev)}
          className="w-full px-4 py-3 bg-slate-950/60 hover:bg-slate-950 flex items-center justify-between text-xs font-medium text-slate-300 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-cyan-400" />
            <span>AssemblyAI Speech Recognition Metadata (JSON)</span>
          </div>
          {showRawJson ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showRawJson && (
          <div className="p-4 bg-slate-950/90 border-t border-slate-800">
            <pre className="text-[11px] font-mono text-cyan-300 bg-slate-900/90 p-3 rounded overflow-x-auto max-h-60">
              {JSON.stringify(result.raw_metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
