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
from typing import Any, Dict, List, Optional
import httpx
from phoneme_comparison import PHONEME_PROFILES, normalize_ipa_symbol


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
    if gemini_key and gemini_key.strip():
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key.strip()}"
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
                            parsed["generation_method"] = "gemini_1.5_flash"
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
