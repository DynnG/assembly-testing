"""
Articula: Hybrid Audio Processing & Phoneme-Level Pronunciation Characteristic Analyzer
Integrates AssemblyAI Speech-to-Text with Hugging Face facebook/wav2vec2-lv-60-espeak-cv-ft.

Processing Pipeline Architecture:
1. Whole-Response Processing:
   - Full audio recording is submitted to AssemblyAI for complete transcription and contextual recognition.
   - Retrieves whole-response transcription, word sequence, speaker info, and word-level timestamps/confidence.
2. Word-Level Extraction:
   - Audio is analyzed at its native sample rate (without assuming 16 kHz).
   - AssemblyAI millisecond timestamps (start_ms, end_ms) are converted to native sample indices:
     start_sample = int((start_ms / 1000) * native_sample_rate)
     end_sample = int((end_ms / 1000) * native_sample_rate)
   - Configurable acoustic boundary padding preserves onsets, bursts, and coda transitions.
3. Word Audio Segment Generation:
   - Extracts isolated word audio clips (e.g. word_001.wav, word_002.wav) from the unmodified original recording.
   - Encodes slices to 16 kHz mono WAV base64 data URIs for direct web playback.
4. Targeted Wav2Vec2Phoneme Analysis:
   - Resamples word slices to 16 kHz mono float32.
   - Runs batched inference using facebook/wav2vec2-lv-60-espeak-cv-ft with attention masking.
   - Decodes acoustic features into phonetic representations (IPA).
5. Unified Results Structure & Context Preservation:
   - Retains whole-utterance contextual reference while offering word-level acoustic insights.
   - Flags candidate tokens for human review (low confidence, boundary anomalies, phonetic deviations).
"""

import base64
import io
import math
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from phoneme_comparison import (
    ExpectedPhonemeGenerator,
    compare_word_phonemes,
    tokenize_phoneme_sequence,
    align_phoneme_sequences,
    select_best_variant_alignment,
    generate_pronunciation_findings,
    classify_phonetic_token,
    arpabet_to_ipa,
    normalize_ipa_symbol,
)

# Lazy global model and processor singletons
_MODEL = None
_PROCESSOR = None
_MODEL_INITIALIZATION_ERROR = None

# Reference IPA dictionary for core research scenarios and common English vocabulary
# Provides reference phonetic baseline for observational comparison against predictions
CANONICAL_IPA_REFERENCE: Dict[str, str] = {
    "the": "ð ə",
    "purpose": "p ˈɜː p ə s",
    "of": "ə v",
    "this": "ð ɪ s",
    "research": "ɹ ɪ s ˈɜː tʃ",
    "is": "ɪ z",
    "to": "t uː",
    "evaluate": "ɪ v ˈæ l j uː ˌeɪ t",
    "automatic": "ˌɔː t ə m ˈæ t ɪ k",
    "speech": "s p ˈiː tʃ",
    "recognition": "ˌɹ ɛ k ə ɡ n ˈɪ ʃ ə n",
    "for": "f ɔː",
    "conversational": "ˌk ɒ n v ə s ˈeɪ ʃ n ə l",
    "voice": "v ˈɔɪ s",
    "analysis": "ə n ˈæ l ə s ɪ s",
    "um": "ʌ m",
    "uh": "ʌ",
    "well": "w ˈɛ l",
    "i": "aɪ",
    "think": "θ ˈɪ ŋ k",
    "that": "ð æ t",
    "effective": "ɪ f ˈɛ k t ɪ v",
    "communication": "k ə ˌm j uː n ɪ k ˈeɪ ʃ n",
    "requires": "ɹ ɪ k w ˈaɪ ə z",
    "active": "ˈæ k t ɪ v",
    "listening": "l ˈɪ s n ɪ ŋ",
    "want": "w ɒ n t",
    "explain": "ɪ k s p l ˈeɪ n",
    "main": "m ˈeɪ n",
    "challenge": "tʃ ˈæ l ɪ n dʒ",
    "public": "p ˈʌ b l ɪ k",
    "speaking": "s p ˈiː k ɪ ŋ",
    "confidence": "k ˈɒ n f ɪ d ə n s",
    "last": "l ɑː s t",
    "year": "j ˈɪə",
    "work": "w ˈɜː k",
    "worked": "w ˈɜː k t",
    "in": "ɪ n",
    "a": "ə",
    "multicultural": "ˌm ʌ l t i k ˈʌ l tʃ ə ɹ ə l",
    "team": "t ˈiː m",
    "and": "æ n d",
    "learned": "l ˈɜː n d",
    "adapt": "ə d ˈæ p t",
    "hello": "h ə l ˈəʊ",
    "world": "w ˈɜː l d",
    "english": "ˈɪ ŋ ɡ l ɪ ʃ",
    "pronunciation": "p ɹ ə ˌn ʌ n s i ˈeɪ ʃ n",
    "improve": "ɪ m p ɹ ˈuː v",
}

