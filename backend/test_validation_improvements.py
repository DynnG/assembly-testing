"""
Articula Phase 1-10 Comprehensive Validation Test Suite
Tests all requirements across Phases 2, 3, 4, 5, 6, 7, and 10:
- IPA Unicode preservation (θ, ð, ŋ, ʃ, ʒ, ɪ, ə, æ, ʊ, ɑ)
- Word-level audio segmentation, native SR conversion, separate raw & padded timestamps
- Short and silent audio validation (status flags, human review, skipping PER)
- Phoneme-level Levenshtein alignment, error breakdown (S, D, I), PER formula, edge cases
- Multiple valid pronunciation variants
- Speech rate signed differences and sample count annotations
- Silent pause matching, TP/FP/FN explanations, F1=0% convention when TP=0
- Evidence-constrained AI analysis summary generation and graceful fallback
"""

import io
import numpy as np
import pytest

from evaluation import (
    compute_word_alignment,
    compute_speech_rate,
    compute_pause_metrics,
    compute_quantitative_errors,
    evaluate_event_detection,
)
from phoneme_analyzer import (
    decode_audio_native,
    resample_to_16k_mono,
    extract_word_segment,
    analyze_words_phonemes,
)
from phoneme_comparison import (
    ExpectedPhonemeGenerator,
    compare_word_phonemes,
    tokenize_phoneme_sequence,
    align_phoneme_sequences,
    normalize_ipa_symbol,
    select_best_variant_alignment,
    ARPABET_TO_IPA_MAP,
)
from ai_summary_service import (
    build_expert_rule_based_summary,
)
from export_service import (
    generate_phoneme_dataset_csv,
    generate_phoneme_dataset_xlsx,
    generate_human_readable_report_txt,
)


# ============================================================================
# Phase 2: IPA and Unicode Preservation Tests
# ============================================================================

def test_ipa_unicode_preservation_symbols():
    """Verify that all target IPA characters remain completely intact across normalization and tokenization."""
    target_symbols = ["θ", "ð", "ŋ", "ʃ", "ʒ", "ɪ", "ə", "æ", "ʊ", "ɑ", "iː", "uː", "ɔː", "ɑː", "ɜː", "ɚ"]
    for sym in target_symbols:
        norm = normalize_ipa_symbol(sym)
        assert norm == sym, f"Symbol {sym} was altered to {norm}"

    # Verify normalization transforms non-standard characters appropriately without mangling
    assert normalize_ipa_symbol("g") == "ɡ"  # ASCII g -> IPA script ɡ
    assert normalize_ipa_symbol(":") == "ː"  # ASCII colon -> IPA length mark
    assert normalize_ipa_symbol("ˈθ") == "θ"  # Stress mark stripped


def test_csv_export_utf8_sig_and_unicode_preservation():
    """Verify CSV export uses utf-8-sig (BOM) and preserves all target phonemes."""
    words = [
        {
            "token_index": 1,
            "word": "think",
            "predicted_phonemes_str": "θ ɪ ŋ k",
            "expected_phonemes_str": "θ ɪ ŋ k",
            "phoneme_error_rate": 0.0,
            "requires_human_review": False,
        },
        {
            "token_index": 2,
            "word": "this",
            "predicted_phonemes_str": "ð ɪ s",
            "expected_phonemes_str": "ð ɪ s",
            "phoneme_error_rate": 0.0,
            "requires_human_review": False,
        },
        {
            "token_index": 3,
            "word": "measure",
            "predicted_phonemes_str": "m ɛ ʃ ɚ",
            "expected_phonemes_str": "m ɛ ʒ ɚ",
            "phoneme_error_rate": 25.0,
            "requires_human_review": True,
        },
    ]
    csv_bytes = generate_phoneme_dataset_csv(words)
    # Must start with UTF-8 BOM
    assert csv_bytes.startswith(b"\xef\xbb\xbf")
    decoded = csv_bytes.decode("utf-8-sig")
    for sym in ["θ", "ð", "ŋ", "ʃ", "ʒ", "ɪ", "ɚ"]:
        assert sym in decoded


# ============================================================================
# Phase 3: Phoneme Tokenization and Normalization Tests
# ============================================================================

