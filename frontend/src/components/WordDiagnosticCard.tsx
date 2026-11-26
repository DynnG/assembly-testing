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
  ChevronDown,
  ChevronRight,
  Filter,
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

type FilterMode = 'all' | 'review' | 'analyzed' | 'low_quality' | 'gaps' | 'phonemes';

export const WordDiagnosticCard: React.FC<WordDiagnosticCardProps> = ({
  words,
  fullTranscription,
  audioMetadata,
  minPauseThresholdSeconds = 0.25,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [playingWordIndex, setPlayingWordIndex] = useState<number | null>(null);
  const [expandedWordIndex, setExpandedWordIndex] = useState<number | null>(null);
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
    const durationMs =
      w.raw_duration_ms ??
      (typeof w.end === 'number' && typeof w.start === 'number' ? w.end - w.start : 0);
    const durationSec = (durationMs / 1000).toFixed(2);

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
        w.audio_quality_status === 'too_short' ||
        w.audio_quality_status === 'near_silence' ||
        Boolean(w.segmentation_notes));

    const isLowQuality =
      w.audio_quality_status === 'too_short' ||
      w.audio_quality_status === 'near_silence' ||
      durationMs < 50;

    const isCompletedAnalysis = w.phoneme_analysis_status === 'completed';

    return {
      ...w,
      wordId,
      clipName,
      startSec,
      endSec,
      durationMs,
      durationSec,
      timestampDisplay: `${startSec}-${endSec}s`,
      gapToNext,
      isCandidateGap,
      requiresReview,
      isLowQuality,
      isCompletedAnalysis,
      index: idx + 1,
    };
  });

  const reviewCount = wordsWithGaps.filter((w) => w.requiresReview).length;
  const lowQualityCount = wordsWithGaps.filter((w) => w.isLowQuality).length;
  const analyzedCount = wordsWithGaps.filter((w) => w.isCompletedAnalysis).length;
  const hasPhonemePredictions = words.some((w) => Boolean(w.phoneme_prediction));

  const filtered = wordsWithGaps.filter((w) => {
    const matchesSearch = w.text.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (filterMode === 'review') return w.requiresReview;
    if (filterMode === 'analyzed') return w.isCompletedAnalysis;
    if (filterMode === 'low_quality') return w.isLowQuality;
    if (filterMode === 'gaps') return w.isCandidateGap;
    if (filterMode === 'phonemes') return Boolean(w.phoneme_prediction);
    return true;
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

  const toggleExpandWord = (idx: number) => {
    setExpandedWordIndex((prev) => (prev === idx ? null : idx));
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
              Inspect word timestamps, padded audio segmentation, ASR confidence, acoustic quality status, and Levenshtein phoneme alignment
            </p>
          </div>
        </div>

        {/* Search */}
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
        </div>
      </div>

      {/* Filter Chips Bar */}
      <div className="flex items-center flex-wrap gap-2 text-xs">
        <span className="text-slate-400 text-[11px] font-semibold flex items-center gap-1 mr-1">
          <Filter className="w-3 h-3 text-cyan-400" /> Filter:
        </span>
        <button
          onClick={() => setFilterMode('all')}
          className={`px-2.5 py-1 rounded-lg font-medium border transition-colors ${
            filterMode === 'all'
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          All ({words.length})
        </button>
        <button
          onClick={() => setFilterMode('review')}
          className={`px-2.5 py-1 rounded-lg font-medium border transition-colors flex items-center gap-1 ${
            filterMode === 'review'
              ? 'bg-rose-500/20 border-rose-500 text-rose-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flag className="w-3 h-3 text-rose-400" />
          <span>Needs Review ({reviewCount})</span>
        </button>
        <button
          onClick={() => setFilterMode('analyzed')}
          className={`px-2.5 py-1 rounded-lg font-medium border transition-colors flex items-center gap-1 ${
            filterMode === 'analyzed'
              ? 'bg-purple-500/20 border-purple-500 text-purple-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="w-3 h-3 text-purple-400" />
          <span>Successfully Analyzed ({analyzedCount})</span>
        </button>
        <button
          onClick={() => setFilterMode('low_quality')}
          className={`px-2.5 py-1 rounded-lg font-medium border transition-colors flex items-center gap-1 ${
            filterMode === 'low_quality'
              ? 'bg-amber-500/20 border-amber-500 text-amber-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3 h-3 text-amber-400" />
          <span>Short / Low-Quality ({lowQualityCount})</span>
        </button>
        <button
          onClick={() => setFilterMode('gaps')}
          className={`px-2.5 py-1 rounded-lg font-medium border transition-colors flex items-center gap-1 ${
            filterMode === 'gaps'
              ? 'bg-blue-500/20 border-blue-500 text-blue-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-3 h-3 text-blue-400" />
          <span>Gaps &ge; {minPauseThresholdSeconds}s</span>
        </button>
        {hasPhonemePredictions && (
          <button
            onClick={() => setFilterMode('phonemes')}
            className={`px-2.5 py-1 rounded-lg font-medium border transition-colors flex items-center gap-1 ${
              filterMode === 'phonemes'
                ? 'bg-purple-500/20 border-purple-500 text-purple-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Phonemes</span>
          </button>
        )}
      </div>

      {/* Full-Response Contextual Reference Banner */}
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
            <strong className="text-purple-200">Wav2Vec2Phoneme Alignment:</strong> Predictions reflect acoustic features in normalized IPA format. Short segments (&lt;30ms) or near-silent clips are automatically skipped to avoid hallucinated acoustic artifacts.
          </span>
        </div>
      </div>

      {/* Word-Level Diagnostic & Pronunciation Table */}
      <div className="overflow-x-auto border border-slate-800 rounded-lg max-h-[500px] overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950/90 text-[11px] uppercase tracking-wider text-slate-400 sticky top-0 border-b border-slate-800 z-10 backdrop-blur">
            <tr>
              <th className="py-2.5 px-2 text-center w-8">#</th>
              <th className="py-2.5 px-3">Word</th>
              <th className="py-2.5 px-3">Timestamps (Raw / Padded)</th>
              <th className="py-2.5 px-2">Duration</th>
              <th className="py-2.5 px-3">ASR Conf</th>
              <th className="py-2.5 px-2">Quality</th>
              <th className="py-2.5 px-2">Audio</th>
              <th className="py-2.5 px-3">Predicted IPA</th>
              <th className="py-2.5 px-3">Ref IPA</th>
              <th className="py-2.5 px-2">PER</th>
              <th className="py-2.5 px-2 text-center">Review</th>
              <th className="py-2.5 px-2">Gap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300 font-mono">
            {filtered.map((w) => {
              const isPlaying = playingWordIndex === w.index;
              const isExpanded = expandedWordIndex === w.index;
              const hasAudio = Boolean(w.audio_clip_base64);
              const decision = reviewerDecisions[w.index];

              // Quality badge colors
              const qualityBadge =
                w.audio_quality_status === 'normal' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Normal
                  </span>
                ) : w.audio_quality_status === 'too_short' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20" title={w.quality_notes || 'Segment under 30ms'}>
                    Too Short
                  </span>
                ) : w.audio_quality_status === 'near_silence' ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20" title={w.quality_notes || 'RMS < 1e-4'}>
                    Silent
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
                    {w.audio_quality_status || 'OK'}
                  </span>
                );

              return (
                <React.Fragment key={w.index}>
                  <tr
                    className={`hover:bg-slate-800/40 transition-colors cursor-pointer ${
                      isPlaying
                        ? 'bg-cyan-500/10'
                        : isExpanded
                        ? 'bg-slate-800/30'
                        : w.requiresReview
                        ? 'bg-rose-500/5'
                        : w.isCandidateGap
                        ? 'bg-amber-500/5'
                        : ''
                    }`}
                    onClick={() => toggleExpandWord(w.index)}
                  >
                    <td className="py-2 px-2 text-slate-500 text-[11px] text-center">
                      <div className="flex items-center justify-center gap-1">
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-cyan-400" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-slate-500" />
                        )}
                        <span>{w.wordId}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 font-semibold text-white font-sans text-sm">
                      {w.text}
                    </td>
                    <td className="py-2 px-3 text-[11px]" title={`Raw: ${w.start}-${w.end}ms | Padded: ${w.padded_start_ms ?? w.start}-${w.padded_end_ms ?? w.end}ms`}>
                      <span className="text-slate-200">{w.timestampDisplay}</span>
                      {w.padded_start_ms != null && w.padded_end_ms != null && (
                        <div className="text-[10px] text-slate-500">
                          Pad: {(w.padded_start_ms / 1000).toFixed(2)}-{(w.padded_end_ms / 1000).toFixed(2)}s
                        </div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-[11px]">
                      <span className="text-slate-300">{w.durationMs}ms</span>
                    </td>
                    <td className="py-2 px-3">
                      {typeof w.confidence === 'number' ? (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                            w.confidence >= 0.9
                              ? 'text-emerald-400'
                              : w.confidence >= 0.7
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                          title={`Raw confidence: ${w.confidence.toFixed(4)}`}
                        >
                          {(w.confidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">N/A</span>
                      )}
                    </td>
                    <td className="py-2 px-2">
                      {qualityBadge}
                    </td>

                    {/* Individual Audio Clip Playback */}
                    <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                      {hasAudio ? (
                        <button
                          onClick={() => handlePlayWordAudio(w)}
                          title={isPlaying ? `Stop ${w.clipName}` : `Play isolated clip: ${w.clipName}`}
                          className={`px-1.5 py-0.5 rounded flex items-center gap-1 text-[10px] font-sans font-medium transition-all ${
                            isPlaying
                              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                          }`}
                        >
                          {isPlaying ? (
                            <>
                              <Square className="w-2.5 h-2.5 fill-current" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-2.5 h-2.5 fill-current text-cyan-400" />
                              <span>Play</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-slate-600 text-[10px] italic">No audio</span>
                      )}
                    </td>

                    {/* Predicted Phonemes */}
                    <td className="py-2 px-3">
                      {w.phoneme_prediction ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-200 border border-purple-800/70 font-mono text-xs">
                          <Sparkles className="w-2.5 h-2.5 text-purple-400 shrink-0" />
                          <span>/{w.phoneme_prediction}/</span>
                        </span>
                      ) : (
                        <span className="text-slate-600 italic text-[11px]">&mdash;</span>
                      )}
                    </td>

                    {/* Reference IPA */}
                    <td className="py-2 px-3">
                      {w.reference_phonemes ? (
                        <span className="text-slate-300 text-xs font-mono">
                          /{w.reference_phonemes}/
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[11px] italic">&mdash;</span>
                      )}
                    </td>

                    {/* PER */}
                    <td className="py-2 px-2">
                      {typeof w.phoneme_error_rate === 'number' ? (
                        <span
                          className={`font-mono font-semibold text-xs ${
                            w.phoneme_error_rate === 0
                              ? 'text-emerald-400'
                              : w.phoneme_error_rate <= 33
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {w.phoneme_error_rate.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]" title={w.phoneme_analysis_status || 'Unavailable'}>
                          N/A
                        </span>
                      )}
                    </td>

                    {/* Human Review Status & Toggle */}
                    <td className="py-2 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => toggleReviewDecision(w.index)}
                        className="cursor-pointer focus:outline-none"
                        title="Click to toggle human review decision (Flagged / Approved)"
                      >
                        {decision === 'approved' ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px]">
                            <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
                            <span>Approved</span>
                          </span>
                        ) : decision === 'flagged' ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/50 text-[10px]">
                            <Flag className="w-2.5 h-2.5 text-rose-400" />
                            <span>Flagged</span>
                          </span>
                        ) : w.requiresReview ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[10px]">
                            <Flag className="w-2.5 h-2.5 text-rose-400" />
                            <span>Review</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">Verified</span>
                        )}
                      </button>
                    </td>

                    {/* Inter-Word Gap */}
                    <td className="py-2 px-2">
                      {w.gapToNext !== null ? (
                        w.isCandidateGap ? (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px]">
                            <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                            <span>{w.gapToNext}s</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">{w.gapToNext}s</span>
                        )
                      ) : (
                        <span className="text-slate-600 italic text-[10px]">Term</span>
                      )}
                    </td>
                  </tr>

                  {/* Expandable Word Details Row */}
                  {isExpanded && (
                    <tr className="bg-slate-950/90 border-b border-slate-800">
                      <td colSpan={12} className="p-4 space-y-3 font-sans">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                          {/* Col 1: Phoneme Breakdown */}
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                              Phoneme Token Alignment
                            </span>
                            <div className="space-y-1 font-mono text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Predicted Normalized:</span>
                                <span className="text-purple-300">
                                  {w.predicted_phonemes_normalized && w.predicted_phonemes_normalized.length > 0
                                    ? `[${w.predicted_phonemes_normalized.join(', ')}]`
                                    : w.phoneme_prediction || 'N/A'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Reference Normalized:</span>
                                <span className="text-emerald-300">
                                  {w.reference_phonemes_normalized && w.reference_phonemes_normalized.length > 0
                                    ? `[${w.reference_phonemes_normalized.join(', ')}]`
                                    : w.reference_phonemes || 'N/A'}
                                </span>
                              </div>
                              <div className="flex justify-between pt-1 border-t border-slate-800">
                                <span className="text-slate-400">Reference Source:</span>
                                <span className="text-slate-300">{w.reference_source || 'cmudict'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Col 2: Audio Segmentation Details */}
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                              <FileAudio className="w-3.5 h-3.5 text-cyan-400" />
                              Audio Segmentation Window
                            </span>
                            <div className="space-y-1 font-mono text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Raw Word Bounds:</span>
                                <span className="text-slate-200">{w.start}ms &rarr; {w.end}ms ({w.durationMs}ms)</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Padded Window:</span>
                                <span className="text-cyan-300">
                                  {w.padded_start_ms ?? w.start}ms &rarr; {w.padded_end_ms ?? w.end}ms (
                                  {w.padded_duration_ms ?? w.durationMs}ms)
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Clip File:</span>
                                <span className="text-slate-400 truncate max-w-[150px]" title={w.clipName}>{w.clipName}</span>
                              </div>
                            </div>
                          </div>

                          {/* Col 3: Quality Notes & Status */}
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-amber-400" />
                              Status & Validation Notes
                            </span>
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between">
                                <span className="text-slate-400">Analysis Status:</span>
                                <span className="font-mono text-slate-200">{w.phoneme_analysis_status || 'completed'}</span>
                              </div>
                              {w.quality_notes && (
                                <div className="text-amber-300/90 text-[10px] bg-amber-950/30 p-1.5 rounded border border-amber-900/40">
                                  <strong>Note:</strong> {w.quality_notes}
                                </div>
                              )}
                              {w.segmentation_notes && (
                                <div className="text-rose-300/90 text-[10px] bg-rose-950/30 p-1.5 rounded border border-rose-900/40">
                                  <strong>Segmentation:</strong> {w.segmentation_notes}
                                </div>
                              )}
                              {!w.quality_notes && !w.segmentation_notes && (
                                <div className="text-emerald-400 text-[10px]">
                                  Audio segment conforms to acoustic validation thresholds (duration &ge; 30ms, non-silent).
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