# Module singleton reference pronunciation generator
_EXPECTED_GENERATOR = ExpectedPhonemeGenerator(canonical_overrides=CANONICAL_IPA_REFERENCE)


def get_phoneme_model():
    """
    Singleton loader for Wav2Vec2Processor and Wav2Vec2ForCTC.
    Loads model once into memory and reuses it across requests in inference mode.
    First tries local cache with local_files_only=True for instant offline execution.
    """
    global _MODEL, _PROCESSOR, _MODEL_INITIALIZATION_ERROR

    if _MODEL is not None and _PROCESSOR is not None:
        return _PROCESSOR, _MODEL

    if _MODEL_INITIALIZATION_ERROR is not None:
        raise RuntimeError(f"Wav2Vec2Phoneme failed earlier: {_MODEL_INITIALIZATION_ERROR}")

    try:
        from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

        model_id = "facebook/wav2vec2-lv-60-espeak-cv-ft"

        # Try local cache first
        try:
            processor = Wav2Vec2Processor.from_pretrained(model_id, local_files_only=True)
            model = Wav2Vec2ForCTC.from_pretrained(model_id, local_files_only=True)
        except Exception:
            processor = Wav2Vec2Processor.from_pretrained(model_id)
            model = Wav2Vec2ForCTC.from_pretrained(model_id)

        model.eval()
        _PROCESSOR = processor
        _MODEL = model
        return _PROCESSOR, _MODEL
    except Exception as exc:
        _MODEL_INITIALIZATION_ERROR = str(exc)
        raise RuntimeError(f"Failed to load Wav2Vec2Phoneme model: {exc}") from exc


def decode_audio_native(audio_bytes: bytes, filename: str = "") -> Tuple[np.ndarray, int, int, float]:
    """
    Decodes audio bytes in any format (WAV, MP3, WebM, M4A, OGG, FLAC) into a
    single-channel (mono) float32 numpy array at its NATIVE sample rate.

    Returns:
        audio_mono: 1D float32 numpy array
        native_sample_rate: native sample rate in Hz (e.g. 44100, 48000, 16000)
        channels: number of original audio channels (1 for mono, 2 for stereo, etc.)
        duration_seconds: duration of original audio in seconds
    """
    # 1. Try PyAV (av) for robust multi-format support (WebM Opus, MP3, M4A AAC, WAV)
    try:
        import av

        with io.BytesIO(audio_bytes) as bio:
            container = av.open(bio)
            audio_stream = next((s for s in container.streams if s.type == "audio"), None)
            if audio_stream is not None:
                native_sr = audio_stream.sample_rate or 44100
                channels = audio_stream.channels or 1

                # Decode frames to float32 mono
                frames = []
                for frame in container.decode(audio_stream):
                    arr = frame.to_ndarray()  # shape (channels, samples)
                    if arr.ndim > 1:
                        arr = arr.mean(axis=0)
                    else:
                        arr = arr.squeeze()
                    frames.append(arr.astype(np.float32))

                if frames:
                    full_signal = np.concatenate(frames, axis=0)
                    # Normalize int ranges to float32 [-1.0, 1.0] if needed
                    max_abs = np.max(np.abs(full_signal)) if len(full_signal) > 0 else 0.0
                    if max_abs > 1.0:
                        full_signal = full_signal / max(max_abs, 32768.0)

                    duration = len(full_signal) / native_sr
                    return full_signal.astype(np.float32), native_sr, channels, duration
    except Exception:
        pass

    # 2. Fallback to soundfile
    try:
        import soundfile as sf

        with io.BytesIO(audio_bytes) as bio:
            data, native_sr = sf.read(bio, dtype="float32")

        channels = 1
        if data.ndim > 1:
            channels = data.shape[1]
            data = data.mean(axis=1)

        duration = len(data) / native_sr
        return data.astype(np.float32), native_sr, channels, duration
    except Exception as exc:
        raise ValueError(f"Could not decode audio file: {exc}") from exc


