import React, { useState } from 'react';
import { Table, Search, AlertTriangle, ShieldAlert } from 'lucide-react';
import type { WordMetadata } from '../types';

interface WordDiagnosticCardProps {
  words: WordMetadata[];
  minPauseThresholdSeconds?: number;
}

export const WordDiagnosticCard: React.FC<WordDiagnosticCardProps> = ({
  words,
  minPauseThresholdSeconds = 0.25,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGapsOnly, setFilterGapsOnly] = useState(false);

  if (!words || words.length === 0) {
    return null;
  }

  // Pre-calculate gap to next word
  const wordsWithGaps = words.map((w, idx) => {
    const next = words[idx + 1];
    const duration = ((w.end - w.start) / 1000).toFixed(2);
    let gapToNext: number | null = null;
    let isCandidateGap = false;

    if (next) {
      gapToNext = Math.round((next.start - w.end) / 10) / 100;
      if (gapToNext >= minPauseThresholdSeconds) {
        isCandidateGap = true;
      }
    }

    return {
      ...w,
      duration,
      gapToNext,
      isCandidateGap,
      index: idx + 1,
    };
  });

  const filtered = wordsWithGaps.filter((w) => {
    const matchesSearch = w.text.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterGapsOnly) {
      return matchesSearch && w.isCandidateGap;
    }
    return matchesSearch;
  });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-cyan-400">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Word-Level Diagnostic & Timestamp Inspector</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono border border-slate-700">
                {words.length} Tokens
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Inspect word timestamps, acoustic durations, confidence scores, and inter-word temporal gaps
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search words..."
              className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            onClick={() => setFilterGapsOnly((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              filterGapsOnly
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Gaps &ge; {minPauseThresholdSeconds}s</span>
          </button>
        </div>
      </div>

      {/* Advisory Banner */}
      <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-xs text-slate-400 flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
        <span>
          <strong>Thesis Diagnostic Rule:</strong> A timestamp gap between adjacent words is only a <em>candidate pause</em> until verified against the acoustic audio signal. Word timestamps alone do not guarantee silent pause existence.
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-72 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 sticky top-0 border-b border-slate-800 z-10 backdrop-blur">
            <tr>
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Word</th>
              <th className="py-2.5 px-3">Start (s)</th>
              <th className="py-2.5 px-3">End (s)</th>
              <th className="py-2.5 px-3">Duration</th>
              <th className="py-2.5 px-3">Confidence</th>
              <th className="py-2.5 px-3">Gap to Next Word</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
            {filtered.map((w) => (
              <tr
                key={w.index}
                className={`hover:bg-slate-800/40 transition-colors ${
                  w.isCandidateGap ? 'bg-amber-500/5' : ''
                }`}
              >
                <td className="py-2 px-3 text-slate-500 text-[11px]">{w.index}</td>
                <td className="py-2 px-3 font-semibold text-white font-sans">{w.text}</td>
                <td className="py-2 px-3">{(w.start / 1000).toFixed(2)}s</td>
                <td className="py-2 px-3">{(w.end / 1000).toFixed(2)}s</td>
                <td className="py-2 px-3">{w.duration}s</td>
                <td className="py-2 px-3">
                  {typeof w.confidence === 'number' ? (
                    <span
                      className={`inline-flex items-center gap-1 font-semibold ${
                        w.confidence >= 0.9
                          ? 'text-emerald-400'
                          : w.confidence >= 0.7
                          ? 'text-amber-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {(w.confidence * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-slate-500">N/A</span>
                  )}
                </td>
                <td className="py-2 px-3">
                  {w.gapToNext !== null ? (
                    w.isCandidateGap ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px]">
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                        <span>{w.gapToNext}s gap (Candidate)</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 text-[11px]">{w.gapToNext}s</span>
                    )
                  ) : (
                    <span className="text-slate-600 italic text-[11px]">Terminal token</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
