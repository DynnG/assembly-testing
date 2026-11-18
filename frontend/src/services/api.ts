import type { HealthResponse, TestConnectionResponse, TranscriptionResponse } from '../types';

// Use proxy path /api which proxies to http://127.0.0.1:8000
const API_BASE = '/api';

/**
 * Fetch backend health status and whether the AssemblyAI API key is configured.
 */
export async function getHealth(): Promise<HealthResponse> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Backend returned HTTP ${res.status}`);
    }
    return await res.json();
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

    const data = await res.json();
    if (!res.ok) {
      const detail = data.detail || {};
      const message = detail.message || data.message || `Request failed with HTTP ${res.status}`;
      return {
        success: false,
        message,
        error: detail.error || 'connection_failed',
        status_code: res.status,
      };
    }

    return {
      success: true,
      message: data.message || 'Connected successfully to AssemblyAI API',
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

  const data = await res.json();
  if (!res.ok) {
    const detail = data.detail || {};
    const message = detail.message || data.message || `Transcription failed with HTTP ${res.status}`;
    throw new Error(message);
  }

  return data as TranscriptionResponse;
}