def resample_to_16k_mono(audio_slice: np.ndarray, orig_sr: int) -> np.ndarray:
    """
    Resamples a 1D float32 mono audio slice to exactly 16,000 Hz.
    If already 16,000 Hz, returns audio slice unchanged.
    """
    target_sr = 16000
    if orig_sr == target_sr:
        return audio_slice.astype(np.float32)

    import scipy.signal

    gcd = math.gcd(orig_sr, target_sr)
    up = target_sr // gcd
    down = orig_sr // gcd
    resampled = scipy.signal.resample_poly(audio_slice, up, down).astype(np.float32)
    return resampled


def decode_audio_to_mono_16k(audio_bytes: bytes, filename: str = "") -> Tuple[np.ndarray, int]:
    """
    Convenience decoder that decodes audio and resamples to 16 kHz mono.
    Maintained for backward compatibility and test verification.
    """
    audio_native, native_sr, _, _ = decode_audio_native(audio_bytes, filename)
    audio_16k = resample_to_16k_mono(audio_native, native_sr)
    return audio_16k, 16000


def encode_slice_to_wav_base64(audio_slice_16k: np.ndarray, sample_rate: int = 16000) -> str:
    """
    Encodes a 1D float32 audio slice into a 16-bit PCM WAV base64 data URI.
    Allows instant in-browser playback without filesystem writes.
    """
    try:
        import soundfile as sf

        clipped = np.clip(audio_slice_16k, -1.0, 1.0)
        buffer = io.BytesIO()
        sf.write(buffer, clipped, sample_rate, format="WAV", subtype="PCM_16")
        wav_bytes = buffer.getvalue()
        b64_str = base64.b64encode(wav_bytes).decode("ascii")
        return f"data:audio/wav;base64,{b64_str}"
    except Exception:
        return ""


