"""
Unit tests for Conversation-First Architecture, Post-Conversation Assessment,
Evidence Constraints, and Aggregated Session Fluency.
"""

import pytest
from evaluation import compute_session_fluency, normalize_transcript
from phoneme_comparison import (
    generate_pronunciation_findings,
    compare_word_phonemes,
    ExpectedPhonemeGenerator,
)
from phoneme_analyzer import CANONICAL_IPA_REFERENCE
from ai_summary_service import build_post_conversation_report
from main import run_post_conversation_pipeline, ConversationTurnInput


def test_compute_session_fluency_multi_turn():
    """
    Verifies that:
    1. Session speech rate is 60 * Total Words / Total Active Duration.
    2. Silence between separate conversation turns is strictly excluded.
    3. Preserves individual turn breakdowns alongside aggregated results.
    """
    turn_metrics = [
        {
            "turn_id": "turn_1",
            "word_count": 25,
            "response_interval_seconds": 12.0,
            "pause_events": [
                {"start_seconds": 2.0, "end_seconds": 2.5, "duration_seconds": 0.5},
                {"start_seconds": 7.0, "end_seconds": 7.4, "duration_seconds": 0.4},
            ],
            "repetition_count": 1,
        },
        {
            "turn_id": "turn_2",
            "word_count": 35,
            "response_interval_seconds": 18.0,
            "pause_events": [
                {"start_seconds": 4.0, "end_seconds": 4.6, "duration_seconds": 0.6},
            ],
            "repetition_count": 0,
        },
    ]

    session_res = compute_session_fluency(turn_metrics)
    assert session_res["status"] == "valid"
    assert session_res["turn_count"] == 2
    assert session_res["total_recognized_words"] == 60
    # Total active duration = 12.0 + 18.0 = 30.0s (excludes inter-turn gap)
    assert session_res["total_response_interval_seconds"] == 30.0
    # Session WPM = 60 * 60 / 30.0 = 120.0 WPM
    assert session_res["speech_rate_wpm"] == 120.0
    # Total pauses = 2 + 1 = 3 pauses
    assert session_res["pause_count"] == 3
    # Total pause duration = 0.5 + 0.4 + 0.6 = 1.5s
    assert session_res["total_pause_duration_seconds"] == 1.5
    # Mean pause duration = 1.5 / 3 = 0.5s
    assert session_res["mean_pause_duration_seconds"] == 0.5
    # Pause frequency = 3 / 30.0 = 0.1 pauses/sec; pauses per min = 60 * 3 / 30 = 6.0
    assert session_res["pause_frequency"] == 0.1
    assert session_res["pauses_per_minute"] == 6.0
    # Total repetitions = 1; Repetition rate = 100 * 1 / 60 = 1.67%
    assert session_res["repetition_event_count"] == 1
    assert session_res["repetition_rate_percent"] == 1.67
    # Preserves individual turns
    assert len(session_res["turns"]) == 2
    assert session_res["turns"][0]["speech_rate_wpm"] == round(60.0 * 25 / 12.0, 2)


def test_evidence_constraints_short_audio_suppressed():
    """
    Verifies that audio segments under 80ms are marked 'insufficient_acoustic_evidence'
    and do NOT produce articulatory practice instructions.
    """
    alignment = [
        {"operation": "substitution", "expected": "t", "predicted": "d", "position": 0}
    ]
    findings = generate_pronunciation_findings(
        word="to",
        alignment=alignment,
        reference_source="canonical_dictionary",
        audio_clip="data:audio/wav;base64,...",
        expected_phonemes_str="t uː",
        target_word="to",
        recognized_word="to",
        speaking_mode="prompted",
        audio_quality_status="too_short",
        duration_ms=45,
    )
    assert len(findings) == 1
    f = findings[0]
    assert f["validation_status"] == "insufficient_acoustic_evidence"
    assert f["articulatory_description"] is None
    assert f["practice_words"] == []
    assert "insufficient acoustic evidence" in f["recommendation"].lower()


