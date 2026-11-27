"""
Unit tests for Articula ASR Evaluation formulas and algorithms.
Tests:
- WER (Wagner-Fischer alignment, S, D, I, N, WER_percent, empty reference, filler retention)
- Speech Rate (60 * W / T, zero denominators, insufficient speech)
- Pause Frequency and Mean Pause Duration (P/T, sum/P, zero pauses)
- Audio-based silence detection in WAV
- Repetition Rate (100 * R / W)
- Quantitative Error Measures (MAE, Median Absolute Error, Signed Differences)
- Event-Detection Evaluation (Precision, Recall, F1, zero denominators, 1-to-1 matching)
"""

import io
import math
import struct
import wave
import pytest

from evaluation import (
    compute_word_alignment,
    compute_speech_rate,
    compute_pause_metrics,
    detect_candidate_repetitions,
    compute_repetition_rate,
    detect_candidate_self_corrections,
    compute_quantitative_errors,
    evaluate_event_detection,
    normalize_transcript,
)
from silence_detector import detect_silence_in_wav


# ============================================================================
# 1. Word Error Rate (WER) Tests
# ============================================================================

def test_wer_exact_match():
    ref = "The quick brown fox jumps over the lazy dog."
    hyp = "The quick brown fox jumps over the lazy dog."
    res = compute_word_alignment(ref, hyp)

    assert res["status"] == "valid"
    assert res["reference_word_count"] == 9
    assert res["substitution_count"] == 0
    assert res["deletion_count"] == 0
    assert res["insertion_count"] == 0
    assert res["total_errors"] == 0
    assert res["word_error_rate"] == 0.0
    assert res["word_error_rate_percent"] == 0.0


def test_wer_with_substitution():
    ref = "I think communication is important"
    hyp = "I feel communication is important"
    res = compute_word_alignment(ref, hyp)

    assert res["status"] == "valid"
    assert res["reference_word_count"] == 5
    assert res["substitution_count"] == 1  # think -> feel
    assert res["deletion_count"] == 0
    assert res["insertion_count"] == 0
    assert res["word_error_rate"] == 0.2
    assert res["word_error_rate_percent"] == 20.0


def test_wer_with_deletion():
    ref = "Yesterday I went to school and met friends"
    hyp = "Yesterday I went to school met friends"  # "and" deleted
    res = compute_word_alignment(ref, hyp)

    assert res["status"] == "valid"
    assert res["reference_word_count"] == 8
    assert res["deletion_count"] == 1
    assert res["substitution_count"] == 0
    assert res["insertion_count"] == 0
    assert round(res["word_error_rate"], 4) == round(1 / 8, 4)


def test_wer_with_insertion():
    ref = "I like apples"
    hyp = "I really like fresh apples"  # "really" and "fresh" inserted
    res = compute_word_alignment(ref, hyp)

    assert res["status"] == "valid"
    assert res["reference_word_count"] == 3
    assert res["insertion_count"] == 2
    assert res["substitution_count"] == 0
    assert res["deletion_count"] == 0
    assert round(res["word_error_rate"], 4) == round(2 / 3, 4)


def test_wer_empty_reference():
    """Empty reference must mark WER as undefined / reference_unavailable per thesis requirement."""
    ref = ""
    hyp = "Something spoken"
    res = compute_word_alignment(ref, hyp)

    assert res["status"] in ("undefined", "reference_unavailable")
    assert res["reference_word_count"] == 0
    assert res["word_error_rate"] is None
    assert res["word_error_rate_percent"] is None
    assert "N=0" in res["reason"]


def test_wer_empty_hypothesis():
    """Empty recognition must result in all deletions (WER = 1.0)."""
    ref = "Three good words"
    hyp = ""
    res = compute_word_alignment(ref, hyp)

    assert res["status"] == "valid"
    assert res["reference_word_count"] == 3
    assert res["deletion_count"] == 3
    assert res["word_error_rate"] == 1.0
    assert res["word_error_rate_percent"] == 100.0


def test_wer_preserves_fillers():
    """Fillers like 'um' must not be stripped during alignment; missing fillers count as deletions."""
    ref = "Um I think I can do this"
    hyp = "I think I can do this"  # AssemblyAI dropped "Um"
    res = compute_word_alignment(ref, hyp)

    assert res["deletion_count"] == 1  # "um" was deleted
    assert res["reference_word_count"] == 7
    assert round(res["word_error_rate_percent"], 2) == round((1 / 7) * 100, 2)