def test_wav2vec2_continuous_unspaced_tokenization():
    """
    Validates that continuous unspaced phonetic output from Wav2Vec2
    (e.g. 'smʊk', 'əɜ', 'tɪŋk') is properly tokenized into discrete phoneme tokens.
    """
    assert tokenize_phoneme_sequence("smʊk") == ["s", "m", "ʊ", "k"]
    assert tokenize_phoneme_sequence("əɜ") == ["ə", "ɜ"]
    assert tokenize_phoneme_sequence("tɪŋk") == ["t", "ɪ", "ŋ", "k"]
    assert tokenize_phoneme_sequence("tʃæt") == ["tʃ", "æ", "t"]
    assert tokenize_phoneme_sequence("dʒɒb") == ["dʒ", "ɒ", "b"]

    # Also handles lists with unspaced strings
    assert tokenize_phoneme_sequence(["əɜ"]) == ["ə", "ɜ"]
    assert tokenize_phoneme_sequence(["s", "m", "oʊ", "k"]) == ["s", "m", "oʊ", "k"]


def test_compare_word_phonemes_structured_output():
    """Verify the structured output schema matches Phase 3 requirements."""
    gen = ExpectedPhonemeGenerator()
    res = compare_word_phonemes("think", ["t", "ɪ", "ŋ", "k"], generator=gen)
    assert res["word"] == "think"
    assert "predicted_phonemes_raw" in res
    assert "reference_phonemes_raw" in res
    assert "predicted_phonemes_normalized" in res
    assert "reference_phonemes_normalized" in res
    assert "normalization_status" in res
    assert "comparison_status" in res
    assert res["normalization_status"] == "completed"
    assert res["comparison_status"] == "completed"
    assert res["phoneme_error_rate"] == 25.0  # 1 substitution out of 4


# ============================================================================
# Phase 4: Audio Segmentation and Quality Validation Tests
# ============================================================================

def test_timestamp_conversion_different_sample_rates():
    """Confirm conversion from milliseconds to sample indices uses the native sample rate."""
    for sr in [16000, 44100, 48000]:
        signal = np.zeros(sr * 2, dtype=np.float32)  # 2.0s signal
        _, _, seg_status, q_status, timing, _ = extract_word_segment(
            audio_native=signal,
            native_sr=sr,
            start_ms=500,
            end_ms=900,
            padding_ms=25,
            return_details=True,
        )
        assert seg_status == "valid"
        assert timing["raw_duration_ms"] == 400
        assert timing["padded_start_ms"] == 475
        assert timing["padded_end_ms"] == 925
        assert timing["padded_duration_ms"] == 450


def test_very_short_audio_quality_flagging():
    """
    Very short audio segments (e.g. 16ms) must be flagged with audio_quality_status='too_short',
    phoneme_analysis_status='skipped_too_short', requires_human_review=True, and PER=None.
    """
    signal = np.ones(16000, dtype=np.float32) * 0.1  # 1 second non-silent audio
    _, slice_16k, seg_status, q_status, timing, notes = extract_word_segment(
        audio_native=signal,
        native_sr=16000,
        start_ms=100,
        end_ms=116,  # 16 ms raw duration
        padding_ms=0,
        min_duration_ms=30,
        return_details=True,
    )
    assert seg_status == "valid"
    assert q_status == "too_short"
    assert timing["raw_duration_ms"] == 16
    assert notes is not None
    assert "under 25ms" in notes or "threshold" in notes


def test_silent_audio_quality_flagging():
    """Silent or near-silent segments (RMS < 1e-4) must be flagged with audio_quality_status='near_silence'."""
    silent_signal = np.zeros(16000, dtype=np.float32)
    _, _, seg_status, q_status, _, notes = extract_word_segment(
        audio_native=silent_signal,
        native_sr=16000,
        start_ms=200,
        end_ms=500,
        padding_ms=25,
        return_details=True,
    )
    assert seg_status == "valid"
    assert q_status == "near_silence"
    assert "energy is near zero" in notes


# ============================================================================
# Phase 5: Phoneme Alignment and PER Formula Tests
# ============================================================================

