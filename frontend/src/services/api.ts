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
  disfluencies: boolean = true,
  phonemeAnalysis: boolean = true,
  speakingMode: 'prompted' | 'spontaneous' = 'prompted',
  promptTarget?: string,
  recordingId?: string
): Promise<TranscriptionResponse> {
  const formData = new FormData();
  formData.append('file', audioFile, fileName);
  formData.append('disfluencies', String(disfluencies));
  formData.append('phoneme_analysis', String(phonemeAnalysis));
  formData.append('speaking_mode', speakingMode);
  if (promptTarget) {
    formData.append('prompt_target', promptTarget);
  }
  if (recordingId) {
    formData.append('recording_id', recordingId);
  }

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
  reference_transcript?: string | null;
  assemblyai_transcript: string;
  recording_id?: string | null;
  reference_recording_id?: string | null;
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

/**
 * Request evidence-constrained AI analysis summary.
 */
export async function generateAiSummary(payload: {
  full_transcription: string;
  words: any[];
  pronunciation_findings: any[];
  evaluation_metrics?: any;
  preferred_accent?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/ai-summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return await parseResponse<any>(res, 'AI summary generation failed');
}

/**
 * Downloads technical phonemes dataset CSV with UTF-8 BOM encoding directly from backend.
 */
export async function downloadBackendCsv(payload: {
  recording_id?: string;
  words: any[];
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/export/csv`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`CSV export failed (HTTP ${res.status})`);
  }
  return await res.blob();
}

/**
 * Downloads multi-sheet Excel spreadsheet (.xlsx) directly from backend.
 */
export async function downloadBackendXlsx(payload: {
  recording_id?: string;
  full_transcription?: string;
  words: any[];
  pronunciation_findings?: any[];
  evaluation_metrics?: any;
  ai_summary?: any;
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/export/xlsx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Excel export failed (HTTP ${res.status})`);
  }
  return await res.blob();
}

/**
 * Downloads human-readable research and learner evaluation report (.txt).
 */
export async function downloadBackendReport(payload: {
  recording_id?: string;
  full_transcription?: string;
  words: any[];
  pronunciation_findings?: any[];
  evaluation_metrics?: any;
  ai_summary?: any;
}): Promise<Blob> {
  const res = await fetch(`${API_BASE}/export/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Report export failed (HTTP ${res.status})`);
  }
  return await res.blob();
}

/**
 * Executes post-conversation session analysis (synchronous JSON response).
 */
export async function analyzeConversationSession(
  payload: import('../types').AnalyzeConversationSessionRequest
): Promise<import('../types').PostConversationReport> {
  const res = await fetch(`${API_BASE}/conversation/analyze-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await parseResponse<{ success: boolean; report: import('../types').PostConversationReport }>(
    res,
    'Post-conversation assessment failed'
  );
  return data.report;
}

/**
 * Streams real-time progress events from the backend for the post-conversation stages:
 * Transcribing -> Analyzing Fluency -> Analyzing Pronunciation -> Validating Evidence -> Generating Feedback -> Completed.
 */
export async function analyzeConversationSessionStream(
  payload: import('../types').AnalyzeConversationSessionRequest,
  onProgress: (event: { stage: import('../types').ProcessingStage; message: string; progress: number; report?: import('../types').PostConversationReport }) => void
): Promise<import('../types').PostConversationReport> {
  const res = await fetch(`${API_BASE}/conversation/analyze-session-stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Session stream failed (HTTP ${res.status}): ${errorText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response body is unavailable.');
  }

  const decoder = new TextDecoder();
  let finalReport: import('../types').PostConversationReport | null = null;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data:')) {
        const jsonStr = trimmed.slice(5).trim();
        if (jsonStr) {
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.report) {
              finalReport = parsed.report;
            }
            onProgress(parsed);
          } catch {
            // Ignore malformed chunks
          }
        }
      }
    }
  }

  if (!finalReport) {
    throw new Error('Post-conversation assessment ended without returning a report.');
  }

  return finalReport;
}

/**
 * Initiates conversational dialogue session with Gemini 3.5 Flash-Lite opening question.
 */
export async function startDialogue(
  topic?: string,
  sessionId?: string,
  mode?: string
): Promise<import('../types').StartDialogueResponse> {
  const res = await fetch(`${API_BASE}/conversation/start-dialogue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      session_id: sessionId,
      topic: topic || 'everyday_conversations',
      mode: mode || 'natural',
    }),
  });

  return await parseResponse<import('../types').StartDialogueResponse>(
    res,
    'Failed to initiate conversation dialogue'
  );
}

/**
 * Responds to learner turn with contextual follow-up question via Gemini 3.5 Flash-Lite.
 */
export async function respondDialogue(payload: {
  session_id: string;
  turn_id: string;
  learner_transcript?: string;
  audio_base64?: string;
  history: Array<{ speaker: string; text: string; topic?: string }>;
  current_topic?: string;
  mode?: string;
}): Promise<import('../types').RespondDialogueResponse> {
  const res = await fetch(`${API_BASE}/conversation/respond-dialogue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await parseResponse<import('../types').RespondDialogueResponse>(
    res,
    'Failed to generate conversational follow-up'
  );
}

/**
 * Requests on-demand English expression or vocabulary assistance.
 */
export async function requestExpressionAssist(
  req: import('../types').ExpressionAssistRequest
): Promise<import('../types').ExpressionAssistResponse> {
  const res = await fetch(`${API_BASE}/conversation/express-assist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(req),
  });

  return await parseResponse<import('../types').ExpressionAssistResponse>(
    res,
    'Failed to generate expression assistance'
  );
}

/**
 * Generates a supportive post-conversation reflection without scores or grading.
 */
export async function reflectConversationSession(payload: {
  session_id: string;
  topic?: string;
  turns: Array<{
    turn_id: string;
    speaker?: string;
    transcript?: string;
    text?: string;
  }>;
}): Promise<{
  success: boolean;
  session_id: string;
  reflection: import('../types').ConversationReflection;
}> {
  const res = await fetch(`${API_BASE}/conversation/reflect-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await parseResponse<{
    success: boolean;
    session_id: string;
    reflection: import('../types').ConversationReflection;
  }>(res, 'Failed to generate conversation reflection');
}

/**
 * Transcribes a single turn audio rapidly without post-conversation pipeline delay.
 */
export async function transcribeTurn(
  audioBase64: string,
  turnId?: string
): Promise<{ turn_id: string; transcript: string; confidence?: number | null; status: string; error?: string }> {
  const res = await fetch(`${API_BASE}/conversation/transcribe-turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      audio_base64: audioBase64,
      turn_id: turnId || 'turn_1',
    }),
  });

  return await parseResponse<{ turn_id: string; transcript: string; confidence?: number | null; status: string; error?: string }>(
    res,
    'Failed to transcribe turn'
  );
}

/**
 * Tests Gemini 3.5 Flash-Lite API connection via backend.
 */
export async function testGeminiConnection(): Promise<{
  success: boolean;
  message: string;
  model?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/test-gemini-connection`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    return await parseResponse<{ success: boolean; message: string; model?: string; error?: string }>(
      res,
      'Failed to test Gemini connection'
    );
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Error connecting to Gemini backend endpoint',
      error: 'network_error',
    };
  }
}
