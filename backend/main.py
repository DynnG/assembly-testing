import asyncio
import io
import os
import time
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field
import httpx

from evaluation import (
    compute_word_alignment,
    compute_speech_rate,
    compute_pause_metrics,
    detect_candidate_repetitions,
    compute_repetition_rate,
    detect_candidate_self_corrections,
    compute_quantitative_errors,
    evaluate_event_detection,
    normalize_transcript,
    compute_session_fluency,
)
from silence_detector import detect_silence_in_wav
from phoneme_analyzer import analyze_words_phonemes, CANONICAL_IPA_REFERENCE
from phoneme_comparison import (
    ExpectedPhonemeGenerator,
    compare_word_phonemes,
    tokenize_phoneme_sequence,
)
from export_service import (
    generate_phoneme_dataset_csv,
    generate_phoneme_dataset_xlsx,
    generate_human_readable_report_txt,
)
from ai_summary_service import (
    build_expert_rule_based_summary,
    generate_llm_analysis_summary,
    build_post_conversation_report,
    generate_post_conversation_feedback_llm,
)
from gemini_service import (
    GeminiService,
    ConversationalResponseModel,
    PostAssessmentInterpretationModel,
    ExpressionAssistRequestModel,
    ExpressionAssistResponseModel,
    ConversationReflectionModel,
)

logger = logging.getLogger("articula.main")

# Reference pronunciation generator singleton for API endpoints
_MAIN_EXPECTED_GENERATOR = ExpectedPhonemeGenerator(canonical_overrides=CANONICAL_IPA_REFERENCE)

# Load environment variables from backend/.env or root .env
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

app = FastAPI(
    title="Articula ASR Testing Backend (AssemblyAI)",
    description="Standalone testing backend for evaluating AssemblyAI ASR API for Articula.",
    version="1.0.0",
)

# Configure CORS for local frontend development
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2"
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB limit for prototype
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".m4a", ".webm", ".ogg", ".flac", ".aac", ".mp4"}


def get_api_key() -> Optional[str]:
    """Retrieve AssemblyAI API key securely from environment, reloading dynamically if .env changed."""
    if env_path.exists():
        load_dotenv(dotenv_path=env_path, override=True)
    key = os.getenv("ASSEMBLYAI_API_KEY")
    if key:
        cleaned = key.strip()
        # Ensure user didn't leave placeholder unchanged
        if cleaned and cleaned != "your_api_key_here":
            return cleaned
    return None


@app.get("/health", summary="Check backend health and API key presence")
def health_check():
    """
    Returns backend health status and indicates whether the AssemblyAI and Gemini
    API keys are configured in the environment, without exposing the key values.
    """
    key = get_api_key()
    gemini_svc = GeminiService()
    return {
        "status": "ok",
        "api_key_configured": bool(key),
        "gemini_api_key_configured": gemini_svc.is_configured(),
        "gemini_model": gemini_svc.model,
    }


@app.post("/test-gemini-connection", summary="Test Gemini API connection and authentication")
async def test_gemini_connection():
    """
    Verifies that the Gemini API key is configured and can communicate with
    the official Gemini model (gemini-3.5-flash-lite) securely through the backend.
    """
    gemini_svc = GeminiService()
    if not gemini_svc.is_configured():
        return {
            "success": False,
            "error": "missing_api_key",
            "message": "GEMINI_API_KEY is not configured in backend/.env. Using deterministic expert fallback.",
        }
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_svc.model}:generateContent?key={gemini_svc.api_key.strip()}"
        body = {
            "contents": [{"parts": [{"text": "Hello"}]}],
            "generationConfig": {"maxOutputTokens": 5},
        }
        raw_res = await gemini_svc._post_with_retry(url, body)
        if raw_res:
            return {
                "success": True,
                "message": f"Successfully connected to Gemini API using model '{gemini_svc.model}'.",
                "model": gemini_svc.model,
            }
        else:
            return {
                "success": False,
                "message": "Gemini API request failed or timed out. Check your GEMINI_API_KEY in backend/.env.",
            }
    except Exception as exc:
        return {
            "success": False,
            "error": str(exc),
            "message": f"Gemini connection error: {str(exc)}",
        }


@app.post("/test-connection", summary="Test AssemblyAI API connection and authentication")
async def test_connection():
    """
    Performs a lightweight authenticated request to AssemblyAI's list transcripts endpoint
    with limit=1 to verify authentication without starting a transcription job or uploading audio.
    """
    api_key = get_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "missing_api_key",
                "message": "AssemblyAI API key is missing. Please create a backend/.env file with ASSEMBLYAI_API_KEY=your_key.",
            },
        )

    headers = {
        "Authorization": api_key,
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{ASSEMBLYAI_BASE_URL}/transcript?limit=1",
                headers=headers,
            )

        if response.status_code == 200:
            return {
                "success": True,
                "message": "Successfully authenticated with AssemblyAI API.",
                "status_code": 200,
            }
        elif response.status_code == 401:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "success": False,
                    "error": "invalid_api_key",
                    "message": "AssemblyAI rejected authentication (401 Unauthorized). Check your API key in backend/.env.",
                },
            )
        elif response.status_code == 403:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "success": False,
                    "error": "forbidden",
                    "message": "AssemblyAI account is forbidden (403 Forbidden). Check account permissions or billing tier.",
                },
            )
        elif response.status_code == 429:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "success": False,
                    "error": "rate_limited",
                    "message": "AssemblyAI rate limit reached. Please wait a moment before retrying.",
                },
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail={
                    "success": False,
                    "error": "api_error",
                    "message": f"AssemblyAI returned HTTP {response.status_code}: {response.text[:200]}",
                },
            )

    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "success": False,
                "error": "network_connection_error",
                "message": "Unable to connect to AssemblyAI servers (network failure or DNS error). Check your internet connection.",
            },
        )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={
                "success": False,
                "error": "timeout",
                "message": "Connection to AssemblyAI servers timed out. Check your network or firewall.",
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "error": "unexpected_error",
                "message": f"An unexpected error occurred: {str(exc)}",
            },
        )


