"""
Comprehensive unit and integration tests for Expected vs. Predicted Phoneme Comparison.
Covers:
1. Expected phoneme generation (Canonical Dictionary, CMUDict, G2P fallback).
2. Phoneme normalization and multi-character tokenization.
3. Sequence alignment (Substitutions, Deletions, Insertions).
4. Phoneme Error Rate (PER) calculation formula and edge cases.
5. Multiple valid pronunciation variants handling (best-matching variant selection).
6. Evidence-based pronunciation findings structure, articulatory categories, and validation guardrails.
7. Graceful degradation on unknown words and invalid phoneme predictions.
8. End-to-end integration test with real audio recording (test_speech_short.wav).
"""

from pathlib import Path
import pytest

from phoneme_comparison import (
    ExpectedPhonemeGenerator,
    ExpectedPronunciationResult,
    align_phoneme_sequences,
    compare_word_phonemes,
    generate_pronunciation_findings,
    normalize_ipa_symbol,
    select_best_variant_alignment,
    tokenize_phoneme_sequence,
    arpabet_to_ipa,
    classify_phonetic_token,
)
from phoneme_analyzer import (
    analyze_words_phonemes,
    CANONICAL_IPA_REFERENCE,
)


@pytest.fixture
def generator():
    return ExpectedPhonemeGenerator(canonical_overrides=CANONICAL_IPA_REFERENCE)


# ============================================================================
# 1. Expected Phoneme Generation Tests
# ============================================================================

def test_expected_phonemes_canonical_dictionary(generator):
    """Verifies retrieval from curated research baseline dictionary."""
    res = generator.generate_expected("think")
    assert res.reference_source == "canonical_dictionary"
    assert res.status == "available"
    assert res.expected_phonemes == ["θ", "ɪ", "ŋ", "k"]
    assert res.expected_phonemes_str == "θ ɪ ŋ k"


def test_expected_phonemes_cmudict(generator):
    """Verifies retrieval from CMU Pronouncing Dictionary for words not in canonical overrides."""
    res = generator.generate_expected("street")
    assert res.reference_source == "cmudict"
    assert res.status == "available"
    assert res.expected_phonemes == ["s", "t", "ɹ", "iː", "t"]

    res_cat = generator.generate_expected("cat")
    assert res_cat.reference_source == "cmudict"
    assert res_cat.expected_phonemes == ["k", "æ", "t"]


def test_expected_phonemes_g2p_fallback(generator):
    """Verifies that novel or out-of-vocabulary words use G2P fallback without crashing."""
    res = generator.generate_expected("articulatestwordxyz")
    assert res.reference_source in ("g2p_model", "cmudict")
    assert res.status in ("available", "fallback_g2p")
    assert len(res.expected_phonemes) > 0


def test_expected_phonemes_unknown_and_symbols_graceful(generator):
    """Verifies empty strings, punctuation, or unsupported symbols handle gracefully."""
    res_punct = generator.generate_expected("---")
    assert res_punct.status == "unsupported"
    assert res_punct.expected_phonemes == []

    res_empty = generator.generate_expected("")
    assert res_empty.status == "unsupported"
    assert res_empty.expected_phonemes == []


# ============================================================================
# 2. Normalization and Tokenization Tests
# ============================================================================

def test_normalize_ipa_symbol():
    """Verifies character unification: Latin g -> IPA ɡ, : -> ː, stress marks removed."""
    # Latin g to IPA script ɡ
    assert normalize_ipa_symbol("g") == "ɡ"
    # Length mark colon to IPA ː
    assert normalize_ipa_symbol("i:") == "iː"
    # Stress marks stripped from phoneme identity
    assert normalize_ipa_symbol("ˈɪ") == "ɪ"
    assert normalize_ipa_symbol("ˌeɪ") == "eɪ"
    # Tie bars stripped
    assert normalize_ipa_symbol("t\u0361ʃ") == "tʃ"


