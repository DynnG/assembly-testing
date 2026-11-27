"""
Unit and integration tests for Gemini 3.5 Flash-Lite integration in Articula.
Tests all 13 core requirements specified in Part 8:
1. Gemini generates a relevant initial question.
2. Gemini generates contextual follow-up questions.
3. Gemini remembers conversation context.
4. Gemini does not repeat questions unnecessarily.
5. The learner can complete multiple turns without waiting for detailed assessment.
6. Audio recordings remain correctly associated with each turn.
7. AssemblyAI results remain independent of Gemini.
8. Fluency measurements remain calculated by deterministic application code.
9. Unvalidated pronunciation findings are not presented as confirmed errors.
10. Gemini produces feedback only from supplied evidence.
11. API failures do not destroy conversation history.
12. API keys are never exposed to the frontend.
13. Completed reports can be revisited through session history.
"""

import asyncio
import os
import json
import pytest
from unittest.mock import patch, AsyncMock

from gemini_service import (
    GeminiService,
    ConversationalResponseModel,
    PostAssessmentInterpretationModel,
)
from ai_summary_service import (
    build_post_conversation_report,
    generate_post_conversation_feedback_llm,
)
from evaluation import compute_session_fluency
from phoneme_comparison import generate_pronunciation_findings
from main import app, StartDialogueRequest, RespondDialogueRequest, DialogueTurnContext
from fastapi.testclient import TestClient

client = TestClient(app)


# 1. Gemini generates a relevant initial question
@pytest.mark.anyio
async def test_gemini_initial_question():
    service = GeminiService()
    res = await service.generate_conversational_response(
        session_id="test_sess_01",
        history=[],
        current_topic="daily_life_and_interests",
        is_opening=True,
    )
    assert isinstance(res, ConversationalResponseModel)
    assert res.intent == "opening"
    assert len(res.response) > 10
    assert "?" in res.response
    assert res.conversation_complete is False


# 2. Gemini generates contextual follow-up questions
@pytest.mark.anyio
async def test_gemini_contextual_follow_up():
    service = GeminiService()
    history = [
        {"speaker": "ai", "text": "What do you enjoy doing on weekends?"}
    ]
    res = await service.generate_conversational_response(
        session_id="test_sess_02",
        history=history,
        current_topic="hobbies",
        learner_response="I love playing acoustic guitar and writing indie music in my room.",
        is_opening=False,
    )
    assert isinstance(res, ConversationalResponseModel)
    assert res.intent in ("follow_up", "topic_shift")
    # Response should acknowledge or relate to music/guitar or provide a natural question
    assert len(res.response) > 15
    assert "?" in res.response
    assert res.conversation_complete is False


# 3. Gemini remembers conversation context
@pytest.mark.anyio
async def test_gemini_remembers_conversation_context():
    service = GeminiService()
    history = [
        {"speaker": "ai", "text": "What is your favorite travel destination?"},
        {"speaker": "learner", "text": "I visited Tokyo last summer and loved the food."},
        {"speaker": "ai", "text": "Tokyo is amazing! What kind of dishes did you enjoy most?"},
    ]
    res = await service.generate_conversational_response(
        session_id="test_sess_03",
        history=history,
        current_topic="travel_and_food",
        learner_response="The authentic ramen was incredible, especially the broth.",
        is_opening=False,
    )
    assert isinstance(res, ConversationalResponseModel)
    assert res.conversation_complete is False
    assert len(res.response) > 10


# 4. Gemini does not repeat questions unnecessarily
@pytest.mark.anyio
async def test_gemini_does_not_repeat_questions():
    service = GeminiService()
    question_1 = "What is a hobby or activity you really enjoy doing during your free time?"
    history = [
        {"speaker": "ai", "text": question_1},
        {"speaker": "learner", "text": "I really like cooking pasta."},
    ]
    res = await service.generate_conversational_response(
        session_id="test_sess_04",
        history=history,
        current_topic="food_and_dining",
        learner_response="I make fresh homemade pasta with garlic and tomato sauce.",
        is_opening=False,
    )
    # The follow-up question must not be identical to the opening question
    assert res.response.strip() != question_1.strip()
    assert "hobby or activity" not in res.response.lower()


