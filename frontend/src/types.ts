export interface HealthResponse {
  status: string;
  api_key_configured: boolean;
}

export interface TestConnectionResponse {
  success: boolean;
  message: string;
  status_code?: number;
  error?: string;
}

export interface WordMetadata {
  word_id?: number;
  token_index?: number;
  text: string;
  word?: string;
  start: number;
  end: number;
  start_ms?: number;
  end_ms?: number;
  confidence: number;
  assembly_confidence?: number;
  speaker?: string | null;
  duration_ms?: number | null;
  audio_clip?: string | null;
  phoneme_prediction?: string | null;
  reference_phonemes?: string | null;
  phoneme_tokens?: string[];
  expected_phonemes?: string[];
  expected_phonemes_str?: string;
  predicted_phonemes?: string[];
  predicted_phonemes_str?: string;
  reference_source?: string;
  reference_variants?: string[];
  selected_variant_index?: number;
  accent_or_variety?: string;
  alignment?: Array<{
    operation: 'match' | 'substitution' | 'deletion' | 'insertion';
    expected: string | null;
    predicted: string | null;
    position: number;
    expected_index?: number | null;
    predicted_index?: number | null;
  }>;
  phoneme_error_rate?: number | null;
  per_metrics?: Record<string, any> | null;
  pronunciation_findings?: Array<Record<string, any>>;
  findings_count?: number;
  audio_clip_base64?: string | null;
  analysis_status?: string;
  segmentation_status?: 'valid' | 'missing_timestamps' | 'invalid_duration' | 'out_of_bounds' | 'near_silence' | 'error';
  segmentation_notes?: string | null;
  requires_human_review?: boolean;
}

export interface DisfluencyPrompt {
  id: string;
  title: string;
  category: 'Filler' | 'Repetition' | 'False Start' | 'Self-Correction' | 'Grammar Error';
  phrase: string;
  description: string;
  targetElements: string[];
}

export interface HistoryItem {
  id: string;
  timestamp: string;
  filename: string;
  status: 'completed' | 'failed';
  processingTimeSec?: number;
  audioDurationSec?: number;
  transcriptText?: string;
  confidence?: number | null;
  words?: WordMetadata[];
  expectedPrompt?: string;
  disfluenciesEnabled?: boolean;
  rawMetadata?: Record<string, any>;
  errorMessage?: string;
}

export interface SilencePauseEvent {
  start_seconds: number;
  end_seconds: number;
  duration_seconds: number;
}

export interface SilenceAnalysisResult {
  detected_pauses: SilencePauseEvent[];
  pause_count: number;
  total_pause_duration_seconds: number;
  mean_pause_duration_seconds: number | null;
  audio_duration_seconds?: number | null;
  sample_rate_hz?: number;
  status: 'valid' | 'unavailable';
  reason?: string | null;
  thresholds_used?: {
    min_pause_duration_seconds: number;
    silence_threshold_db: number;
    frame_duration_ms?: number;
    hop_duration_ms?: number;
  };
}

export interface TranscriptionResponse {
  success: boolean;
  id: string;
  recording_id?: string;
  status: string;
  text: string;
  full_transcription?: string;
  confidence?: number | null;
  audio_duration?: number | null;
  audio_metadata?: {
    duration?: number | null;
    sample_rate?: number;
    channels?: number;
    total_samples?: number;
  };
  words: WordMetadata[];
  disfluencies_enabled: boolean;
  phoneme_analysis?: {
    enabled: boolean;
    model: string;
    status: string;
    notes?: string | null;
    analyzed_tokens?: number;
  } | null;
  pronunciation_summary?: {
    average_phoneme_error_rate?: number | null;
    total_words_analyzed?: number;
    words_with_findings?: number;
    total_findings?: number;
    accent_variety?: string;
  } | null;
  pronunciation_findings?: Array<Record<string, any>>;
  processing_time_sec: number;
  filename: string;
  silence_analysis?: SilenceAnalysisResult | null;
  raw_metadata: Record<string, any>;
}

export interface AlignedToken {
  type: 'match' | 'substitution' | 'deletion' | 'insertion';
  ref_token: string | null;
  hyp_token: string | null;
}

export interface WordAlignmentResult {
  reference_word_count: number;
  recognized_word_count: number;
  substitution_count: number;
  deletion_count: number;
  insertion_count: number;
  total_errors: number;
  word_error_rate: number | null;
  word_error_rate_percent: number | null;
  status: 'valid' | 'undefined';
  reason?: string | null;
  aligned_pairs: AlignedToken[];
  normalized_reference: string;
  normalized_hypothesis: string;
}

export interface SpeechRateResult {
  speech_rate_wpm: number | null;
  word_count: number;
  response_interval_seconds: number;
  status: 'valid' | 'unavailable';
  reason?: string | null;
}

export interface PauseMetricsResult {
  pause_count: number;
  pause_frequency: number | null;
  pauses_per_minute: number | null;
  mean_pause_duration_seconds: number | null;
  total_pause_duration_seconds: number;
  status: 'valid' | 'unavailable';
  reason?: string | null;
}