# ============================================================================
# 2. Speech Rate (WPM = 60 * W / T) Tests
# ============================================================================

def test_speech_rate_normal():
    # 130 words in 60 seconds = 130 WPM
    res = compute_speech_rate(word_count=130, response_interval_seconds=60.0)
    assert res["status"] == "valid"
    assert res["speech_rate_wpm"] == 130.0

    # 65 words in 30 seconds = 130 WPM
    res2 = compute_speech_rate(word_count=65, response_interval_seconds=30.0)
    assert res2["status"] == "valid"
    assert res2["speech_rate_wpm"] == 130.0


def test_speech_rate_zero_duration():
    """Zero response interval must return unavailable status instead of crashing with ZeroDivisionError."""
    res = compute_speech_rate(word_count=50, response_interval_seconds=0.0)
    assert res["status"] == "unavailable"
    assert res["speech_rate_wpm"] is None


def test_speech_rate_zero_words():
    """Zero words must return unavailable status per thesis requirement."""
    res = compute_speech_rate(word_count=0, response_interval_seconds=15.0)
    assert res["status"] == "unavailable"
    assert res["speech_rate_wpm"] is None


# ============================================================================
# 3. Pause Frequency and Duration Tests
# ============================================================================

def test_pause_metrics_normal():
    pauses = [
        {"start_seconds": 1.0, "end_seconds": 1.5, "duration_seconds": 0.5},
        {"start_seconds": 3.0, "end_seconds": 4.0, "duration_seconds": 1.0},
    ]
    duration = 10.0  # seconds
    res = compute_pause_metrics(pauses, eligible_duration_seconds=duration)

    assert res["status"] == "valid"
    assert res["pause_count"] == 2
    assert res["total_pause_duration_seconds"] == 1.5
    assert res["mean_pause_duration_seconds"] == 0.75  # 1.5 / 2
    assert res["pause_frequency"] == 0.2  # 2 / 10
    assert res["pauses_per_minute"] == 12.0  # 60 * 2 / 10


def test_pause_metrics_zero_pauses():
    """Mean pause duration must be undefined (None) when P = 0."""
    res = compute_pause_metrics([], eligible_duration_seconds=10.0)
    assert res["pause_count"] == 0
    assert res["mean_pause_duration_seconds"] is None
    assert res["pause_frequency"] == 0.0
    assert res["pauses_per_minute"] == 0.0


def test_pause_metrics_zero_duration():
    res = compute_pause_metrics([{"duration_seconds": 0.5}], eligible_duration_seconds=0.0)
    assert res["status"] == "unavailable"
    assert res["pause_frequency"] is None


# ============================================================================
# 4. Audio-Based Silence Detector Tests (Signal Analysis)
# ============================================================================

def test_silence_detector_synthetic_wav():
    """Generate a synthetic 2-second WAV with 0.6s speech + 0.8s silence + 0.6s speech."""
    sample_rate = 16000
    num_frames = sample_rate * 2  # 2 seconds total

    # 0.0s to 0.6s: tone (active speech)
    # 0.6s to 1.4s: silence (zeros) -> 0.8s pause >= 0.25s threshold
    # 1.4s to 2.0s: tone (active speech)
    samples = []
    for i in range(num_frames):
        t = i / sample_rate
        if 0.6 <= t < 1.4:
            samples.append(0)  # Silence
        else:
            samples.append(int(math.sin(2 * math.pi * 440 * t) * 12000))  # Tone

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(b"".join(struct.pack("<h", s) for s in samples))

    wav_bytes = buf.getvalue()
    res = detect_silence_in_wav(
        wav_bytes,
        min_pause_duration_seconds=0.25,
        silence_threshold_db=-35.0,
    )

    assert res["status"] == "valid"
    assert res["pause_count"] >= 1
    # Verify the detected pause roughly matches the 0.8s window (0.6s - 1.4s)
    found_middle_pause = any(
        0.5 <= p["start_seconds"] <= 0.7 and 0.6 <= p["duration_seconds"] <= 0.9
        for p in res["detected_pauses"]
    )
    assert found_middle_pause, f"Detected pauses: {res['detected_pauses']}"


def test_silence_detector_invalid_bytes():
    """Invalid audio bytes must return unavailable status without crashing."""
    res = detect_silence_in_wav(b"not a valid wav file")
    assert res["status"] == "unavailable"
    assert res["pause_count"] == 0
    assert "not a standard PCM WAV container" in res["reason"]