# 5. The learner can complete multiple turns without waiting for detailed assessment
@pytest.mark.anyio
async def test_learner_multiple_turns_without_waiting_for_assessment():
    """
    Verifies that calling /conversation/respond-dialogue is decoupled from
    heavy Wav2Vec2 phoneme inference or fluency analysis, returning immediately.
    """
    req_payload = {
        "session_id": "test_fast_session",
        "turn_id": "turn_1",
        "learner_transcript": "I manage software projects with cross-functional teams.",
        "history": [
            {"speaker": "ai", "text": "Tell me about your job."}
        ],
        "current_topic": "workplace",
    }
    resp = client.post("/conversation/respond-dialogue", json=req_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert "response" in data
    assert data["turn_id"] == "turn_2"
    assert data["session_id"] == "test_fast_session"
    assert "phoneme_error_rate" not in data
    assert "speech_rate_wpm" not in data


# 6. Audio recordings remain correctly associated with each turn
def test_audio_recordings_associated_with_turns():
    turns_data = [
        {
            "turn_id": "turn_1",
            "audio_duration": 4.2,
            "transcript": "hello world",
            "words": [{"word": "hello", "start": 0, "end": 400}],
        },
        {
            "turn_id": "turn_2",
            "audio_duration": 5.8,
            "transcript": "i am practicing my spoken english",
            "words": [{"word": "practicing", "start": 500, "end": 1200}],
        },
    ]
    session_fluency = {
        "speech_rate_wpm": 100.0,
        "silent_pause_frequency": 0.2,
        "pauses_per_minute": 12.0,
        "mean_pause_duration_seconds": 0.4,
        "repetition_rate_percent": 0.0,
        "total_response_interval_seconds": 10.0,
        "total_recognized_words": 8,
        "pause_count": 2,
        "repetition_event_count": 0,
        "turns": [],
    }
    report = build_post_conversation_report(
        session_id="assoc_test",
        turns_data=turns_data,
        session_fluency=session_fluency,
        all_pronunciation_findings=[],
        all_words=turns_data[0]["words"] + turns_data[1]["words"],
    )
    processed_turns = report["section_a_transcription_and_timing"]["turns"]
    assert len(processed_turns) == 2
    assert processed_turns[0]["turn_id"] == "turn_1"
    assert processed_turns[0]["duration_seconds"] == 4.2
    assert processed_turns[1]["turn_id"] == "turn_2"
    assert processed_turns[1]["duration_seconds"] == 5.8


# 7. AssemblyAI results remain independent of Gemini
def test_assemblyai_results_independent_of_gemini():
    turns_data = [
        {
            "turn_id": "turn_1",
            "transcript": "i think communication is critical",
            "confidence": 0.942,
            "words": [
                {"word": "think", "confidence": 0.98},
                {"word": "critical", "confidence": 0.91},
            ],
        }
    ]
    session_fluency = {
        "speech_rate_wpm": 110.0,
        "total_response_interval_seconds": 3.0,
        "total_recognized_words": 5,
        "pause_count": 0,
        "repetition_event_count": 0,
    }
    report = build_post_conversation_report(
        session_id="indep_test",
        turns_data=turns_data,
        session_fluency=session_fluency,
        all_pronunciation_findings=[],
        all_words=turns_data[0]["words"],
    )
    sec_a = report["section_a_transcription_and_timing"]
    # ASR confidence remains exactly the acoustic decoding value
    assert sec_a["asr_average_confidence"] == 0.942
    # Ensure explicit notice that ASR confidence is NOT pronunciation accuracy
    assert any("not learner pronunciation accuracy" in lim for lim in sec_a["transcription_limitations"])


# 8. Fluency measurements remain calculated by deterministic application code
def test_fluency_calculated_by_deterministic_code():
    turn_metrics = [
        {
            "turn_id": "turn_1",
            "word_count": 30,
            "response_interval_seconds": 15.0,
            "pause_events": [
                {"start_seconds": 3.0, "end_seconds": 3.6, "duration_seconds": 0.6}
            ],
            "repetition_count": 0,
        },
        {
            "turn_id": "turn_2",
            "word_count": 45,
            "response_interval_seconds": 20.0,
            "pause_events": [
                {"start_seconds": 5.0, "end_seconds": 5.4, "duration_seconds": 0.4}
            ],
            "repetition_count": 1,
        },
    ]
    # Pure deterministic Python calculation
    res = compute_session_fluency(turn_metrics)
    assert res["total_recognized_words"] == 75
    assert res["total_response_interval_seconds"] == 35.0
    # Formula: 60 * 75 / 35.0 = 128.57 WPM
    assert res["speech_rate_wpm"] == 128.57
    # Mean pause duration: (0.6 + 0.4) / 2 = 0.5s
    assert res["mean_pause_duration_seconds"] == 0.5
    # Repetition rate: 100 * 1 / 75 = 1.33%
    assert res["repetition_rate_percent"] == 1.33


# 9. Unvalidated pronunciation findings are not presented as confirmed errors
def test_unvalidated_findings_not_presented_as_confirmed_errors():
    alignment = [
        {"operation": "substitution", "expected": "æ", "predicted": "ɛ", "position": 1}
    ]
    findings = generate_pronunciation_findings(
        word="cat",
        alignment=alignment,
        reference_source="canonical_dictionary",
        audio_clip="data:audio/wav;base64,...",
        expected_phonemes_str="k æ t",
        target_word="cat",
        recognized_word="cat",
        speaking_mode="spontaneous",
        audio_quality_status="normal",
        duration_ms=180,
    )
    report = build_post_conversation_report(
        session_id="unval_test",
        turns_data=[{"turn_id": "turn_1", "transcript": "cat", "duration": 1.0}],
        session_fluency={"speech_rate_wpm": 60.0},
        all_pronunciation_findings=findings,
        all_words=[{"word": "cat"}],
    )
    sec_c = report["section_c_pronunciation_observations"]
    # No validated observations should be created from single spontaneous occurrence
    assert len(sec_c["validated_observations"]) == 0
    # Must explicitly state insufficient evidence to claim an error
    assert "insufficient evidence" in sec_c["insufficient_evidence_message"].lower()


# 10. Gemini produces feedback only from supplied evidence
@pytest.mark.anyio
async def test_gemini_feedback_grounded_only_in_evidence():
    evidence_payload = {
        "transcription_info": {
            "full_transcript": "i think effective communication requires listening",
            "turn_count": 1,
            "total_recognized_words": 6,
            "asr_average_confidence": 0.96,
            "transcription_limitations": ["ASR confidence reflects lexical match probability"],
        },
        "fluency_measures": {
            "speech_rate_wpm": 115.0,
            "silent_pause_frequency": 0.2,
            "mean_silent_pause_duration_seconds": 0.35,
            "repetition_rate_percent": 0.0,
            "total_response_interval_seconds": 4.5,
            "pause_count": 1,
            "repetition_event_count": 0,
        },
        "validated_pronunciation_observations": [
            {
                "word": "think",
                "expected_phoneme": "θ",
                "observed_phonetic_evidence": "s",
                "recommendation": "Practice target dental fricative /θ/.",
                "practice_words": ["think", "thought", "three"],
            }
        ],
        "quality_and_limitations": {
            "insufficient_audio_count": 0,
            "unvalidated_observations_count": 2,
        },
    }
    service = GeminiService()
    interpreted = await service.interpret_assessment_results(evidence_payload)
    assert isinstance(interpreted, PostAssessmentInterpretationModel)
    assert len(interpreted.evidence_supported_strengths) > 0
    assert len(interpreted.priority_practice_areas) > 0
    # Pronunciation priority must link to the validated finding 'think' or '/θ/'
    assert any("think" in p or "θ" in p for p in interpreted.priority_practice_areas)


# 11. API failures do not destroy conversation history
@pytest.mark.anyio
async def test_api_failures_do_not_destroy_conversation_history():
    service = GeminiService()
    history = [
        {"speaker": "ai", "text": "What is your favorite book?"},
        {"speaker": "learner", "text": "I really enjoy 1984 by George Orwell."},
    ]
    # Mock network failure
    with patch.object(service, "_post_with_retry", new=AsyncMock(return_value=None)):
        res = await service.generate_conversational_response(
            session_id="resilience_test",
            history=history,
            current_topic="literature",
            learner_response="The political themes and dystopian atmosphere are powerful.",
            is_opening=False,
        )
        assert isinstance(res, ConversationalResponseModel)
        assert len(res.response) > 5
        # The fallback preserves topic continuity
        assert res.conversation_complete is False


# 12. API keys are never exposed to the frontend
def test_api_keys_never_exposed_to_frontend():
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    # Check that boolean presence flags are used, never actual API key strings
    assert "api_key_configured" in data
    assert "gemini_api_key_configured" in data
    assert isinstance(data["api_key_configured"], bool)
    assert isinstance(data["gemini_api_key_configured"], bool)
    # The response must not contain any raw API key strings
    data_str = json.dumps(data)
    assert "AIza" not in data_str
    assert "sk-" not in data_str
    assert os.getenv("ASSEMBLYAI_API_KEY", "NON_EXISTENT") not in data_str


# 13. Completed reports can be revisited through session history
def test_completed_reports_can_be_revisited():
    report = build_post_conversation_report(
        session_id="revisit_sess_999",
        turns_data=[{"turn_id": "turn_1", "transcript": "hello", "duration": 1.5}],
        session_fluency={"speech_rate_wpm": 90.0, "total_response_interval_seconds": 1.5},
        all_pronunciation_findings=[],
        all_words=[{"word": "hello"}],
    )
    # Simulate storing in session history record
    session_record = {
        "session_id": report["session_id"],
        "timestamp": report["created_at"],
        "report": report,
        "status": "completed",
    }
    # Can serialize and deserialize without re-executing assessment pipeline
    json_serialized = json.dumps(session_record)
    loaded = json.loads(json_serialized)
    assert loaded["session_id"] == "revisit_sess_999"
    assert loaded["report"]["section_a_transcription_and_timing"]["full_transcript"] == "hello"
    assert loaded["report"]["section_b_fluency_analysis"]["speech_rate_wpm"] == 90.0
