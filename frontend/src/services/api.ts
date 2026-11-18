import type {
  EvaluationResponse,
  HealthResponse,
  SilenceAnalysisResult,
  TestConnectionResponse,
  TranscriptionResponse,
} from '../types';

// Use proxy path /api which proxies to http://127.0.0.1:8000
const API_BASE = '/api';

/**
 * Safely parse HTTP response handling both JSON and plain-text/HTML errors.
 */
async function parseResponse<T>(res: Response, defaultErrorMsg: string): Promise<T> {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (data && data.detail) {
      const msg = typeof data.detail === 'string'
        ? data.detail
        : data.detail.message || JSON.stringify(data.detail);
      throw new Error(msg);
    }
    if (data && data.message) {
      throw new Error(data.message);
    }
    throw new Error(text || `${defaultErrorMsg} (HTTP ${res.status})`);
  }

  if (data === null) {
    throw new Error(`${defaultErrorMsg}: Server returned empty or non-JSON response.`);
  }

  return data as T;
}

/**
 * Fetch backend health status and whether the AssemblyAI API key is configured.
 */
export async function getHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return await parseResponse<HealthResponse>(res, 'Failed to fetch backend health');
  } catch (err: any) {
    throw new Error(err.message || 'Failed to connect to backend server');
  }
}

/**
 * Test authentication with AssemblyAI API via backend.
 */
export async function testConnection(): Promise<TestConnectionResponse> {
  try {
    const res = await fetch(`${API_BASE}/test-connection`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const detail = data?.detail || {};
      const message = typeof detail === 'string'
        ? detail
        : detail.message || data?.message || text || `Request failed with HTTP ${res.status}`;
      return {
        success: false,
        message,
        error: detail.error || 'connection_failed',
        status_code: res.status,
      };
    }

    return {
      success: true,
      message: data?.message || 'Connected successfully to AssemblyAI API',
      status_code: 200,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Network error connecting to backend server',
      error: 'network_error',
    };
  }
}

/**
 * Upload an audio file and request AssemblyAI transcription.
 */
export async function transcribeAudio(
  audioFile: File | Blob,
  fileName: string,
  disfluencies: boolean = true
): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append('file', audioFile, fileName);
  formData.append('disfluencies', String(disfluencies));

  const res = await fetch(`${API_BASE}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  return await parseResponse<TranscriptionResponse>(res, 'Transcription request failed');
}

/**
 * Run formal Articula thesis evaluation calculations (WER, speech rate, pause metrics, errors).
 */
export async function evaluateMetrics(payload: {
  reference_transcript: string;
  assemblyai_transcript: string;
  audio_duration_seconds: number;
  response_interval_seconds?: number;
  detected_pauses?: any[];
  reference_pause_events?: any[];
  reference_repetition_events?: any[];
  reference_self_correction_events?: any[];
  reference_speech_rate_wpm?: number;
  reference_response_duration_seconds?: number;
  min_pause_duration_seconds?: number;
  silence_threshold_db?: number;
  normalize?: boolean;
}): Promise<EvaluationResponse> {
  const res = await fetch(`${API_BASE}/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await parseResponse<EvaluationResponse>(res, 'Evaluation calculation failed');
}

/**
 * Request backend silence analysis on audio file (WAV).
 */
export async function analyzeSilenceBackend(
  file: File | Blob,
  minPauseDuration: number = 0.25,
  silenceThresholdDb: number = -35.0
): Promise<SilenceAnalysisResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('min_pause_duration', String(minPauseDuration));
  formData.append('silence_threshold_db', String(silenceThresholdDb));

  const res = await fetch(`${API_BASE}/analyze-silence`, {
    method: 'POST',
    body: formData,
  });

  return await parseResponse<SilenceAnalysisResult>(res, 'Silence analysis failed');
}
