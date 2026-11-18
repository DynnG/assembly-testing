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
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: string | null;
}

export interface TranscriptionResponse {
  success: boolean;
  id: string;
  status: string;
  text: string;
  confidence?: number | null;
  audio_duration?: number | null;
  words: WordMetadata[];
  disfluencies_enabled: boolean;
  processing_time_sec: number;
  filename: string;
  raw_metadata: Record<string, any>;
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