@app.post("/transcribe", summary="Upload audio and run AssemblyAI speech-to-text")
async def transcribe_audio(
    file: UploadFile = File(...),
    disfluencies: bool = Form(True),
    phoneme_analysis: bool = Form(True),
    speaking_mode: str = Form("prompted"),
    prompt_target: Optional[str] = Form(None),
    recording_id: Optional[str] = Form(None),
):
    """
    Accepts an audio file, streams it directly to AssemblyAI's upload endpoint,
    requests transcription with optional disfluency preservation (filler words),
    and polls until the transcription is complete.
    No audio or transcript is permanently stored on the server.
    """
    start_time = time.time()

    api_key = get_api_key()
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "missing_api_key",
                "message": "AssemblyAI API key is missing. Please configure ASSEMBLYAI_API_KEY in backend/.env.",
            },
        )

    # Validate file extension if filename is present
    filename = file.filename or "recording.webm"
    ext = Path(filename).suffix.lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "unsupported_audio_format",
                "message": f"Unsupported audio format '{ext}'. Supported formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            },
        )

    # Read audio bytes with file size guard
    try:
        audio_content = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "read_error",
                "message": f"Failed to read uploaded audio: {str(exc)}",
            },
        )

    if not audio_content or len(audio_content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "success": False,
                "error": "empty_file",
                "message": "Uploaded audio file is empty (0 bytes).",
            },
        )

    if len(audio_content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "success": False,
                "error": "file_too_large",
                "message": f"File exceeds the maximum test size limit of 50 MB (size: {len(audio_content) / (1024 * 1024):.1f} MB).",
            },
        )

    # Acoustic silence analysis on WAV signal
    silence_result = None
    if filename.lower().endswith(".wav"):
        silence_result = detect_silence_in_wav(
            audio_content,
            min_pause_duration_seconds=0.25,
            silence_threshold_db=-35.0,
        )
    else:
        silence_result = {
            "detected_pauses": [],
            "pause_count": 0,
            "total_pause_duration_seconds": 0.0,
            "mean_pause_duration_seconds": None,
            "audio_duration_seconds": None,
            "status": "unavailable",
            "reason": "Backend signal analysis is optimized for uncompressed PCM WAV. Browser Web Audio API analyzes silence for compressed formats (WebM/MP3/M4A).",
        }

    headers = {
        "Authorization": api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            # 1. Upload audio bytes directly to AssemblyAI
            upload_response = await client.post(
                f"{ASSEMBLYAI_BASE_URL}/upload",
                headers=headers,
                content=audio_content,
            )

            if upload_response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "success": False,
                        "error": "upload_failed",
                        "message": f"AssemblyAI upload failed (HTTP {upload_response.status_code}): {upload_response.text[:200]}",
                    },
                )

            upload_result = upload_response.json()
            upload_url = upload_result.get("upload_url")
            if not upload_url:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "success": False,
                        "error": "upload_url_missing",
                        "message": "AssemblyAI did not return an upload URL.",
                    },
                )

            # 2. Submit transcription job
            transcript_payload = {
                "audio_url": upload_url,
                "disfluencies": disfluencies,
            }

            transcript_response = await client.post(
                f"{ASSEMBLYAI_BASE_URL}/transcript",
                headers={
                    "Authorization": api_key,
                    "Content-Type": "application/json",
                },
                json=transcript_payload,
            )

            if transcript_response.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "success": False,
                        "error": "transcript_request_failed",
                        "message": f"AssemblyAI transcript request failed (HTTP {transcript_response.status_code}): {transcript_response.text[:200]}",
                    },
                )

            transcript_data = transcript_response.json()
            transcript_id = transcript_data.get("id")
            if not transcript_id:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail={
                        "success": False,
                        "error": "transcript_id_missing",
                        "message": "AssemblyAI did not return a transcript ID.",
                    },
                )

            # 3. Poll for completion
            polling_url = f"{ASSEMBLYAI_BASE_URL}/transcript/{transcript_id}"
            max_poll_time_seconds = 180  # 3 minutes maximum polling
            poll_interval = 1.5
            poll_start = time.time()

            completed_data = None
            while (time.time() - poll_start) < max_poll_time_seconds:
                poll_response = await client.get(
                    polling_url,
                    headers=headers,
                )

                if poll_response.status_code != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={
                            "success": False,
                            "error": "polling_failed",
                            "message": f"Error polling AssemblyAI status (HTTP {poll_response.status_code}): {poll_response.text[:200]}",
                        },
                    )

                status_obj = poll_response.json()
                current_status = status_obj.get("status")

                if current_status == "completed":
                    completed_data = status_obj
                    break
                elif current_status == "error":
                    error_msg = status_obj.get("error", "Unknown transcription error from AssemblyAI")
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail={
                            "success": False,
                            "error": "transcription_error",
                            "message": f"AssemblyAI transcription error: {error_msg}",
                        },
                    )

                await asyncio.sleep(poll_interval)

            if not completed_data:
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail={
                        "success": False,
                        "error": "polling_timeout",
                        "message": f"Transcription took longer than {max_poll_time_seconds} seconds to complete.",
                    },
                )

    except HTTPException:
        raise
    except httpx.ConnectError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "success": False,
                "error": "network_connection_error",
                "message": "Network connection error while communicating with AssemblyAI.",
            },
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "error": "transcription_exception",
                "message": f"Unexpected error during transcription: {str(exc)}",
            },
        )

    elapsed_time = round(time.time() - start_time, 2)

    # Word-level timestamps & confidence (only if returned by AssemblyAI)
    words = completed_data.get("words") or []
    cleaned_words = [
        {
            "text": w.get("text"),
            "word": w.get("text"),
            "start": w.get("start"),
            "end": w.get("end"),
            "confidence": w.get("confidence"),
            "assembly_confidence": w.get("confidence"),
            "speaker": w.get("speaker"),
        }
        for w in words
        if isinstance(w, dict)
    ]

    phoneme_meta = {
        "enabled": phoneme_analysis,
        "model": "facebook/wav2vec2-lv-60-espeak-cv-ft",
        "status": "skipped" if not phoneme_analysis else "pending",
        "notes": None,
    }

    transcript_id = completed_data.get("id") or f"transcript_{int(time.time())}"
    full_text = completed_data.get("text", "")
    audio_meta_info = {
        "duration": completed_data.get("audio_duration"),
        "sample_rate": 16000,
        "channels": 1,
    }

    eff_recording_id = recording_id or transcript_id

    # Integrate Hugging Face Wav2Vec2Phoneme for pronunciation characteristic analysis
    if phoneme_analysis and cleaned_words:
        try:
            hybrid_result = analyze_words_phonemes(
                audio_bytes=audio_content,
                words=cleaned_words,
                filename=filename,
                padding_ms=25,
                recording_id=eff_recording_id,
                full_transcription=full_text,
                return_unified=True,
                speaking_mode=speaking_mode,
                prompt_target=prompt_target,
            )
            cleaned_words = hybrid_result.get("words", cleaned_words)
            if hybrid_result.get("audio_metadata"):
                audio_meta_info = hybrid_result["audio_metadata"]
            phoneme_meta["status"] = "completed"
            phoneme_meta["analyzed_tokens"] = len(cleaned_words)
        except Exception as pe:
            # Preserve AssemblyAI transcription if phoneme analysis encounters an error
            phoneme_meta["status"] = "error"
            phoneme_meta["notes"] = f"Phoneme analysis warning: {str(pe)}"
    elif not phoneme_analysis:
        phoneme_meta["status"] = "disabled"

    # Explicitly release memory reference to uploaded audio bytes
    del audio_content

    # Generate initial AI-assisted interpretation from validated findings
    ai_summary_result = None
    if phoneme_analysis and cleaned_words:
        try:
            findings_for_summary = hybrid_result.get("pronunciation_findings", []) if "hybrid_result" in locals() and isinstance(hybrid_result, dict) else []
            ai_summary_result = build_expert_rule_based_summary(
                full_transcription=full_text,
                words=cleaned_words,
                pronunciation_findings=findings_for_summary,
                preferred_accent="General English",
            )
        except Exception:
            ai_summary_result = None

    return {
        "success": True,
        "id": transcript_id,
        "recording_id": eff_recording_id,
        "speaking_mode": speaking_mode,
        "prompt_target": prompt_target,
        "status": completed_data.get("status"),
        "text": full_text,
        "full_transcription": full_text,
        "confidence": completed_data.get("confidence"),
        "audio_duration": completed_data.get("audio_duration"),
        "audio_metadata": audio_meta_info,
        "words": cleaned_words,
        "disfluencies_enabled": disfluencies,
        "phoneme_analysis": phoneme_meta,
        "pronunciation_summary": hybrid_result.get("pronunciation_summary") if (phoneme_analysis and "hybrid_result" in locals() and isinstance(hybrid_result, dict)) else None,
        "pronunciation_findings": hybrid_result.get("pronunciation_findings") if (phoneme_analysis and "hybrid_result" in locals() and isinstance(hybrid_result, dict)) else [],
        "ai_summary": ai_summary_result,
        "processing_time_sec": elapsed_time,
        "filename": filename,
        "silence_analysis": silence_result,
        "raw_metadata": {
            "id": transcript_id,
            "status": completed_data.get("status"),
            "audio_duration": completed_data.get("audio_duration"),
            "confidence": completed_data.get("confidence"),
            "language_code": completed_data.get("language_code"),
            "acoustic_model": completed_data.get("acoustic_model"),
            "language_model": completed_data.get("language_model"),
            "punctuate": completed_data.get("punctuate"),
            "format_text": completed_data.get("format_text"),
        },
    }