def test_evidence_constraints_prompted_substitution_validated():
    """
    Verifies that a high-contrast prompted substitution (e.g. /θ/ -> [s] in 'think')
    with adequate duration produces a 'validated_observation' with actionable guidance.
    """
    alignment = [
        {"operation": "substitution", "expected": "θ", "predicted": "s", "position": 0},
        {"operation": "match", "expected": "ɪ", "predicted": "ɪ", "position": 1},
        {"operation": "match", "expected": "ŋ", "predicted": "ŋ", "position": 2},
        {"operation": "match", "expected": "k", "predicted": "k", "position": 3},
    ]
    findings = generate_pronunciation_findings(
        word="think",
        alignment=alignment,
        reference_source="canonical_dictionary",
        audio_clip="data:audio/wav;base64,...",
        expected_phonemes_str="θ ɪ ŋ k",
        target_word="think",
        recognized_word="sink",
        speaking_mode="prompted",
        audio_quality_status="normal",
        duration_ms=280,
    )
    assert len(findings) == 1
    f = findings[0]
    assert f["validation_status"] == "validated_observation"
    assert f["observed_characteristic"] == "dental_to_alveolar_fricative_substitution"
    assert f["articulatory_description"] is not None
    assert len(f["practice_words"]) > 0


def test_evidence_constraints_spontaneous_requires_human_review():
    """
    Verifies that in spontaneous speech, discrepancies are marked 'human_review_required'
    and are not automatically claimed as confirmed learner pronunciation errors.
    """
    alignment = [
        {"operation": "substitution", "expected": "æ", "predicted": "ɛ", "position": 1}
    ]
    findings = generate_pronunciation_findings(
        word="and",
        alignment=alignment,
        reference_source="canonical_dictionary",
        audio_clip="data:audio/wav;base64,...",
        expected_phonemes_str="æ n d",
        target_word="and",
        recognized_word="and",
        speaking_mode="spontaneous",
        audio_quality_status="normal",
        duration_ms=190,
    )
    assert len(findings) == 1
    f = findings[0]
    assert f["validation_status"] == "candidate_discrepancy_review_required"
    assert f["articulatory_description"] is None
    assert "spontaneous speech requires human review" in f["recommendation"].lower()


def test_build_post_conversation_report_structure():
    """
    Verifies that the consolidated post-conversation report contains exactly
    the 5 specified sections (A, B, C, D, E) and strictly obeys research boundaries.
    """
    turns_data = [
        {
            "turn_id": "turn_1",
            "transcript": "i think effective communication requires listening",
            "audio_duration": 4.5,
            "confidence": 0.95,
            "words": [
                {"word": "i", "start": 0, "end": 200, "confidence": 0.98},
                {"word": "think", "start": 250, "end": 600, "confidence": 0.96},
            ],
        }
    ]
    session_fluency = {
        "speech_rate_wpm": 115.0,
        "pause_frequency": 0.22,
        "pauses_per_minute": 13.2,
        "mean_pause_duration_seconds": 0.38,
        "repetition_rate_percent": 0.0,
        "total_response_interval_seconds": 4.5,
        "total_recognized_words": 6,
        "pause_count": 1,
        "repetition_event_count": 0,
        "turns": [],
    }
    findings = [
        {
            "word": "think",
            "expected_phoneme": "θ",
            "predicted_phoneme": "s",
            "difference_type": "substitution",
            "validation_status": "validated_observation",
            "recommendation": "Practice target /θ/.",
            "practice_words": ["think", "thought", "three"],
        }
    ]

    report = build_post_conversation_report(
        session_id="session_test_001",
        turns_data=turns_data,
        session_fluency=session_fluency,
        all_pronunciation_findings=findings,
        all_words=turns_data[0]["words"],
        preferred_accent="General English",
    )

    # Verify 5 sections exist
    assert "section_a_transcription_and_timing" in report
    assert "section_b_fluency_analysis" in report
    assert "section_c_pronunciation_observations" in report
    assert "section_d_evidence_and_quality_checks" in report
    assert "section_e_formative_feedback" in report

    # Verify no prohibited scope additions (grammar, vocabulary, CEFR, proficiency score)
    assert "grammar" not in report
    assert "vocabulary" not in report
    assert "cefr" not in report
    assert "proficiency_score" not in report

    # Section A verification
    sec_a = report["section_a_transcription_and_timing"]
    assert sec_a["turn_count"] == 1
    assert sec_a["asr_average_confidence"] == 0.95
    assert len(sec_a["transcription_limitations"]) >= 2

    # Section B verification
    sec_b = report["section_b_fluency_analysis"]
    assert sec_b["speech_rate_wpm"] == 115.0
    assert "strictly excluded" in sec_b["measurement_protocol"]

    # Section C verification
    sec_c = report["section_c_pronunciation_observations"]
    assert len(sec_c["validated_observations"]) == 1
    assert sec_c["validated_observations"][0]["word"] == "think"

    # Section E formative feedback
    sec_e = report["section_e_formative_feedback"]
    assert len(sec_e["evidence_supported_strengths"]) > 0
    assert len(sec_e["priority_practice_areas"]) > 0
    assert len(sec_e["actionable_recommendations"]) > 0


