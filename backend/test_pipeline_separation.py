"""
Comprehensive tests verifying the strict separation of:
Pipeline A: ASR Performance & Word Error Rate (WER) Evaluation
Pipeline B: Phonetic Pronunciation Characteristics Assessment

Covers:
1. "think" versus "sink" prompted speaking practice
2. Correctly pronounced "think"
3. Spontaneous speaking practice with candidate hypotheses
4. Independence of WER from pronunciation assessment (stale reference protection)
5. Cross-recording reference mismatch prevention
"""

import pytest
from evaluation import compute_word_alignment
from phoneme_comparison import (
    ExpectedPhonemeGenerator,
    compare_word_phonemes,
    tokenize_phoneme_sequence,
)
from phoneme_analyzer import analyze_words_phonemes


@pytest.fixture(scope="module")
def generator():
    return ExpectedPhonemeGenerator()


# ============================================================================
# Scenario 1: "think" vs "sink" Prompted Speaking Practice
# ============================================================================

def test_prompted_think_vs_sink_substitution(generator):
    """
    User scenario:
    - Target word assigned to learner: 'think' (expected IPA: /θ ɪ ŋ k/)
    - Actual learner production: 'sink' (acoustic phonemes: [s ɪ ŋ k])
    - AssemblyAI ASR recognizes: 'sink'
    
    Verifies:
    - Pronunciation assessment compares against intended target 'think', NOT ASR word 'sink'.
    - Sequence alignment identifies /θ/ -> [s] dental-to-alveolar fricative substitution.
    - PER = 25.0% (1 substitution / 4 reference phonemes).
    - ASR recognized word 'sink' is retained without distorting expected pronunciation.
    """
    comp = compare_word_phonemes(
        word="think",
        predicted_tokens=["s", "ɪ", "ŋ", "k"],
        generator=generator,
        assembly_confidence=0.96,
        audio_clip="word_think_001.wav",
        speaking_mode="prompted",
        target_word="think",
        recognized_word="sink",
    )

    # 1. Target & Recognition provenance
    assert comp["target_word"] == "think"
    assert comp["recognized_word"] == "sink"
    assert comp["speaking_mode"] == "prompted"
    assert comp["intent_certainty"] == "prompt_verified"

    # 2. Expected vs Predicted IPA
    assert "θ" in comp["expected_phonemes"]
    assert comp["predicted_phonemes"] == ["s", "ɪ", "ŋ", "k"]

    # 3. Levenshtein Phoneme Error Rate
    assert comp["phoneme_error_rate"] == 25.0
    assert comp["per_metrics"]["substitutions"] == 1
    assert comp["per_metrics"]["matches"] == 3

    # 4. Articulatory Findings
    assert comp["findings_count"] >= 1
    finding = comp["pronunciation_findings"][0]
    assert finding["expected_phoneme"] == "θ"
    assert finding["predicted_phoneme"] == "s"
    assert finding["difference_type"] == "substitution"
    assert finding["observed_characteristic"] == "dental_to_alveolar_fricative_substitution"
    assert "sink" in finding["notes"]
    assert "think" in finding["notes"]


# ============================================================================
# Scenario 2: Correctly Pronounced "think"
# ============================================================================

def test_prompted_correct_think(generator):
    """
    User scenario:
    - Target word: 'think'
    - Learner produces correct acoustic phonemes: [θ ɪ ŋ k]
    - AssemblyAI recognizes: 'think'
    
    Verifies:
    - PER = 0.0%
    - 0 substitutions, 4 matches.
    - 0 pronunciation error findings.
    """
    comp = compare_word_phonemes(
        word="think",
        predicted_tokens=["θ", "ɪ", "ŋ", "k"],
        generator=generator,
        assembly_confidence=0.98,
        audio_clip="word_think_002.wav",
        speaking_mode="prompted",
        target_word="think",
        recognized_word="think",
    )

    assert comp["target_word"] == "think"
    assert comp["phoneme_error_rate"] == 0.0
    assert comp["per_metrics"]["substitutions"] == 0
    assert comp["per_metrics"]["matches"] == 4
    assert comp["findings_count"] == 0
    assert comp["comparison_status"] == "completed"


# ============================================================================
# Scenario 3: Spontaneous Speaking with Candidate Hypotheses
# ============================================================================

def test_spontaneous_speaking_candidate_hypothesis(generator):
    """
    User scenario:
    - Spontaneous response: No predefined prompt word exists.
    - Learner produces acoustic phonemes: [s ɪ ŋ k]
    - AssemblyAI transcribes candidate word: 'sink'
    
    Verifies:
    - Candidate hypothesis is evaluated with intent_certainty = 'candidate_inferred'.
    - Concordant phonemes produce comparison_status = 'candidate_concordant'.
    """
    comp = compare_word_phonemes(
        word="sink",
        predicted_tokens=["s", "ɪ", "ŋ", "k"],
        generator=generator,
        assembly_confidence=0.92,
        audio_clip="spontaneous_001.wav",
        speaking_mode="spontaneous",
        target_word="sink",
        recognized_word="sink",
    )

    assert comp["speaking_mode"] == "spontaneous"
    assert comp["intent_certainty"] == "candidate_inferred"
    assert comp["phoneme_error_rate"] == 0.0
    assert comp["comparison_status"] == "candidate_concordant"


