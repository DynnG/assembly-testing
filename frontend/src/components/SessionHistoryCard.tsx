import React, { useState } from 'react';
import { History, Trash2, Eye, CheckCircle2, XCircle, FileAudio, Clock } from 'lucide-react';
import type { TestSessionRecord, ConversationSessionRecord } from '../types';

interface SessionHistoryCardProps {
  history: TestSessionRecord[];
  conversationHistory?: ConversationSessionRecord[];
  onClearHistory: () => void;
  onClearConversationHistory?: () => void;
  onSelectHistoryItem: (item: TestSessionRecord) => void;
  onSelectConversationSession?: (session: ConversationSessionRecord) => void;
}

export const SessionHistoryCard: React.FC<SessionHistoryCardProps> = ({
  history,
  conversationHistory = [],
  onClearHistory,
  onClearConversationHistory,
  onSelectHistoryItem,
  onSelectConversationSession,
}) => {
  const [activeTab, setActiveTab] = useState<'conversation' | 'benchmark'>(
    conversationHistory.length > 0 ? 'conversation' : 'conversation'
  );

  const hasAnyHistory = history.length > 0 || conversationHistory.length > 0;

  if (!hasAnyHistory) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 text-center">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
            <History className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-white">Session History</h2>
        </div>
        <p className="text-xs text-slate-500 py-4">
          No sessions executed yet. Completing a conversation or benchmark test will store the results here for instant recall without re-running analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Session History</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {conversationHistory.length} conversations • {history.length} benchmarks
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Ephemeral in-memory history. Revisit completed sessions instantly without re-running jobs.
            </p>
          </div>
        </div>

        {/* Tab & Clear Buttons */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          <div className="inline-flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs">
            <button
              onClick={() => setActiveTab('conversation')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'conversation'
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Conversations ({conversationHistory.length})
            </button>
            <button
              onClick={() => setActiveTab('benchmark')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'benchmark'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Benchmarks ({history.length})
            </button>
          </div>

          <button
            onClick={() => {
              if (activeTab === 'conversation' && onClearConversationHistory) {
                onClearConversationHistory();
              } else {
                onClearHistory();
              }
            }}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 text-xs flex items-center gap-1.5 transition-colors"
            title="Clear active history"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* Tab: Conversation Sessions */}
      {activeTab === 'conversation' && (
        <div className="space-y-2.5 max-h-80 overflow-y-auto">
          {conversationHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">
              No conversation sessions recorded yet.
            </p>
          ) : (
            conversationHistory.map((sess, idx) => {
              const report = sess.report;
              const wpm = report?.section_b_fluency_analysis.speech_rate_wpm;
              const wordCount = report?.section_a_transcription_and_timing.word_timestamps_count;

              return (
                <div
                  key={`${sess.session_id}-${idx}`}
                  className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-teal-400">
                        {sess.session_id}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/30 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-teal-400" />
                        {sess.status}
                      </span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300">
                        {sess.speaking_mode}
                      </span>
                      {wpm && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/20 text-cyan-300">
                          {wpm} WPM
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {sess.total_duration_seconds.toFixed(1)}s ({sess.turn_count} turns)
                      </span>
                    </div>

                    {/* Preview transcript */}
                    <p className="text-xs text-slate-300 font-mono line-clamp-1 italic">
                      "{report?.section_a_transcription_and_timing.full_transcript || 'No transcript text'}"
                    </p>

                    <div className="text-[10px] text-slate-500">
                      Recorded at {sess.timestamp} • {wordCount || 0} recognized words
                    </div>
                  </div>

                  {sess.report && onSelectConversationSession && (
                    <button
                      onClick={() => onSelectConversationSession(sess)}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-teal-600 hover:text-white text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 self-end sm:self-center"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Revisit Report</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab: Benchmark Test Runs */}
      {activeTab === 'benchmark' && (
        <div className="space-y-2.5 max-h-80 overflow-y-auto">
          {history.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">
              No benchmark test runs recorded yet.
            </p>
          ) : (
            history.map((item, idx) => {
              const testNumber = history.length - idx;
              const isSuccess = item.status === 'completed';

              return (
                <div
                  key={`${item.test_case_id}-${idx}`}
                  className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        #{testNumber} {item.test_case_id}
                      </span>
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          isSuccess
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                        }`}
                      >
                        {isSuccess ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3 h-3 text-rose-400" />
                        )}
                        {item.status}
                      </span>

                      {item.word_error_rate_percent !== null && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                          WER: {item.word_error_rate_percent}%
                        </span>
                      )}

                      {item.speech_rate_wpm !== null && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/20 text-teal-300">
                          {item.speech_rate_wpm} WPM
                        </span>
                      )}

                      <span className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                        <FileAudio className="w-3 h-3 text-slate-500 shrink-0" />
                        {item.audio_file}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 font-mono line-clamp-1 italic">
                      {item.assemblyai_transcript
                        ? `"${item.assemblyai_transcript}"`
                        : item.exclusion_reason || '[No transcript text]'}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                      <span>{item.timestamp}</span>
                      {item.audio_duration_seconds !== undefined && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.audio_duration_seconds}s audio
                        </span>
                      )}
                      {item.pause_count > 0 && (
                        <span>
                          {item.pause_count} pauses ({item.mean_pause_duration_seconds}s avg)
                        </span>
                      )}
                      <span className="text-slate-400">Condition: {item.recording_condition}</span>
                    </div>
                  </div>

                  {isSuccess && (
                    <button
                      onClick={() => onSelectHistoryItem(item)}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-teal-600 hover:text-white text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 self-end sm:self-center"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

