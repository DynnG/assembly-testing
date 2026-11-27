export interface HealthResponse {
  status: string;
  api_key_configured: boolean;
  gemini_api_key_configured?: boolean;
  gemini_model?: string;
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
  target_word?: string | null;
  recognized_word?: string | null;
  speaking_mode?: 'prompted' | 'spontaneous';
  intent_certainty?: 'prompt_verified' | 'candidate_inferred';
  start: number;
  end: number;
  start_ms?: number;
  end_ms?: number;
  duration_ms?: number | null;
  raw_duration_ms?: number | null;
  padded_start_ms?: number | null;
  padded_end_ms?: number | null;
  padded_duration_ms?: number | null;
  confidence: number;
  assembly_confidence?: number;
  speaker?: string | null;
  audio_clip?: string | null;
  phoneme_prediction?: string | null;
  reference_phonemes?: string | null;
  phoneme_tokens?: string[];
  expected_phonemes?: string[];
  expected_phonemes_str?: string;
  predicted_phonemes?: string[];
  predicted_phonemes_str?: string;
  predicted_phonemes_raw?: string;
  reference_phonemes_raw?: string;
  predicted_phonemes_normalized?: string[];
  reference_phonemes_normalized?: string[];
  normalization_status?: string;
  comparison_status?: string;
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
  audio_quality_status?: 'normal' | 'too_short' | 'near_silence' | 'clipped' | 'low_energy';
  phoneme_analysis_status?: string;
  segmentation_notes?: string | null;
  quality_notes?: string | null;
  requires_human_review?: boolean;
}

export interface PronunciationObservation {
  word: string;
  target_phoneme: string;
  predicted_phoneme: string;
  difference_type: string;
  phoneme_position: number;
  observation: string;
  supporting_evidence: string;
  possible_articulation_explanation: string;
  practice_recommendation: string[];
  validation_status: string;
}

export interface AiAnalysisSummary {
  overall_summary: string;
  pronunciation_observations: PronunciationObservation[];
  speech_timing_observations: string[];
  audio_quality_warnings: string[];
  limitations: string[];
  human_review_recommendations: string[];
  generation_method?: string;
  evidence_traceability?: Record<string, any>;
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
  speaking_mode?: 'prompted' | 'spontaneous';
  prompt_target?: string | null;
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
  ai_summary?: AiAnalysisSummary | null;
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
  status: 'valid' | 'undefined' | 'reference_unavailable' | 'recording_mismatch';
  reason?: string | null;
  recording_id?: string | null;
  reference_recording_id?: string | null;
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
  sample_note?: string | null;
  status: 'valid' | 'unavailable';
  reason?: string | null;
}

export interface EventMatchingDetail {
  event_id?: string;
  match_type?: 'TP' | 'FP' | 'FN';
  classification?: 'TP' | 'FP' | 'FN';
  detected_start?: number | null;
  detected_end?: number | null;
  detected_duration?: number | null;
  reference_start?: number | null;
  reference_end?: number | null;
  matched_ref_index?: number | null;
  time_difference_sec?: number | null;
  duration_difference_sec?: number | null;
  temporal_distance_seconds?: number | null;
  reason?: string;
  explanation?: string;
}