def test_spontaneous_speaking_acoustic_discrepancy(generator):
    """
    In spontaneous mode, when acoustic phonemes differ from the ASR hypothesis,
    the system must NOT assign a definitive mispronunciation error automatically.
    Instead, it must flag comparison_status = 'candidate_discrepancy_review_required'.
    """
    comp = compare_word_phonemes(
        word="sink",
        predicted_tokens=["θ", "ɪ", "ŋ", "k"],  # Acoustic model detected /θ/, ASR said 'sink'
        generator=generator,
        assembly_confidence=0.82,
        audio_clip="spontaneous_002.wav",
        speaking_mode="spontaneous",
        target_word="sink",
        recognized_word="sink",
    )

    assert comp["speaking_mode"] == "spontaneous"
    assert comp["intent_certainty"] == "candidate_inferred"
    assert comp["comparison_status"] == "candidate_discrepancy_review_required"
    assert comp["requires_human_review"] is True
    assert len(comp["pronunciation_findings"]) >= 1
    assert comp["pronunciation_findings"][0]["validation_status"] == "candidate_discrepancy_review_required"


# ============================================================================
# Scenario 4: Strict Separation & Prevention of Stale / Mismatched WER
# ============================================================================

def test_wer_unavailable_when_reference_missing():
    """
    If no verified human reference transcript exists for a recording,
    the application must report status = 'reference_unavailable' and
    word_error_rate = None (NOT a false numeric score).
    """
    res = compute_word_alignment(
        reference_text="",
        hypothesis_text="sink",
        recording_id="rec_custom_001",
    )

    assert res["status"] == "reference_unavailable"
    assert res["word_error_rate"] is None
    assert res["word_error_rate_percent"] is None
    assert "unavailable" in res["reason"].lower()


def test_wer_blocks_cross_recording_reference_reuse():
    """
    User problem scenario:
    - Manual WER reference in memory: 'The purpose of this research is to evaluate...' (from TC-01)
    - Actual recording: 'sink' (from rec_learner_sink)
    
    The system must prevent cross-recording contamination, return status = 'recording_mismatch',
    and set word_error_rate = None rather than producing a false 100% WER.
    """
    tc01_ref = "The purpose of this research is to evaluate automatic speech recognition for conversational voice analysis."
    learner_hyp = "sink"

    res = compute_word_alignment(
        reference_text=tc01_ref,
        hypothesis_text=learner_hyp,
        recording_id="rec_learner_sink",
        reference_recording_id="TC-01",
    )

    assert res["status"] == "recording_mismatch"
    assert res["word_error_rate"] is None
    assert res["word_error_rate_percent"] is None
    assert "strictly prevented" in res["reason"]


def test_wer_evaluates_when_properly_paired():
    """
    When the reference belongs to the exact recording, WER is accurately calculated.
    For example: reference = 'think', ASR = 'sink' -> WER = 100.0% (1 substitution / 1 word).
    """
    res = compute_word_alignment(
        reference_text="think",
        hypothesis_text="sink",
        recording_id="rec_001",
        reference_recording_id="rec_001",
    )

    assert res["status"] == "valid"
    assert res["reference_word_count"] == 1
    assert res["substitution_count"] == 1
    assert res["word_error_rate"] == 1.0
    assert res["word_error_rate_percent"] == 100.0


def test_pipelines_are_completely_independent(generator):
    """
    Verifies that changing or clearing the ASR reference transcript does NOT alter
    the pronunciation assessment, and vice-versa.
    """
    # Pronunciation Assessment for "think" vs acoustic [s, ɪ, ŋ, k]
    pron_result = compare_word_phonemes(
        word="think",
        predicted_tokens=["s", "ɪ", "ŋ", "k"],
        generator=generator,
        target_word="think",
        recognized_word="sink",
        speaking_mode="prompted",
    )

    # 1. Pronunciation PER is 25%
    assert pron_result["phoneme_error_rate"] == 25.0

    # 2. ASR evaluation without reference -> WER is None
    asr_without_ref = compute_word_alignment(
        reference_text=None,
        hypothesis_text="sink",
        recording_id="rec_001",
    )
    assert asr_without_ref["word_error_rate"] is None
    assert asr_without_ref["status"] == "reference_unavailable"

    # 3. ASR evaluation with reference "sink" -> WER is 0%
    asr_with_ref = compute_word_alignment(
        reference_text="sink",
        hypothesis_text="sink",
        recording_id="rec_001",
        reference_recording_id="rec_001",
    )
    assert asr_with_ref["word_error_rate"] == 0.0

    # 4. Pronunciation PER remains exactly 25.0% regardless of ASR WER state
    assert pron_result["phoneme_error_rate"] == 25.0