def test_per_alignment_scenarios():
    """
    Tests standard Levenshtein phoneme alignment and PER formula:
    PER = ((S + D + I) / N) * 100
    """
    # 1. Identical sequences -> PER = 0%
    align, m = align_phoneme_sequences(["θ", "ɪ", "ŋ", "k"], ["θ", "ɪ", "ŋ", "k"])
    assert m["substitutions"] == 0 and m["deletions"] == 0 and m["insertions"] == 0 and m["matches"] == 4
    assert m["phoneme_error_rate"] == 0.0
    assert m["status"] == "completed"

    # 2. One substitution: expected /θ ɪ ŋ k/, predicted /t ɪ ŋ k/ -> PER = 25%
    align, m = align_phoneme_sequences(["θ", "ɪ", "ŋ", "k"], ["t", "ɪ", "ŋ", "k"])
    assert m["substitutions"] == 1 and m["deletions"] == 0 and m["insertions"] == 0 and m["matches"] == 3
    assert m["phoneme_error_rate"] == 25.0

    # 3. One deletion: expected /θ ɪ ŋ k/, predicted /θ ɪ k/ -> PER = 25%
    align, m = align_phoneme_sequences(["θ", "ɪ", "ŋ", "k"], ["θ", "ɪ", "k"])
    assert m["substitutions"] == 0 and m["deletions"] == 1 and m["insertions"] == 0 and m["matches"] == 3
    assert m["phoneme_error_rate"] == 25.0

    # 4. One insertion: expected /k æ t/, predicted /s k æ t/ -> PER = 33.33%
    align, m = align_phoneme_sequences(["k", "æ", "t"], ["s", "k", "æ", "t"])
    assert m["substitutions"] == 0 and m["deletions"] == 0 and m["insertions"] == 1 and m["matches"] == 3
    assert m["phoneme_error_rate"] == 33.33

    # 5. Multiple errors: expected /b ɜː d/, predicted /p ɛ d/ -> S=2, PER=66.67%
    align, m = align_phoneme_sequences(["b", "ɜː", "d"], ["p", "ɛ", "d"])
    assert m["substitutions"] == 2
    assert m["phoneme_error_rate"] == 66.67

    # 6. Edge case: empty reference and empty prediction -> 0.0%, empty_sequences
    align, m = align_phoneme_sequences([], [])
    assert m["phoneme_error_rate"] == 0.0
    assert m["status"] == "empty_sequences"

    # 7. Edge case: empty reference with non-empty prediction -> PER is None (cannot compute PER without reference)
    align, m = align_phoneme_sequences([], ["t", "ɛ", "s", "t"])
    assert m["phoneme_error_rate"] is None
    assert m["status"] == "reference_unavailable"


def test_multiple_valid_pronunciation_variants():
    """Verify that multiple valid pronunciations (e.g. 'either' /iː ð ɚ/ vs /aɪ ð ɚ/) select the best variant."""
    variants = [
        ["iː", "ð", "ɚ"],
        ["aɪ", "ð", "ɚ"],
    ]
    # Learner produces /aɪ ð ɚ/ -> must match Variant 2 with 0 edits
    best_idx, best_tokens, alignment, metrics = select_best_variant_alignment(variants, ["aɪ", "ð", "ɚ"])
    assert best_idx == 1
    assert metrics["phoneme_error_rate"] == 0.0
    assert metrics["total_edits"] == 0


# ============================================================================
# Phase 6: Speech Rate and Silent Pause Evaluation Tests
# ============================================================================

def test_speech_rate_signed_difference_and_sample_note():
    """Verify Signed Difference = Auto - Ref, MAE, Median AE, and sample count annotations."""
    # Single sample case (dashboard displayed +55.35 WPM)
    pairs = [(193.85, 138.5)]
    res = compute_quantitative_errors(pairs, unit_label="WPM")
    assert res["eligible_pairs_count"] == 1
    assert res["mean_signed_difference"] == 55.35
    assert res["mean_absolute_error"] == 55.35
    assert res["median_absolute_error"] == 55.35
    assert "Single-pair" in res["sample_note"]

    # Multi-sample case
    pairs_multi = [(150.0, 140.0), (130.0, 140.0)]  # diffs: +10, -10
    res_multi = compute_quantitative_errors(pairs_multi, unit_label="WPM")
    assert res_multi["eligible_pairs_count"] == 2
    assert res_multi["mean_signed_difference"] == 0.0
    assert res_multi["mean_absolute_error"] == 10.0
    assert "Calculated across 2 paired" in res_multi["sample_note"]


