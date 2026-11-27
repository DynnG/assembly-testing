"""
Articula Gemini 3.5 Flash-Lite Service
Secure backend-only service for AI English Conversation Companion and Post-Conversation Reflection.

Model: gemini-3.5-flash-lite
Brand Identity: "Articula: Your Space to Speak, Express, and Grow."
Philosophy: "English is not just something you study. It is something you practice by using it."

Responsibilities:
1. Conversational Companion: Natural, encouraging, context-aware dialogue partner across conversation categories and modes.
2. English Expression Assistance: On-demand contextual phrasing, vocabulary, and sentence expansion.
3. Conversation Reflection: Supportive summary, useful expressions, thought development highlights, and personal reflection prompts.

Articula is NOT an English proficiency examiner, pronunciation evaluator, or fluency scoring system.
It provides a judgment-free environment to practice expressing thoughts, opinions, and experiences.
"""

import os
import json
import asyncio
import logging
from typing import Any, Dict, List, Optional
import httpx
from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger("articula.gemini")

DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


# ============================================================================
# Schemas for Conversational Companion
# ============================================================================

class ConversationalResponseModel(BaseModel):
    """Schema for conversational companion turn responses."""
    response: str = Field(..., description="The next conversational response and follow-up question")
    intent: str = Field(
        "follow_up",
        description="Conversational intent: opening, follow_up, clarification, topic_shift, or conclusion"
    )
    topic: str = Field("everyday_conversations", description="Current conversation topic")
    conversation_complete: bool = Field(False, description="Whether the conversation has reached a natural conclusion")
    expression_tip: Optional[str] = Field(
        None,
        description="Optional gentle vocabulary or phrasing suggestion when appropriate"
    )


# ============================================================================
# Schemas for Expression Assistance
# ============================================================================

class ExpressionAssistRequestModel(BaseModel):
    """Request for on-demand language and expression support."""
    assist_type: str = Field(
        ...,
        description="Type of help: 'help_express', 'how_else', 'explain_word', 'expand_answer', 'give_example'"
    )
    learner_input: str = Field(..., description="The idea, phrase, or word the learner wants help with")
    context: Optional[str] = Field(None, description="Current discussion context or topic")


class ExpressionAssistResponseModel(BaseModel):
    """Response containing encouraging phrasing and vocabulary support."""
    assist_type: str
    original_input: str
    primary_suggestion: str = Field(..., description="Clear, supportive guidance or phrasing")
    natural_alternatives: List[str] = Field(
        default_factory=list,
        description="2-3 natural ways to express the idea (e.g. casual, polite, idiom)"
    )
    useful_words: List[str] = Field(
        default_factory=list,
        description="Helpful vocabulary or idioms related to the topic"
    )
    example_usage: Optional[str] = Field(
        None,
        description="Example of how to use it in a real conversation"
    )


# ============================================================================
# Schemas for Post-Conversation Reflection (Replaces Pronunciation Scoring)
# ============================================================================

class UsefulExpressionItem(BaseModel):
    """An expression or vocabulary item to take away from the conversation."""
    phrase: str = Field(..., description="The expression or phrase")
    natural_alternative: Optional[str] = Field(None, description="A natural or idiomatic way to say it")
    context_note: str = Field(..., description="When and how to use it naturally")
    example_sentence: str = Field(..., description="Example in conversation")


class ThoughtDevelopmentHighlight(BaseModel):
    """Highlights where the learner expressed ideas or opinions well."""
    point_expressed: str = Field(..., description="The interesting idea or thought shared by the learner")
    why_it_stood_out: str = Field(..., description="Why this was engaging or clear communication")


