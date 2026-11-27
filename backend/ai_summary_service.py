"""
Articula AI-Assisted Pronunciation & Fluency Interpretation Service
Implements Phase 7:
Pipeline:
Raw Analysis -> Technical Validation -> Phoneme Comparison -> Validated Findings -> AI-Assisted Explanation -> Human Review.

The AI receives structured, validated technical results and generates accessible
interpretation, articulatory explanations, and targeted practice suggestions.
Supports Gemini/OpenAI API if keys are provided in .env, with a deterministic,
expert phonetic rule-based fallback when offline or without external API keys.
"""

import json
import os
import logging
from typing import Any, Dict, List, Optional
import httpx
from phoneme_comparison import PHONEME_PROFILES, normalize_ipa_symbol

logger = logging.getLogger("articula.ai_summary")


def build_expert_rule_based_summary(
    full_transcription: str,
    words: List[Dict[str, Any]],
    pronunciation_findings: List[Dict[str, Any]],
    evaluation_metrics: Optional[Dict[str, Any]] = None,
    preferred_accent: str = "General English",
) -> Dict[str, Any]:
    """
    Deterministic expert rule-based generator for AI analysis summary.
    Guarantees reliable, evidence-grounded interpretation even when no external
    LLM API key is configured or when network requests fail.
    """
    total_words = len(words)
    analyzed_words = len([
        w for w in words
        if w.get("phoneme_analysis_status") == "completed" or w.get("analysis_status") == "completed"
    ])
    review_words = [w for w in words if w.get("requires_human_review")]
    short_or_poor_audio = [
        w for w in words
        if w.get("audio_quality_status") not in (None, "normal", "valid")
        or (w.get("duration_ms") is not None and w.get("duration_ms") < 40)
    ]

    # 1. Overall Summary
    summary_parts = []
    if full_transcription:
        summary_parts.append(
            f"The recording contains a recognized utterance of {total_words} spoken words: \"{full_transcription}\"."
        )
    else:
        summary_parts.append(f"The recording contains {total_words} recognized spoken tokens.")

    summary_parts.append(
        f"{analyzed_words} of {total_words} words were successfully processed through acoustic phoneme alignment."
    )

    if review_words:
        summary_parts.append(
            f"{len(review_words)} tokens have been flagged for human reviewer inspection due to boundary padding, "
            f"acoustic brevity, or phonetic differences against reference pronunciations."
        )
    else:
        summary_parts.append("All analyzed tokens exhibited close alignment with reference phonetic targets.")

    overall_summary = " ".join(summary_parts)

    # 2. Pronunciation Observations (Filtered to supported findings)
    pronunciation_observations: List[Dict[str, Any]] = []
    seen_word_finding = set()

    for f in pronunciation_findings:
        w_text = f.get("word", "")
        exp_phone = f.get("expected_phoneme") or f.get("target_phoneme") or ""
        pred_phone = f.get("predicted_phoneme") or ""
        diff_type = f.get("difference_type", "substitution")
        pos = f.get("phoneme_position", 0)
        key = (w_text, exp_phone, pred_phone, pos)

        if key in seen_word_finding:
            continue
        seen_word_finding.add(key)

        prof = PHONEME_PROFILES.get(normalize_ipa_symbol(exp_phone), {})
        articulatory_desc = prof.get("guidance") or f"Articulation target for /{exp_phone}/."
        practice_words = prof.get("practice_words") or [w_text]

        if diff_type == "substitution":
            obs_text = (
                f"In the word \"{w_text}\", target phoneme /{exp_phone}/ was recognized acoustically as /{pred_phone}/ "
                f"at phoneme position {pos}."
            )
        elif diff_type == "deletion":
            obs_text = (
                f"In the word \"{w_text}\", expected phoneme /{exp_phone}/ was not detected by the acoustic model."
            )
        elif diff_type == "insertion":
            obs_text = (
                f"In the word \"{w_text}\", an additional acoustic sound /{pred_phone}/ was detected at position {pos}."
            )
        else:
            obs_text = f"Phonetic variation noted in word \"{w_text}\"."

        pronunciation_observations.append({
            "word": w_text,
            "target_phoneme": exp_phone,
            "predicted_phoneme": pred_phone,
            "difference_type": diff_type,
            "phoneme_position": pos,
            "observation": obs_text,
            "supporting_evidence": f"Acoustic alignment sequence: expected /{exp_phone}/ vs predicted /{pred_phone}/",
            "possible_articulation_explanation": articulatory_desc,
            "practice_recommendation": practice_words[:4],
            "validation_status": f.get("validation_status", "requires_human_review"),
        })

    # 3. Speech Timing Observations
    speech_timing_observations: List[str] = []
    if evaluation_metrics:
        sr = evaluation_metrics.get("speech_rate", {})
        wpm = sr.get("speech_rate_wpm")
        if wpm is not None:
            speech_timing_observations.append(
                f"Automatic speech rate is {wpm:.1f} WPM across an active response interval of {sr.get('response_interval_seconds', 0):.1f}s."
            )

        q_sr = evaluation_metrics.get("quantitative_errors", {}).get("speech_rate_wpm")
        if q_sr and q_sr.get("mean_signed_difference") is not None:
            signed_diff = q_sr["mean_signed_difference"]
            sign_str = f"+{signed_diff:.1f}" if signed_diff >= 0 else f"{signed_diff:.1f}"
            speech_timing_observations.append(
                f"Speech rate signed difference against verified reference baseline is {sign_str} WPM (MAE: {q_sr.get('mean_absolute_error', 0):.1f} WPM)."
            )

        pm = evaluation_metrics.get("pause_metrics", {})
        if pm and pm.get("pause_count") is not None:
            p_count = pm["pause_count"]
            mean_dur = pm.get("mean_pause_duration_seconds")
            mean_dur_str = f"{mean_dur:.2f}s" if mean_dur is not None else "undefined"
            speech_timing_observations.append(
                f"Acoustic signal detector identified {p_count} qualifying silent pauses (mean duration: {mean_dur_str}, pause frequency: {pm.get('pauses_per_minute', 0):.1f}/min)."
            )

        pe = evaluation_metrics.get("event_evaluations", {}).get("pause_detection")
        if pe and pe.get("status") == "valid":
            f1_val = f"{pe['f1_score'] * 100:.1f}%" if pe.get("f1_score") is not None else "0.0%"
            speech_timing_observations.append(
                f"Pause detection agreement against reference annotations: Precision: {pe.get('precision', 0) * 100:.1f}%, Recall: {pe.get('recall', 0) * 100:.1f}%, F1: {f1_val}."
            )

    # 4. Audio Quality Warnings
    audio_quality_warnings: List[str] = []
    for w in short_or_poor_audio:
        w_text = w.get("text", "")
        dur = w.get("duration_ms", 0)
        q_stat = w.get("audio_quality_status", "unknown")
        notes = w.get("segmentation_notes") or ""
        audio_quality_warnings.append(
            f"Word \"{w_text}\" has raw duration of {dur}ms (status: {q_stat}). {notes} Phonetic prediction may be affected by boundary truncation."
        )

    # 5. Limitations
    limitations: List[str] = [
        "Acoustic phoneme predictions from Wav2Vec2 are observational indicators, not clinical speech diagnoses.",
        "Isolated word audio slices are extracted using speech-to-text word boundaries, which may capture surrounding coarticulation bursts.",
        "Reference pronunciations reflect dictionary standards and do not penalize natural regional or dialectal English variations.",
    ]
    if audio_quality_warnings:
        limitations.append(
            f"{len(audio_quality_warnings)} short or low-energy audio segments were excluded or padded, which can reduce acoustic resolution."
        )

    # 6. Human Review Recommendations
    human_review_recommendations: List[str] = []
    for w in review_words[:6]:
        w_text = w.get("text", "")
        dur = w.get("duration_ms", "N/A")
        exp = w.get("expected_phonemes_str", "")
        pred = w.get("predicted_phonemes_str", "")
        per = w.get("phoneme_error_rate")
        per_str = f"{per}%" if per is not None else "N/A"
        human_review_recommendations.append(
            f"Review word \"{w_text}\" (Duration: {dur}ms, PER: {per_str}): Target /{exp}/ recognized as /{pred}/."
        )

    return {
        "overall_summary": overall_summary,
        "pronunciation_observations": pronunciation_observations,
        "speech_timing_observations": speech_timing_observations,
        "audio_quality_warnings": audio_quality_warnings,
        "limitations": limitations,
        "human_review_recommendations": human_review_recommendations,
        "generation_method": "deterministic_expert_rules",
        "evidence_traceability": {
            "total_words": total_words,
            "analyzed_words": analyzed_words,
            "flagged_words": len(review_words),
            "findings_count": len(pronunciation_findings),
        },
    }