def test_run_post_conversation_pipeline_simulated():
    """
    Verifies the end-to-end multi-turn pipeline with pre-provided turns
    without requiring external network calls.
    """
    import asyncio

    stages_visited = []

    async def mock_callback(stage: str, msg: str, progress: int):
        stages_visited.append(stage)

    turns = [
        ConversationTurnInput(
            turn_id="turn_1",
            transcript="well i think that is effective",
            words=[
                {"word": "well", "start": 0, "end": 300, "confidence": 0.95},
                {"word": "i", "start": 350, "end": 500, "confidence": 0.98},
                {"word": "think", "start": 550, "end": 900, "confidence": 0.92},
                {"word": "that", "start": 950, "end": 1200, "confidence": 0.96},
                {"word": "is", "start": 1250, "end": 1400, "confidence": 0.97},
                {"word": "effective", "start": 1450, "end": 2000, "confidence": 0.94},
            ],
            duration_seconds=2.5,
            prompt_target="think",
            speaking_mode="prompted",
            detected_pauses=[
                {"start_seconds": 0.3, "end_seconds": 0.55, "duration_seconds": 0.25}
            ],
        ),
        ConversationTurnInput(
            turn_id="turn_2",
            transcript="communication requires listening",
            words=[
                {"word": "communication", "start": 0, "end": 800, "confidence": 0.93},
                {"word": "requires", "start": 850, "end": 1300, "confidence": 0.91},
                {"word": "listening", "start": 1350, "end": 1900, "confidence": 0.95},
            ],
            duration_seconds=2.2,
            prompt_target=None,
            speaking_mode="spontaneous",
            detected_pauses=[],
        ),
    ]

    report = asyncio.run(
        run_post_conversation_pipeline(
            session_id="session_sim_123",
            speaking_mode="prompted",
            prompt_target="think",
            preferred_accent="General English",
            turns_input=turns,
            progress_callback=mock_callback,
        )
    )

    assert "transcribing" in stages_visited
    assert "analyzing_fluency" in stages_visited
    assert "analyzing_pronunciation" in stages_visited
    assert "validating_evidence" in stages_visited
    assert "generating_feedback" in stages_visited
    assert "completed" in stages_visited

    assert report["session_id"] == "session_sim_123"
    assert report["section_a_transcription_and_timing"]["turn_count"] == 2
    assert report["section_b_fluency_analysis"]["total_recognized_words"] == 9
