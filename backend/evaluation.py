"""
Articula Research Evaluation Module
Implements formal thesis metrics, variable definitions, and alignment algorithms for:
- Word Error Rate (WER) with Levenshtein / Wagner-Fischer dynamic programming
- Speech Rate (WPM = 60 * W / T)
- Pause Frequency and Duration (P / T, mean pause duration)
- Repetition Rate (100 * R / W)
- Candidate Self-Correction tracking
- Quantitative Error Measures (MAE, Median Absolute Error, Signed Differences)
- Event-Detection Evaluation (Precision, Recall, F1 with 1-to-1 temporal matching)
"""

import math
import re
from typing import Any, Dict, List, Optional, Tuple


def normalize_transcript(
    text: str,
    lowercase: bool = True,
    remove_punctuation: bool = True,
    preserve_fillers: bool = True,
) -> List[str]:
    """
    Standard transcript normalization policy for fair ASR evaluation.
    - Preserves fillers ('um', 'uh', 'erm', 'er') as tokens
    - Retains hyphens in stutter words (e.g. 'i-i') or splits if configured
    - Lowercases text
    - Strips commas, periods, question marks, exclamation marks, and quotes
    """
    if not text:
        return []

    cleaned = text
    if lowercase:
        cleaned = cleaned.lower()

    if remove_punctuation:
        # Preserve hyphens between word characters (e.g., 'i-i', 'well-known')
        # Remove all other punctuation
        cleaned = re.sub(r"[^\w\s-]", " ", cleaned)
        # Clean up stray hyphens not surrounded by letters
        cleaned = re.sub(r"(?<!\w)-|-(?!\w)", " ", cleaned)

    tokens = [t.strip() for t in cleaned.split() if t.strip()]
    return tokens


def compute_word_alignment(
    reference_text: str,
    hypothesis_text: str,
    normalize: bool = True,
) -> Dict[str, Any]:
    """
    Computes exact word-level alignment between reference and hypothesis transcripts
    using the Wagner-Fischer dynamic programming algorithm.
    Returns:
    - substitution_count (S)
    - deletion_count (D)
    - insertion_count (I)
    - reference_word_count (N)
    - word_error_rate (WER = (S + D + I) / N)
    - word_error_rate_percent (100 * WER)
    - aligned_pairs: List of token alignment operations
    """
    ref_tokens = normalize_transcript(reference_text) if normalize else reference_text.split()
    hyp_tokens = normalize_transcript(hypothesis_text) if normalize else hypothesis_text.split()

    n = len(ref_tokens)
    m = len(hyp_tokens)

    # If reference has no eligible words, WER is undefined
    if n == 0:
        return {
            "reference_word_count": 0,
            "recognized_word_count": m,
            "substitution_count": 0,
            "deletion_count": 0,
            "insertion_count": m,
            "word_error_rate": None,
            "word_error_rate_percent": None,
            "status": "undefined",
            "reason": "Reference transcript contains no eligible words (N=0).",
            "aligned_pairs": [
                {"type": "insertion", "ref_token": None, "hyp_token": tok} for tok in hyp_tokens
            ],
            "normalized_reference": " ".join(ref_tokens),
            "normalized_hypothesis": " ".join(hyp_tokens),
        }

    # DP Matrix: dp[i][j] = (cost, op, prev_i, prev_j)
    dp = [[0] * (m + 1) for _ in range(n + 1)]

    for i in range(n + 1):
        dp[i][0] = i
    for j in range(m + 1):
        dp[0][j] = j

    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if ref_tokens[i - 1] == hyp_tokens[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]  # Match cost 0
            else:
                sub_cost = dp[i - 1][j - 1] + 1  # Substitution
                del_cost = dp[i - 1][j] + 1      # Deletion (omitted in hyp)
                ins_cost = dp[i][j - 1] + 1      # Insertion (extra in hyp)
                dp[i][j] = min(sub_cost, del_cost, ins_cost)

    # Backtracking to reconstruct exact alignment sequence
    aligned_pairs: List[Dict[str, Any]] = []
    i = n
    j = m

    s_count = 0
    d_count = 0
    i_count = 0

    while i > 0 or j > 0:
        if i > 0 and j > 0 and ref_tokens[i - 1] == hyp_tokens[j - 1] and dp[i][j] == dp[i - 1][j - 1]:
            aligned_pairs.append({
                "type": "match",
                "ref_token": ref_tokens[i - 1],
                "hyp_token": hyp_tokens[j - 1],
            })
            i -= 1
            j -= 1
        elif i > 0 and j > 0 and dp[i][j] == dp[i - 1][j - 1] + 1:
            aligned_pairs.append({
                "type": "substitution",
                "ref_token": ref_tokens[i - 1],
                "hyp_token": hyp_tokens[j - 1],
            })
            s_count += 1
            i -= 1
            j -= 1
        elif i > 0 and dp[i][j] == dp[i - 1][j] + 1:
            aligned_pairs.append({
                "type": "deletion",
                "ref_token": ref_tokens[i - 1],
                "hyp_token": None,
            })
            d_count += 1
            i -= 1
        elif j > 0 and dp[i][j] == dp[i][j - 1] + 1:
            aligned_pairs.append({
                "type": "insertion",
                "ref_token": None,
                "hyp_token": hyp_tokens[j - 1],
            })
            i_count += 1
            j -= 1
        else:
            # Fallback for boundary
            if i > 0:
                aligned_pairs.append({
                    "type": "deletion",
                    "ref_token": ref_tokens[i - 1],
                    "hyp_token": None,
                })
                d_count += 1
                i -= 1
            elif j > 0:
                aligned_pairs.append({
                    "type": "insertion",
                    "ref_token": None,
                    "hyp_token": hyp_tokens[j - 1],
                })
                i_count += 1
                j -= 1

    aligned_pairs.reverse()

    total_errors = s_count + d_count + i_count
    wer = round(total_errors / n, 4)
    wer_percent = round(wer * 100, 2)

    return {
        "reference_word_count": n,
        "recognized_word_count": m,
        "substitution_count": s_count,
        "deletion_count": d_count,
        "insertion_count": i_count,
        "total_errors": total_errors,
        "word_error_rate": wer,
        "word_error_rate_percent": wer_percent,
        "status": "valid",
        "reason": None,
        "aligned_pairs": aligned_pairs,
        "normalized_reference": " ".join(ref_tokens),
        "normalized_hypothesis": " ".join(hyp_tokens),
    }


