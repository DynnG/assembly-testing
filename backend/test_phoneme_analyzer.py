"""
Unit tests for Wav2Vec2Phoneme pronunciation analyzer and hybrid word segmentation.
"""

import io
import math
import numpy as np
import pytest
import soundfile as sf

from phoneme_analyzer import (
    decode_audio_native,
    decode_audio_to_mono_16k,
    resample_to_16k_mono,
    encode_slice_to_wav_base64,
    extract_word_segment,
    predict_phonemes_batch,
    check_requires_human_review,
    build_unified_hybrid_result,
    analyze_words_phonemes,
    get_phoneme_model,
    CANONICAL_IPA_REFERENCE,
)


def create_synthetic_wav(duration_sec: float = 1.0, freq: float = 440.0, sample_rate: int = 16000) -> bytes:
    t = np.linspace(0, duration_sec, int(sample_rate * duration_sec), endpoint=False)
    signal = 0.5 * np.sin(2 * np.pi * freq * t).astype(np.float32)
    bio = io.BytesIO()
    sf.write(bio, signal, sample_rate, format="WAV", subtype="PCM_16")
    return bio.getvalue()


def test_decode_audio_to_mono_16k():
    wav_bytes = create_synthetic_wav(duration_sec=0.5, sample_rate=16000)
    data, sr = decode_audio_to_mono_16k(wav_bytes)
    assert sr == 16000
    assert len(data) == 8000
    assert isinstance(data, np.ndarray)


def test_decode_audio_native_48k():
    wav_bytes = create_synthetic_wav(duration_sec=0.5, sample_rate=48000)
    data, native_sr, channels, duration = decode_audio_native(wav_bytes)
    assert native_sr == 48000
    assert channels == 1
    assert len(data) == 24000
    assert abs(duration - 0.5) < 1e-3


def test_resample_to_16k_mono():
    t = np.linspace(0, 0.5, 24000, endpoint=False)
    signal = 0.5 * np.sin(2 * np.pi * 440.0 * t).astype(np.float32)
    resampled = resample_to_16k_mono(signal, orig_sr=48000)
    assert len(resampled) == 8000
    assert resampled.dtype == np.float32


def test_extract_word_segment_native_alignment():
    # 48 kHz audio of 1.0 second duration (48000 samples)
    t = np.linspace(0, 1.0, 48000, endpoint=False)
    signal = 0.5 * np.sin(2 * np.pi * 440.0 * t).astype(np.float32)

    # Word from 200ms to 500ms (duration 300ms) with 0ms padding
    slice_nat, slice_16k, status, notes = extract_word_segment(
        audio_native=signal,
        native_sr=48000,
        start_ms=200,
        end_ms=500,
        padding_ms=0,
    )
    assert status == "valid"
    assert slice_nat is not None
    assert slice_16k is not None
    # 300ms at 48k = 14400 samples
    assert len(slice_nat) == 14400
    # 300ms at 16k = 4800 samples
    assert len(slice_16k) == 4800


def test_extract_word_segment_padding():
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    signal = 0.5 * np.sin(2 * np.pi * 440.0 * t).astype(np.float32)

    # Word from 200ms to 400ms with 25ms padding -> 175ms to 425ms (250ms total)
    slice_nat, slice_16k, status, notes = extract_word_segment(
        audio_native=signal,
        native_sr=16000,
        start_ms=200,
        end_ms=400,
        padding_ms=25,
    )
    assert status == "valid"
    # 250ms at 16k = 4000 samples
    assert len(slice_16k) == 4000


def test_encode_slice_to_wav_base64():
    slice_data = np.zeros(1600, dtype=np.float32)
    b64 = encode_slice_to_wav_base64(slice_data, 16000)
    assert b64.startswith("data:audio/wav;base64,")
    assert len(b64) > 50