@app.post("/analyze-phonemes", summary="Run standalone Wav2Vec2Phoneme analysis on audio with word timestamps")
async def analyze_phonemes_endpoint(
    file: UploadFile = File(...),
    words_json: str = Form(..., description="JSON serialized array of word objects with text, start, end, confidence"),
    padding_ms: int = Form(25),
):
    """
    Accepts an audio file and word timestamp list, performs audio segmentation,
    and returns phonetic predictions from Hugging Face Wav2Vec2Phoneme.
    """
    import json

    try:
        content = await file.read()
        words_data = json.loads(words_json)
        if not isinstance(words_data, list):
            raise ValueError("words_json must be a JSON array of word objects")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": f"Invalid input: {str(exc)}"},
        )

    rec_id = f"recording_{int(time.time())}"
    full_trans = " ".join(str(w.get("text", "")) for w in words_data)
    unified = analyze_words_phonemes(
        audio_bytes=content,
        words=words_data,
        filename=file.filename or "audio.wav",
        padding_ms=padding_ms,
        recording_id=rec_id,
        full_transcription=full_trans,
        return_unified=True,
    )
    return {
        "success": True,
        "model": "facebook/wav2vec2-lv-60-espeak-cv-ft",
        **unified,
    }


class ComparePhonemesRequest(BaseModel):
    word: str = Field(..., description="Target or expected word (e.g. 'think')")
    predicted_phonemes: Optional[Union[str, list]] = Field(
        None,
        description="Predicted phonetic transcription from Wav2Vec2Phoneme (space-separated IPA string or token list, e.g. 't ɪ ŋ k')",
    )
    expected_phonemes: Optional[Union[str, list]] = Field(
        None,
        description="Optional manual reference phoneme override (space-separated IPA or token list)",
    )
    preferred_accent: Optional[str] = Field("General English", description="Reference accent variety (e.g. General English, US, UK)")
    assembly_confidence: Optional[float] = Field(None, description="Optional ASR word confidence score")
    audio_clip: Optional[str] = Field(None, description="Optional supporting audio clip filename")
    speaking_mode: Optional[str] = Field("prompted", description="Speaking mode: 'prompted' or 'spontaneous'")
    target_word: Optional[str] = Field(None, description="Intended prompt target word")
    recognized_word: Optional[str] = Field(None, description="Recognized ASR word")


