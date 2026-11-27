"""
Tests for Articula: AI English Conversation Companion
Validates the major project revision:
1. Articula acts as a supportive English conversation companion, NOT an examiner or scorer.
2. Modes supported: Natural Conversation, Gentle Guidance, Learning Support.
3. Conversation categories supported (Everyday, School, Work, Opinions, Storytelling, Situational).
4. Expression assistance endpoint (/conversation/express-assist) provides on-demand phrasing, alternatives, and vocabulary tips.
5. Conversation reflection endpoint (/conversation/reflect-session) generates supportive 5-section reflection with zero proficiency scores or PER.
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from gemini_service import (
    GeminiService,
    ConversationalResponseModel,
    ExpressionAssistResponseModel,
    ConversationReflectionModel,
)

client = TestClient(app)


@pytest.mark.anyio
async def test_companion_modes_and_categories():
    service = GeminiService()
    # Test everyday conversations opening
    res_everyday = await service.generate_conversational_response(
        session_id="test_comp_1",
        history=[],
        current_topic="everyday_conversations",
        is_opening=True,
        mode="natural",
    )
    assert isinstance(res_everyday, ConversationalResponseModel)
    assert res_everyday.intent == "opening"
    assert len(res_everyday.response) > 10

    # Test work and professional with gentle_guidance
    res_work = await service.generate_conversational_response(
        session_id="test_comp_2",
        history=[{"speaker": "ai", "text": "How was your day?"}],
        current_topic="work_and_professional",
        learner_response="I had a very difficult presentation with my manager.",
        is_opening=False,
        mode="gentle_guidance",
    )
    assert isinstance(res_work, ConversationalResponseModel)
    assert res_work.conversation_complete is False
    # No scoring in companion response
    assert not hasattr(res_work, "fluency_score")
    assert not hasattr(res_work, "phoneme_error_rate")


@pytest.mark.anyio
async def test_expression_assistance_service():
    service = GeminiService()

    # Test "how_else" assistance
    res_how_else = await service.generate_expression_assistance(
        assist_type="how_else",
        learner_input="I think it is very good",
        context="discussing favorite movies",
    )
    assert isinstance(res_how_else, ExpressionAssistResponseModel)
    assert len(res_how_else.natural_alternatives) >= 2
    assert len(res_how_else.useful_words) >= 1

    # Test "expand_answer" assistance
    res_expand = await service.generate_expression_assistance(
        assist_type="expand_answer",
        learner_input="I like coffee",
        context="morning routines",
    )
    assert isinstance(res_expand, ExpressionAssistResponseModel)
    assert len(res_expand.natural_alternatives) >= 2


@pytest.mark.anyio
async def test_conversation_reflection_service():
    service = GeminiService()
    sample_turns = [
        {"turn_id": "turn_1", "speaker": "ai", "text": "What do you like to do on weekends?"},
        {"turn_id": "turn_2", "speaker": "learner", "text": "I really enjoy hiking in the mountains with my friends."},
        {"turn_id": "turn_3", "speaker": "ai", "text": "That sounds refreshing! What is your favorite trail?"},
        {"turn_id": "turn_4", "speaker": "learner", "text": "There is a trail near the lake where the air is very crisp."},
    ]

    reflection = await service.generate_conversation_reflection(
        session_id="test_refl_1",
        turns=sample_turns,
        topic="everyday_conversations",
    )
    assert isinstance(reflection, ConversationReflectionModel)
    # Check 5 core sections
    assert len(reflection.conversation_summary) > 20
    assert len(reflection.topics_covered) > 0
    assert len(reflection.useful_expressions) >= 1
    assert len(reflection.thought_development) >= 1
    assert len(reflection.further_practice_topics) >= 1
    assert len(reflection.personal_reflection_prompts) >= 1

    # Absolute verification: NO scores, NO grades, NO PER
    data_dict = reflection.model_dump()
    assert "score" not in data_dict
    assert "grade" not in data_dict
    assert "per" not in data_dict
    assert "phoneme_error_rate" not in data_dict


def test_expression_assist_endpoint():
    payload = {
        "assist_type": "how_else",
        "learner_input": "I am agree with you",
        "context": "opinions_and_discussions",
    }
    resp = client.post("/conversation/express-assist", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["assist_type"] == "how_else"
    assert "primary_suggestion" in data
    assert len(data["natural_alternatives"]) >= 2


def test_reflect_session_endpoint():
    payload = {
        "session_id": "endpoint_sess_1",
        "topic": "school_and_academic",
        "turns": [
            {"turn_id": "turn_1", "speaker": "ai", "text": "What are you studying?"},
            {"turn_id": "turn_2", "speaker": "learner", "text": "I am studying computer science and preparing for exams."},
        ],
    }
    resp = client.post("/conversation/reflect-session", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "reflection" in data
    refl = data["reflection"]
    assert "conversation_summary" in refl
    assert "useful_expressions" in refl
    assert "thought_development" in refl
    assert "further_practice_topics" in refl
    assert "personal_reflection_prompts" in refl
