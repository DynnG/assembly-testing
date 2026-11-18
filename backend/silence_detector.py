"""
Articula Audio-Based Silence Detector
Independent audio signal analysis module for detecting silent pauses:
- Computes RMS amplitude and dBFS across rolling frames
- Identifies continuous periods below configurable silence threshold (dBFS)
- Enforces configurable minimum qualifying pause duration threshold (e.g., 0.25s)
- Measures Pause Count (P), Total Pause Duration, Mean Pause Duration, and Pause Frequency (P / T)
- Validates silence directly against the audio signal (independent of ASR timestamps)
"""

import io
import math
import wave
from typing import Any, Dict, List, Optional
import numpy as np


def detect_silence_in_wav(
    audio_bytes: bytes,
    min_pause_duration_seconds: float = 0.25,
    silence_threshold_db: float = -35.0,
    frame_duration_ms: float = 20.0,
    hop_duration_ms: float = 10.0,
) -> Dict[str, Any]:
    """
    Analyzes PCM audio signal in WAV format to detect silent pauses.
    Returns:
    - detected_pauses: List of {start_seconds, end_seconds, duration_seconds}
    - pause_count (P)
    - total_pause_duration_seconds
    - mean_pause_duration_seconds
    - audio_duration_seconds
    - sample_rate_hz
    - status: 'valid' | 'unavailable'
    - reason: explanation if unavailable
    """
    try:
        with wave.open(io.BytesIO(audio_bytes), "rb") as wf:
            num_channels = wf.getnchannels()
            sample_width = wf.getsampwidth()
            sample_rate = wf.getframerate()
            num_frames = wf.getnframes()

            if num_frames == 0 or sample_rate == 0:
                return {
                    "detected_pauses": [],
                    "pause_count": 0,
                    "total_pause_duration_seconds": 0.0,
                    "mean_pause_duration_seconds": None,
                    "audio_duration_seconds": 0.0,
                    "sample_rate_hz": sample_rate,
                    "status": "unavailable",
                    "reason": "WAV file contains 0 frames or invalid sample rate.",
                }

            audio_duration = num_frames / float(sample_rate)
            raw_frames = wf.readframes(num_frames)

            # Support 16-bit PCM and 8-bit PCM
            if sample_width == 2:
                samples = np.frombuffer(raw_frames, dtype=np.int16).astype(np.float32)
                max_possible_amplitude = 32768.0
            elif sample_width == 1:
                samples = (np.frombuffer(raw_frames, dtype=np.uint8).astype(np.float32) - 128.0) * 256.0
                max_possible_amplitude = 32768.0
            elif sample_width == 4:
                samples = np.frombuffer(raw_frames, dtype=np.int32).astype(np.float32)
                max_possible_amplitude = 2147483648.0
            else:
                return {
                    "detected_pauses": [],
                    "pause_count": 0,
                    "total_pause_duration_seconds": 0.0,
                    "mean_pause_duration_seconds": None,
                    "audio_duration_seconds": audio_duration,
                    "sample_rate_hz": sample_rate,
                    "status": "unavailable",
                    "reason": f"Unsupported sample width: {sample_width} bytes per sample.",
                }

            # If multi-channel, downmix to mono by averaging channels
            if num_channels > 1:
                samples = samples.reshape(-1, num_channels).mean(axis=1)

    except wave.Error as e:
        return {
            "detected_pauses": [],
            "pause_count": 0,
            "total_pause_duration_seconds": 0.0,
            "mean_pause_duration_seconds": None,
            "audio_duration_seconds": 0.0,
            "sample_rate_hz": 0,
            "status": "unavailable",
            "reason": f"Audio file is not a standard PCM WAV container ({str(e)}). In-browser Web Audio API handles compressed formats (WebM/MP3).",
        }
    except Exception as exc:
        return {
            "detected_pauses": [],
            "pause_count": 0,
            "total_pause_duration_seconds": 0.0,
            "mean_pause_duration_seconds": None,
            "audio_duration_seconds": 0.0,
            "sample_rate_hz": 0,
            "status": "unavailable",
            "reason": f"Error decoding audio signal: {str(exc)}",
        }

    # Frame analysis
    frame_size = int(sample_rate * (frame_duration_ms / 1000.0))
    hop_size = int(sample_rate * (hop_duration_ms / 1000.0))

    if frame_size <= 0 or hop_size <= 0 or len(samples) < frame_size:
        return {
            "detected_pauses": [],
            "pause_count": 0,
            "total_pause_duration_seconds": 0.0,
            "mean_pause_duration_seconds": None,
            "audio_duration_seconds": audio_duration,
            "sample_rate_hz": sample_rate,
            "status": "unavailable",
            "reason": "Audio is too short for acoustic frame analysis.",
        }

    # Calculate frame RMS and dBFS
    num_hops = (len(samples) - frame_size) // hop_size + 1
    silence_flags = []

    for h in range(num_hops):
        start_idx = h * hop_size
        frame = samples[start_idx : start_idx + frame_size]
        rms = np.sqrt(np.mean(frame**2))

        # Avoid log(0)
        if rms < 1e-6:
            dbfs = -100.0
        else:
            dbfs = 20.0 * math.log10(rms / max_possible_amplitude)

        silence_flags.append(dbfs < silence_threshold_db)

    # Segment consecutive silent frames into continuous intervals
    raw_pauses: List[Dict[str, float]] = []
    in_silence = False
    silence_start_frame = 0

    for idx, is_silent in enumerate(silence_flags):
        if is_silent and not in_silence:
            in_silence = True
            silence_start_frame = idx
        elif not is_silent and in_silence:
            in_silence = False
            start_sec = (silence_start_frame * hop_size) / sample_rate
            end_sec = ((idx * hop_size) + frame_size) / sample_rate
            dur = end_sec - start_sec
            if dur >= min_pause_duration_seconds:
                raw_pauses.append({
                    "start_seconds": round(start_sec, 3),
                    "end_seconds": round(end_sec, 3),
                    "duration_seconds": round(dur, 3),
                })

    # Close trailing silence if still open
    if in_silence:
        start_sec = (silence_start_frame * hop_size) / sample_rate
        end_sec = audio_duration
        dur = end_sec - start_sec
        if dur >= min_pause_duration_seconds:
            raw_pauses.append({
                "start_seconds": round(start_sec, 3),
                "end_seconds": round(end_sec, 3),
                "duration_seconds": round(dur, 3),
            })

    # Filter and format
    p_count = len(raw_pauses)
    total_pause_dur = round(sum(p["duration_seconds"] for p in raw_pauses), 3)
    mean_pause_dur = round(total_pause_dur / p_count, 3) if p_count > 0 else None

    return {
        "detected_pauses": raw_pauses,
        "pause_count": p_count,
        "total_pause_duration_seconds": total_pause_dur,
        "mean_pause_duration_seconds": mean_pause_dur,
        "audio_duration_seconds": round(audio_duration, 3),
        "sample_rate_hz": sample_rate,
        "status": "valid",
        "reason": None,
        "thresholds_used": {
            "min_pause_duration_seconds": min_pause_duration_seconds,
            "silence_threshold_db": silence_threshold_db,
            "frame_duration_ms": frame_duration_ms,
            "hop_duration_ms": hop_duration_ms,
        },
    }