export interface RepetitionCandidate {
  id: string;
  type: string;
  phrase: string;
  repeated_word: string;
  token_index: number;
  occurrence_count: number;
}

export interface RepetitionRateResult {
  repetition_rate_percent: number | null;
  repetition_event_count: number;
  word_count: number;
  status: 'valid' | 'unavailable';
  reason?: string | null;
}

export interface SelfCorrectionCandidate {
  id: string;
  original_phrase: string;
  replacement_phrase: string;
  detection_method: string;
  span: string;
  reviewer_decision: 'pending' | 'approved' | 'rejected';
  notes: string;
}

export interface QuantitativeErrorMetrics {
  eligible_pairs_count: number;
  mean_absolute_error: number | null;
  median_absolute_error: number | null;
  mean_signed_difference: number | null;
  signed_differences: number[];
  unit: string;
  status: 'valid' | 'unavailable';
  reason?: string | null;
}

export interface EventDetectionEvaluation {
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  tolerance_seconds: number;
  status: 'valid' | 'undefined';
  reason?: string | null;
}

export interface EvaluationResponse {
  alignment: WordAlignmentResult;
  speech_rate: SpeechRateResult;
  pause_metrics: PauseMetricsResult;
  repetition_metrics: {
    candidate_repetitions: RepetitionCandidate[];
    repetition_rate: RepetitionRateResult;
  };
  self_corrections: {
    candidates: SelfCorrectionCandidate[];
    candidate_count: number;
  };
  quantitative_errors: {
    speech_rate_wpm?: QuantitativeErrorMetrics;
    response_duration_seconds?: QuantitativeErrorMetrics;
  };
  event_evaluations: {
    pause_detection?: EventDetectionEvaluation;
    repetition_detection?: EventDetectionEvaluation;
  };
  reproducibility: {
    formulas: Record<string, string>;
    parameters: Record<string, any>;
  };
}

export type TaskType =
  | 'Read Aloud'
  | 'Spontaneous Response'
  | 'Descriptive Speech'
  | 'Interview Question'
  | 'Free Speaking';

export type RecordingCondition =
  | 'Quiet Room'
  | 'Low Background Speech'
  | 'Noisy Cafe'
  | 'Office Environment'
  | 'Simulated Noise';

export type BackgroundNoiseCategory =
  | 'None / Quiet'
  | 'Low Background Speech'
  | 'Ambient Office'
  | 'Traffic / Street'
  | 'Coffee Shop'
  | 'White Noise';

export interface TestCaseScenario {
  id: string;
  scenario_number: number;
  title: string;
  category: string;
  description: string;
  task_type: TaskType;
  recording_condition: RecordingCondition;
  background_noise_category: BackgroundNoiseCategory;
  microphone_or_device: string;
  speaker_code: string;
  reference_transcript: string;
  reference_response_duration_seconds: number;
  reference_speech_rate_wpm?: number;
  reference_pause_events: SilencePauseEvent[];
  reference_repetition_events: { phrase: string; start_seconds?: number; token_index?: number }[];
  reference_self_correction_events: { original: string; replacement: string; notes?: string }[];
  annotation_notes: string;
  annotator_id: string;
}

export interface TestSessionRecord {
  test_case_id: string;
  timestamp: string;
  audio_file: string;
  audio_format: string;
  audio_duration_seconds: number;
  sample_rate_hz?: number;
  recording_condition: RecordingCondition;
  background_noise_category: BackgroundNoiseCategory;
  microphone_or_device: string;
  task_type: TaskType;
  speaker_or_participant_code: string;
  annotator_id: string;
  annotation_notes: string;

  // Reference variables
  reference_transcript: string;
  reference_word_count: number;
  reference_response_duration_seconds: number;
  reference_pause_events: SilencePauseEvent[];
  reference_repetition_events: any[];
  reference_self_correction_events: any[];

  // AssemblyAI variables
  assemblyai_transcript: string;
  provider_request_id?: string;
  transcription_status: string;
  word_timestamps: WordMetadata[];
  provider_confidence_score?: number | null;
  request_latency_ms?: number;
  disfluencies_enabled: boolean;

  // Evaluation variables
  substitution_count: number;
  deletion_count: number;
  insertion_count: number;
  word_error_rate: number | null;
  word_error_rate_percent: number | null;
  recognized_word_count: number;
  speech_rate_wpm: number | null;
  detected_pause_events: SilencePauseEvent[];
  pause_count: number;
  mean_pause_duration_seconds: number | null;
  pause_frequency: number | null;
  pauses_per_minute: number | null;
  detected_repetition_events: RepetitionCandidate[];
  repetition_rate_percent: number | null;
  candidate_self_corrections: SelfCorrectionCandidate[];

  // Quantitative errors & event metrics
  speech_rate_mae?: number | null;
  speech_rate_signed_diff?: number | null;
  pause_precision?: number | null;
  pause_recall?: number | null;
  pause_f1?: number | null;

  aligned_pairs: AlignedToken[];
  status: 'completed' | 'failed' | 'excluded';
  exclusion_reason?: string | null;
}