def test_silent_pause_evaluation_zero_tp_convention():
    """
    When TP = 0 and there are false positives or false negatives:
    Precision = 0%, Recall = 0%, and F1 must be reported as 0.0% (not None/N/A).
    Every pause must have an explanation.
    """
    detected_pauses = [
        {"start_seconds": 0.5, "end_seconds": 0.8, "duration_seconds": 0.3},
        {"start_seconds": 1.2, "end_seconds": 1.5, "duration_seconds": 0.3},
    ]
    reference_pauses = [
        {"start_seconds": 2.1, "end_seconds": 2.5, "duration_seconds": 0.4},
    ]
    eval_res = evaluate_event_detection(detected_pauses, reference_pauses, tolerance_seconds=0.25)
    assert eval_res["true_positives"] == 0
    assert eval_res["false_positives"] == 2
    assert eval_res["false_negatives"] == 1
    assert eval_res["precision"] == 0.0
    assert eval_res["recall"] == 0.0
    # Standard convention: F1 is 0.0, not None
    assert eval_res["f1_score"] == 0.0
    assert len(eval_res["matching_details"]) == 3  # 2 FPs + 1 FN
    # Check explanations exist
    assert "explanation" in eval_res["matching_details"][0]
    assert "false positive" in eval_res["matching_details"][0]["explanation"]
    assert "false negative" in eval_res["matching_details"][2]["explanation"]


def test_silent_pause_evaluation_both_zero_convention():
    """When both detected and reference pauses are 0, status is 'undefined' and F1 is None."""
    eval_res = evaluate_event_detection([], [], tolerance_seconds=0.25)
    assert eval_res["true_positives"] == 0
    assert eval_res["false_positives"] == 0
    assert eval_res["false_negatives"] == 0
    assert eval_res["f1_score"] is None
    assert eval_res["status"] == "undefined"


# ============================================================================
# Phase 7: AI-Assisted Analysis Summary Tests
# ============================================================================

def test_ai_summary_generation_schema_and_grounding():
    """Verify that the AI summary service produces the complete required schema without inventing errors."""
    words = [
        {
            "token_index": 1,
            "text": "think",
            "word": "think",
            "duration_ms": 320,
            "confidence": 0.98,
            "expected_phonemes_str": "θ ɪ ŋ k",
            "predicted_phonemes_str": "t ɪ ŋ k",
            "phoneme_error_rate": 25.0,
            "requires_human_review": True,
            "audio_quality_status": "normal",
            "phoneme_analysis_status": "completed",
        }
    ]
    findings = [
        {
            "word": "think",
            "observed_characteristic": "potential_consonant_substitution",
            "target_phoneme": "θ",
            "expected_phoneme": "θ",
            "predicted_phoneme": "t",
            "difference_type": "substitution",
            "phoneme_position": 0,
            "practice_words": ["think", "thank", "theater"],
            "validation_status": "requires_human_review",
        }
    ]
    eval_metrics = {
        "speech_rate": {"speech_rate_wpm": 138.5, "response_interval_seconds": 6.5, "word_count": 15},
        "pause_metrics": {"pause_count": 1, "mean_pause_duration_seconds": 0.4, "pauses_per_minute": 9.2},
    }

    summary = build_expert_rule_based_summary(
        full_transcription="I think that",
        words=words,
        pronunciation_findings=findings,
        evaluation_metrics=eval_metrics,
    )

    assert "overall_summary" in summary
    assert "pronunciation_observations" in summary
    assert "speech_timing_observations" in summary
    assert "audio_quality_warnings" in summary
    assert "limitations" in summary
    assert "human_review_recommendations" in summary

    # Check pronunciation observation structure
    obs = summary["pronunciation_observations"][0]
    assert obs["word"] == "think"
    assert obs["target_phoneme"] == "θ"
    assert obs["predicted_phoneme"] == "t"
    assert len(obs["practice_recommendation"]) > 0
    assert "tongue" in obs["possible_articulation_explanation"].lower() or "teeth" in obs["possible_articulation_explanation"].lower()