class ConversationReflectionModel(BaseModel):
    """
    Supportive, judgment-free reflection on the learner's speaking session.
    No numerical proficiency scores, no phoneme error rates, no grading.
    """
    conversation_summary: str = Field(
        ...,
        description="Overview of the topics discussed and the thoughts/ideas shared"
    )
    topics_covered: List[str] = Field(
        default_factory=list,
        description="List of main topics or themes explored during the dialogue"
    )
    useful_expressions: List[UsefulExpressionItem] = Field(
        default_factory=list,
        description="Useful expressions, natural alternatives, and new vocabulary from the conversation"
    )
    thought_development: List[ThoughtDevelopmentHighlight] = Field(
        default_factory=list,
        description="Celebration of ideas, opinions, and perspectives clearly communicated"
    )
    further_practice_topics: List[str] = Field(
        default_factory=list,
        description="Engaging topics and follow-up questions to try in the next conversation"
    )
    personal_reflection_prompts: List[str] = Field(
        default_factory=list,
        description="Encouraging questions for the learner to reflect on how they felt expressing themselves"
    )


# ============================================================================
# Legacy Schema for Technical Compatibility with Benchmark Test Suites
# ============================================================================

class PronunciationFeedbackItem(BaseModel):
    """Learner-friendly observation linked to a validated finding."""
    word: str
    target_sound: str
    observed_sound: str
    layman_explanation: str
    practice_words: List[str] = Field(default_factory=list)


class PostAssessmentInterpretationModel(BaseModel):
    """Legacy schema preserved for technical backend test suites."""
    overall_recording_assessment: str
    asr_transcription_and_reliability: str
    fluency_measurements_summary: str
    evidence_supported_fluency_observations: List[str] = Field(default_factory=list)
    selected_pronunciation_observations: List[PronunciationFeedbackItem] = Field(default_factory=list)
    recording_quality_and_limitations: List[str] = Field(default_factory=list)
    evidence_supported_strengths: List[str] = Field(default_factory=list)
    priority_practice_areas: List[str] = Field(default_factory=list)
    actionable_recommendations: List[str] = Field(default_factory=list)


# ============================================================================
# Gemini Service Implementation
# ============================================================================

