import React, { useState } from 'react';
import { History, Trash2, Eye, Clock, Sparkles, MessageCircle } from 'lucide-react';
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
          <h2 className="text-base font-semibold text-white">Conversation History</h2>
        </div>
        <p className="text-xs text-slate-500 py-4">
          No conversation sessions completed yet. Practice speaking with your companion and your session reflections will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-teal-500/10 border border-teal-500/20 rounded-lg text-teal-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Conversation & Practice History</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-teal-300 font-mono">
                {conversationHistory.length} conversations
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Revisit your past conversations, useful expressions, and reflections.
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
            {history.length > 0 && (
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
            )}
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
              const reflection = sess.reflection;
              const report = sess.report;
              const summarySnippet =
                reflection?.conversation_summary ||
                report?.section_a_speaking_session?.overall_recording_assessment ||
                report?.section_a_transcription_and_timing?.full_transcript ||
                'Conversation session';

              const topicLabel =
                sess.topic?.replace(/_/g, ' ') ||
                reflection?.topics_covered?.[0] ||
                'Everyday Conversation';

              return (
                <div
                  key={`${sess.session_id}-${idx}`}
                  className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-teal-950/80 text-teal-300 border border-teal-500/30 capitalize flex items-center gap-1">
                        <MessageCircle className="w-3 h-3 text-teal-400" />
                        {topicLabel}
                      </span>
                      {sess.mode && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 capitalize">
                          {sess.mode.replace(/_/g, ' ')}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {sess.total_duration_seconds.toFixed(0)}s • {sess.turn_count} turns
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">
                      {summarySnippet}
                    </p>

                    <div className="text-[10px] text-slate-500">
                      Practiced at {sess.timestamp}
                      {reflection?.useful_expressions && (
                        <span> • {reflection.useful_expressions.length} useful expressions discovered</span>
                      )}
                    </div>
                  </div>

                  {(sess.reflection || sess.report) && onSelectConversationSession && (
                    <button
                      onClick={() => onSelectConversationSession(sess)}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-teal-600 hover:text-white text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 self-end sm:self-center"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                      <span>View Reflection</span>
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
                        {item.status}
                      </span>
                    </div>
                  </div>

                  {item.assemblyai_transcript && onSelectHistoryItem && (
                    <button
                      onClick={() => onSelectHistoryItem(item)}
                      className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 self-end sm:self-center"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Revisit Test</span>
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