def extract_word_segment(
    audio_native: np.ndarray,
    native_sr: int,
    start_ms: Optional[Union[int, float]],
    end_ms: Optional[Union[int, float]],
    padding_ms: int = 25,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], str, Optional[str]]:
    """
    Extracts an individual word audio segment from the original native audio signal.

    Algorithm:
    1. Converts AssemblyAI millisecond timestamps to exact sample indices using native_sr:
       start_sample = int((start_ms / 1000) * native_sr)
       end_sample = int((end_ms / 1000) * native_sr)
    2. Applies configurable boundary padding (default 25 ms) to preserve plosive release bursts,
       fricative onsets, and coda transitions while bounding within original audio duration.
    3. Resamples extracted segment to 16 kHz mono for Wav2Vec2 acoustic model.

    Returns:
        (word_slice_native, word_slice_16k, segmentation_status, segmentation_notes)
    """
    if start_ms is None or end_ms is None:
        return None, None, "missing_timestamps", "AssemblyAI did not return start or end timestamps for this token."

    if end_ms <= start_ms:
        return None, None, "invalid_duration", f"End timestamp ({end_ms}ms) <= start timestamp ({start_ms}ms)."

    total_samples = len(audio_native)
    total_duration_sec = total_samples / native_sr

    # Timestamp conversion to sample indices at native sample rate
    start_sec = max(0.0, start_ms / 1000.0)
    end_sec = min(total_duration_sec, end_ms / 1000.0)

    # Configurable padding around word boundaries
    pad_sec = max(0.0, padding_ms / 1000.0)
    padded_start_sec = max(0.0, start_sec - pad_sec)
    padded_end_sec = min(total_duration_sec, end_sec + pad_sec)

    start_idx = int(padded_start_sec * native_sr)
    end_idx = int(padded_end_sec * native_sr)

    if start_idx >= total_samples or end_idx <= start_idx:
        return None, None, "out_of_bounds", "Calculated sample indices fall outside audio waveform boundaries."

    # Extract slice from original recording
    word_slice_native = audio_native[start_idx:end_idx]

    # Resample slice to 16 kHz for Wav2Vec2 model
    word_slice_16k = resample_to_16k_mono(word_slice_native, native_sr)

    # Quality and duration checks on 16k slice
    notes = []
    status = "valid"

    if len(word_slice_16k) < 400:
        notes.append("Segment duration is under 25ms (under acoustic model receptive field); phonetic inference skipped.")
    elif len(word_slice_16k) < 480:
        notes.append("Segment duration is under 30ms; phonetic prediction may be imprecise.")

    rms_energy = np.sqrt(np.mean(word_slice_16k**2)) if len(word_slice_16k) > 0 else 0.0
    if rms_energy < 1e-4:
        status = "near_silence"
        notes.append("Audio segment energy is near zero (silent or inaudible transient).")

    notes_str = "; ".join(notes) if notes else None
    return word_slice_native, word_slice_16k, status, notes_str


def predict_phonemes_batch(
    audio_slices_16k: List[np.ndarray],
    batch_size: int = 16,
) -> List[Tuple[Optional[str], List[str], Optional[str]]]:
    """
    Performs batched acoustic phoneme prediction using Wav2Vec2Phoneme (espeak-cv-ft).
    Loads model once and runs inference in torch.inference_mode() with dynamic padding.

    Returns:
        List of tuples: (phoneme_str, phoneme_tokens, error_note)
    """
    if not audio_slices_16k:
        return []

    try:
        import torch
        processor, model = get_phoneme_model()
    except Exception as exc:
        return [(None, [], f"Model unavailable: {str(exc)}")] * len(audio_slices_16k)

    results: List[Tuple[Optional[str], List[str], Optional[str]]] = [
        (None, [], None) for _ in range(len(audio_slices_16k))
    ]

    # Find valid slices with at least 400 samples (25ms receptive field)
    valid_indices = [
        i for i, s in enumerate(audio_slices_16k)
        if s is not None and len(s) >= 400
    ]

    if not valid_indices:
        return results

    # Process in batches
    for b_start in range(0, len(valid_indices), batch_size):
        b_indices = valid_indices[b_start : b_start + batch_size]
        batch_slices = [audio_slices_16k[i] for i in b_indices]

        try:
            inputs = processor(
                batch_slices,
                sampling_rate=16000,
                padding=True,
                return_tensors="pt",
            )
            with torch.inference_mode():
                attention_mask = inputs.get("attention_mask")
                logits = model(inputs.input_values, attention_mask=attention_mask).logits
                predicted_ids = torch.argmax(logits, dim=-1)
                decoded_list = processor.batch_decode(predicted_ids)

            for idx, decoded in zip(b_indices, decoded_list):
                cleaned_str = decoded.strip()
                tokens = [t for t in cleaned_str.split(" ") if t]
                results[idx] = (cleaned_str, tokens, None)
        except Exception as inf_exc:
            for idx in b_indices:
                results[idx] = (None, [], f"Inference error: {str(inf_exc)}")

    return results