class GeminiService:
    """
    Reusable Gemini 3.5 Flash-Lite service for Articula: AI English Conversation Companion.
    Provides conversational dialogue, on-demand expression assistance, and conversation reflections.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout_seconds: float = 15.0,
        max_retries: int = 2,
    ):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or ""
        self.model = model or os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    def is_configured(self) -> bool:
        """Returns True if a valid API key is present."""
        return bool(self.api_key and self.api_key.strip())

    async def _post_with_retry(self, endpoint_url: str, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Executes HTTP POST to Gemini API with exponential backoff on transient errors."""
        if not self.is_configured():
            logger.warning("Gemini API key is not configured; skipping remote call.")
            return None

        delay = 1.0
        for attempt in range(self.max_retries + 1):
            try:
                async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                    response = await client.post(
                        endpoint_url,
                        json=payload,
                        headers={"Content-Type": "application/json"},
                    )

                    if response.status_code == 200:
                        return response.json()

                    if response.status_code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                        logger.warning(
                            f"Gemini API returned {response.status_code}. Retrying in {delay}s (attempt {attempt + 1}/{self.max_retries})..."
                        )
                        await asyncio.sleep(delay)
                        delay *= 2.0
                        continue

                    logger.error(f"Gemini API returned unhandled status {response.status_code}: {response.text[:200]}")
                    return None

            except (httpx.TimeoutException, httpx.NetworkError) as err:
                if attempt < self.max_retries:
                    logger.warning(
                        f"Gemini connection error: {err}. Retrying in {delay}s (attempt {attempt + 1}/{self.max_retries})..."
                    )
                    await asyncio.sleep(delay)
                    delay *= 2.0
                    continue
                logger.error(f"Gemini API connection failed after {self.max_retries + 1} attempts: {err}")
                return None
            except Exception as exc:
                logger.error(f"Unexpected error communicating with Gemini API: {exc}")
                return None

        return None

    # ========================================================================
    # 1. Conversational AI Companion
    # ========================================================================

    async def generate_conversational_response(
        self,
        session_id: str,
        history: List[Dict[str, str]],
        current_topic: str = "everyday_conversations",
        learner_response: Optional[str] = None,
        is_opening: bool = False,
        mode: str = "natural",
    ) -> ConversationalResponseModel:
        """
        Generates contextual conversational responses and natural follow-up questions.
        Modes:
        - 'natural': authentic peer conversation with thoughtful curiosity.
        - 'gentle_guidance': slightly simpler language, models natural phrasing.
        - 'learning_support': offers extra sentence scaffolding and encouragement.
        """
        system_instruction = (
            "You are Articula, a friendly, encouraging, and supportive English conversation companion.\n"
            "Motto: 'Articula: Your Space to Speak, Express, and Grow.'\n"
            "Philosophy: 'English is not just something you study. It is something you practice by using it.'\n\n"
            "YOUR PURPOSE:\n"
            "Provide learners with an accessible, judgment-free environment to practice expressing their thoughts, "
            "ideas, opinions, and experiences in English. You are someone to talk to in English.\n\n"
            "CORE BEHAVIORS:\n"
            "1. Initiate with a warm, open-ended question or respond naturally to what the learner shared.\n"
            "2. Listen actively to the learner's ideas. Acknowledge what they said before following up.\n"
            "3. Ask ONE clear, engaging follow-up question per turn to help them expand their thoughts.\n"
            "4. NEVER ask multiple unrelated questions in one turn.\n"
            "5. Encourage expressing thoughts over grammatical perfection.\n"
            "6. STRICT PRODUCT RULE: NEVER give numerical scores, proficiency ratings, CEFR levels, or pronunciation grades.\n"
            "7. If the learner struggles or gives a short response, encourage them gently without pressure.\n"
            f"8. Active Mode: '{mode}'. If 'gentle_guidance', gently model natural phrasing. If 'learning_support', offer helpful sentence starters.\n"
            "9. Conclude the conversation gracefully when the learner says goodbye or after 5-7 meaningful turns.\n"
            "10. Return valid JSON only, matching the exact schema."
        )

        user_content = {
            "session_id": session_id,
            "current_topic": current_topic,
            "mode": mode,
            "is_opening": is_opening,
            "conversation_history": history[-6:] if history else [],
            "learner_latest_response": learner_response or "",
        }

        prompt = (
            f"Context:\n{json.dumps(user_content, indent=2)}\n\n"
            "Respond as the conversational companion. Produce JSON matching this schema:\n"
            "{\n"
            '  "response": "Your natural conversational response and follow-up question",\n'
            '  "intent": "opening | follow_up | clarification | topic_shift | conclusion",\n'
            '  "topic": "current or newly introduced topic",\n'
            '  "conversation_complete": false,\n'
            '  "expression_tip": "Optional brief phrasing or vocabulary tip, or null"\n'
            "}"
        )

        if self.is_configured():
            url = f"{GEMINI_API_BASE}/{self.model}:generateContent?key={self.api_key.strip()}"
            body = {
                "contents": [
                    {"parts": [{"text": f"{system_instruction}\n\n{prompt}"}]}
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.45,
                },
            }

            raw_res = await self._post_with_retry(url, body)
            if raw_res:
                try:
                    candidates = raw_res.get("candidates", [])
                    if candidates:
                        text_val = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        parsed_json = json.loads(text_val)
                        return ConversationalResponseModel(**parsed_json)
                except (json.JSONDecodeError, ValidationError) as parse_err:
                    logger.warning(f"Gemini conversational response parsing failed: {parse_err}")

        # Deterministic fallback companion
        return self._generate_fallback_conversational_response(
            history=history,
            learner_response=learner_response,
            current_topic=current_topic,
            is_opening=is_opening,
            mode=mode,
        )

    def _generate_fallback_conversational_response(
        self,
        history: List[Dict[str, str]],
        learner_response: Optional[str],
        current_topic: str,
        is_opening: bool,
        mode: str = "natural",
    ) -> ConversationalResponseModel:
        """Deterministic conversational fallback providing an engaging, supportive flow."""
        turn_count = len(history)

        if is_opening or turn_count == 0:
            topic_openings = {
                "everyday_conversations": "Hello! It is wonderful to chat with you today. To get us started, what is something you did today or over the weekend that you really enjoyed?",
                "school_and_academic": "Hi there! Welcome. What subjects or topics have you been studying or finding interesting recently?",
                "work_and_professional": "Hello! Welcome to our session. How has your week at work or your current projects been going?",
                "opinions_and_discussions": "Hi! Great to connect with you. If you could share your opinion on any modern trend or technology, what would you choose to talk about?",
                "storytelling_and_experiences": "Hello! It is great to meet you. What is a memorable trip, experience, or funny story you would love to tell me about?",
                "situational_practice": "Hello! Let us practice a real-life situation. Imagine you are at a cozy cafe ordering your favorite drink—what would you like to order today?",
            }
            opening_text = topic_openings.get(
                current_topic,
                "Hello! It is great to talk with you. To start our conversation, what is a hobby or interest you love spending time on?"
            )
            return ConversationalResponseModel(
                response=opening_text,
                intent="opening",
                topic=current_topic,
                conversation_complete=False,
            )

        resp_clean = (learner_response or "").strip().lower()

        # Graceful recovery for short or unclear input
        if not resp_clean or len(resp_clean) < 3:
            return ConversationalResponseModel(
                response="I did not catch all of that clearly, but I would love to hear more! Could you tell me a little bit more about what you had in mind?",
                intent="clarification",
                topic=current_topic,
                conversation_complete=False,
            )

        # Contextual triggers
        if any(w in resp_clean for w in ["music", "song", "play", "listen", "guitar", "piano", "band"]):
            return ConversationalResponseModel(
                response="Music is such a wonderful way to express yourself! What kind of music or artists inspire you most when you want to relax?",
                intent="follow_up",
                topic="music_and_interests",
                conversation_complete=False,
            )
        elif any(w in resp_clean for w in ["work", "job", "career", "office", "project", "meeting", "team"]):
            return ConversationalResponseModel(
                response="That sounds like a meaningful project. When you collaborate with others or tackle a big challenge, what helps you communicate best?",
                intent="follow_up",
                topic="work_and_professional",
                conversation_complete=False,
            )
        elif any(w in resp_clean for w in ["travel", "trip", "visit", "country", "city", "place", "vacation"]):
            return ConversationalResponseModel(
                response="Traveling always gives us unforgettable memories! What was one moment or place from that trip that stayed with you the most?",
                intent="follow_up",
                topic="storytelling_and_experiences",
                conversation_complete=False,
            )
        elif any(w in resp_clean for w in ["food", "cook", "eat", "restaurant", "dinner", "coffee", "dish"]):
            return ConversationalResponseModel(
                response="That sounds delicious! Do you enjoy trying new recipes at home, or do you prefer finding local spots with friends?",
                intent="follow_up",
                topic="everyday_conversations",
                conversation_complete=False,
            )

        # Conclude if learner indicates ending
        if any(w in resp_clean for w in ["goodbye", "bye", "see you", "have to go", "thank you that is all", "wrap up"]):
            return ConversationalResponseModel(
                response="It was truly a pleasure chatting with you today! You expressed your thoughts wonderfully. Whenever you would like to practice again, I will be here. Have a fantastic day!",
                intent="conclusion",
                topic=current_topic,
                conversation_complete=True,
            )

        if turn_count >= 6:
            return ConversationalResponseModel(
                response="Thank you for sharing your thoughts with me! We have explored so many interesting ideas today. How did you feel about expressing your ideas in English today?",
                intent="conclusion",
                topic=current_topic,
                conversation_complete=True,
            )

        return ConversationalResponseModel(
            response="That is really interesting! What made you see it that way, and how does that influence your perspective?",
            intent="follow_up",
            topic=current_topic,
            conversation_complete=False,
        )

    # ========================================================================
    # 2. English Expression Assistance (On-Demand Support)
    # ========================================================================

    async def generate_expression_assistance(
        self,
        assist_type: str,
        learner_input: str,
        context: Optional[str] = None,
    ) -> ExpressionAssistResponseModel:
        """
        Provides on-demand expression support for learners:
        - 'help_express': Help framing an idea naturally.
        - 'how_else': Alternative ways to say something (casual, polite, native).
        - 'explain_word': Meaning, nuance, and conversational examples.
        - 'expand_answer': Guided ideas and sentence structures to elaborate.
        - 'give_example': Conversational dialogue examples.
        """
        system_instruction = (
            "You are Articula's Language & Expression Assistant.\n"
            "Your mission is to help English learners find the right words, express their thoughts smoothly, "
            "and discover natural, conversational phrasing in a supportive, friendly way.\n"
            "Rules:\n"
            "1. Give encouraging, practical phrasing that sounds natural in real conversation.\n"
            "2. Offer 2-3 distinct alternatives (e.g. casual everyday, polite/professional, idiomatic).\n"
            "3. Include a short example sentence.\n"
            "4. NEVER judge or criticize grammar. Celebrate their effort to communicate.\n"
            "5. Return valid JSON only, matching the exact schema."
        )

        user_content = {
            "assist_type": assist_type,
            "learner_input": learner_input,
            "context": context or "general conversation",
        }

        prompt = (
            f"Input:\n{json.dumps(user_content, indent=2)}\n\n"
            "Generate expression assistance in this JSON format:\n"
            "{\n"
            '  "assist_type": "help_express | how_else | explain_word | expand_answer | give_example",\n'
            f'  "original_input": {json.dumps(learner_input)},\n'
            '  "primary_suggestion": "Direct, supportive advice or natural way to say it",\n'
            '  "natural_alternatives": ["Alternative 1 (casual)", "Alternative 2 (clear/polite)", "Alternative 3 (idiomatic)"],\n'
            '  "useful_words": ["useful word 1", "useful word 2"],\n'
            '  "example_usage": "Example of this in a sentence or dialogue"\n'
            "}"
        )

        if self.is_configured():
            url = f"{GEMINI_API_BASE}/{self.model}:generateContent?key={self.api_key.strip()}"
            body = {
                "contents": [
                    {"parts": [{"text": f"{system_instruction}\n\n{prompt}"}]}
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.3,
                },
            }

            raw_res = await self._post_with_retry(url, body)
            if raw_res:
                try:
                    candidates = raw_res.get("candidates", [])
                    if candidates:
                        text_val = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        parsed_json = json.loads(text_val)
                        return ExpressionAssistResponseModel(**parsed_json)
                except (json.JSONDecodeError, ValidationError) as parse_err:
                    logger.warning(f"Gemini expression assist parsing failed: {parse_err}")

        # Deterministic fallback
        return self._generate_fallback_expression_assistance(assist_type, learner_input, context)

    def _generate_fallback_expression_assistance(
        self,
        assist_type: str,
        learner_input: str,
        context: Optional[str],
    ) -> ExpressionAssistResponseModel:
        """Deterministic helper when Gemini is offline."""
        inp = learner_input.strip()

        if assist_type == "how_else":
            return ExpressionAssistResponseModel(
                assist_type=assist_type,
                original_input=inp,
                primary_suggestion=f"Here are natural ways to express '{inp}' depending on the situation:",
                natural_alternatives=[
                    f"Casual: 'I’d say {inp}.'",
                    f"Clear & polite: 'From my perspective, {inp}.'",
                    f"Conversational: 'The way I see it, {inp}.'",
                ],
                useful_words=["in my opinion", "from my experience", "to be honest"],
                example_usage=f"In a conversation, you could say: 'To be honest, {inp}.'",
            )
        elif assist_type == "explain_word":
            return ExpressionAssistResponseModel(
                assist_type=assist_type,
                original_input=inp,
                primary_suggestion=f"'{inp}' is commonly used in English conversations to express a specific nuance.",
                natural_alternatives=[
                    f"Simpler synonym: 'essentially {inp}'",
                    f"Everyday phrasing: 'what I mean by {inp} is...'",
                ],
                useful_words=["in terms of", "specifically", "for instance"],
                example_usage=f"Example: 'I really value {inp} when discussing new ideas.'",
            )
        elif assist_type == "expand_answer":
            return ExpressionAssistResponseModel(
                assist_type=assist_type,
                original_input=inp,
                primary_suggestion="To expand your answer naturally, try adding a personal reason or a quick story!",
                natural_alternatives=[
                    f"Add reason: '{inp}, mostly because it helps me stay inspired.'",
                    f"Add example: '{inp}. For example, just yesterday I noticed that...'",
                    f"Add feeling: '{inp}, and it made me realize how important that is.'",
                ],
                useful_words=["for instance", "mainly because", "what made me realize this"],
                example_usage=f"Try this structure: '{inp}, because it gives me a fresh perspective.'",
            )
        else:  # help_express or default
            return ExpressionAssistResponseModel(
                assist_type=assist_type,
                original_input=inp,
                primary_suggestion=f"You can express this clearly by focusing on your main thought: '{inp}'.",
                natural_alternatives=[
                    f"Natural: 'What I mean is, {inp}.'",
                    f"Smooth: 'I feel that {inp}.'",
                    f"Expressive: 'If I had to describe it, {inp}.'",
                ],
                useful_words=["what I mean is", "it feels like", "to put it simply"],
                example_usage=f"Example: 'What I mean is, {inp}, and that really matters to me.'",
            )

    # ========================================================================
    # 3. Post-Conversation Reflection (Replaces Pronunciation Scoring)
    # ========================================================================

    async def generate_conversation_reflection(
        self,
        session_id: str,
        turns: List[Dict[str, Any]],
        topic: str = "everyday_conversations",
    ) -> ConversationReflectionModel:
        """
        Generates a supportive post-conversation reflection focused on expression,
        ideas shared, useful vocabulary, and encouragement.
        Strict rule: NO numerical scores, NO CEFR levels, NO phoneme error rates.
        """
        system_instruction = (
            "You are Articula's Conversation Reflection Guide.\n"
            "Mission: Help English learners reflect on their conversation with pride and curiosity.\n\n"
            "CRITICAL PRODUCT PHILOSOPHY:\n"
            "- Articula is NOT an exam, test, or proficiency evaluator.\n"
            "- DO NOT assign grades, CEFR levels, percentage scores, or phoneme error counts.\n"
            "- The goal is to celebrate communication, thought expression, and discovering natural English phrasing.\n\n"
            "GENERATE 5 SUPPORTIVE REFLECTION SECTIONS:\n"
            "1. conversation_summary: Warm, narrative summary of what the learner discussed, their thoughts, and their perspective.\n"
            "2. topics_covered: List of topics touched upon.\n"
            "3. useful_expressions: 3-5 practical expressions, natural alternatives to how they phrased things, and useful vocabulary with example sentences.\n"
            "4. thought_development: 2-3 specific moments where the learner expressed an interesting thought, opinion, or experience well.\n"
            "5. further_practice_topics: 2-3 engaging follow-up topics/questions for their next conversation.\n"
            "6. personal_reflection_prompts: 2-3 encouraging questions for the learner to reflect on how comfortable they felt speaking.\n"
            "Return valid JSON only matching the schema."
        )

        conversation_data = {
            "session_id": session_id,
            "topic": topic,
            "turn_count": len(turns),
            "transcript_turns": [
                {
                    "turn_id": t.get("turn_id"),
                    "speaker": t.get("speaker", "learner"),
                    "text": t.get("transcript") or t.get("text", ""),
                }
                for t in turns
            ],
        }

        prompt = (
            f"Conversation Transcript:\n{json.dumps(conversation_data, indent=2)}\n\n"
            "Generate the supportive Conversation Reflection matching this JSON schema:\n"
            "{\n"
            '  "conversation_summary": "Encouraging narrative summary of the thoughts and ideas discussed",\n'
            '  "topics_covered": ["Topic 1", "Topic 2"],\n'
            '  "useful_expressions": [\n'
            '    {\n'
            '      "phrase": "Phrase or word from or for the conversation",\n'
            '      "natural_alternative": "Natural or conversational alternative",\n'
            '      "context_note": "Explanation of when to use it",\n'
            '      "example_sentence": "Conversational example"\n'
            '    }\n'
            '  ],\n'
            '  "thought_development": [\n'
            '    {\n'
            '      "point_expressed": "Point the learner made",\n'
            '      "why_it_stood_out": "Why this was great expression or communication"\n'
            '    }\n'
            '  ],\n'
            '  "further_practice_topics": ["Suggested topic 1", "Suggested topic 2"],\n'
            '  "personal_reflection_prompts": ["Reflection question 1", "Reflection question 2"]\n'
            "}"
        )

        if self.is_configured():
            url = f"{GEMINI_API_BASE}/{self.model}:generateContent?key={self.api_key.strip()}"
            body = {
                "contents": [
                    {"parts": [{"text": f"{system_instruction}\n\n{prompt}"}]}
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.35,
                },
            }

            raw_res = await self._post_with_retry(url, body)
            if raw_res:
                try:
                    candidates = raw_res.get("candidates", [])
                    if candidates:
                        text_val = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        parsed_json = json.loads(text_val)
                        return ConversationReflectionModel(**parsed_json)
                except (json.JSONDecodeError, ValidationError) as parse_err:
                    logger.warning(f"Gemini conversation reflection parsing failed: {parse_err}")

        # Deterministic fallback reflection
        return self._generate_fallback_conversation_reflection(session_id, turns, topic)

    def _generate_fallback_conversation_reflection(
        self,
        session_id: str,
        turns: List[Dict[str, Any]],
        topic: str,
    ) -> ConversationReflectionModel:
        """Deterministic reflection generator celebrating the learner's conversational effort."""
        learner_texts = [
            t.get("transcript") or t.get("text", "")
            for t in turns
            if t.get("speaker") in ("learner", None) and (t.get("transcript") or t.get("text"))
        ]
        total_words = sum(len(txt.split()) for txt in learner_texts)
        turn_count = len(learner_texts) or len(turns)

        combined_text = " ".join(learner_texts).lower()

        summary = (
            f"In this session, you engaged in {turn_count} conversational turns focusing on {topic.replace('_', ' ')}. "
            f"You shared thoughts totaling approximately {total_words} words, exploring your perspectives and connecting ideas. "
            "Every conversation helps you build comfort and discover new ways to express who you are in English."
        )

        useful_expressions = [
            UsefulExpressionItem(
                phrase="From my point of view...",
                natural_alternative="The way I see it...",
                context_note="Great for sharing a personal thought or opinion smoothly.",
                example_sentence="The way I see it, practicing speaking every day makes a huge difference."
            ),
            UsefulExpressionItem(
                phrase="I really like...",
                natural_alternative="I'm really into...",
                context_note="A natural, conversational idiom for talking about hobbies and interests.",
                example_sentence="Lately, I've been really into discovering new music and reading."
            ),
            UsefulExpressionItem(
                phrase="It is hard to say...",
                natural_alternative="That's a good question, I'd say...",
                context_note="Buys you a moment to think while keeping the conversational flow smooth.",
                example_sentence="That's a good question—I'd say my favorite memory was traveling with friends."
            ),
        ]

        thought_highlights = [
            ThoughtDevelopmentHighlight(
                point_expressed=f"Sharing your thoughts across {turn_count} spoken turns.",
                why_it_stood_out="You maintained the flow of dialogue and communicated your ideas without giving up when searching for words."
            ),
            ThoughtDevelopmentHighlight(
                point_expressed="Elaborating on your personal experiences and interests.",
                why_it_stood_out="Giving specific details helps the listener connect with your story and makes your English feel authentic."
            ),
        ]

        practice_topics = [
            f"Dive deeper into a favorite experience or project related to {topic.replace('_', ' ')}.",
            "Try describing an obstacle you overcame and what you learned from it.",
            "Practice explaining a hobby or passion to someone who has never heard of it.",
        ]

        reflection_prompts = [
            "How did you feel about finding words to express your ideas today?",
            "Was there a moment during our conversation where you felt especially confident?",
            "What is one new phrase or expression you would like to try in our next chat?",
        ]

        return ConversationReflectionModel(
            conversation_summary=summary,
            topics_covered=[topic.replace("_", " ").title(), "Personal Perspectives", "Real-time Expression"],
            useful_expressions=useful_expressions,
            thought_development=thought_highlights,
            further_practice_topics=practice_topics,
            personal_reflection_prompts=reflection_prompts,
        )

    # ========================================================================
    # 4. Legacy Assessment Interpretation (Preserved for Benchmark Tests)
    # ========================================================================

    async def interpret_assessment_results(
        self,
        structured_evidence: Dict[str, Any],
    ) -> PostAssessmentInterpretationModel:
        """Legacy method preserved for technical benchmark suites."""
        return self._generate_fallback_assessment_interpretation(structured_evidence)

    def _generate_fallback_assessment_interpretation(
        self,
        evidence: Dict[str, Any],
    ) -> PostAssessmentInterpretationModel:
        """Deterministic generator for benchmark testing backwards compatibility."""
        transcription_info = evidence.get("transcription_info", {})
        turn_count = transcription_info.get("turn_count", 0)
        asr_conf = transcription_info.get("asr_average_confidence")

        fluency = evidence.get("fluency_measures", {})
        wpm = fluency.get("speech_rate_wpm")
        mean_pause = fluency.get("mean_silent_pause_duration_seconds")
        rep_rate = fluency.get("repetition_rate_percent")
        duration_s = fluency.get("total_response_interval_seconds", 0.0)

        validated_findings = evidence.get("validated_pronunciation_observations", [])
        conf_str = f"{int(asr_conf * 100)}%" if asr_conf is not None else "normal"

        overall_assessment = (
            f"You completed {turn_count} conversational speaking turn(s) with a total active response time of "
            f"{duration_s:.1f} seconds."
        )

        asr_reliability = (
            f"Speech recognition transcribed {transcription_info.get('total_recognized_words', 0)} words with an "
            f"average decoding certainty of {conf_str}."
        )

        wpm_str = f"{wpm:.1f} WPM" if wpm is not None else "N/A"
        mean_pause_str = f"{mean_pause:.2f}s" if mean_pause is not None else "N/A"
        rep_str = f"{rep_rate:.1f}%" if rep_rate is not None else "0.0%"
        fluency_summary = (
            f"Your conversational speaking rate was {wpm_str}. Silent pauses averaged {mean_pause_str} each, "
            f"and word repetition was measured at {rep_str}."
        )

        pron_obs: List[PronunciationFeedbackItem] = []
        for vf in validated_findings:
            pron_obs.append(
                PronunciationFeedbackItem(
                    word=vf.get("word", ""),
                    target_sound=vf.get("expected_phoneme", ""),
                    observed_sound=vf.get("observed_phonetic_evidence", ""),
                    layman_explanation=vf.get("recommendation", "Acoustic variation observed."),
                    practice_words=vf.get("practice_words", [vf.get("word", "")])[:4],
                )
            )

        priorities = []
        if pron_obs:
            for item in pron_obs[:2]:
                priorities.append(f"Refine articulation of /{item.target_sound}/ in words such as '{item.word}'.")
        else:
            priorities.append("Continue everyday conversational practice.")

        recommendations = []
        if pron_obs:
            for item in pron_obs[:2]:
                if item.practice_words:
                    recommendations.append(f"Practice target sound /{item.target_sound}/ with word pairs: {', '.join(item.practice_words)}.")
        if not recommendations:
            recommendations.append("Practice speaking naturally on topics you enjoy.")

        return PostAssessmentInterpretationModel(
            overall_recording_assessment=overall_assessment,
            asr_transcription_and_reliability=asr_reliability,
            fluency_measurements_summary=fluency_summary,
            evidence_supported_fluency_observations=[f"Speech rate: {wpm_str}"],
            selected_pronunciation_observations=pron_obs,
            recording_quality_and_limitations=["Objective acoustic evidence only."],
            evidence_supported_strengths=["Maintained dialogue across turns."],
            priority_practice_areas=priorities,
            actionable_recommendations=recommendations,
        )