@app.post("/compare-phonemes", summary="Compare expected reference phonemes vs predicted phonemes for a word")
def compare_phonemes_endpoint(req: ComparePhonemesRequest):
    """
    Executes sequence alignment and evidence-based pronunciation comparison between:
    - Expected reference phonemes (from CMUDict, canonical dictionary, or G2P)
    - Predicted phonemes (from Hugging Face Wav2Vec2Phoneme acoustic model)
    
    Returns tokenized expected and predicted phonemes, Levenshtein sequence alignment,
    Phoneme Error Rate (PER), and evidence-based pronunciation findings.
    """
    pred_tokens = []
    if req.predicted_phonemes:
        pred_tokens = tokenize_phoneme_sequence(req.predicted_phonemes)

    # If manual expected override is provided, register temporary generator override
    if req.expected_phonemes:
        exp_tokens = tokenize_phoneme_sequence(req.expected_phonemes)
        target_lookup = (req.target_word or req.word).lower().strip()
        custom_gen = ExpectedPhonemeGenerator(canonical_overrides={target_lookup: " ".join(exp_tokens)})
        generator_to_use = custom_gen
    else:
        generator_to_use = _MAIN_EXPECTED_GENERATOR

    comparison = compare_word_phonemes(
        word=req.word,
        predicted_tokens=pred_tokens,
        generator=generator_to_use,
        assembly_confidence=req.assembly_confidence,
        audio_clip=req.audio_clip,
        preferred_accent=req.preferred_accent or "General English",
        speaking_mode=req.speaking_mode or "prompted",
        target_word=req.target_word,
        recognized_word=req.recognized_word,
    )

    return {
        "success": True,
        **comparison,
    }


@app.post("/analyze-silence", summary="Analyze audio signal for silent pauses")
async def analyze_silence_endpoint(
    file: UploadFile = File(...),
    min_pause_duration: float = Form(0.25),
    silence_threshold_db: float = Form(-35.0),
):
    """
    Independent acoustic signal analysis for silence detection in WAV audio.
    """
    try:
        content = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": f"Failed to read file: {str(exc)}"},
        )
    return detect_silence_in_wav(
        content,
        min_pause_duration_seconds=min_pause_duration,
        silence_threshold_db=silence_threshold_db,
    )


class EvaluationRequest(BaseModel):
    reference_transcript: Optional[str] = Field(None, description="Manually verified reference transcript belonging specifically to this recording")
    assemblyai_transcript: str = Field(..., description="Raw verbatim AssemblyAI transcript")
    recording_id: Optional[str] = Field(None, description="Identifier for the current recording/session")
    reference_recording_id: Optional[str] = Field(None, description="Identifier of the recording for which the reference was verified")
    audio_duration_seconds: float = Field(..., description="Audio duration in seconds")
    response_interval_seconds: Optional[float] = Field(None, description="Learner response interval T in seconds")
    detected_pauses: Optional[list] = Field(default_factory=list, description="Detected silence pause events")
    reference_pause_events: Optional[list] = Field(default_factory=list, description="Annotated reference pause events")
    reference_repetition_events: Optional[list] = Field(default_factory=list, description="Annotated reference repetitions")
    reference_self_correction_events: Optional[list] = Field(default_factory=list, description="Annotated reference self-corrections")
    reference_speech_rate_wpm: Optional[float] = Field(None, description="Reference speech rate WPM")
    reference_response_duration_seconds: Optional[float] = Field(None, description="Reference response duration")
    min_pause_duration_seconds: Optional[float] = Field(0.25, description="Minimum qualifying pause threshold")
    silence_threshold_db: Optional[float] = Field(-35.0, description="Silence energy threshold dBFS")
    normalize: Optional[bool] = Field(True, description="Apply standard normalization policy")


@app.post("/evaluate", summary="Run Articula thesis evaluation formulas")
def evaluate_endpoint(req: EvaluationRequest):
    """
    Executes formal Articula thesis evaluation calculations:
    - Word Error Rate (WER) using Wagner-Fischer dynamic programming
    - Speech Rate: 60 * W / T
    - Pause Frequency: P / T and Mean Pause Duration
    - Repetition Rate: 100 * R / W
    - Candidate Self-Corrections
    - Quantitative Errors: MAE, Median Absolute Error, Signed Differences
    - Event-Detection Evaluation: Precision, Recall, F1 for pauses and repetitions
    """
    # 1. Word Error Rate (WER) & Alignment (Data Integrity: checks recording/session matching)
    alignment = compute_word_alignment(
        reference_text=req.reference_transcript,
        hypothesis_text=req.assemblyai_transcript,
        normalize=req.normalize if req.normalize is not None else True,
        recording_id=req.recording_id,
        reference_recording_id=req.reference_recording_id,
    )

    # 2. Speech Rate (WPM = 60 * W / T)
    effective_t = (
        req.response_interval_seconds
        if (req.response_interval_seconds is not None and req.response_interval_seconds > 0)
        else req.audio_duration_seconds
    )
    speech_rate = compute_speech_rate(
        word_count=alignment["recognized_word_count"],
        response_interval_seconds=effective_t,
    )

    # 3. Pause Metrics (P / T, mean pause duration)
    pause_metrics = compute_pause_metrics(
        pause_events=req.detected_pauses or [],
        eligible_duration_seconds=effective_t,
    )

    # 4. Repetition Detection & Rate (100 * R / W)
    hyp_tokens = normalize_transcript(req.assemblyai_transcript)
    candidate_repetitions = detect_candidate_repetitions(hyp_tokens)
    rep_count = (
        len(req.reference_repetition_events)
        if req.reference_repetition_events
        else len(candidate_repetitions)
    )
    repetition_rate = compute_repetition_rate(
        repetition_event_count=rep_count,
        word_count=alignment["recognized_word_count"],
    )

    # 5. Candidate Self-Corrections
    candidate_self_corrections = detect_candidate_self_corrections(
        text=req.assemblyai_transcript,
        tokens=hyp_tokens,
    )

    # 6. Quantitative Error Measures (MAE, Median AE, Signed Differences)
    quantitative_errors = {}
    if req.reference_speech_rate_wpm is not None and speech_rate["speech_rate_wpm"] is not None:
        sr_pairs = [(speech_rate["speech_rate_wpm"], req.reference_speech_rate_wpm)]
        quantitative_errors["speech_rate_wpm"] = compute_quantitative_errors(sr_pairs, unit_label="WPM")

    if req.reference_response_duration_seconds is not None and effective_t > 0:
        dur_pairs = [(effective_t, req.reference_response_duration_seconds)]
        quantitative_errors["response_duration_seconds"] = compute_quantitative_errors(dur_pairs, unit_label="seconds")

    # 7. Event-Detection Evaluation (Precision, Recall, F1)
    event_evaluations = {}
    if req.reference_pause_events:
        event_evaluations["pause_detection"] = evaluate_event_detection(
            detected_events=req.detected_pauses or [],
            reference_events=req.reference_pause_events,
            tolerance_seconds=req.min_pause_duration_seconds or 0.25,
        )

    if req.reference_repetition_events:
        event_evaluations["repetition_detection"] = evaluate_event_detection(
            detected_events=candidate_repetitions,
            reference_events=req.reference_repetition_events,
            tolerance_seconds=req.min_pause_duration_seconds or 0.25,
        )

    return {
        "alignment": alignment,
        "speech_rate": speech_rate,
        "pause_metrics": pause_metrics,
        "repetition_metrics": {
            "candidate_repetitions": candidate_repetitions,
            "repetition_rate": repetition_rate,
        },
        "self_corrections": {
            "candidates": candidate_self_corrections,
            "candidate_count": len(candidate_self_corrections),
        },
        "quantitative_errors": quantitative_errors,
        "event_evaluations": event_evaluations,
        "reproducibility": {
            "formulas": {
                "wer": "WER = (S + D + I) / N",
                "speech_rate": "Speech Rate (WPM) = 60 * W / T",
                "pause_frequency": "Pause Frequency = P / T",
                "mean_pause_duration": "Mean Pause Duration = sum(durations) / P",
                "repetition_rate": "Repetition Rate (%) = 100 * R / W",
                "mae": "MAE = sum(|auto - ref|) / n",
                "precision": "Precision = TP / (TP + FP)",
                "recall": "Recall = TP / (TP + FN)",
                "f1": "F1 = 2 * Precision * Recall / (Precision + Recall)",
            },
            "parameters": {
                "min_pause_duration_seconds": req.min_pause_duration_seconds,
                "silence_threshold_db": req.silence_threshold_db,
                "normalization_policy": "lowercase=True, remove_punctuation=True, preserve_fillers=True",
            },
        },
    }