def check_requires_human_review(
    confidence: Optional[float],
    segmentation_status: str,
    segmentation_notes: Optional[str],
    predicted_phonemes: Optional[str],
    reference_phonemes: Optional[str],
    phoneme_error_rate: Optional[float] = None,
) -> bool:
    """
    Evaluates whether an individual word segment warrants human reviewer attention.
    Triggers on:
    - Low ASR decoding confidence (< 0.85)
    - Boundary or segmentation warnings (near silence, out of bounds, short duration)
    - Non-zero Phoneme Error Rate (PER > 0) or discrepancy against reference phonemes
    """
    if confidence is not None and confidence < 0.85:
        return True
    if segmentation_status not in ("valid",):
        return True
    if segmentation_notes is not None and "under 25ms" in segmentation_notes:
        return True
    if phoneme_error_rate is not None and phoneme_error_rate > 0.0:
        return True
    if reference_phonemes and predicted_phonemes:
        # Check if predicted phoneme sequence differs markedly from reference
        ref_norm = reference_phonemes.replace(" ", "").replace("ˈ", "").replace("ˌ", "")
        pred_norm = predicted_phonemes.replace(" ", "").replace("ˈ", "").replace("ˌ", "")
        if ref_norm and pred_norm and ref_norm != pred_norm:
            return True
    return False


def build_unified_hybrid_result(
    recording_id: str,
    full_transcription: str,
    audio_metadata: Dict[str, Any],
    words: List[Dict[str, Any]],
    raw_metadata: Optional[Dict[str, Any]] = None,
    preferred_accent: str = "General English",
) -> Dict[str, Any]:
    """
    Constructs the structured Stage 6 hybrid results payload preserving whole-response
    contextual metadata alongside individual extracted word segments and pronunciation findings.
    """
    all_findings = []
    pers = []
    for w in words:
        findings = w.get("pronunciation_findings") or []
        all_findings.extend(findings)
        per = w.get("phoneme_error_rate")
        if per is not None and isinstance(per, (int, float)):
            pers.append(per)

    avg_per = round(sum(pers) / len(pers), 2) if pers else None

    return {
        "recording_id": recording_id,
        "full_transcription": full_transcription,
        "audio_metadata": audio_metadata,
        "words": words,
        "pronunciation_summary": {
            "average_phoneme_error_rate": avg_per,
            "total_words_analyzed": len(words),
            "words_with_findings": len([w for w in words if w.get("findings_count", 0) > 0]),
            "total_findings": len(all_findings),
            "accent_variety": preferred_accent,
        },
        "pronunciation_findings": all_findings,
        "raw_metadata": raw_metadata or {},
    }