export interface EventDetectionEvaluation {
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  tolerance_seconds: number;
  matching_details?: EventMatchingDetail[];
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

export type ProcessingStage =
  | 'recording'
  | 'session_ended'
  | 'transcribing'
  | 'analyzing_fluency'
  | 'analyzing_pronunciation'
  | 'validating_evidence'
  | 'generating_feedback'
  | 'completed'
  | 'error';

export interface ConversationTurn {
  turn_id: string;
  audio_blob?: Blob | null;
  audio_url?: string | null;
  audio_base64?: string | null;
  duration_seconds: number;
  speaker: 'learner';
  transcript?: string;
  words?: WordMetadata[];
  prompt_target?: string;
  speaking_mode?: 'prompted' | 'spontaneous';
  detected_pauses?: SilencePauseEvent[];
  recorded_at: string;
}

export interface PostConversationReport {
  report_id: string;
  session_id: string;
  created_at: string;
  preferred_accent: string;
  section_a_transcription_and_timing: {
    full_transcript: string;
    turn_count: number;
    turns: Array<{
      turn_id: string;
      speaker: string;
      transcript: string;
      duration_seconds: number;
      word_count: number;
      confidence?: number | null;
    }>;
    word_timestamps_count: number;
    word_timestamps: Array<{
      word: string;
      start?: number;
      end?: number;
      confidence?: number;
      turn_id?: string;
    }>;
    asr_average_confidence?: number | null;
    transcription_limitations: string[];
  };
  section_b_fluency_analysis: {
    speech_rate_wpm: number | null;
    silent_pause_frequency: number | null;
    pauses_per_minute: number | null;
    mean_silent_pause_duration_seconds: number | null;
    repetition_rate_percent: number | null;
    total_response_interval_seconds: number;
    total_recognized_words: number;
    pause_count: number;
    repetition_event_count: number;
    turn_breakdown: any[];
    measurement_protocol: string;
  };
  section_c_pronunciation_observations: {
    raw_predictions?: Array<{
      word: string;
      start?: number;
      end?: number;
      raw_prediction: string;
      tokens: string[];
    }>;
    candidate_differences: any[];
    validated_observations: Array<{
      word: string;
      target_word?: string;
      recognized_word?: string;
      expected_phoneme: string;
      observed_phonetic_evidence: string;
      difference_type: string;
      nature_of_difference: string;
      recording_quality_limitation?: string;
      audio_playback_reference?: string | null;
      validation_status: string;
      confidence_level?: string;
      recommendation?: string;
      practice_words?: string[];
      notes?: string;
    }>;
    excluded_observations?: any[];
    insufficient_evidence?: any[];
    human_review_required?: any[];
    total_findings_count: number;
    grouped_by_word: Record<string, any[]>;
    underlying_diagnostic_data?: Array<Record<string, any>>;
    insufficient_evidence_message?: string | null;
    learner_observations?: Array<{
      word: string;
      target_sound: string;
      observed_sound: string;
      layman_explanation: string;
      practice_words?: string[];
    }>;
  };
  section_d_evidence_and_quality_checks: {
    insufficient_audio_segments: any[];
    insufficient_audio_count: number;
    uncertain_phoneme_predictions: any[];
    uncertain_predictions_count: number;
    asr_reliability_limitations: string[];
    unvalidated_observations_count: number;
  };
  section_e_formative_feedback: {
    evidence_supported_strengths: string[];
    priority_practice_areas: string[];
    actionable_recommendations: string[];
  };
  // Redesigned 7 learner-centric sections (Part 6)
  section_a_speaking_session?: {
    overall_recording_assessment: string;
    asr_transcription_and_reliability: string;
    full_transcript: string;
    turn_count: number;
    total_recognized_words: number;
    total_response_interval_seconds: number;
    asr_average_confidence?: number | null;
    turns: any[];
    transcription_limitations: string[];
  };
  section_b_fluency_measurements?: {
    speech_rate_wpm: number | null;
    silent_pause_frequency: number | null;
    pauses_per_minute: number | null;
    mean_silent_pause_duration_seconds: number | null;
    repetition_rate_percent: number | null;
    total_response_interval_seconds?: number;
    total_recognized_words?: number;
    pause_count?: number;
    repetition_event_count?: number;
    measurement_protocol?: string;
    fluency_summary?: string;
    fluency_observations?: string[];
  };
  section_d_recording_quality_and_evidence?: {
    recording_quality_limitations: string[];
    insufficient_audio_count: number;
    insufficient_audio_segments?: any[];
    unvalidated_observations_count: number;
    candidate_differences_count?: number;
    policy_note?: string;
    asr_reliability_limitations?: string[];
  };
  section_e_what_you_did_well?: string[];
  section_f_what_to_practice_next?: string[];
  section_g_recommended_practice?: string[];
  generation_method: string;
}

export type ConversationalMode = 'natural' | 'gentle_guidance' | 'learning_support';

export interface StartDialogueResponse {
  session_id: string;
  turn_id: string;
  response: string;
  intent: string;
  topic: string;
  conversation_complete: boolean;
  expression_tip?: string | null;
}

export interface RespondDialogueResponse {
  session_id: string;
  turn_id: string;
  response: string;
  intent: string;
  topic: string;
  conversation_complete: boolean;
  transcribed_text?: string | null;
  expression_tip?: string | null;
}

export interface ExpressionAssistRequest {
  assist_type: 'help_express' | 'how_else' | 'explain_word' | 'expand_answer' | 'give_example';
  learner_input: string;
  context?: string;
}

export interface ExpressionAssistResponse {
  assist_type: string;
  original_input: string;
  primary_suggestion: string;
  natural_alternatives: string[];
  useful_words: string[];
  example_usage?: string | null;
}

export interface UsefulExpressionItem {
  phrase: string;
  natural_alternative?: string | null;
  context_note: string;
  example_sentence: string;
}

export interface ThoughtDevelopmentHighlight {
  point_expressed: string;
  why_it_stood_out: string;
}

export interface ConversationReflection {
  conversation_summary: string;
  topics_covered: string[];
  useful_expressions: UsefulExpressionItem[];
  thought_development: ThoughtDevelopmentHighlight[];
  further_practice_topics: string[];
  personal_reflection_prompts: string[];
}

export interface DialogueMessage {
  speaker: 'ai' | 'learner';
  text: string;
  turn_id?: string;
  timestamp?: string;
  topic?: string;
  intent?: string;
  expression_tip?: string | null;
}

export interface ConversationSessionRecord {
  session_id: string;
  timestamp: string;
  speaking_mode: 'prompted' | 'spontaneous';
  prompt_target?: string;
  turn_count: number;
  total_duration_seconds: number;
  turns: ConversationTurn[];
  report?: PostConversationReport | null;
  reflection?: ConversationReflection | null;
  topic?: string;
  mode?: ConversationalMode;
  status: 'completed' | 'processing' | 'failed';
  error_message?: string;
}

export interface AnalyzeConversationSessionRequest {
  session_id: string;
  speaking_mode: 'prompted' | 'spontaneous';
  prompt_target?: string;
  preferred_accent?: string;
  min_pause_duration_seconds?: number;
  silence_threshold_db?: number;
  turns: Array<{
    turn_id: string;
    audio_base64?: string | null;
    transcript?: string;
    words?: WordMetadata[];
    duration_seconds?: number;
    prompt_target?: string;
    speaking_mode?: 'prompted' | 'spontaneous';
    detected_pauses?: SilencePauseEvent[];
  }>;
}