# ============================================================================
# 5. Repetition and Self-Correction Tests
# ============================================================================

def test_detect_candidate_repetitions():
    tokens = ["the", "the", "main", "reason", "is", "communication"]
    candidates = detect_candidate_repetitions(tokens)
    assert len(candidates) == 1
    assert candidates[0]["repeated_word"] == "the"
    assert candidates[0]["occurrence_count"] == 2

    # Test stutter word
    stutter_tokens = ["i-i", "want", "to", "explain"]
    stutter_candidates = detect_candidate_repetitions(stutter_tokens)
    assert len(stutter_candidates) == 1
    assert stutter_candidates[0]["type"] == "stutter"


def test_compute_repetition_rate():
    # 2 repetition events out of 50 words = 4.0%
    res = compute_repetition_rate(repetition_event_count=2, word_count=50)
    assert res["status"] == "valid"
    assert res["repetition_rate_percent"] == 4.0

    # Zero words
    res_zero = compute_repetition_rate(repetition_event_count=0, word_count=0)
    assert res_zero["status"] == "unavailable"
    assert res_zero["repetition_rate_percent"] is None


def test_detect_candidate_self_corrections():
    text = "I wanted to go—actually I stayed home."
    tokens = text.lower().split()
    sc = detect_candidate_self_corrections(text, tokens)
    assert len(sc) >= 1
    assert any("actually" in c["notes"] or "actually" in c["span"] for c in sc)


# ============================================================================
# 6. Quantitative Error Measures (MAE, Median AE, Signed Differences)
# ============================================================================

def test_quantitative_errors_normal():
    # Auto vs Ref speech rates (WPM):
    # Pair 1: 140 vs 130 (+10)
    # Pair 2: 120 vs 125 (-5)
    # Pair 3: 150 vs 150 (0)
    pairs = [(140.0, 130.0), (120.0, 125.0), (150.0, 150.0)]
    res = compute_quantitative_errors(pairs, unit_label="WPM")

    assert res["status"] == "valid"
    assert res["eligible_pairs_count"] == 3
    assert res["signed_differences"] == [10.0, -5.0, 0.0]
    # MAE = (10 + 5 + 0) / 3 = 15 / 3 = 5.0
    assert res["mean_absolute_error"] == 5.0
    # Median AE: sorted [0, 5, 10] -> median is 5.0
    assert res["median_absolute_error"] == 5.0
    # Mean signed difference: (10 - 5 + 0) / 3 = 5 / 3 = 1.667
    assert res["mean_signed_difference"] == 1.667


def test_quantitative_errors_empty():
    res = compute_quantitative_errors([])
    assert res["status"] == "unavailable"
    assert res["mean_absolute_error"] is None
    assert res["median_absolute_error"] is None


# ============================================================================
# 7. Event-Detection Evaluation (Precision, Recall, F1) Tests
# ============================================================================

def test_event_detection_perfect_match():
    detected = [{"start_seconds": 1.0}, {"start_seconds": 3.0}]
    reference = [{"start_seconds": 1.05}, {"start_seconds": 3.0}]  # within 0.25s tolerance
    res = evaluate_event_detection(detected, reference, tolerance_seconds=0.25)

    assert res["status"] == "valid"
    assert res["true_positives"] == 2
    assert res["false_positives"] == 0
    assert res["false_negatives"] == 0
    assert res["precision"] == 1.0
    assert res["recall"] == 1.0
    assert res["f1_score"] == 1.0


def test_event_detection_imperfect():
    # 2 detected: one matches, one is a false positive
    detected = [{"start_seconds": 1.0}, {"start_seconds": 5.0}]
    # 2 reference: one matches (1.1s), one was missed (8.0s)
    reference = [{"start_seconds": 1.1}, {"start_seconds": 8.0}]
    res = evaluate_event_detection(detected, reference, tolerance_seconds=0.25)

    assert res["true_positives"] == 1
    assert res["false_positives"] == 1
    assert res["false_negatives"] == 1
    assert res["precision"] == 0.5  # 1 / (1 + 1)
    assert res["recall"] == 0.5     # 1 / (1 + 1)
    assert res["f1_score"] == 0.5


def test_event_detection_zero_events():
    res = evaluate_event_detection([], [])
    assert res["status"] == "undefined"
    assert res["precision"] is None
    assert res["recall"] is None
    assert res["f1_score"] is None