# ============================================================================
# Phase 7 & 9: AI Summary and Export Endpoints
# ============================================================================

class AISummaryRequest(BaseModel):
    full_transcription: str = Field("", description="Recognized utterance transcription")
    words: List[Dict[str, Any]] = Field(default_factory=list, description="Array of enriched word records")
    pronunciation_findings: List[Dict[str, Any]] = Field(default_factory=list, description="Validated phonetic findings")
    evaluation_metrics: Optional[Dict[str, Any]] = Field(None, description="Speech rate, pause, and WER evaluation results")
    preferred_accent: Optional[str] = Field("General English", description="Target English variety")


@app.post("/ai-summary", summary="Generate evidence-constrained AI analysis summary")
async def ai_summary_endpoint(req: AISummaryRequest):
    """
    Produces structured AI interpretation grounded strictly on validated acoustic
    and phonetic findings. Does not diagnose raw audio or invent findings.
    """
    summary = await generate_llm_analysis_summary(
        full_transcription=req.full_transcription,
        words=req.words,
        pronunciation_findings=req.pronunciation_findings,
        evaluation_metrics=req.evaluation_metrics,
        preferred_accent=req.preferred_accent or "General English",
    )
    return {
        "success": True,
        **summary,
    }


class ExportDataRequest(BaseModel):
    recording_id: Optional[str] = Field("recording_001")
    full_transcription: Optional[str] = Field("")
    words: List[Dict[str, Any]] = Field(default_factory=list)
    pronunciation_findings: Optional[List[Dict[str, Any]]] = Field(default_factory=list)
    evaluation_metrics: Optional[Dict[str, Any]] = Field(None)
    ai_summary: Optional[Dict[str, Any]] = Field(None)


@app.post("/export/csv", summary="Export technical dataset CSV with UTF-8 BOM encoding")
def export_csv_endpoint(req: ExportDataRequest):
    """
    Generates and downloads a technical dataset CSV encoded in UTF-8 with BOM (utf-8-sig)
    for seamless opening in Microsoft Excel without corrupting Unicode IPA characters.
    """
    csv_bytes = generate_phoneme_dataset_csv(req.words)
    filename = f"articula_phonemes_{req.recording_id or 'export'}.csv"
    return StreamingResponse(
        io.BytesIO(csv_bytes),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/export/xlsx", summary="Export professionally formatted Excel workbook (.xlsx)")
def export_xlsx_endpoint(req: ExportDataRequest):
    """
    Generates and downloads a multi-sheet Microsoft Excel workbook (.xlsx)
    guaranteeing native cell Unicode preservation of all IPA phonetic symbols.
    """
    xlsx_bytes = generate_phoneme_dataset_xlsx(
        recording_id=req.recording_id or "recording_001",
        full_transcription=req.full_transcription or "",
        words=req.words,
        pronunciation_findings=req.pronunciation_findings,
        evaluation_metrics=req.evaluation_metrics,
        ai_summary=req.ai_summary,
    )
    filename = f"articula_evaluation_{req.recording_id or 'export'}.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/export/report", summary="Export human-readable research and learner evaluation report")
def export_report_endpoint(req: ExportDataRequest):
    """
    Generates a structured human-readable text report containing summary cards,
    AI observations, and words requiring human review.
    """
    report_text = generate_human_readable_report_txt(
        recording_id=req.recording_id or "recording_001",
        full_transcription=req.full_transcription or "",
        words=req.words,
        pronunciation_findings=req.pronunciation_findings,
        evaluation_metrics=req.evaluation_metrics,
        ai_summary=req.ai_summary,
    )
    filename = f"articula_report_{req.recording_id or 'export'}.txt"
    return StreamingResponse(
        io.BytesIO(report_text.encode("utf-8")),
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ============================================================================
# Phase 10: Conversation-First Architecture & Post-Conversation Assessment
# ============================================================================

async def execute_assemblyai_transcription(
    audio_content: bytes,
    api_key: str,
    disfluencies: bool = True,
    timeout_seconds: float = 120.0,
) -> Dict[str, Any]:
    """
    Direct asynchronous wrapper for AssemblyAI STT.
    Uploads audio bytes, requests transcription, and polls until completed.
    """
    headers = {"Authorization": api_key}
    async with httpx.AsyncClient(timeout=60.0) as client:
        # 1. Upload audio
        upload_resp = await client.post(
            f"{ASSEMBLYAI_BASE_URL}/upload",
            headers=headers,
            content=audio_content,
        )
        if upload_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AssemblyAI upload failed: {upload_resp.text[:200]}",
            )
        upload_url = upload_resp.json().get("upload_url")

        # 2. Submit transcript
        transcript_resp = await client.post(
            f"{ASSEMBLYAI_BASE_URL}/transcript",
            headers={"Authorization": api_key, "Content-Type": "application/json"},
            json={"audio_url": upload_url, "disfluencies": disfluencies},
        )
        if transcript_resp.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AssemblyAI transcript submission failed: {transcript_resp.text[:200]}",
            )
        transcript_id = transcript_resp.json().get("id")

        # 3. Poll for completion
        poll_url = f"{ASSEMBLYAI_BASE_URL}/transcript/{transcript_id}"
        poll_start = time.time()
        while (time.time() - poll_start) < timeout_seconds:
            poll_resp = await client.get(poll_url, headers=headers)
            if poll_resp.status_code == 200:
                res = poll_resp.json()
                if res.get("status") == "completed":
                    return res
                elif res.get("status") == "error":
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"AssemblyAI transcription error: {res.get('error')}",
                    )
            await asyncio.sleep(1.2)

        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"AssemblyAI transcription timed out after {timeout_seconds}s.",
        )