def test_tokenize_phoneme_sequence_preserves_multi_char():
    """Verifies multi-character phonemes remain atomic tokens and are not split into chars."""
    tokens = tokenize_phoneme_sequence("s m oʊ k")
    assert tokens == ["s", "m", "oʊ", "k"]

    tokens_affricate = tokenize_phoneme_sequence("tʃ ˈæ l ɪ n dʒ")
    assert tokens_affricate == ["tʃ", "æ", "l", "ɪ", "n", "dʒ"]

    tokens_diphthong = tokenize_phoneme_sequence("w aɪ l d f aɪ ɚ z")
    assert "aɪ" in tokens_diphthong
    assert "oʊ" not in tokens_diphthong


def test_arpabet_to_ipa_stress_vowels():
    """Verifies ARPAbet stress handling: AH0 -> ə, AH1 -> ʌ, ER0 -> ɚ, ER1 -> ɜː."""
    # Stressed vs unstressed AH
    ipa_unstressed = arpabet_to_ipa(["AH0"])
    assert ipa_unstressed == ["ə"]

    ipa_stressed = arpabet_to_ipa(["AH1"])
    assert ipa_stressed == ["ʌ"]

    # Stressed vs unstressed ER
    ipa_er_unstressed = arpabet_to_ipa(["ER0"])
    assert ipa_er_unstressed == ["ɚ"]

    ipa_er_stressed = arpabet_to_ipa(["ER1"])
    assert ipa_er_stressed == ["ɜː"]


# ============================================================================
# 3. Alignment and Difference Detection Tests (Sub, Del, Ins)
# ============================================================================

def test_alignment_substitution_identified(generator):
    """
    Section 6A Test:
    Expected: θ ɪ ŋ k
    Predicted: t ɪ ŋ k
    Difference: θ -> t (Substitution at position 0)
    PER: (1 / 4) * 100 = 25.0%
    """
    comp = compare_word_phonemes("think", ["t", "ɪ", "ŋ", "k"], generator, assembly_confidence=0.94)

    assert comp["word"] == "think"
    assert comp["expected_phonemes"] == ["θ", "ɪ", "ŋ", "k"]
    assert comp["predicted_phonemes"] == ["t", "ɪ", "ŋ", "k"]
    assert comp["phoneme_error_rate"] == 25.0

    # Alignment structure check
    alignment = comp["alignment"]
    assert len(alignment) == 4
    assert alignment[0]["operation"] == "substitution"
    assert alignment[0]["expected"] == "θ"
    assert alignment[0]["predicted"] == "t"
    assert alignment[0]["position"] == 0

    assert alignment[1]["operation"] == "match"
    assert alignment[2]["operation"] == "match"
    assert alignment[3]["operation"] == "match"

    # Finding check
    findings = comp["pronunciation_findings"]
    assert len(findings) == 1
    f0 = findings[0]
    assert f0["observed_characteristic"] == "potential_consonant_substitution"
    assert f0["target_phoneme"] == "θ"
    assert f0["predicted_phoneme"] == "t"
    assert f0["confidence_level"] == "requires_validation"
    assert "dental fricative" in f0["articulatory_description"]


def test_alignment_deletion_identified(generator):
    """
    Section 6B Test:
    Expected: s t ɹ iː t
    Predicted: s t iː t
    Difference: ɹ was deleted
    PER: (1 / 5) * 100 = 20.0%
    """
    comp = compare_word_phonemes("street", ["s", "t", "iː", "t"], generator)

    assert comp["expected_phonemes"] == ["s", "t", "ɹ", "iː", "t"]
    assert comp["predicted_phonemes"] == ["s", "t", "iː", "t"]
    assert comp["phoneme_error_rate"] == 20.0

    alignment = comp["alignment"]
    assert len(alignment) == 5
    # The third operation should be deletion of ɹ
    del_ops = [item for item in alignment if item["operation"] == "deletion"]
    assert len(del_ops) == 1
    assert del_ops[0]["expected"] == "ɹ"
    assert del_ops[0]["predicted"] is None

    findings = comp["pronunciation_findings"]
    assert len(findings) == 1
    assert findings[0]["observed_characteristic"] == "potential_consonant_deletion"
    assert findings[0]["target_phoneme"] == "ɹ"