def compute_speech_rate(
    word_count: int,
    response_interval_seconds: float,
) -> Dict[str, Any]:
    """
    Computes Speech Rate (Words Per Minute) according to Articula thesis formula:
    Speech Rate (WPM) = 60 * W / T
    Where:
    - W = recognized spoken-word count
    - T = learner response interval in seconds (including internal silent pauses)
    """
    if response_interval_seconds <= 0:
        return {
            "speech_rate_wpm": None,
            "word_count": word_count,
            "response_interval_seconds": response_interval_seconds,
            "status": "unavailable",
            "reason": "Response interval is zero or negative (T <= 0).",
        }

    if word_count <= 0:
        return {
            "speech_rate_wpm": None,
            "word_count": 0,
            "response_interval_seconds": response_interval_seconds,
            "status": "unavailable",
            "reason": "Recognized speech contains no spoken words (W = 0).",
        }

    wpm = round((60.0 * word_count) / response_interval_seconds, 2)
    return {
        "speech_rate_wpm": wpm,
        "word_count": word_count,
        "response_interval_seconds": round(response_interval_seconds, 2),
        "status": "valid",
        "reason": None,
    }


def compute_pause_metrics(
    pause_events: List[Dict[str, Any]],
    eligible_duration_seconds: float,
) -> Dict[str, Any]:
    """
    Computes silence pause metrics according to Articula thesis:
    - Pause Frequency = P / T (pauses per second)
    - Pauses per Minute = 60 * P / T
    - Mean Pause Duration = sum(durations) / P (undefined if P=0)
    """
    p = len(pause_events)
    if eligible_duration_seconds <= 0:
        return {
            "pause_count": p,
            "pause_frequency": None,
            "pauses_per_minute": None,
            "mean_pause_duration_seconds": None,
            "total_pause_duration_seconds": 0.0,
            "status": "unavailable",
            "reason": "Eligible audio duration is non-positive.",
        }

    total_pause_duration = sum(
        float(evt.get("duration_seconds", 0.0)) for evt in pause_events
    )

    if p == 0:
        return {
            "pause_count": 0,
            "pause_frequency": 0.0,
            "pauses_per_minute": 0.0,
            "mean_pause_duration_seconds": None,  # Undefined when P=0
            "total_pause_duration_seconds": 0.0,
            "status": "valid",
            "reason": "No qualifying pause events detected (mean duration undefined).",
        }

    mean_duration = round(total_pause_duration / p, 3)
    pause_frequency = round(p / eligible_duration_seconds, 3)
    pauses_per_minute = round((60.0 * p) / eligible_duration_seconds, 2)

    return {
        "pause_count": p,
        "pause_frequency": pause_frequency,
        "pauses_per_minute": pauses_per_minute,
        "mean_pause_duration_seconds": mean_duration,
        "total_pause_duration_seconds": round(total_pause_duration, 3),
        "status": "valid",
        "reason": None,
    }


