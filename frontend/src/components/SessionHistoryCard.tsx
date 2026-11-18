import React from 'react';
import { History, Trash2, Eye, CheckCircle2, XCircle, FileAudio, Clock } from 'lucide-react';
import type { HistoryItem } from '../types';

interface SessionHistoryCardProps {
  history: HistoryItem[];
  onClearHistory: () => void;
  onSelectHistoryItem: (item: HistoryItem) => void;
}

export const SessionHistoryCard: React.FC<SessionHistoryCardProps> = ({
  history,
  onClearHistory,
  onSelectHistoryItem,
}) => {
  if (history.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 text-center">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
            <History className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-white">Session Test History</h2>
        </div>
        <p className="text-xs text-slate-500 py-4">
          No tests executed in this session. Running a transcription will log its results here for side-by-side comparison.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Session Test History</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                {history.length} {history.length === 1 ? 'test' : 'tests'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Ephemeral in-memory history for this browser session only (no database)
            </p>
          </div>
        </div>

        <button
          onClick={onClearHistory}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 hover:text-rose-400 text-slate-400 text-xs flex items-center gap-1.5 transition-colors"
          title="Clear session history"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>

      <div className="space-y-2.5 max-h-80 overflow-y-auto">
        {history.map((item, idx) => {
          const testNumber = history.length - idx;
          const isSuccess = item.status === 'completed';

          return (
            <div
              key={item.id}
              className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-lg hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    Test #{testNumber}
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
                  <span className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                    <FileAudio className="w-3 h-3 text-slate-500 shrink-0" />
                    {item.filename}
                  </span>
                </div>

                {/* Preview text */}
                <p className="text-xs text-slate-300 font-mono line-clamp-1 italic">
                  {item.transcriptText
                    ? `"${item.transcriptText}"`
                    : item.errorMessage || '[No transcript text]'}
                </p>

                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span>{item.timestamp}</span>
                  {item.processingTimeSec !== undefined && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.processingTimeSec}s process
                    </span>
                  )}
                  {item.audioDurationSec !== undefined && (
                    <span>{item.audioDurationSec}s audio</span>
                  )}
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
        })}
      </div>
    </div>
  );
};