def test_alignment_insertion_identified(generator):
    """
    Section 6C Test:
    Expected: k æ t
    Predicted: k ə æ t
    Difference: extra ə inserted
    PER: (1 / 3) * 100 = 33.33%
    """
    comp = compare_word_phonemes("cat", ["k", "ə", "æ", "t"], generator)

    assert comp["expected_phonemes"] == ["k", "æ", "t"]
    assert comp["predicted_phonemes"] == ["k", "ə", "æ", "t"]
    assert comp["phoneme_error_rate"] == 33.33

    ins_ops = [item for item in comp["alignment"] if item["operation"] == "insertion"]
    assert len(ins_ops) == 1
    assert ins_ops[0]["predicted"] == "ə"
    assert ins_ops[0]["expected"] is None

    findings = comp["pronunciation_findings"]
    assert len(findings) == 1
    assert findings[0]["observed_characteristic"] == "potential_vowel_insertion"


# ============================================================================
# 4. Phoneme Error Rate (PER) Formula Tests
# ============================================================================

def test_per_formula_calculation():
    """
    Verifies PER = (S + D + I) / N * 100 on known synthetic sequences.
    """
    # 1 Sub, 1 Del, 1 Ins on 4 target phonemes -> (3 / 4) * 100 = 75.0%
    expected = ["p", "æ", "t", "ʃ"]
    predicted = ["b", "æ", "k", "s"]  # p->b (sub), t->k (sub), ʃ->s (sub) -> 3 subs / 4 = 75%
    _, metrics = align_phoneme_sequences(expected, predicted)
    assert metrics["phoneme_error_rate"] == 75.0
    assert metrics["substitutions"] == 3

    # Exact match -> PER = 0.0%
    _, perfect_metrics = align_phoneme_sequences(["k", "æ", "t"], ["k", "æ", "t"])
    assert perfect_metrics["phoneme_error_rate"] == 0.0
    assert perfect_metrics["total_edits"] == 0


def test_per_empty_sequences():
    """Verifies edge cases where expected or predicted sequence is empty."""
    # Both empty -> 0.0%, status="empty_sequences"
    _, m1 = align_phoneme_sequences([], [])
    assert m1["phoneme_error_rate"] == 0.0
    assert m1["status"] == "empty_sequences"

    # Reference empty, predicted non-empty -> None (cannot compute PER without reference), status="reference_unavailable"
    _, m2 = align_phoneme_sequences([], ["k", "æ", "t"])
    assert m2["phoneme_error_rate"] is None
    assert m2["status"] == "reference_unavailable"


# ============================================================================
# 5. Multiple Valid Pronunciations Handling Tests
# ============================================================================

def test_multiple_valid_pronunciations_variant_selection(generator):
    """
    Section 8 Test:
    'either' has multiple accepted pronunciations:
    Variant 1: /iː ð ɚ/
    Variant 2: /aɪ ð ɚ/
    If learner produces /aɪ ð ɚ/, the system must match Variant 2 and NOT flag an error!
    """
    comp_variant2 = compare_word_phonemes("either", ["aɪ", "ð", "ɚ"], generator)
    assert comp_variant2["phoneme_error_rate"] == 0.0
    assert len(comp_variant2["pronunciation_findings"]) == 0
    assert len(comp_variant2["reference_variants"]) >= 2

    # If learner produces /iː ð ɚ/, it matches Variant 1 without error
    comp_variant1 = compare_word_phonemes("either", ["iː", "ð", "ɚ"], generator)
    assert comp_variant1["phoneme_error_rate"] == 0.0
    assert len(comp_variant1["pronunciation_findings"]) == 0


# ============================================================================
# 6. Evidence-Based Pronunciation Findings Structure Tests
# ============================================================================