def detect_candidate_repetitions(tokens: List[str]) -> List[Dict[str, Any]]:
    """
    Identifies candidate repetition events (stuttering, duplicate words, repeated phrases).
    Distinguishes genuine repetition candidates from ordinary prose.
    """
    candidates: List[Dict[str, Any]] = []
    if len(tokens) < 1:
        return candidates

    i = 0
    while i < len(tokens):
        token = tokens[i]

        # 1. Check for hyphenated stutter words (e.g., 'i-i', 'the-the')
        if "-" in token:
            parts = token.split("-")
            if len(parts) >= 2 and parts[0] == parts[1] and parts[0]:
                candidates.append({
                    "id": f"rep-{len(candidates) + 1}",
                    "type": "stutter",
                    "phrase": token,
                    "repeated_word": parts[0],
                    "token_index": i,
                    "occurrence_count": len(parts),
                })
                i += 1
                continue

        # 2. Check for consecutive single-word duplicate ('the the', 'i i')
        if i + 1 < len(tokens) and token == tokens[i + 1]:
            repeat_count = 2
            while i + repeat_count < len(tokens) and tokens[i + repeat_count] == token:
                repeat_count += 1

            candidates.append({
                "id": f"rep-{len(candidates) + 1}",
                "type": "consecutive_word",
                "phrase": " ".join([token] * repeat_count),
                "repeated_word": token,
                "token_index": i,
                "occurrence_count": repeat_count,
            })
            i += repeat_count
            continue

        # 3. Check for 2-word phrase duplicate ('in the in the')
        if i + 3 < len(tokens):
            if tokens[i:i + 2] == tokens[i + 2:i + 4]:
                phrase = " ".join(tokens[i:i + 2])
                candidates.append({
                    "id": f"rep-{len(candidates) + 1}",
                    "type": "phrase_repetition",
                    "phrase": f"{phrase} {phrase}",
                    "repeated_word": phrase,
                    "token_index": i,
                    "occurrence_count": 2,
                })
                i += 4
                continue

        i += 1

    return candidates


def compute_repetition_rate(
    repetition_event_count: int,
    word_count: int,
) -> Dict[str, Any]:
    """
    Computes Repetition Rate (%) = 100 * R / W
    Where:
    - R = annotated/detected repetition events
    - W = eligible spoken-word count
    """
    if word_count <= 0:
        return {
            "repetition_rate_percent": None,
            "repetition_event_count": repetition_event_count,
            "word_count": word_count,
            "status": "unavailable",
            "reason": "Eligible word count is zero.",
        }

    rate = round((100.0 * repetition_event_count) / word_count, 2)
    return {
        "repetition_rate_percent": rate,
        "repetition_event_count": repetition_event_count,
        "word_count": word_count,
        "status": "valid",
        "reason": None,
    }


def detect_candidate_self_corrections(
    text: str,
    tokens: List[str],
) -> List[Dict[str, Any]]:
    """
    Detects candidate self-correction patterns without automatic classification.
    Identifies conversational repair cues:
    - Pivot cues: 'actually', 'i mean', 'rather', 'sorry', 'or rather'
    - Tense / verb correction patterns (e.g. 'i work—worked', 'i go—went')
    """
    candidates: List[Dict[str, Any]] = []
    norm_text = text.lower()

    # Pattern cues
    patterns = [
        (r"\b(\w[\w\s]{1,20}?)\s+(?:actually|i mean|or rather|sorry)\s+(\w[\w\s]{1,20}?)\b", "pivot_cue"),
        (r"\b(\w+)[—\-](\w+)\b", "false_start_dash"),
    ]

    for pat, pat_type in patterns:
        for match in re.finditer(pat, norm_text):
            orig = match.group(1).strip()
            repl = match.group(2).strip()
            if orig and repl and orig != repl:
                candidates.append({
                    "id": f"sc-{len(candidates) + 1}",
                    "original_phrase": orig,
                    "replacement_phrase": repl,
                    "detection_method": pat_type,
                    "span": match.group(0),
                    "reviewer_decision": "pending",
                    "notes": f"Detected via pattern cue '{pat_type}'",
                })

    return candidates