class ConversationTurnInput(BaseModel):
    turn_id: str = Field(..., description="Unique turn identifier, e.g. turn_1")
    audio_base64: Optional[str] = Field(None, description="Data URI or base64-encoded audio bytes")
    transcript: Optional[str] = Field(None, description="Recognized or provided text")
    words: Optional[List[Dict[str, Any]]] = Field(None, description="Word timestamps and confidence")
    duration_seconds: Optional[float] = Field(None, description="Turn duration in seconds")
    prompt_target: Optional[str] = Field(None, description="Prompt target word if prompted mode")
    speaking_mode: Optional[str] = Field("prompted", description="'prompted' or 'spontaneous'")
    detected_pauses: Optional[List[Dict[str, Any]]] = Field(None, description="Pre-calculated pause events")


class AnalyzeConversationSessionRequest(BaseModel):
    session_id: str = Field(..., description="Unique conversation session identifier")
    speaking_mode: str = Field("prompted", description="'prompted' or 'spontaneous'")
    prompt_target: Optional[str] = Field(None, description="Default prompt target word")
    preferred_accent: str = Field("General English", description="Preferred English accent baseline")
    min_pause_duration_seconds: float = Field(0.25, description="Minimum pause duration threshold")
    silence_threshold_db: float = Field(-35.0, description="Silence energy threshold dBFS")
    turns: List[ConversationTurnInput] = Field(..., description="Recorded learner conversation turns")


async def run_post_conversation_pipeline(
    session_id: str,
    speaking_mode: str,
    prompt_target: Optional[str],
    preferred_accent: str,
    turns_input: List[ConversationTurnInput],
    min_pause: float = 0.25,
    silence_db: float = -35.0,
    progress_callback=None,
) -> Dict[str, Any]:
    """
    Executes the post-conversation assessment pipeline sequentially through actual backend stages:
    1. Transcribing (AssemblyAI STT for all turns lacking pre-computed transcripts)
    2. Analyzing Fluency (calculates turn and aggregated session metrics, excluding inter-turn gaps)
    3. Analyzing Pronunciation (runs Wav2Vec2 on original turn audio segments)
    4. Validating Evidence (filters, deduplicates, and groups findings into 6 evidence categories)
    5. Generating Feedback (compiles consolidated 5-section report)
    6. Completed
    """
    import base64

    # Stage 1: Transcribing
    if progress_callback:
        await progress_callback("transcribing", "Transcribing learner turns...", 20)

    api_key = get_api_key()
    processed_turns = []

    for t_idx, turn in enumerate(turns_input):
        t_id = turn.turn_id
        t_text = turn.transcript
        t_words = turn.words or []
        t_dur = turn.duration_seconds
        t_conf = None
        t_audio_bytes = None

        if turn.audio_base64:
            b64_clean = turn.audio_base64.split(",")[-1] if "," in turn.audio_base64 else turn.audio_base64
            try:
                t_audio_bytes = base64.b64decode(b64_clean)
            except Exception:
                t_audio_bytes = None

        # If transcript not provided and audio bytes exist, call AssemblyAI
        if (not t_text or not t_words) and t_audio_bytes and api_key:
            try:
                stt_res = await execute_assemblyai_transcription(t_audio_bytes, api_key)
                t_text = stt_res.get("text", "")
                t_dur = stt_res.get("audio_duration") or t_dur
                t_conf = stt_res.get("confidence")
                t_words = [
                    {
                        "word": w.get("text"),
                        "text": w.get("text"),
                        "start": w.get("start"),
                        "end": w.get("end"),
                        "confidence": w.get("confidence"),
                        "speaker": "learner",
                    }
                    for w in stt_res.get("words", [])
                ]
            except Exception as e:
                # Fallback to empty text with error note
                t_text = t_text or ""

        if t_dur is None or t_dur <= 0:
            if t_audio_bytes:
                try:
                    _, native_sr, _, dur = decode_audio_native(t_audio_bytes)
                    t_dur = dur
                except Exception:
                    t_dur = 1.0
            else:
                t_dur = 1.0

        processed_turns.append({
            "turn_id": t_id,
            "transcript": t_text or "",
            "words": t_words,
            "duration_seconds": t_dur,
            "confidence": t_conf,
            "audio_bytes": t_audio_bytes,
            "prompt_target": turn.prompt_target or prompt_target,
            "speaking_mode": turn.speaking_mode or speaking_mode,
            "detected_pauses": turn.detected_pauses,
        })

    # Stage 2: Analyzing Fluency
    if progress_callback:
        await progress_callback("analyzing_fluency", "Analyzing turn and session fluency...", 40)

    turn_fluency_metrics = []
    for pt in processed_turns:
        t_words = pt["words"]
        t_text = pt["transcript"]
        t_dur = pt["duration_seconds"]

        # Detect pauses within turn if audio is WAV or if pauses were pre-computed
        pauses = pt.get("detected_pauses") or []
        if not pauses and pt.get("audio_bytes"):
            try:
                silence_res = detect_silence_in_wav(
                    pt["audio_bytes"],
                    min_pause_duration_seconds=min_pause,
                    silence_threshold_db=silence_db,
                )
                if silence_res.get("status") == "valid":
                    pauses = silence_res.get("detected_pauses", [])
            except Exception:
                pauses = []

        tokens = normalize_transcript(t_text) if t_text else [w.get("text", "") for w in t_words]
        reps = detect_candidate_repetitions(tokens)

        w_count = len(t_words) if t_words else len(tokens)
        turn_fluency_metrics.append({
            "turn_id": pt["turn_id"],
            "word_count": w_count,
            "response_interval_seconds": t_dur,
            "pause_events": pauses,
            "pause_count": len(pauses),
            "total_pause_duration_seconds": sum(float(p.get("duration_seconds", 0.0)) for p in pauses),
            "repetition_count": len(reps),
        })

    session_fluency = compute_session_fluency(turn_fluency_metrics)

    # Stage 3: Analyzing Pronunciation
    if progress_callback:
        await progress_callback("analyzing_pronunciation", "Extracting acoustic phoneme evidence...", 60)

    all_analyzed_words = []
    all_findings = []

    for pt in processed_turns:
        t_audio_bytes = pt.get("audio_bytes")
        t_words = pt.get("words", [])
        t_mode = pt.get("speaking_mode", speaking_mode)
        t_target = pt.get("prompt_target", prompt_target)

        if t_audio_bytes and t_words:
            try:
                analyzed = analyze_words_phonemes(
                    audio_bytes=t_audio_bytes,
                    words=t_words,
                    filename=f"{pt['turn_id']}.wav",
                    preferred_accent=preferred_accent,
                    speaking_mode=t_mode,
                    prompt_target=t_target,
                )
                all_analyzed_words.extend(analyzed)
                for w in analyzed:
                    if w.get("pronunciation_findings"):
                        all_findings.extend(w["pronunciation_findings"])
            except Exception:
                # If phonetic inference fails on this turn, preserve words
                all_analyzed_words.extend(t_words)
        else:
            all_analyzed_words.extend(t_words)

    # Stage 4: Validating Evidence
    if progress_callback:
        await progress_callback("validating_evidence", "Filtering and validating phonetic evidence...", 80)

    # Deduplicate findings by (word, expected, predicted)
    seen_dedup = set()
    validated_findings = []
    for f in all_findings:
        k = (f.get("word", "").lower(), f.get("expected_phoneme"), f.get("predicted_phoneme"), f.get("difference_type"))
        if k not in seen_dedup:
            seen_dedup.add(k)
            validated_findings.append(f)

    # Stage 5: Generating Feedback
    if progress_callback:
        await progress_callback("generating_feedback", "Generating post-conversation feedback report...", 95)

    session_report = build_post_conversation_report(
        session_id=session_id,
        turns_data=processed_turns,
        session_fluency=session_fluency,
        all_pronunciation_findings=validated_findings,
        all_words=all_analyzed_words,
        preferred_accent=preferred_accent,
    )

    # Enhance formative feedback via Gemini if configured
    session_report = await generate_post_conversation_feedback_llm(session_report)

    # Stage 6: Completed
    if progress_callback:
        await progress_callback("completed", "Post-conversation assessment completed.", 100)

    return session_report