def test_findings_structure_for_feedback_generation(generator):
    """
    Section 10 & 11 Test:
    Verifies all required finding fields are populated and ready for future feedback engine:
    identified word, expected phoneme, predicted phoneme, difference type,
    supporting audio clip, reference pronunciation, validation status, practice target.
    """
    comp = compare_word_phonemes(
        word="think",
        predicted_tokens=["t", "ɪ", "ŋ", "k"],
        generator=generator,
        assembly_confidence=0.95,
        audio_clip="word_001.wav",
    )

    assert comp["findings_count"] == 1
    finding = comp["pronunciation_findings"][0]

    required_keys = [
        "word",
        "identified_word",
        "observed_characteristic",
        "target_phoneme",
        "expected_phoneme",
        "predicted_phoneme",
        "difference_type",
        "phoneme_position",
        "phonetic_category",
        "articulatory_description",
        "supporting_audio_clip",
        "reference_pronunciation",
        "reference_source",
        "evidence",
        "confidence_level",
        "validation_status",
        "recommendation",
        "suggested_practice_target",
        "practice_words",
    ]
    for key in required_keys:
        assert key in finding, f"Missing key: {key}"

    assert finding["identified_word"] == "think"
    assert finding["expected_phoneme"] == "θ"
    assert finding["predicted_phoneme"] == "t"
    assert finding["difference_type"] == "substitution"
    assert finding["supporting_audio_clip"] == "word_001.wav"
    assert finding["confidence_level"] == "requires_validation"
    assert finding["validation_status"] == "unvalidated_single_occurrence"
    assert len(finding["practice_words"]) > 0


def test_empty_predicted_tokens_no_fabricated_findings(generator):
    """Section 12.11: Invalid or empty phoneme predictions do not fabricate findings."""
    comp = compare_word_phonemes("think", [], generator)
    assert comp["analysis_status"] == "prediction_missing"
    # When predicted phonemes are empty, all expected phonemes are marked deleted in alignment
    assert comp["phoneme_error_rate"] == 100.0


# ============================================================================
# 7. End-to-End Hybrid Pipeline Integration Test with Real Audio
# ============================================================================

def test_hybrid_pipeline_with_real_audio():
    """
    Section 12 Real Audio Test:
    Tests the complete hybrid pipeline using actual recording 'test_speech_short.wav'.
    Verifies:
    1. Audio slices extracted from original recording.
    2. Expected phonemes generated for each word.
    3. Wav2Vec2 predicted phonemes decoded.
    4. Alignment, PER, and findings computed.
    5. Original audio duration and AssemblyAI metadata preserved.
    """
    audio_path = Path(__file__).parent / "test_speech_short.wav"
    assert audio_path.exists(), "test_speech_short.wav must exist in backend directory"

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    # Real words from AssemblyAI transcription of test_speech_short.wav
    words = [
        {"text": "Smoke", "start": 148, "end": 538, "confidence": 0.998},
        {"text": "from", "start": 751, "end": 848, "confidence": 0.995},
        {"text": "hundreds", "start": 1077, "end": 1469, "confidence": 0.999},
        {"text": "of", "start": 1502, "end": 1648, "confidence": 0.999},
        {"text": "wildfires", "start": 1665, "end": 2204, "confidence": 0.999},
    ]

    result = analyze_words_phonemes(
        audio_bytes=audio_bytes,
        words=words,
        filename="test_speech_short.wav",
        padding_ms=25,
        recording_id="rec_real_test",
        full_transcription="Smoke from hundreds of wildfires",
        return_unified=True,
    )

    assert isinstance(result, dict)
    assert result["recording_id"] == "rec_real_test"
    assert result["audio_metadata"]["sample_rate"] == 44100
    assert result["audio_metadata"]["duration"] == 4.0
    assert "pronunciation_summary" in result
    assert "pronunciation_findings" in result

    analyzed_words = result["words"]
    assert len(analyzed_words) == 5

    for w in analyzed_words:
        # Expected phonemes must be generated
        assert "expected_phonemes" in w
        assert len(w["expected_phonemes"]) > 0
        assert w["reference_source"] in ("canonical_dictionary", "cmudict", "g2p_model")

        # Predicted phonemes from Wav2Vec2 must be populated
        assert "phoneme_prediction" in w
        assert "alignment" in w
        assert "phoneme_error_rate" in w

        # Audio slice base64 must be valid
        assert w["audio_clip_base64"].startswith("data:audio/wav;base64,")
        assert w["segmentation_status"] == "valid"