def compute_quantitative_errors(
    paired_values: List[Tuple[float, float]],
    unit_label: str = "",
) -> Dict[str, Any]:
    """
    Computes quantitative error metrics between automatic and reference measurements:
    - MAE = sum(|auto - ref|) / n
    - Median Absolute Error = median(|auto - ref|)
    - Signed Differences = [auto_i - ref_i]
    """
    if not paired_values:
        return {
            "eligible_pairs_count": 0,
            "mean_absolute_error": None,
            "median_absolute_error": None,
            "mean_signed_difference": None,
            "signed_differences": [],
            "unit": unit_label,
            "status": "unavailable",
            "reason": "No paired measurements available for comparison.",
        }

    signed_diffs = [round(auto - ref, 3) for auto, ref in paired_values]
    abs_diffs = [abs(d) for d in signed_diffs]

    mae = round(sum(abs_diffs) / len(abs_diffs), 3)

    sorted_abs = sorted(abs_diffs)
    mid = len(sorted_abs) // 2
    if len(sorted_abs) % 2 == 1:
        median_ae = round(sorted_abs[mid], 3)
    else:
        median_ae = round((sorted_abs[mid - 1] + sorted_abs[mid]) / 2.0, 3)

    mean_signed = round(sum(signed_diffs) / len(signed_diffs), 3)

    return {
        "eligible_pairs_count": len(paired_values),
        "mean_absolute_error": mae,
        "median_absolute_error": median_ae,
        "mean_signed_difference": mean_signed,
        "signed_differences": signed_diffs,
        "unit": unit_label,
        "status": "valid",
        "reason": None,
    }


def evaluate_event_detection(
    detected_events: List[Dict[str, Any]],
    reference_events: List[Dict[str, Any]],
    tolerance_seconds: float = 0.25,
) -> Dict[str, Any]:
    """
    Evaluates event detection (pauses, repetitions) against manually verified references.
    Implements 1-to-1 matching with temporal tolerance.
    Returns Precision, Recall, and F1.
    """
    num_det = len(detected_events)
    num_ref = len(reference_events)

    if num_det == 0 and num_ref == 0:
        return {
            "true_positives": 0,
            "false_positives": 0,
            "false_negatives": 0,
            "precision": None,
            "recall": None,
            "f1_score": None,
            "status": "undefined",
            "reason": "Both detected and reference event counts are zero (no events to evaluate).",
        }

    # Match detected to reference based on timestamps or token index
    matched_refs = set()
    tp = 0

    for det in detected_events:
        det_start = det.get("start_seconds") or det.get("token_index")
        if det_start is None:
            continue

        best_match_idx = None
        min_dist = float("inf")

        for r_idx, ref in enumerate(reference_events):
            if r_idx in matched_refs:
                continue

            ref_start = ref.get("start_seconds") or ref.get("token_index")
            if ref_start is None:
                continue

            dist = abs(float(det_start) - float(ref_start))
            if dist <= tolerance_seconds and dist < min_dist:
                min_dist = dist
                best_match_idx = r_idx

        if best_match_idx is not None:
            matched_refs.add(best_match_idx)
            tp += 1

    fp = num_det - tp
    fn = num_ref - tp

    precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else None
    recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else None

    if precision is not None and recall is not None and (precision + recall) > 0:
        f1 = round((2.0 * precision * recall) / (precision + recall), 4)
    else:
        f1 = None

    return {
        "true_positives": tp,
        "false_positives": fp,
        "false_negatives": fn,
        "precision": precision,
        "recall": recall,
        "f1_score": f1,
        "tolerance_seconds": tolerance_seconds,
        "status": "valid" if (precision is not None or recall is not None) else "undefined",
        "reason": None if (precision is not None and recall is not None) else "Zero in denominator.",
    }