def analyze_words_phonemes(
    audio_bytes: bytes,
    words: List[Dict[str, Any]],
    filename: str = "",
    padding_ms: int = 25,
    recording_id: str = "recording_001",
    full_transcription: str = "",
    return_unified: bool = False,
    preferred_accent: str = "General English",
) -> Union[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Complete hybrid audio processing pipeline:
    1. Decodes the full recording at native sample rate, preserving whole-utterance duration & rate.
    2. Uses AssemblyAI word timestamps to extract individual word audio clips.
    3. Resamples extracted word segments to 16 kHz mono.
    4. Runs batched Hugging Face Wav2Vec2Phoneme acoustic inference.
    5. Compares expected vs predicted phonemes, aligns sequences, and calculates Phoneme Error Rate (PER).
    6. Produces structured evidence-based pronunciation findings for personalized feedback.
    7. Combines whole-response context with word-level diagnostics into a unified structure.

    If return_unified=True: returns structured dict with recording_id, full_transcription, audio_metadata, words, and findings.
    If return_unified=False: returns list of enriched word records (for full backward compatibility).
    """
    if not words:
        if return_unified:
            return build_unified_hybrid_result(
                recording_id=recording_id,
                full_transcription=full_transcription,
                audio_metadata={"duration": 0.0, "sample_rate": 16000, "channels": 1},
                words=[],
                preferred_accent=preferred_accent,
            )
        return []

    # 1. Decode original recording at native sample rate
    try:
        audio_native, native_sr, channels, duration_sec = decode_audio_native(audio_bytes, filename)
    except Exception as exc:
        # Fallback if audio decoding fails: retain word records with error annotations
        error_words = []
        for idx, w in enumerate(words):
            raw_w = str(w.get("text", ""))
            ref_res = _EXPECTED_GENERATOR.generate_expected(raw_w, preferred_accent=preferred_accent)
            error_words.append({
                "word_id": idx + 1,
                "token_index": idx + 1,
                "text": raw_w,
                "word": raw_w,
                "start_ms": w.get("start"),
                "end_ms": w.get("end"),
                "start": w.get("start"),
                "end": w.get("end"),
                "confidence": w.get("confidence"),
                "assembly_confidence": w.get("confidence"),
                "speaker": w.get("speaker"),
                "duration_ms": (
                    w.get("end") - w.get("start")
                    if (w.get("start") is not None and w.get("end") is not None)
                    else None
                ),
                "audio_clip": f"word_{idx + 1:03d}.wav",
                "audio_clip_base64": None,
                "phoneme_prediction": None,
                "phoneme_tokens": [],
                "expected_phonemes": ref_res.expected_phonemes,
                "expected_phonemes_str": ref_res.expected_phonemes_str,
                "predicted_phonemes": [],
                "predicted_phonemes_str": "",
                "reference_phonemes": ref_res.expected_phonemes_str,
                "reference_source": ref_res.reference_source,
                "reference_variants": [" ".join(v) for v in ref_res.all_variants],
                "selected_variant_index": ref_res.selected_variant_index,
                "accent_or_variety": ref_res.accent_or_variety,
                "alignment": [],
                "phoneme_error_rate": None,
                "per_metrics": None,
                "pronunciation_findings": [],
                "findings_count": 0,
                "analysis_status": "error",
                "segmentation_status": "error",
                "segmentation_notes": f"Audio decode failed: {str(exc)}",
                "requires_human_review": True,
            })

        if return_unified:
            return build_unified_hybrid_result(
                recording_id=recording_id,
                full_transcription=full_transcription,
                audio_metadata={"duration": 0.0, "sample_rate": 16000, "channels": 1},
                words=error_words,
                preferred_accent=preferred_accent,
            )
        return error_words

    audio_metadata = {
        "duration": round(duration_sec, 3),
        "sample_rate": native_sr,
        "channels": channels,
        "total_samples": len(audio_native),
    }

    # 2. Extract word segments and generate audio clips
    word_records = []
    slices_for_inference: List[Optional[np.ndarray]] = []

    for idx, w in enumerate(words):
        raw_text = str(w.get("text", "")).strip()
        cleaned_text = raw_text.lower().strip(".,!?;:\"'")
        start_ms = w.get("start") if w.get("start") is not None else w.get("start_ms")
        end_ms = w.get("end") if w.get("end") is not None else w.get("end_ms")
        confidence = w.get("confidence") if w.get("confidence") is not None else w.get("assembly_confidence")
        speaker = w.get("speaker")
        clip_filename = f"word_{idx + 1:03d}.wav"

        duration_ms = (end_ms - start_ms) if (start_ms is not None and end_ms is not None) else None

        # Pre-resolve expected phonemes
        ref_res = _EXPECTED_GENERATOR.generate_expected(raw_text, preferred_accent=preferred_accent)

        slice_native, slice_16k, seg_status, seg_notes = extract_word_segment(
            audio_native=audio_native,
            native_sr=native_sr,
            start_ms=start_ms,
            end_ms=end_ms,
            padding_ms=padding_ms,
        )

        # Generate base64 WAV clip for UI playback
        clip_b64 = None
        if slice_16k is not None and len(slice_16k) > 0:
            clip_b64 = encode_slice_to_wav_base64(slice_16k, sample_rate=16000)

        record = {
            "word_id": idx + 1,
            "token_index": idx + 1,
            "text": raw_text,
            "word": raw_text,
            "start_ms": start_ms,
            "end_ms": end_ms,
            "start": start_ms,
            "end": end_ms,
            "confidence": confidence,
            "assembly_confidence": confidence,
            "speaker": speaker,
            "duration_ms": duration_ms,
            "audio_clip": clip_filename,
            "audio_clip_base64": clip_b64,
            "phoneme_prediction": None,
            "phoneme_tokens": [],
            "expected_phonemes": ref_res.expected_phonemes,
            "expected_phonemes_str": ref_res.expected_phonemes_str,
            "predicted_phonemes": [],
            "predicted_phonemes_str": "",
            "reference_phonemes": ref_res.expected_phonemes_str,
            "reference_source": ref_res.reference_source,
            "reference_variants": [" ".join(v) for v in ref_res.all_variants],
            "selected_variant_index": ref_res.selected_variant_index,
            "accent_or_variety": ref_res.accent_or_variety,
            "alignment": [],
            "phoneme_error_rate": None,
            "per_metrics": None,
            "pronunciation_findings": [],
            "findings_count": 0,
            "analysis_status": "pending",
            "segmentation_status": seg_status,
            "segmentation_notes": seg_notes,
            "requires_human_review": False,
        }

        word_records.append(record)
        slices_for_inference.append(slice_16k if seg_status == "valid" else None)

    # 3. Targeted batched phonetic analysis
    eligible_slices = [s if s is not None else np.zeros(0, dtype=np.float32) for s in slices_for_inference]
    predictions = predict_phonemes_batch(eligible_slices, batch_size=16)

    # 4. Integrate phonetic predictions, perform sequence comparison, and generate findings
    for idx, (pred_str, tokens, err_note) in enumerate(predictions):
        rec = word_records[idx]
        word_text = rec["word"]

        if pred_str is not None:
            rec["phoneme_prediction"] = pred_str
            rec["phoneme_tokens"] = tokens
            rec["analysis_status"] = "completed"

            # Execute Expected vs Predicted Phoneme Comparison
            comparison = compare_word_phonemes(
                word=word_text,
                predicted_tokens=tokens,
                generator=_EXPECTED_GENERATOR,
                assembly_confidence=rec["assembly_confidence"],
                audio_clip=rec["audio_clip"],
                preferred_accent=preferred_accent,
            )
            rec["expected_phonemes"] = comparison["expected_phonemes"]
            rec["expected_phonemes_str"] = comparison["expected_phonemes_str"]
            rec["predicted_phonemes"] = comparison["predicted_phonemes"]
            rec["predicted_phonemes_str"] = comparison["predicted_phonemes_str"]
            rec["reference_phonemes"] = comparison["expected_phonemes_str"]
            rec["reference_source"] = comparison["reference_source"]
            rec["reference_variants"] = comparison["reference_variants"]
            rec["selected_variant_index"] = comparison["selected_variant_index"]
            rec["accent_or_variety"] = comparison["accent_or_variety"]
            rec["alignment"] = comparison["alignment"]
            rec["phoneme_error_rate"] = comparison["phoneme_error_rate"]
            rec["per_metrics"] = comparison["per_metrics"]
            rec["pronunciation_findings"] = comparison["pronunciation_findings"]
            rec["findings_count"] = comparison["findings_count"]

            rec["requires_human_review"] = check_requires_human_review(
                confidence=rec["assembly_confidence"],
                segmentation_status=rec["segmentation_status"],
                segmentation_notes=rec["segmentation_notes"],
                predicted_phonemes=rec["phoneme_prediction"],
                reference_phonemes=rec["reference_phonemes"],
                phoneme_error_rate=rec["phoneme_error_rate"],
            )
        else:
            if err_note:
                if rec["segmentation_notes"]:
                    rec["segmentation_notes"] += f"; {err_note}"
                else:
                    rec["segmentation_notes"] = err_note
                rec["analysis_status"] = "skipped" if "under 25ms" in str(rec["segmentation_notes"]) else "error"
            else:
                rec["analysis_status"] = "skipped"

            rec["requires_human_review"] = True

    if return_unified:
        return build_unified_hybrid_result(
            recording_id=recording_id,
            full_transcription=full_transcription or " ".join(r["text"] for r in word_records),
            audio_metadata=audio_metadata,
            words=word_records,
            preferred_accent=preferred_accent,
        )

    return word_records
