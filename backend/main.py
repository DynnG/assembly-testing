import asyncio
import os
import time
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
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
)
from silence_detector import detect_silence_in_wav

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
    Returns backend health status and indicates whether the AssemblyAI
    API key is configured in the environment, without exposing the key value.
    """
    key = get_api_key()
    return {
        "status": "ok",
        "api_key_configured": bool(key),
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
        # Run silence detector on audio bytes if WAV format
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
    finally:
        # Explicitly release memory reference to uploaded audio bytes
        del audio_content

    elapsed_time = round(time.time() - start_time, 2)

    # Word-level timestamps & confidence (only if returned by AssemblyAI)
    words = completed_data.get("words") or []
    cleaned_words = [
        {
            "text": w.get("text"),
            "start": w.get("start"),
            "end": w.get("end"),
            "confidence": w.get("confidence"),
            "speaker": w.get("speaker"),
        }
        for w in words
        if isinstance(w, dict)
    ]

    return {
        "success": True,
        "id": completed_data.get("id"),
        "status": completed_data.get("status"),
        "text": completed_data.get("text", ""),
        "confidence": completed_data.get("confidence"),
        "audio_duration": completed_data.get("audio_duration"),
        "words": cleaned_words,
        "disfluencies_enabled": disfluencies,
        "processing_time_sec": elapsed_time,
        "filename": filename,
        "silence_analysis": silence_result,
        "raw_metadata": {
            "id": completed_data.get("id"),
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
    reference_transcript: str = Field(..., description="Manually verified reference transcript")
    assemblyai_transcript: str = Field(..., description="Raw verbatim AssemblyAI transcript")
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
    # 1. Word Error Rate (WER) & Alignment
    alignment = compute_word_alignment(
        reference_text=req.reference_transcript,
        hypothesis_text=req.assemblyai_transcript,
        normalize=req.normalize if req.normalize is not None else True,
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