def test_analyze_words_valid_segmentation():
    wav_bytes = create_synthetic_wav(duration_sec=1.5, sample_rate=16000)
    words = [
        {"text": "communication", "start": 100, "end": 600, "confidence": 0.94, "speaker": None},
        {"text": "speech", "start": 700, "end": 1200, "confidence": 0.91, "speaker": None},
    ]
    results = analyze_words_phonemes(wav_bytes, words, "synthetic.wav", padding_ms=25)
    assert len(results) == 2

    # Check structure
    r0 = results[0]
    assert r0["word"] == "communication"
    assert r0["start"] == 100
    assert r0["end"] == 600
    assert r0["assembly_confidence"] == 0.94
    assert r0["segmentation_status"] == "valid"
    assert r0["reference_phonemes"] is not None
    assert r0["audio_clip_base64"].startswith("data:audio/wav;base64,")
    assert "phoneme_prediction" in r0
    assert r0["audio_clip"] == "word_001.wav"
    assert r0["word_id"] == 1


def test_analyze_words_unified_structure():
    wav_bytes = create_synthetic_wav(duration_sec=2.0, sample_rate=48000)
    words = [
        {"text": "hello", "start": 100, "end": 600, "confidence": 0.95},
        {"text": "world", "start": 700, "end": 1300, "confidence": 0.92},
    ]
    unified = analyze_words_phonemes(
        wav_bytes,
        words,
        "test_48k.wav",
        padding_ms=20,
        recording_id="rec_test_123",
        full_transcription="hello world",
        return_unified=True,
    )
    assert isinstance(unified, dict)
    assert unified["recording_id"] == "rec_test_123"
    assert unified["full_transcription"] == "hello world"
    assert "audio_metadata" in unified
    assert unified["audio_metadata"]["sample_rate"] == 48000
    assert len(unified["words"]) == 2
    assert unified["words"][0]["word_id"] == 1
    assert unified["words"][0]["audio_clip"] == "word_001.wav"
    assert unified["words"][1]["word_id"] == 2
    assert unified["words"][1]["audio_clip"] == "word_002.wav"


def test_analyze_words_missing_timestamps():
    wav_bytes = create_synthetic_wav(duration_sec=1.0)
    words = [
        {"text": "mystery", "start": None, "end": None, "confidence": 0.5},
    ]
    results = analyze_words_phonemes(wav_bytes, words)
    assert len(results) == 1
    assert results[0]["segmentation_status"] == "missing_timestamps"
    assert results[0]["phoneme_prediction"] is None
    assert results[0]["requires_human_review"] is True


def test_analyze_words_invalid_duration():
    wav_bytes = create_synthetic_wav(duration_sec=1.0)
    words = [
        {"text": "inverted", "start": 500, "end": 200, "confidence": 0.6},
    ]
    results = analyze_words_phonemes(wav_bytes, words)
    assert len(results) == 1
    assert results[0]["segmentation_status"] == "invalid_duration"
    assert results[0]["requires_human_review"] is True


def test_analyze_words_very_short_segment():
    wav_bytes = create_synthetic_wav(duration_sec=1.0)
    # 15 ms duration
    words = [
        {"text": "a", "start": 100, "end": 115, "confidence": 0.8},
    ]
    results = analyze_words_phonemes(wav_bytes, words, padding_ms=0)
    assert len(results) == 1
    assert results[0]["segmentation_notes"] is not None
    assert "under 25ms" in results[0]["segmentation_notes"]
    assert results[0]["requires_human_review"] is True


def test_check_requires_human_review():
    # Low confidence triggers review
    assert check_requires_human_review(0.65, "valid", None, "t ɛ s t", "t ɛ s t") is True
    # High confidence match does not trigger review
    assert check_requires_human_review(0.95, "valid", None, "t ɛ s t", "t ɛ s t") is False
    # Segmentation error triggers review
    assert check_requires_human_review(0.95, "near_silence", "Near silence", None, None) is True


def test_canonical_ipa_lookup():
    assert "communication" in CANONICAL_IPA_REFERENCE
    assert "speech" in CANONICAL_IPA_REFERENCE
    assert "research" in CANONICAL_IPA_REFERENCE
    assert "english" in CANONICAL_IPA_REFERENCE
    assert "pronunciation" in CANONICAL_IPA_REFERENCE