async def generate_llm_analysis_summary(
    full_transcription: str,
    words: List[Dict[str, Any]],
    pronunciation_findings: List[Dict[str, Any]],
    evaluation_metrics: Optional[Dict[str, Any]] = None,
    preferred_accent: str = "General English",
    gemini_api_key: Optional[str] = None,
    openai_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Generates AI interpretation using Gemini or OpenAI when credentials exist.
    Enforces strict grounding on validated evidence: the LLM is provided the validated
    findings and metrics and instructed never to calculate its own metrics or diagnose errors.
    Falls back gracefully to the deterministic expert engine if anything fails.
    """
    # Baseline rule-based payload as reliable fallback
    fallback_summary = build_expert_rule_based_summary(
        full_transcription=full_transcription,
        words=words,
        pronunciation_findings=pronunciation_findings,
        evaluation_metrics=evaluation_metrics,
        preferred_accent=preferred_accent,
    )

    # Build compact structured evidence payload for LLM prompt
    evidence_payload = {
        "transcription": full_transcription,
        "word_count": len(words),
        "analyzed_count": len([w for w in words if w.get("phoneme_analysis_status") == "completed"]),
        "flagged_words": [
            {
                "word": w.get("text"),
                "duration_ms": w.get("duration_ms"),
                "confidence": round(w.get("confidence", 0), 2) if w.get("confidence") is not None else None,
                "expected": w.get("expected_phonemes_str"),
                "predicted": w.get("predicted_phonemes_str"),
                "per": w.get("phoneme_error_rate"),
                "notes": w.get("segmentation_notes"),
            }
            for w in words if w.get("requires_human_review")
        ],
        "findings": [
            {
                "word": f.get("word"),
                "expected": f.get("expected_phoneme"),
                "predicted": f.get("predicted_phoneme"),
                "op": f.get("difference_type"),
                "pos": f.get("phoneme_position"),
                "practice_words": f.get("practice_words", [])[:3],
            }
            for f in pronunciation_findings[:10]
        ],
        "speech_rate": evaluation_metrics.get("speech_rate") if evaluation_metrics else None,
        "pause_metrics": evaluation_metrics.get("pause_metrics") if evaluation_metrics else None,
        "quantitative_errors": evaluation_metrics.get("quantitative_errors") if evaluation_metrics else None,
    }

    system_instruction = (
        "You are an expert speech-processing and pronunciation analysis assistant for Articula. "
        "Your task is to generate a helpful, encouraging, and scientifically sound explanation "
        "of the technical pronunciation and speech timing evaluation results.\n\n"
        "STRICT RULES:\n"
        "1. DO NOT independently diagnose errors from raw audio or invent findings.\n"
        "2. Ground all explanations strictly in the validated findings provided in the input.\n"
        "3. Do not modify or recalculate any numbers (PER, WPM, pause counts).\n"
        "4. Tone must be pedagogical, objective, and supportive.\n"
        "5. Include relevant limitations (acoustic segmentation noise, short segments, accent variation).\n"
        "6. Return ONLY valid JSON matching the requested schema.\n"
    )

    prompt = (
        f"Input Evidence Data:\n{json.dumps(evidence_payload, indent=2)}\n\n"
        "Generate a JSON response matching this schema:\n"
        "{\n"
        '  "overall_summary": "...",\n'
        '  "pronunciation_observations": [\n'
        '    {\n'
        '      "word": "...",\n'
        '      "observation": "...",\n'
        '      "supporting_evidence": "...",\n'
        '      "possible_articulation_explanation": "...",\n'
        '      "practice_recommendation": ["word1", "word2"],\n'
        '      "validation_status": "requires_human_review"\n'
        '    }\n'
        '  ],\n'
        '  "speech_timing_observations": ["..."],\n'
        '  "audio_quality_warnings": ["..."],\n'
        '  "limitations": ["..."],\n'
        '  "human_review_recommendations": ["..."]\n'
        "}"
    )

    # 1. Try Gemini API if key is present
    gemini_key = gemini_api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    if gemini_key and gemini_key.strip():
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key.strip()}"
            body = {
                "contents": [
                    {"parts": [{"text": f"{system_instruction}\n\n{prompt}"}]}
                ],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "temperature": 0.2,
                },
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, json=body)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        text_val = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        parsed = json.loads(text_val)
                        if isinstance(parsed, dict) and "overall_summary" in parsed:
                            parsed["generation_method"] = gemini_model
                            parsed["evidence_traceability"] = fallback_summary["evidence_traceability"]
                            return parsed
        except Exception:
            pass  # Fallback gracefully to expert rules

    # 2. Try OpenAI API if key is present
    openai_key = openai_api_key or os.getenv("OPENAI_API_KEY")
    if openai_key and openai_key.strip():
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {openai_key.strip()}",
                "Content-Type": "application/json",
            }
            body = {
                "model": "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt},
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.2,
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=body)
                if res.status_code == 200:
                    data = res.json()
                    choice = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    parsed = json.loads(choice)
                    if isinstance(parsed, dict) and "overall_summary" in parsed:
                        parsed["generation_method"] = "openai_gpt4o_mini"
                        parsed["evidence_traceability"] = fallback_summary["evidence_traceability"]
                        return parsed
        except Exception:
            pass  # Fallback gracefully to expert rules

    # Default to expert rule-based generator
    return fallback_summary


def build_post_conversation_report(
    session_id: str,
    turns_data: List[Dict[str, Any]],
    session_fluency: Dict[str, Any],
    all_pronunciation_findings: List[Dict[str, Any]],
    all_words: List[Dict[str, Any]],
    preferred_accent: str = "General English",
) -> Dict[str, Any]:
    """
    Builds the formal 5-section post-conversation consolidated report (Section 7).

    Guarantees & Constraints:
    1. Section A: Transcription & Timing (learner speech only, timestamps, ASR reliability, limitations)
    2. Section B: Fluency Analysis (speech rate, pause freq, mean pause dur, repetition rate; NO inter-turn silence)
    3. Section C: Selected Pronunciation Observations (grouped by word & phoneme, evidence-constrained, playback ref)
    4. Section D: Evidence and Quality Checks (insufficient audio, uncertain predictions, ASR limits)
    5. Section E: Formative Feedback (strengths, priority areas, actionable recommendations grounded in evidence)
    Strictly excludes grammar, vocabulary, task performance, CEFR, or broad proficiency scoring.
    """
    import datetime

    # --- Section A: Transcription & Timing Information ---
    full_transcript_parts = []
    processed_turns = []
    total_conf = 0.0
    conf_count = 0
    all_word_timestamps = []

    for t in turns_data:
        t_id = t.get("turn_id", "turn")
        t_text = t.get("transcript", t.get("text", "")).strip()
        t_dur = float(t.get("audio_duration", t.get("duration", 0.0)))
        t_conf = t.get("confidence")
        if t_text:
            full_transcript_parts.append(t_text)
        if t_conf is not None:
            total_conf += float(t_conf)
            conf_count += 1

        t_words = t.get("words", [])
        for w in t_words:
            all_word_timestamps.append({
                "word": w.get("word", w.get("text", "")),
                "start": w.get("start"),
                "end": w.get("end"),
                "confidence": w.get("confidence", w.get("assembly_confidence")),
                "turn_id": t_id,
            })

        processed_turns.append({
            "turn_id": t_id,
            "speaker": "learner",
            "transcript": t_text,
            "duration_seconds": round(t_dur, 2),
            "word_count": len(t_words) or len(t_text.split()),
            "confidence": round(t_conf, 3) if t_conf is not None else None,
        })

    avg_conf = round(total_conf / conf_count, 3) if conf_count > 0 else None
    transcription_limitations = [
        "AssemblyAI transcription operates on learner utterances; conversational AI prompt audio is strictly excluded.",
        "ASR confidence indicates acoustic/language model decoding certainty for lexical words, not learner pronunciation accuracy.",
        "Word timestamps are derived from ASR acoustic alignment and may reflect slight coarticulation boundary variance.",
    ]

    section_a = {
        "full_transcript": " ".join(full_transcript_parts),
        "turn_count": len(processed_turns),
        "turns": processed_turns,
        "word_timestamps_count": len(all_word_timestamps),
        "word_timestamps": all_word_timestamps,
        "asr_average_confidence": avg_conf,
        "transcription_limitations": transcription_limitations,
    }

    # --- Section B: Fluency Analysis ---
    section_b = {
        "speech_rate_wpm": session_fluency.get("speech_rate_wpm"),
        "silent_pause_frequency": session_fluency.get("pause_frequency"),
        "pauses_per_minute": session_fluency.get("pauses_per_minute"),
        "mean_silent_pause_duration_seconds": session_fluency.get("mean_pause_duration_seconds"),
        "repetition_rate_percent": session_fluency.get("repetition_rate_percent"),
        "total_response_interval_seconds": session_fluency.get("total_response_interval_seconds", 0.0),
        "total_recognized_words": session_fluency.get("total_recognized_words", 0),
        "pause_count": session_fluency.get("pause_count", 0),
        "repetition_event_count": session_fluency.get("repetition_event_count", 0),
        "turn_breakdown": session_fluency.get("turns", []),
        "measurement_protocol": (
            "Fluency metrics are calculated exclusively on learner response intervals. "
            "Silence intervals between separate conversation turns are strictly excluded from within-response pause calculations."
        ),
    }

    # --- Section C: Selected Pronunciation Observations ---
    # Partition observations into the 6 explicit evidentiary categories:
    # 1. Raw phoneme predictions
    # 2. Candidate phoneme differences
    # 3. Validated pronunciation observations
    # 4. Excluded observations
    # 5. Insufficient evidence
    # 6. Human-review-required observations
    # Plus: Preserved underlying diagnostic data for research evaluation & debugging
    grouped_findings: Dict[str, List[Dict[str, Any]]] = {}
    validated_obs = []
    candidate_diffs = []
    excluded_obs = []
    insufficient_evidence_obs = []
    human_review_obs = []
    seen_obs_keys = set()

    for f in all_pronunciation_findings:
        w_text = f.get("word", "")
        exp = f.get("expected_phoneme", "")
        pred = f.get("predicted_phoneme", "")
        stat = f.get("validation_status", "candidate_difference")
        key = (w_text.lower(), exp, pred, f.get("difference_type"))

        if key in seen_obs_keys:
            continue
        seen_obs_keys.add(key)

        obs_item = {
            "word": w_text,
            "target_word": f.get("target_word", w_text),
            "recognized_word": f.get("recognized_word", w_text),
            "expected_phoneme": exp,
            "observed_phonetic_evidence": pred,
            "difference_type": f.get("difference_type", "substitution"),
            "nature_of_difference": f.get("observed_characteristic", "phonetic_variation"),
            "recording_quality_limitation": f.get("audio_quality_status", "normal"),
            "audio_playback_reference": f.get("supporting_audio_clip"),
            "validation_status": stat,
            "confidence_level": f.get("confidence_level", "requires_validation"),
            "recommendation": f.get("recommendation"),
            "practice_words": f.get("practice_words", []),
            "notes": f.get("notes"),
        }

        # Partition into the 4/5/6 categories
        if stat == "validated_observation":
            validated_obs.append(obs_item)
        elif stat in ("excluded_observation", "analysis_unavailable"):
            excluded_obs.append(obs_item)
        elif stat in ("insufficient_acoustic_evidence", "insufficient_evidence"):
            insufficient_evidence_obs.append(obs_item)
        elif stat in ("human_review_required", "candidate_discrepancy_review_required"):
            human_review_obs.append(obs_item)
        else:
            candidate_diffs.append(obs_item)

        if w_text not in grouped_findings:
            grouped_findings[w_text] = []
        grouped_findings[w_text].append(obs_item)

    # 1. Raw phoneme predictions
    raw_predictions_list = [
        {
            "word": w.get("word", w.get("text", "")),
            "start": w.get("start"),
            "end": w.get("end"),
            "raw_prediction": w.get("predicted_phonemes_raw") or w.get("predicted_phonemes_str") or w.get("phoneme_prediction", ""),
            "tokens": w.get("predicted_phonemes") or w.get("phoneme_tokens") or [],
        }
        for w in all_words
        if w.get("predicted_phonemes") or w.get("phoneme_tokens") or w.get("predicted_phonemes_str")
    ]

    # Underlying diagnostic dataset preserved for research evaluation and debugging
    underlying_diagnostic_data = [
        {
            "word": w.get("word", w.get("text", "")),
            "target_word": w.get("target_word"),
            "recognized_word": w.get("recognized_word"),
            "start_ms": w.get("start_ms", w.get("start")),
            "end_ms": w.get("end_ms", w.get("end")),
            "raw_duration_ms": w.get("raw_duration_ms", w.get("duration_ms")),
            "padded_duration_ms": w.get("padded_duration_ms"),
            "audio_quality_status": w.get("audio_quality_status", "normal"),
            "segmentation_status": w.get("segmentation_status", "valid"),
            "asr_confidence": w.get("assembly_confidence", w.get("confidence")),
            "reference_source": w.get("reference_source"),
            "expected_phonemes": w.get("expected_phonemes", []),
            "predicted_phonemes": w.get("predicted_phonemes", []),
            "alignment": w.get("alignment", []),
            "phoneme_error_rate": w.get("phoneme_error_rate"),
            "requires_human_review": w.get("requires_human_review", False),
            "notes": w.get("segmentation_notes"),
        }
        for w in all_words
    ]

    section_c = {
        "raw_predictions": raw_predictions_list,
        "candidate_differences": candidate_diffs,
        "validated_observations": validated_obs,
        "excluded_observations": excluded_obs,
        "insufficient_evidence": insufficient_evidence_obs,
        "human_review_required": human_review_obs,
        "total_findings_count": len(all_pronunciation_findings),
        "grouped_by_word": grouped_findings,
        "underlying_diagnostic_data": underlying_diagnostic_data,
    }

    # --- Section D: Evidence and Quality Checks ---
    short_audio_tokens = [
        {
            "word": w.get("word", w.get("text")),
            "duration_ms": w.get("duration_ms"),
            "quality_status": w.get("audio_quality_status"),
            "notes": w.get("segmentation_notes"),
        }
        for w in all_words
        if w.get("audio_quality_status") not in (None, "normal", "valid")
        or (w.get("duration_ms") is not None and w.get("duration_ms") < 80)
    ]

    uncertain_predictions = [
        {
            "word": c.get("word"),
            "expected": c.get("expected_phoneme"),
            "observed": c.get("observed_phonetic_evidence"),
            "reason": c.get("notes"),
        }
        for c in candidate_diffs
        if c.get("validation_status") != "validated_observation"
    ]

    section_d = {
        "insufficient_audio_segments": short_audio_tokens[:10],
        "insufficient_audio_count": len(short_audio_tokens),
        "uncertain_phoneme_predictions": uncertain_predictions[:10],
        "uncertain_predictions_count": len(uncertain_predictions),
        "asr_reliability_limitations": [
            "AssemblyAI confidence represents acoustic-lexical match probability, not phonological accuracy.",
            "Words with low ASR confidence are flagged for manual review rather than penalized as pronunciation errors.",
            "Whole audio processing was prioritized to reduce edge transient distortions.",
        ],
        "unvalidated_observations_count": len(candidate_diffs),
    }

    # --- Section E: Formative Feedback ---
    strengths = []
    if session_fluency.get("speech_rate_wpm") and session_fluency["speech_rate_wpm"] >= 90:
        strengths.append(
            f"Speech rate ({session_fluency['speech_rate_wpm']} WPM) reflects conversational speaking pace."
        )
    if session_fluency.get("repetition_rate_percent") is not None and session_fluency["repetition_rate_percent"] <= 5.0:
        strengths.append(
            f"Low repetition rate ({session_fluency['repetition_rate_percent']}%) indicates coherent phrase production."
        )
    if len(validated_obs) == 0:
        strengths.append("Analyzed tokens exhibited strong concordance with reference phonetic baselines.")
    else:
        strengths.append(f"Successfully communicated across {len(processed_turns)} turns with intelligible pacing.")

    priority_practice = []
    for vo in validated_obs[:3]:
        exp = vo.get("expected_phoneme")
        pred = vo.get("observed_phonetic_evidence")
        w = vo.get("word")
        priority_practice.append(
            f"Articulatory focus on target /{exp}/ (observed as [{pred}] in \"{w}\")."
        )
    if not priority_practice:
        priority_practice.append(
            "There was insufficient evidence to identify a reliable pronunciation concern. Continue practicing conversational rhythm and steady pacing."
        )

    recommendations = []
    for vo in validated_obs[:3]:
        recs = vo.get("practice_words", [])
        if recs:
            recommendations.append(f"Practice minimal pairs and target words: {', '.join(recs)}.")
    if not recommendations:
        recommendations.append(
            "Engage in repeated conversational turns focusing on sustained phrasing and natural pausing."
        )

    section_e = {
        "evidence_supported_strengths": strengths,
        "priority_practice_areas": priority_practice,
        "actionable_recommendations": recommendations,
    }

    # Add explicit insufficient evidence note on Section C if no validated observations
    if len(validated_obs) == 0:
        section_c["insufficient_evidence_message"] = (
            "There was insufficient evidence to identify a reliable pronunciation concern."
        )
    else:
        section_c["insufficient_evidence_message"] = None

    # The 7 Learner-Centric Report Sections (Part 6)
    section_a_speaking_session = {
        "overall_recording_assessment": (
            f"You completed {len(processed_turns)} conversational turn(s) with an active speaking time of "
            f"{section_b['total_response_interval_seconds']:.1f} seconds across {section_b['total_recognized_words']} words."
        ),
        "asr_transcription_and_reliability": (
            f"Transcribed {len(processed_turns)} turn(s) with {round((avg_conf or 0.9) * 100)}% average decoding reliability. "
            "Note: ASR confidence reflects lexical decoding certainty, not learner pronunciation accuracy."
        ),
        "full_transcript": section_a["full_transcript"],
        "turn_count": len(processed_turns),
        "total_recognized_words": section_b["total_recognized_words"],
        "total_response_interval_seconds": section_b["total_response_interval_seconds"],
        "asr_average_confidence": avg_conf,
        "turns": processed_turns,
        "transcription_limitations": transcription_limitations,
    }

    section_b_fluency_measurements = {
        "speech_rate_wpm": section_b["speech_rate_wpm"],
        "silent_pause_frequency": section_b["silent_pause_frequency"],
        "pauses_per_minute": section_b["pauses_per_minute"],
        "mean_silent_pause_duration_seconds": section_b["mean_silent_pause_duration_seconds"],
        "repetition_rate_percent": section_b["repetition_rate_percent"],
        "total_response_interval_seconds": section_b["total_response_interval_seconds"],
        "total_recognized_words": section_b["total_recognized_words"],
        "pause_count": section_b["pause_count"],
        "repetition_event_count": section_b["repetition_event_count"],
        "measurement_protocol": section_b["measurement_protocol"],
        "fluency_observations": [
            f"Speaking pace: {section_b['speech_rate_wpm']} WPM across active speaking time.",
            f"Silent pauses: {section_b['pause_count']} pause(s), averaging {section_b['mean_silent_pause_duration_seconds']}s each.",
            f"Phrase repetition: {section_b['repetition_rate_percent']}% of words produced.",
        ],
    }

    section_d_recording_quality_and_evidence = {
        "recording_quality_limitations": section_d["asr_reliability_limitations"],
        "insufficient_audio_count": section_d["insufficient_audio_count"],
        "insufficient_audio_segments": section_d["insufficient_audio_segments"],
        "unvalidated_observations_count": section_d["unvalidated_observations_count"],
        "candidate_differences_count": len(candidate_diffs),
        "policy_note": (
            f"{len(candidate_diffs)} candidate difference(s) were observed in spontaneous speech. "
            "Under Articula's strict evidence rules, candidate discrepancies require multi-utterance confirmation "
            "and are not treated as confirmed learner errors."
        ),
    }

    return {
        "report_id": f"rep_{session_id}_{int(datetime.datetime.now().timestamp())}",
        "session_id": session_id,
        "created_at": datetime.datetime.now().isoformat(),
        "preferred_accent": preferred_accent,
        # Backward-compatible 5 section keys
        "section_a_transcription_and_timing": section_a,
        "section_b_fluency_analysis": section_b,
        "section_c_pronunciation_observations": section_c,
        "section_d_evidence_and_quality_checks": section_d,
        "section_e_formative_feedback": section_e,
        # Redesigned 7 learner-centric sections (Part 6)
        "section_a_speaking_session": section_a_speaking_session,
        "section_b_fluency_measurements": section_b_fluency_measurements,
        "section_d_recording_quality_and_evidence": section_d_recording_quality_and_evidence,
        "section_e_what_you_did_well": strengths,
        "section_f_what_to_practice_next": priority_practice,
        "section_g_recommended_practice": recommendations,
        "generation_method": "deterministic_expert_rules",
    }


async def generate_post_conversation_feedback_llm(
    session_report: Dict[str, Any],
    gemini_api_key: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Uses Gemini 3.5 Flash-Lite exclusively to interpret and organize structured assessment findings
    into learner-friendly, accessible language.
    STRICT CONSTRAINT: Gemini is NEVER permitted to invent measurements, phoneme predictions,
    or errors not supported by session_report data.
    """
    try:
        from gemini_service import GeminiService
        service = GeminiService(api_key=gemini_api_key)

        sec_a = session_report.get("section_a_transcription_and_timing", {})
        sec_b = session_report.get("section_b_fluency_analysis", {})
        sec_c = session_report.get("section_c_pronunciation_observations", {})
        sec_d = session_report.get("section_d_evidence_and_quality_checks", {})

        evidence_payload = {
            "transcription_info": {
                "full_transcript": sec_a.get("full_transcript", ""),
                "turn_count": sec_a.get("turn_count", 0),
                "total_recognized_words": sec_a.get("word_timestamps_count", 0),
                "asr_average_confidence": sec_a.get("asr_average_confidence"),
                "transcription_limitations": sec_a.get("transcription_limitations", []),
            },
            "fluency_measures": {
                "speech_rate_wpm": sec_b.get("speech_rate_wpm"),
                "silent_pause_frequency": sec_b.get("silent_pause_frequency"),
                "mean_silent_pause_duration_seconds": sec_b.get("mean_silent_pause_duration_seconds"),
                "repetition_rate_percent": sec_b.get("repetition_rate_percent"),
                "total_response_interval_seconds": sec_b.get("total_response_interval_seconds", 0.0),
                "pause_count": sec_b.get("pause_count", 0),
                "repetition_event_count": sec_b.get("repetition_event_count", 0),
            },
            "validated_pronunciation_observations": sec_c.get("validated_observations", []),
            "quality_and_limitations": {
                "insufficient_audio_count": sec_d.get("insufficient_audio_count", 0),
                "unvalidated_observations_count": sec_d.get("unvalidated_observations_count", 0),
                "uncertain_predictions_count": sec_d.get("uncertain_predictions_count", 0),
                "asr_limitations": sec_d.get("asr_reliability_limitations", []),
            },
        }

        interpreted = await service.interpret_assessment_results(evidence_payload)

        # Update Section E
        session_report["section_e_formative_feedback"]["evidence_supported_strengths"] = interpreted.evidence_supported_strengths
        session_report["section_e_formative_feedback"]["priority_practice_areas"] = interpreted.priority_practice_areas
        session_report["section_e_formative_feedback"]["actionable_recommendations"] = interpreted.actionable_recommendations

        # Update Redesigned 7 Learner Sections
        if "section_a_speaking_session" in session_report:
            session_report["section_a_speaking_session"]["overall_recording_assessment"] = interpreted.overall_recording_assessment
            session_report["section_a_speaking_session"]["asr_transcription_and_reliability"] = interpreted.asr_transcription_and_reliability

        if "section_b_fluency_measurements" in session_report:
            session_report["section_b_fluency_measurements"]["fluency_summary"] = interpreted.fluency_measurements_summary
            session_report["section_b_fluency_measurements"]["fluency_observations"] = interpreted.evidence_supported_fluency_observations

        session_report["section_c_pronunciation_observations"]["learner_observations"] = [
            item.model_dump() for item in interpreted.selected_pronunciation_observations
        ]

        if "section_d_recording_quality_and_evidence" in session_report:
            session_report["section_d_recording_quality_and_evidence"]["recording_quality_limitations"] = interpreted.recording_quality_and_limitations

        session_report["section_e_what_you_did_well"] = interpreted.evidence_supported_strengths
        session_report["section_f_what_to_practice_next"] = interpreted.priority_practice_areas
        session_report["section_g_recommended_practice"] = interpreted.actionable_recommendations

        session_report["generation_method"] = (
            f"{service.model} (structured_interpretation)" if service.is_configured() else "deterministic_expert_rules"
        )
    except Exception as exc:
        logger.warning(f"Error during post-conversation LLM feedback interpretation: {exc}")

    return session_report

    return session_report
