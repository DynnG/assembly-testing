import type { SilenceAnalysisResult, SilencePauseEvent } from '../types';

/**
 * Analyzes audio signal using browser Web Audio API to detect silent pauses.
 * Works on any audio file format decoded by the browser (WAV, WebM, MP3, M4A, OGG).
 */
export async function analyzeAudioSilence(
  audioBlobOrFile: Blob | File,
  minPauseDurationSeconds: number = 0.25,
  silenceThresholdDb: number = -35.0,
  frameDurationMs: number = 20.0,
  hopDurationMs: number = 10.0
): Promise<SilenceAnalysisResult> {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) {
    return {
      detected_pauses: [],
      pause_count: 0,
      total_pause_duration_seconds: 0,
      mean_pause_duration_seconds: null,
      status: 'unavailable',
      reason: 'Web Audio API is not supported in this browser.',
    };
  }

  const audioCtx = new AudioContextClass();
  try {
    const arrayBuffer = await audioBlobOrFile.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));

    const sampleRate = audioBuffer.sampleRate;
    const audioDuration = audioBuffer.duration;
    const numChannels = audioBuffer.numberOfChannels;

    if (audioDuration <= 0 || sampleRate <= 0) {
      return {
        detected_pauses: [],
        pause_count: 0,
        total_pause_duration_seconds: 0,
        mean_pause_duration_seconds: null,
        audio_duration_seconds: 0,
        sample_rate_hz: sampleRate,
        status: 'unavailable',
        reason: 'Audio buffer contains zero duration or invalid sample rate.',
      };
    }

    // Downmix to mono float array
    const channelData = audioBuffer.getChannelData(0);
    const monoData = new Float32Array(channelData.length);
    if (numChannels === 1) {
      monoData.set(channelData);
    } else {
      for (let c = 0; c < numChannels; c++) {
        const cData = audioBuffer.getChannelData(c);
        for (let i = 0; i < cData.length; i++) {
          monoData[i] += cData[i] / numChannels;
        }
      }
    }

    const frameSize = Math.floor(sampleRate * (frameDurationMs / 1000.0));
    const hopSize = Math.floor(sampleRate * (hopDurationMs / 1000.0));

    if (frameSize <= 0 || hopSize <= 0 || monoData.length < frameSize) {
      return {
        detected_pauses: [],
        pause_count: 0,
        total_pause_duration_seconds: 0,
        mean_pause_duration_seconds: null,
        audio_duration_seconds: audioDuration,
        sample_rate_hz: sampleRate,
        status: 'unavailable',
        reason: 'Audio is too short for frame analysis.',
      };
    }

    const numHops = Math.floor((monoData.length - frameSize) / hopSize) + 1;
    const isSilent: boolean[] = new Array(numHops);

    for (let h = 0; h < numHops; h++) {
      const start = h * hopSize;
      let sumSq = 0;
      for (let s = 0; s < frameSize; s++) {
        const val = monoData[start + s];
        sumSq += val * val;
      }
      const rms = Math.sqrt(sumSq / frameSize);
      const dbfs = rms < 1e-6 ? -100.0 : 20.0 * Math.log10(rms);
      isSilent[h] = dbfs < silenceThresholdDb;
    }

    // Identify continuous segments exceeding minPauseDurationSeconds
    const pauses: SilencePauseEvent[] = [];
    let inSilence = false;
    let silenceStartHop = 0;

    for (let h = 0; h < numHops; h++) {
      if (isSilent[h] && !inSilence) {
        inSilence = true;
        silenceStartHop = h;
      } else if (!isSilent[h] && inSilence) {
        inSilence = false;
        const startSec = (silenceStartHop * hopSize) / sampleRate;
        const endSec = (h * hopSize + frameSize) / sampleRate;
        const dur = endSec - startSec;
        if (dur >= minPauseDurationSeconds) {
          pauses.push({
            start_seconds: Math.round(startSec * 100) / 100,
            end_seconds: Math.round(endSec * 100) / 100,
            duration_seconds: Math.round(dur * 100) / 100,
          });
        }
      }
    }

    if (inSilence) {
      const startSec = (silenceStartHop * hopSize) / sampleRate;
      const endSec = audioDuration;
      const dur = endSec - startSec;
      if (dur >= minPauseDurationSeconds) {
        pauses.push({
          start_seconds: Math.round(startSec * 100) / 100,
          end_seconds: Math.round(endSec * 100) / 100,
          duration_seconds: Math.round(dur * 100) / 100,
        });
      }
    }

    const pCount = pauses.length;
    const totalDuration = pauses.reduce((acc, p) => acc + p.duration_seconds, 0);
    const meanDuration = pCount > 0 ? Math.round((totalDuration / pCount) * 100) / 100 : null;

    return {
      detected_pauses: pauses,
      pause_count: pCount,
      total_pause_duration_seconds: Math.round(totalDuration * 100) / 100,
      mean_pause_duration_seconds: meanDuration,
      audio_duration_seconds: Math.round(audioDuration * 100) / 100,
      sample_rate_hz: sampleRate,
      status: 'valid',
      reason: null,
      thresholds_used: {
        min_pause_duration_seconds: minPauseDurationSeconds,
        silence_threshold_db: silenceThresholdDb,
        frame_duration_ms: frameDurationMs,
        hop_duration_ms: hopDurationMs,
      },
    };
  } catch (err: any) {
    return {
      detected_pauses: [],
      pause_count: 0,
      total_pause_duration_seconds: 0,
      mean_pause_duration_seconds: null,
      status: 'unavailable',
      reason: `Web Audio decoding failed: ${err.message || 'Unknown error'}`,
    };
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }
}
