"""
Articula Gemini 3.5 Flash-Lite Service
Secure backend-only service for Conversational AI and Assessment Interpretation.

Model: gemini-3.5-flash-lite
Responsibilities:
1. Conversational AI: Natural, contextual dialogue partner during practice.
2. Assessment Interpretation: Explains validated structured post-conversation results.
These two responsibilities are strictly decoupled and never combined into one uncontrolled workflow.
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


class ConversationalResponseModel(BaseModel):
    """Schema for conversational AI turn responses."""
    response: str = Field(..., description="The next conversational response and follow-up question")
    intent: str = Field(
        "follow_up",
        description="Conversational intent: opening, follow_up, clarification, topic_shift, or conclusion"
    )
    topic: str = Field("general", description="Current conversation topic")
    conversation_complete: bool = Field(False, description="Whether the conversation has reached a natural conclusion")


class PronunciationFeedbackItem(BaseModel):
    """Learner-friendly observation linked to a validated finding."""
    word: str
    target_sound: str
    observed_sound: str
    layman_explanation: str
    practice_words: List[str] = Field(default_factory=list)


class PostAssessmentInterpretationModel(BaseModel):
    """Schema for post-conversation formative feedback interpretation."""
    overall_recording_assessment: str = Field(..., description="Objective synthesis of the speaking session")
    asr_transcription_and_reliability: str = Field(..., description="Transcription overview with ASR reliability notes")
    fluency_measurements_summary: str = Field(..., description="Interpretation of the 4 defined fluency metrics")
    evidence_supported_fluency_observations: List[str] = Field(
        default_factory=list,
        description="Specific fluency observations grounded in timing data"
    )
    selected_pronunciation_observations: List[PronunciationFeedbackItem] = Field(
        default_factory=list,
        description="Validated pronunciation observations with accessible explanations"
    )
    recording_quality_and_limitations: List[str] = Field(
        default_factory=list,
        description="Acoustic and technical limitations of the recording"
    )
    evidence_supported_strengths: List[str] = Field(
        default_factory=list,
        description="Observed speaking strengths supported by data"
    )
    priority_practice_areas: List[str] = Field(
        default_factory=list,
        description="Targeted areas for learner improvement"
    )
    actionable_recommendations: List[str] = Field(
        default_factory=list,
        description="Clear, practical exercises for future practice"
    )


class GeminiService:
    """
    Reusable Gemini 3.5 Flash-Lite service with timeout, retry, and validation policies.
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
        """
        Executes HTTP POST to Gemini API with exponential backoff on transient errors.
        """
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

                    # Handle retryable status codes
                    if response.status_code in (429, 500, 502, 503, 504) and attempt < self.max_retries:
                        logger.warning(
                            f"Gemini API returned status {response.status_code}. Retrying in {delay}s (attempt {attempt + 1}/{self.max_retries})..."
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
    # RESPONSIBILITY 1: Conversational AI
    # ========================================================================

    async def generate_conversational_response(
        self,
        session_id: str,
        history: List[Dict[str, str]],
        current_topic: str = "daily_life_and_interests",
        learner_response: Optional[str] = None,
        is_opening: bool = False,
    ) -> ConversationalResponseModel:
        """
        Generates contextual conversational responses and natural follow-up questions.

        Constraints:
        - Natural conversation flow, not a questionnaire.
        - Friendly, supportive personality.
        - Exactly ONE clear, engaging follow-up question per turn.
        - Never assign fluency or pronunciation scores.
        - Graceful recovery on missing or brief inputs.
        """
        system_instruction = (
            "You are a friendly, encouraging, and natural conversational English practice partner for Articula. "
            "Your role is to have an authentic, comfortable conversation with the learner to give them practice speaking.\n\n"
            "BEHAVIORAL RULES:\n"
            "1. Initiate with a friendly opening question or respond naturally to what the learner shared.\n"
            "2. Listen carefully to the learner's response and ask ONE relevant, engaging follow-up question.\n"
            "3. Encourage the learner to elaborate naturally without being pushy.\n"
            "4. Introduce related topics smoothly when appropriate.\n"
            "5. Never ask multiple unrelated questions in a single turn.\n"
            "6. Maintain an encouraging, warm, supportive tone.\n"
            "7. STRICT RULE: DO NOT assign any scores, grades, fluency numbers, or pronunciation assessments. "
            "Your sole focus is conversational engagement.\n"
            "8. If the conversation has covered 4-6 meaningful turns, you may naturally conclude the conversation.\n"
            "9. Return ONLY valid JSON matching the exact schema."
        )

        user_content = {
            "session_id": session_id,
            "current_topic": current_topic,
            "is_opening": is_opening,
            "conversation_history": history[-6:] if history else [],
            "learner_latest_response": learner_response or "",
        }

        prompt = (
            f"Context:\n{json.dumps(user_content, indent=2)}\n\n"
            "Respond as the conversational partner. Produce JSON matching this schema:\n"
            "{\n"
            '  "response": "Your natural conversational response and follow-up question",\n'
            '  "intent": "opening | follow_up | clarification | topic_shift | conclusion",\n'
            '  "topic": "current or newly introduced topic",\n'
            '  "conversation_complete": false\n'
            "}"
        )

        # Attempt Gemini call if configured
        if self.is_configured():
            url = f"{GEMINI_API_BASE}/{self.model}:generateContent?key={self.api_key.strip()}"
            body = {
                "contents": [
                    {"parts": [{"text": f"{system_instruction}\n\n{prompt}"}]}
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.4,
                },
            }

            raw_res = await self._post_with_retry(url, body)
            if raw_res:
                try:
                    candidates = raw_res.get("candidates", [])
                    if candidates:
                        text_val = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        parsed_json = json.loads(text_val)
                        validated = ConversationalResponseModel(**parsed_json)
                        return validated
                except (json.JSONDecodeError, ValidationError) as parse_err:
                    logger.warning(f"Gemini conversational response validation failed: {parse_err}")

        # Deterministic conversational fallback
        return self._generate_fallback_conversational_response(
            history=history,
            learner_response=learner_response,
            current_topic=current_topic,
            is_opening=is_opening,
        )

    def _generate_fallback_conversational_response(
        self,
        history: List[Dict[str, str]],
        learner_response: Optional[str],
        current_topic: str,
        is_opening: bool,
    ) -> ConversationalResponseModel:
        """
        Reliable rule-based conversational fallback when Gemini is offline or unconfigured.
        Ensures learner can practice uninterrupted with contextual questions.
        """
        turn_count = len(history)

        if is_opening or turn_count == 0:
            return ConversationalResponseModel(
                response="Hello! It is wonderful to speak with you today. To kick off our conversation, what is a hobby or activity you really enjoy doing during your free time?",
                intent="opening",
                topic="hobbies_and_passions",
                conversation_complete=False,
            )

        resp_clean = (learner_response or "").strip().lower()

        # Graceful recovery for empty or short audio transcription
        if not resp_clean or len(resp_clean) < 3:
            return ConversationalResponseModel(
                response="I did not quite catch all of that clearly, but I would love to hear more! Could you tell me a little bit more about what you were describing?",
                intent="clarification",
                topic=current_topic,
                conversation_complete=False,
            )

        # Contextual elaboration triggers
        if any(w in resp_clean for w in ["music", "song", "play", "listen", "guitar", "piano"]):
            return ConversationalResponseModel(
                response="Music is such a great way to unwind! What kind of music or artists do you find yourself listening to most often?",
                intent="follow_up",
                topic="music_and_relaxation",
                conversation_complete=False,
            )
        elif any(w in resp_clean for w in ["work", "job", "career", "office", "project", "boss"]):
            return ConversationalResponseModel(
                response="That sounds engaging. When you have a demanding project or busy day, what helps you stay focused and productive?",
                intent="follow_up",
                topic="workplace_and_goals",
                conversation_complete=False,
            )
        elif any(w in resp_clean for w in ["travel", "trip", "visit", "country", "city", "place"]):
            return ConversationalResponseModel(
                response="Traveling always gives us memorable stories! What is one place you have visited that left a strong impression on you?",
                intent="follow_up",
                topic="travel_and_culture",
                conversation_complete=False,
            )
        elif any(w in resp_clean for w in ["food", "cook", "eat", "restaurant", "dinner"]):
            return ConversationalResponseModel(
                response="That sounds delicious! Do you prefer cooking your own meals at home, or exploring new places to eat out?",
                intent="follow_up",
                topic="food_and_dining",
                conversation_complete=False,
            )

        if turn_count >= 6:
            return ConversationalResponseModel(
                response="Thank you for sharing your thoughts so openly! We have had a great conversation today. How do you feel about our discussion today?",
                intent="conclusion",
                topic=current_topic,
                conversation_complete=True,
            )

        return ConversationalResponseModel(
            response=f"That is really interesting! What made you choose that, and how does it fit into your everyday routine?",
            intent="follow_up",
            topic=current_topic,
            conversation_complete=False,
        )

    # ========================================================================
    # RESPONSIBILITY 2: Assessment Interpretation
    # ========================================================================

    async def interpret_assessment_results(
        self,
        structured_evidence: Dict[str, Any],
    ) -> PostAssessmentInterpretationModel:
        """
        Interprets validated structured assessment results and generates formative feedback.

        STRICT EVIDENCE RULES:
        Gemini must NEVER:
        - Invent measurements or phoneme predictions.
        - Treat AssemblyAI confidence as pronunciation accuracy.
        - Treat every phoneme mismatch as a confirmed error.
        - Convert unvalidated discrepancies into pronunciation problems.
        - Claim that a learner has good pronunciation without supporting evidence.
        - Assign an overall English proficiency score or CEFR level.
        - Evaluate grammar, vocabulary, task performance, or general communication.
        If evidence is insufficient, explicitly state that no reliable conclusion can be drawn.
        """
        system_instruction = (
            "You are an expert pedagogical speech-language interpreter for Articula. "
            "Your task is to interpret validated, structured speech assessment results and generate "
            "clear, educational, encouraging, and actionable post-conversation feedback for an English learner.\n\n"
            "STRICT EVIDENCE RULES (MUST OBEY AT ALL COSTS):\n"
            "1. NEVER invent or hallucinate measurements, phoneme predictions, or error counts.\n"
            "2. NEVER treat AssemblyAI confidence as pronunciation accuracy (it is only acoustic-lexical decoding certainty).\n"
            "3. NEVER treat unvalidated discrepancies or candidate differences as confirmed learner errors.\n"
            "4. NEVER evaluate grammar, vocabulary, task performance, or broad communication quality.\n"
            "5. NEVER assign an overall English proficiency score or CEFR level (e.g., A1-C2).\n"
            "6. NEVER generate generic praise that is unsupported by the actual measurements.\n"
            "7. If no pronunciation findings passed validation, explicitly state: 'There was insufficient evidence to identify a reliable pronunciation concern.'\n"
            "8. Every pronunciation recommendation MUST link to an actual validated finding in the input.\n"
            "9. Avoid excessive technical jargon; explain phonetic symbols in simple terms (e.g., '/θ/ as the 'th' sound in 'think').\n"
            "10. Return valid JSON only, matching the exact required schema."
        )

        prompt = (
            f"Structured Assessment Evidence:\n{json.dumps(structured_evidence, indent=2)}\n\n"
            "Generate formative post-conversation interpretation matching this JSON schema:\n"
            "{\n"
            '  "overall_recording_assessment": "Clear synthesis of the speaking session and recording length",\n'
            '  "asr_transcription_and_reliability": "Overview of spoken turns and ASR decoding reliability with explicit note on ASR limits",\n'
            '  "fluency_measurements_summary": "Friendly interpretation of Speech Rate (WPM), Silent-Pause Frequency, Mean Silent-Pause Duration, and Repetition Rate",\n'
            '  "evidence_supported_fluency_observations": ["specific observation 1", "specific observation 2"],\n'
            '  "selected_pronunciation_observations": [\n'
            '    {\n'
            '      "word": "target word",\n'
            '      "target_sound": "target phoneme",\n'
            '      "observed_sound": "observed acoustic sound",\n'
            '      "layman_explanation": "Simple explanation of mouth/tongue placement",\n'
            '      "practice_words": ["word1", "word2"]\n'
            '    }\n'
            '  ],\n'
            '  "recording_quality_and_limitations": ["technical limit 1", "technical limit 2"],\n'
            '  "evidence_supported_strengths": ["strength 1 grounded in data", "strength 2 grounded in data"],\n'
            '  "priority_practice_areas": ["priority 1", "priority 2"],\n'
            '  "actionable_recommendations": ["recommendation 1", "recommendation 2"]\n'
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
                    "temperature": 0.2,
                },
            }

            raw_res = await self._post_with_retry(url, body)
            if raw_res:
                try:
                    candidates = raw_res.get("candidates", [])
                    if candidates:
                        text_val = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        parsed_json = json.loads(text_val)
                        validated = PostAssessmentInterpretationModel(**parsed_json)
                        return validated
                except (json.JSONDecodeError, ValidationError) as parse_err:
                    logger.warning(f"Gemini post-assessment interpretation validation failed: {parse_err}")

        # Deterministic expert fallback
        return self._generate_fallback_assessment_interpretation(structured_evidence)

    def _generate_fallback_assessment_interpretation(
        self,
        evidence: Dict[str, Any],
    ) -> PostAssessmentInterpretationModel:
        """
        Deterministic expert phonetic rule-based generator.
        Guarantees rigorous evidence compliance even without an external LLM key.
        """
        transcription_info = evidence.get("transcription_info", {})
        full_transcript = transcription_info.get("full_transcript", "")
        turn_count = transcription_info.get("turn_count", 0)
        asr_conf = transcription_info.get("asr_average_confidence")

        fluency = evidence.get("fluency_measures", {})
        wpm = fluency.get("speech_rate_wpm")
        pause_freq = fluency.get("silent_pause_frequency")
        mean_pause = fluency.get("mean_silent_pause_duration_seconds")
        rep_rate = fluency.get("repetition_rate_percent")
        duration_s = fluency.get("total_response_interval_seconds", 0.0)

        validated_findings = evidence.get("validated_pronunciation_observations", [])
        quality_info = evidence.get("quality_and_limitations", {})
        insufficient_audio_count = quality_info.get("insufficient_audio_count", 0)
        unvalidated_count = quality_info.get("unvalidated_observations_count", 0)

        # 1. Overall recording assessment
        overall_assessment = (
            f"You completed {turn_count} conversational speaking turn(s) with a total active response time of "
            f"{duration_s:.1f} seconds. The session provided a rich speech sample for objective timing and phonetic analysis."
        )

        # 2. ASR transcription & reliability
        conf_str = f"{int(asr_conf * 100)}%" if asr_conf is not None else "normal"
        asr_reliability = (
            f"Speech recognition transcribed {transcription_info.get('total_recognized_words', 0)} words with an "
            f"average decoding certainty of {conf_str}. Note: ASR confidence reflects word recognition certainty, "
            f"not pronunciation accuracy."
        )

        # 3. Fluency summary
        wpm_str = f"{wpm:.1f} WPM" if wpm is not None else "N/A"
        mean_pause_str = f"{mean_pause:.2f}s" if mean_pause is not None else "N/A"
        rep_str = f"{rep_rate:.1f}%" if rep_rate is not None else "0.0%"
        fluency_summary = (
            f"Your conversational speaking rate was {wpm_str}. Silent pauses averaged {mean_pause_str} each, "
            f"and word repetition was measured at {rep_str}."
        )

        # 4. Fluency observations
        fluency_obs = []
        if wpm is not None:
            if wpm >= 110:
                fluency_obs.append(f"Speaking tempo ({wpm_str}) is within a natural conversational range.")
            elif wpm >= 80:
                fluency_obs.append(f"Speaking tempo ({wpm_str}) reflects deliberate, steady pacing.")
            else:
                fluency_obs.append(f"Pacing ({wpm_str}) shows thoughtful word selection with extended pauses.")

        if mean_pause is not None and mean_pause > 0:
            fluency_obs.append(f"Pauses averaged {mean_pause:.2f} seconds between phrases.")
        if rep_rate is not None:
            if rep_rate <= 5.0:
                fluency_obs.append(f"Low phrase repetition ({rep_str}) indicates cohesive thought progression.")
            else:
                fluency_obs.append(f"Repetitions ({rep_str}) reflect occasional real-time phrasing adjustments.")

        # 5. Selected pronunciation observations (Strictly validated only!)
        pron_obs: List[PronunciationFeedbackItem] = []
        seen_words = set()
        for vf in validated_findings:
            w_text = vf.get("word", "")
            target_p = vf.get("expected_phoneme", "")
            obs_p = vf.get("observed_phonetic_evidence", "")

            if (w_text, target_p) in seen_words:
                continue
            seen_words.add((w_text, target_p))

            explanation = vf.get("recommendation") or f"Acoustic alignment indicated variation in target sound /{target_p}/."
            practice = vf.get("practice_words") or [w_text]
            pron_obs.append(
                PronunciationFeedbackItem(
                    word=w_text,
                    target_sound=target_p,
                    observed_sound=obs_p,
                    layman_explanation=explanation,
                    practice_words=practice[:4],
                )
            )

        # 6. Recording quality & limitations
        limitations = [
            "Acoustic phoneme observations are objective indicators from machine learning models, not clinical speech diagnoses.",
            "Fluency metrics are calculated strictly during active learner speaking intervals, excluding silence between turns.",
        ]
        if insufficient_audio_count > 0:
            limitations.append(
                f"{insufficient_audio_count} word segment(s) were shorter than 80ms or low-energy and were excluded from phonetic diagnosis to avoid boundary errors."
            )
        if unvalidated_count > 0:
            limitations.append(
                f"{unvalidated_count} candidate acoustic differences were withheld because single spontaneous occurrences require multi-utterance verification before being confirmed as errors."
            )

        # 7. Strengths
        strengths = []
        if wpm and wpm >= 85:
            strengths.append(f"Maintained steady conversational pacing of {wpm_str} across active turns.")
        if rep_rate is not None and rep_rate < 6.0:
            strengths.append("Demonstrated smooth forward phrasing with minimal hesitations or restarts.")
        if not validated_findings:
            strengths.append("Spoken targets showed close acoustic alignment with reference phonetic targets.")
        else:
            strengths.append(f"Successfully sustained conversational turns across {turn_count} interaction(s).")

        # 8. Priority practice areas
        priorities = []
        if pron_obs:
            for item in pron_obs[:2]:
                priorities.append(
                    f"Refine articulation of /{item.target_sound}/ in words such as '{item.word}'."
                )
        else:
            priorities.append("Continue practicing natural connected speech rhythm and phrase-linking.")

        # 9. Actionable recommendations
        recommendations = []
        if pron_obs:
            for item in pron_obs[:2]:
                if item.practice_words:
                    recommendations.append(
                        f"Practice target sound /{item.target_sound}/ with word pairs: {', '.join(item.practice_words)}."
                    )
        if not recommendations:
            recommendations.append(
                "Read short conversational paragraphs aloud, focusing on maintaining steady breath flow and natural pause points."
            )

        return PostAssessmentInterpretationModel(
            overall_recording_assessment=overall_assessment,
            asr_transcription_and_reliability=asr_reliability,
            fluency_measurements_summary=fluency_summary,
            evidence_supported_fluency_observations=fluency_obs,
            selected_pronunciation_observations=pron_obs,
            recording_quality_and_limitations=limitations,
            evidence_supported_strengths=strengths,
            priority_practice_areas=priorities,
            actionable_recommendations=recommendations,
        )