@app.post("/conversation/analyze-session", summary="Analyze completed multi-turn conversation session")
async def analyze_conversation_session_endpoint(req: AnalyzeConversationSessionRequest):
    """
    Processes all learner turns collected during a conversation session.
    Runs non-blocking post-conversation assessment across the sequential stages:
    Transcribing -> Analyzing Fluency -> Analyzing Pronunciation -> Validating Evidence -> Generating Feedback -> Completed.
    """
    report = await run_post_conversation_pipeline(
        session_id=req.session_id,
        speaking_mode=req.speaking_mode,
        prompt_target=req.prompt_target,
        preferred_accent=req.preferred_accent,
        turns_input=req.turns,
        min_pause=req.min_pause_duration_seconds,
        silence_db=req.silence_threshold_db,
    )
    return {
        "success": True,
        "session_id": req.session_id,
        "report": report,
    }


@app.post("/conversation/analyze-session-stream", summary="Stream real progress events for post-conversation assessment")
async def analyze_conversation_session_stream_endpoint(req: AnalyzeConversationSessionRequest):
    """
    Server-Sent Events (SSE) endpoint that streams real backend stage progress:
    Recording -> Session Ended -> Transcribing -> Analyzing Fluency -> Analyzing Pronunciation -> Validating Evidence -> Generating Feedback -> Completed.
    """
    import json

    async def event_generator():
        progress_queue = asyncio.Queue()

        async def callback(stage: str, message: str, progress: int):
            await progress_queue.put({"stage": stage, "message": message, "progress": progress})

        async def worker():
            try:
                rep = await run_post_conversation_pipeline(
                    session_id=req.session_id,
                    speaking_mode=req.speaking_mode,
                    prompt_target=req.prompt_target,
                    preferred_accent=req.preferred_accent,
                    turns_input=req.turns,
                    min_pause=req.min_pause_duration_seconds,
                    silence_db=req.silence_threshold_db,
                    progress_callback=callback,
                )
                await progress_queue.put({"stage": "completed", "message": "Assessment completed.", "progress": 100, "report": rep})
            except Exception as exc:
                await progress_queue.put({"stage": "error", "message": f"Processing error: {str(exc)}", "progress": 0})
            finally:
                await progress_queue.put(None)

        asyncio.create_task(worker())

        while True:
            item = await progress_queue.get()
            if item is None:
                break
            payload = json.dumps(item)
            yield f"data: {payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================================================
# Phase 11: Conversational AI Companion (Gemini 3.5 Flash-Lite)
# Articula: Your Space to Speak, Express, and Grow
# ============================================================================

class StartDialogueRequest(BaseModel):
    session_id: Optional[str] = None
    topic: Optional[str] = "everyday_conversations"
    mode: Optional[str] = "natural"


class DialogueTurnContext(BaseModel):
    speaker: str  # "ai" or "learner"
    text: str
    topic: Optional[str] = None


