import React, { useState, useRef, useEffect } from 'react';
import {
  Table,
  Search,
  AlertTriangle,
  ShieldAlert,
  Play,
  Square,
  Sparkles,
  Info,
  CheckCircle,
  Flag,
  FileAudio,
} from 'lucide-react';
import type { WordMetadata } from '../types';

interface WordDiagnosticCardProps {
  words: WordMetadata[];
  fullTranscription?: string;
  audioMetadata?: {
    duration?: number | null;
    sample_rate?: number;
    channels?: number;
    total_samples?: number;
  };
  minPauseThresholdSeconds?: number;
}

export const WordDiagnosticCard: React.FC<WordDiagnosticCardProps> = ({
  words,
  fullTranscription,
  audioMetadata,
  minPauseThresholdSeconds = 0.25,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGapsOnly, setFilterGapsOnly] = useState(false);
  const [filterPhonemesOnly, setFilterPhonemesOnly] = useState(false);
  const [filterReviewOnly, setFilterReviewOnly] = useState(false);
  const [playingWordIndex, setPlayingWordIndex] = useState<number | null>(null);
  const [reviewerDecisions, setReviewerDecisions] = useState<Record<number, 'approved' | 'flagged'>>({});
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  // Stop playback on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  if (!words || words.length === 0) {
    return null;
  }

  // Pre-calculate gap to next word and normalized values
  const wordsWithGaps = words.map((w, idx) => {
    const next = words[idx + 1];
    const startSec = typeof w.start === 'number' ? (w.start / 1000).toFixed(2) : '0.00';
    const endSec = typeof w.end === 'number' ? (w.end / 1000).toFixed(2) : '0.00';
    const duration =
      typeof w.end === 'number' && typeof w.start === 'number'
        ? ((w.end - w.start) / 1000).toFixed(2)
        : '0.00';

    let gapToNext: number | null = null;
    let isCandidateGap = false;

    if (next && typeof next.start === 'number' && typeof w.end === 'number') {
      gapToNext = Math.round((next.start - w.end) / 10) / 100;
      if (gapToNext >= minPauseThresholdSeconds) {
        isCandidateGap = true;
      }
    }

    const wordId = w.word_id ?? idx + 1;
    const clipName = w.audio_clip || `word_${String(wordId).padStart(3, '0')}.wav`;
    const requiresReview =
      w.requires_human_review ??
      (w.confidence < 0.85 ||
        w.segmentation_status !== 'valid' ||
        Boolean(w.segmentation_notes));

    return {
      ...w,
      wordId,
      clipName,
      startSec,
      endSec,
      timestampDisplay: `${startSec}-${endSec}s`,
      duration,
      gapToNext,
      isCandidateGap,
      requiresReview,
      index: idx + 1,
    };
  });

  const reviewCount = wordsWithGaps.filter((w) => w.requiresReview).length;
  const hasPhonemePredictions = words.some((w) => Boolean(w.phoneme_prediction));

  const filtered = wordsWithGaps.filter((w) => {
    const matchesSearch = w.text.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterGapsOnly && !w.isCandidateGap) {
      return false;
    }
    if (filterPhonemesOnly && !w.phoneme_prediction) {
      return false;
    }
    if (filterReviewOnly && !w.requiresReview) {
      return false;
    }
    return matchesSearch;
  });

  const handlePlayWordAudio = (word: (typeof wordsWithGaps)[0]) => {
    if (playingWordIndex === word.index) {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      setPlayingWordIndex(null);
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    if (word.audio_clip_base64) {
      try {
        const audio = new Audio(word.audio_clip_base64);
        currentAudioRef.current = audio;
        setPlayingWordIndex(word.index);

        audio.play().catch((err) => {
          console.error('Audio playback failed:', err);
          setPlayingWordIndex(null);
        });

        audio.onended = () => {
          setPlayingWordIndex(null);
          currentAudioRef.current = null;
        };

        audio.onerror = () => {
          setPlayingWordIndex(null);
          currentAudioRef.current = null;
        };
      } catch (err) {
        console.error('Failed to create audio element:', err);
        setPlayingWordIndex(null);
      }
    }
  };

  const toggleReviewDecision = (idx: number) => {
    setReviewerDecisions((prev) => {
      const current = prev[idx];
      if (!current) return { ...prev, [idx]: 'flagged' };
      if (current === 'flagged') return { ...prev, [idx]: 'approved' };
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  };

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
              <h2 className="text-base font-semibold text-white">
                Word Diagnostics & Pronunciation Characteristic Analysis
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono border border-slate-700">
                {words.length} Tokens
              </span>
              {hasPhonemePredictions && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/40 text-purple-300 font-mono border border-purple-700/60 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  Wav2Vec2Phoneme Active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Inspect word timestamps, ASR confidence, isolated word audio playback, and Hugging Face phonetic predictions
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center flex-wrap gap-2">
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
            onClick={() => setFilterReviewOnly((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              filterReviewOnly
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Flag className="w-3.5 h-3.5 text-rose-400" />
            <span>Needs Review ({reviewCount})</span>
          </button>

          <button
            onClick={() => setFilterGapsOnly((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
              filterGapsOnly
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Gaps &ge; {minPauseThresholdSeconds}s</span>
          </button>

          {hasPhonemePredictions && (
            <button
              onClick={() => setFilterPhonemesOnly((prev) => !prev)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                filterPhonemesOnly
                  ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Phonemes</span>
            </button>
          )}
        </div>
      </div>

      {/* Stage 5: Full-Response Contextual Reference Banner */}
      {fullTranscription && (
        <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-lg space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <FileAudio className="w-3.5 h-3.5 text-cyan-400" />
              Contextual Reference (Complete Spoken Response):
            </span>
            {audioMetadata && (
              <span className="font-mono text-[11px] text-slate-500">
                Native SR: {audioMetadata.sample_rate?.toLocaleString()} Hz | Channels:{' '}
                {audioMetadata.channels === 1 ? 'Mono' : audioMetadata.channels === 2 ? 'Stereo' : audioMetadata.channels || 'Mono'} | Duration:{' '}
                {typeof audioMetadata.duration === 'number' ? `${audioMetadata.duration.toFixed(2)}s` : 'N/A'}
              </span>
            )}
          </div>
          <p className="text-sm text-cyan-200/90 font-medium italic pl-1 leading-relaxed border-l-2 border-cyan-500/50">
            &ldquo;{fullTranscription}&rdquo;
          </p>
        </div>
      )}

      {/* Scientific & Methodological Advisory Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg text-slate-400 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-slate-200">ASR Confidence &ne; Pronunciation Quality:</strong> AssemblyAI confidence denotes acoustic decoding certainty, not speaker proficiency or phonological accuracy.
          </span>
        </div>
        <div className="p-3 bg-purple-950/20 border border-purple-900/40 rounded-lg text-purple-300/90 flex items-start gap-2">
          <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <span>
            <strong className="text-purple-200">Wav2Vec2Phoneme Representation:</strong> Predictions from <code className="text-[11px] text-purple-300">facebook/wav2vec2-lv-60-espeak-cv-ft</code> reflect acoustic features in IPA format. Differences from standard dictionary baselines reflect dialectal and coarticulation variations.
          </span>
        </div>
      </div>

      {/* Word-Level Diagnostic & Pronunciation Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-96 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/90 text-[11px] uppercase tracking-wider text-slate-400 sticky top-0 border-b border-slate-800 z-10 backdrop-blur">
            <tr>
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Word</th>
              <th className="py-2.5 px-3">Timestamp</th>
              <th className="py-2.5 px-3">ASR Confidence</th>
              <th className="py-2.5 px-3">Audio Clip</th>
              <th className="py-2.5 px-3">Phoneme Prediction (IPA)</th>
              <th className="py-2.5 px-3">Ref IPA</th>
              <th className="py-2.5 px-3">Review Flag</th>
              <th className="py-2.5 px-3">Inter-Word Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
            {filtered.map((w) => {
              const isPlaying = playingWordIndex === w.index;
              const hasAudio = Boolean(w.audio_clip_base64);
              const decision = reviewerDecisions[w.index];

              return (
                <tr
                  key={w.index}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isPlaying
                      ? 'bg-cyan-500/10'
                      : w.requiresReview
                      ? 'bg-rose-500/5'
                      : w.isCandidateGap
                      ? 'bg-amber-500/5'
                      : ''
                  }`}
                >
                  <td className="py-2 px-3 text-slate-500 text-[11px]">{w.wordId}</td>
                  <td className="py-2 px-3 font-semibold text-white font-sans text-sm">
                    {w.text}
                  </td>
                  <td className="py-2 px-3" title={`Start: ${w.start}ms, End: ${w.end}ms, Duration: ${w.duration}s`}>
                    <span className="text-slate-300 font-medium">{w.timestampDisplay}</span>
                    <span className="text-[10px] text-slate-500 ml-1">({w.duration}s)</span>
                  </td>
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
                        title={`Raw confidence: ${w.confidence.toFixed(4)}`}
                      >
                        {w.confidence.toFixed(2)} ({(w.confidence * 100).toFixed(0)}%)
                      </span>
                    ) : (
                      <span className="text-slate-500">N/A</span>
                    )}
                  </td>

                  {/* Individual Audio Clip Playback */}
                  <td className="py-2 px-3">
                    {hasAudio ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handlePlayWordAudio(w)}
                          title={isPlaying ? `Stop ${w.clipName}` : `Play isolated clip: ${w.clipName}`}
                          className={`px-2 py-1 rounded flex items-center gap-1 text-[11px] font-sans font-medium transition-all ${
                            isPlaying
                              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          }`}
                        >
                          {isPlaying ? (
                            <>
                              <Square className="w-3 h-3 fill-current" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3 h-3 fill-current text-cyan-400" />
                              <span>Play</span>
                            </>
                          )}
                        </button>
                        <span className="text-[10px] text-slate-500 font-mono hidden lg:inline" title={w.clipName}>
                          {w.clipName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-600 text-[11px] italic">No audio</span>
                    )}
                  </td>

                  {/* Predicted Phonemes */}
                  <td className="py-2 px-3">
                    {w.phoneme_prediction ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-950/60 text-purple-200 border border-purple-800/70 font-mono text-xs">
                        <Sparkles className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                        <span>/{w.phoneme_prediction}/</span>
                      </span>
                    ) : w.segmentation_notes ? (
                      <span
                        className="text-amber-400/80 text-[11px] italic truncate max-w-[140px] block"
                        title={w.segmentation_notes}
                      >
                        {w.segmentation_notes}
                      </span>
                    ) : (
                      <span className="text-slate-600 italic text-[11px]">&mdash;</span>
                    )}
                  </td>

                  {/* Reference IPA */}
                  <td className="py-2 px-3">
                    {w.reference_phonemes ? (
                      <span className="text-slate-400 text-xs font-mono">
                        /{w.reference_phonemes}/
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[11px] italic">&mdash;</span>
                    )}
                  </td>

                  {/* Human Review Status & Toggle */}
                  <td className="py-2 px-3">
                    <button
                      onClick={() => toggleReviewDecision(w.index)}
                      className="cursor-pointer focus:outline-none"
                      title="Click to toggle human review decision (Flagged / Approved)"
                    >
                      {decision === 'approved' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px]">
                          <CheckCircle className="w-3 h-3 text-emerald-400" />
                          <span>Approved</span>
                        </span>
                      ) : decision === 'flagged' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/50 text-[11px]">
                          <Flag className="w-3 h-3 text-rose-400" />
                          <span>Flagged</span>
                        </span>
                      ) : w.requiresReview ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[11px]">
                          <Flag className="w-3 h-3 text-rose-400" />
                          <span>Needs Review</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Verified</span>
                      )}
                    </button>
                  </td>

                  {/* Inter-Word Gap to Next Word */}
                  <td className="py-2 px-3">
                    {w.gapToNext !== null ? (
                      w.isCandidateGap ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px]">
                          <AlertTriangle className="w-3 h-3 text-amber-400" />
                          <span>{w.gapToNext}s (Gap)</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">{w.gapToNext}s</span>
                      )
                    ) : (
                      <span className="text-slate-600 italic text-[11px]">Terminal</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