class RespondDialogueRequest(BaseModel):
    session_id: str
    turn_id: str
    learner_transcript: Optional[str] = None
    audio_base64: Optional[str] = None
    history: List[DialogueTurnContext] = []
    current_topic: Optional[str] = "everyday_conversations"
    mode: Optional[str] = "natural"


class TranscribeTurnRequest(BaseModel):
    audio_base64: str
    turn_id: Optional[str] = "turn_1"


class ReflectSessionRequest(BaseModel):
    session_id: str
    topic: Optional[str] = "everyday_conversations"
    turns: List[Dict[str, Any]] = []


@app.post("/conversation/start-dialogue", summary="Initiate conversation with Gemini opening question")
async def start_dialogue_endpoint(req: StartDialogueRequest):
    """
    Initiates a new conversational session.
    Gemini 3.5 Flash-Lite generates a friendly, natural opening question tailored to category & mode.
    """
    import uuid
    session_id = req.session_id or f"session_{uuid.uuid4().hex[:8]}"
    topic = req.topic or "everyday_conversations"
    mode = req.mode or "natural"

    gemini_svc = GeminiService()
    res = await gemini_svc.generate_conversational_response(
        session_id=session_id,
        history=[],
        current_topic=topic,
        is_opening=True,
        mode=mode,
    )

    return {
        "session_id": session_id,
        "turn_id": "turn_1",
        "response": res.response,
        "intent": res.intent,
        "topic": res.topic,
        "conversation_complete": res.conversation_complete,
        "expression_tip": res.expression_tip,
    }


@app.post("/conversation/respond-dialogue", summary="Process learner turn and generate Gemini contextual follow-up")
async def respond_dialogue_endpoint(req: RespondDialogueRequest):
    """
    Processes the learner's spoken turn during the conversation.
    Decoupled from post-conversation assessment: does NOT run Wav2Vec2 or fluency calculation!
    Generates a natural, contextual follow-up question via Gemini 3.5 Flash-Lite.
    Includes graceful recovery if live transcription is temporarily unavailable.
    """
    learner_text = (req.learner_transcript or "").strip()

    # Fast transcription if text not pre-provided but audio is available
    if not learner_text and req.audio_base64:
        try:
            raw_audio = req.audio_base64
            if "," in raw_audio:
                raw_audio = raw_audio.split(",", 1)[1]
            import base64
            audio_bytes = base64.b64decode(raw_audio)

            api_key = get_api_key()
            if api_key:
                stt_res = await execute_assemblyai_transcription(
                    audio_content=audio_bytes,
                    api_key=api_key,
                    disfluencies=True,
                    timeout_seconds=20.0,
                )
                learner_text = stt_res.get("text", "").strip()
        except Exception as stt_err:
            logger.warning(f"Live turn transcription failed or timed out: {stt_err}")

    # Format history for Gemini
    history_dicts = [{"speaker": h.speaker, "text": h.text} for h in req.history]

    gemini_svc = GeminiService()
    gemini_res = await gemini_svc.generate_conversational_response(
        session_id=req.session_id,
        history=history_dicts,
        current_topic=req.current_topic or "everyday_conversations",
        learner_response=learner_text,
        is_opening=False,
        mode=req.mode or "natural",
    )

    # Next turn id calculation
    curr_num = 1
    if "_" in req.turn_id:
        try:
            curr_num = int(req.turn_id.split("_")[-1])
        except ValueError:
            pass
    next_turn_id = f"turn_{curr_num + 1}"

    return {
        "session_id": req.session_id,
        "turn_id": next_turn_id,
        "response": gemini_res.response,
        "intent": gemini_res.intent,
        "topic": gemini_res.topic,
        "conversation_complete": gemini_res.conversation_complete,
        "transcribed_text": learner_text if learner_text else None,
        "expression_tip": gemini_res.expression_tip,
    }


@app.post("/conversation/express-assist", summary="On-demand English expression and vocabulary assistance")
async def express_assist_endpoint(req: ExpressionAssistRequestModel):
    """
    Provides on-demand expression support for learners:
    - help_express: Find words to frame an idea
    - how_else: Alternative ways to say something (casual, polite, native)
    - explain_word: Meaning, nuance, and conversational examples
    - expand_answer: Guided elaboration points and structures
    - give_example: Conversational examples
    """
    gemini_svc = GeminiService()
    res = await gemini_svc.generate_expression_assistance(
        assist_type=req.assist_type,
        learner_input=req.learner_input,
        context=req.context,
    )
    return res


@app.post("/conversation/reflect-session", summary="Generate supportive post-conversation reflection")
async def reflect_session_endpoint(req: ReflectSessionRequest):
    """
    Generates a judgment-free, supportive post-conversation reflection.
    Highlights summary of thoughts shared, useful expressions, thought development,
    and personal reflection questions. No numerical scores, no phoneme error rates.
    """
    gemini_svc = GeminiService()
    reflection = await gemini_svc.generate_conversation_reflection(
        session_id=req.session_id,
        turns=req.turns,
        topic=req.topic or "everyday_conversations",
    )
    return {
        "success": True,
        "session_id": req.session_id,
        "reflection": reflection,
    }


@app.post("/conversation/transcribe-turn", summary="Quick live transcription of a single turn")
async def transcribe_turn_endpoint(req: TranscribeTurnRequest):
    """
    Lightweight turn transcription endpoint for responsive conversational UI.
    """
    api_key = get_api_key()
    if not api_key:
        return {
            "turn_id": req.turn_id or "turn_1",
            "transcript": "",
            "confidence": None,
            "status": "unavailable",
            "error": "ASR API key not configured",
        }

    try:
        raw_audio = req.audio_base64
        if "," in raw_audio:
            raw_audio = raw_audio.split(",", 1)[1]
        import base64
        audio_bytes = base64.b64decode(raw_audio)

        stt_res = await execute_assemblyai_transcription(
            audio_content=audio_bytes,
            api_key=api_key,
            disfluencies=True,
            timeout_seconds=25.0,
        )
        return {
            "turn_id": req.turn_id or "turn_1",
            "transcript": stt_res.get("text", "").strip(),
            "confidence": stt_res.get("confidence"),
            "status": "completed",
        }
    except Exception as exc:
        return {
            "turn_id": req.turn_id or "turn_1",
            "transcript": "",
            "confidence": None,
            "status": "error",
            "error": str(exc),
        }


