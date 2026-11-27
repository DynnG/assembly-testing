# Articula: AssemblyAI ASR Evaluation Web App

A functional research-testing application for evaluating **AssemblyAI Speech-to-Text** as the automatic speech recognition (ASR) component for the thesis:
> **“Articula: An AI-Based Speech Coach for Clear and Effective English Communication Through Conversational Voice Analysis.”**

This application provides a rigorous, auditable testing platform to evaluate transcription accuracy against ground truth, measure conversational speech-rate indicators, detect silent pauses using independent acoustic signal analysis, track speech disfluencies (fillers, repetitions, self-corrections), compute quantitative error metrics (MAE, Precision, Recall, F1), and export comprehensive reproducibility records.

---

## 1. System Architecture & Capabilities

```text
testing/
├── backend/                       # Python 3.13 + FastAPI Backend
│   ├── main.py                    # REST API: /health, /test-connection, /transcribe, /analyze-silence, /evaluate, /analyze-phonemes, /compare-phonemes
│   ├── phoneme_analyzer.py        # Hugging Face Wav2Vec2Phoneme pronunciation characteristic analyzer & word segmenter
│   ├── phoneme_comparison.py      # Expected vs Predicted phoneme comparison engine (G2P, CMUDict, alignment, PER, findings)
│   ├── evaluation.py              # Thesis formulas: WER, Speech Rate, Pause/Repetition rates, MAE, F1
│   ├── silence_detector.py        # Independent acoustic signal silence detector (RMS & dBFS analysis)
│   ├── test_evaluation.py         # Automated pytest test suite for thesis evaluation formulas (23 tests)
│   ├── test_phoneme_analyzer.py   # Automated pytest test suite for word segmentation & phoneme analysis (13 tests)
│   ├── test_phoneme_comparison.py # Automated pytest test suite for expected vs predicted phoneme comparison (16 tests)
│   ├── test_speech_short.wav      # Sample 4.0s 44.1 kHz speech recording for integration testing
│   ├── sample_hybrid_result.json  # Reference full hybrid transcription + phoneme comparison JSON payload
│   ├── requirements.txt           # Dependencies (FastAPI, PyTorch, Transformers, SoundFile, Scipy, PyAV, cmudict, g2p_en, etc.)
│   └── .env.example               # Template for ASSEMBLYAI_API_KEY
├── frontend/                      # React 19 + TypeScript + Vite + Tailwind CSS
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx                 # Header & data privacy disclosure
│   │   │   ├── ResearchLimitationsCard.tsx# Section 9 thesis limitations & guidance
│   │   │   ├── ApiStatusCard.tsx          # Real-time backend status & AssemblyAI auth tester
│   │   │   ├── TestCaseSelectorCard.tsx   # 10 authorized thesis scenarios & provenance editor
│   │   │   ├── AudioInputCard.tsx         # File upload & MediaRecorder microphone recording
│   │   │   ├── TranscriptionResultsCard.tsx# Raw verbatim transcript viewer & metadata
│   │   │   ├── ReferenceAndWerCard.tsx    # Ground-truth alignment (S, D, I, N, WER %, normalization policy)
│   │   │   ├── SpeechMeasurementsCard.tsx # WPM, Pause Frequency, Mean Pause Duration, Repetition Rate
│   │   │   ├── WordDiagnosticCard.tsx     # Word timestamps, confidence %, and candidate gap inspector
│   │   │   ├── EvaluationResultsCard.tsx  # MAE, Median AE, Signed Differences, Precision, Recall, F1
│   │   │   ├── ExportCard.tsx             # TXT, per-test CSV, alignment CSV, reproducibility JSON
│   │   │   └── SessionHistoryCard.tsx     # Ephemeral in-memory session run log
│   │   ├── data/
│   │   │   └── testScenarios.ts           # Library of 10 standard research scenarios
│   │   ├── services/
│   │   │   ├── api.ts                     # REST client for backend endpoints
│   │   │   └── audioAnalysis.ts           # In-browser Web Audio API acoustic silence detector
│   │   ├── types.ts                       # Research schema interfaces
│   │   ├── App.tsx                        # Main dashboard coordinator
│   │   └── main.tsx                       # React application entry point
│   ├── package.json
│   └── vite.config.ts                     # Dev server & backend proxy configuration
├── .gitignore                             # Protects .env, venv/, node_modules/, dist/
└── README.md                              # This specification and setup guide
```

---

## 2. Thesis Formulas & Measurement Methods

### A. Word Error Rate (WER)
Calculated using the standard Wagner-Fischer dynamic programming word alignment:

$$\text{WER} = \frac{S + D + I}{N}$$
$$\text{WER}_{\%} = 100 \times \frac{S + D + I}{N}$$

- $S$ = Substitutions (mismatched words)
- $D$ = Deletions (words in reference omitted by ASR)
- $I$ = Insertions (extra words recognized by ASR not in reference)
- $N$ = Number of words in manually verified reference transcript
- **Empty Reference Handling:** If $N = 0$, WER is explicitly marked as `undefined` (never 0 or crashing).
- **Filler Retention:** Fillers (*"um"*, *"uh"*, *"erm"*) are retained as distinct tokens during alignment; dropped fillers correctly register as deletions ($D$).
- **Normalization Policy:** Both raw verbatim and normalized versions are retained. Case is lowercased and punctuation stripped. Contractions and hyphenated stutters (*"I-I"*) are preserved.
- **Thesis Advisory:** Lower WER indicates greater verbatim word-level alignment with the reference transcript. It does **not** establish pronunciation quality or overall speaking proficiency.

### B. Speech Rate (WPM)
Calculated according to the thesis formula:

$$\text{Speech Rate (WPM)} = \frac{60 \times W}{T}$$

- $W$ = Recognized spoken-word count
- $T$ = Learner response interval in seconds (including internal silent pauses; excluding system prompts and unused margins)
- **Zero/Insufficient Speech Handling:** If $T \le 0$ or $W \le 0$, the metric is reported as `unavailable` rather than 0 WPM.

### C. Silence Pause Frequency and Duration
Implemented via **independent acoustic audio signal analysis** (not inferred solely from word timestamps):
- Signal is windowed into frames (20 ms window, 10 ms hop).
- RMS amplitude is converted to $\text{dBFS} = 20 \log_{10}(\text{RMS} / \text{MAX})$.
- Continuous segments where $\text{dBFS} < \text{threshold}$ (default: $-35.0\text{ dBFS}$) for at least $\text{min\_pause\_duration}$ (default: $0.25\text{ s}$ / $250\text{ ms}$, configurable) are classified as qualifying pause events ($P$).
- **Pause Frequency:** $\text{Pause Frequency} = P / T$ (pauses per second)
- **Pauses per Minute:** $\text{Pauses per Minute} = 60 \times P / T$
- **Mean Pause Duration:** $\text{Mean Pause Duration} = \frac{\sum \text{qualifying pause durations}}{P}$
- **Zero Pauses Handling:** If $P = 0$, mean pause duration is explicitly reported as `undefined` (None).

### D. Repetition Rate
Operational implementation-defined metric:

$$\text{Repetition Rate (\%)} = 100 \times \frac{R}{W}$$

- $R$ = Number of annotated / candidate repetition events (stutters like *"I-I"*, single-word duplicates like *"the the"*, or phrase repetitions)
- $W$ = Eligible spoken-word count

### E. Candidate Self-Corrections
Identifies verbal repair indicators (e.g., *"actually"*, *"I mean"*, *"rather"*, *"sorry"*, mid-sentence restarts like *"I work—worked"*). Stored as provisional candidates with reviewer decisions (`pending`, `approved`, `rejected`) and reported separately from repetitions.

### F. Quantitative Error Measures (MAE, Median AE, Signed Differences)
For paired automatic ($A_i$) and reference ($R_i$) measurements (e.g., Speech Rate WPM, Response Duration):
- **Signed Difference:** $A_i - R_i$
- **Mean Absolute Error (MAE):** $\text{MAE} = \frac{1}{n} \sum |A_i - R_i|$
- **Median Absolute Error:** $\text{Median}(|A_i - R_i|)$

### G. Event-Detection Evaluation (Precision, Recall, F1)
Evaluates silence pause and repetition detection against reference annotations using 1-to-1 temporal matching within a configurable tolerance window ($\pm 0.25\text{ s}$):
- $\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}$
- $\text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}}$
- $\text{F1} = \frac{2 \times \text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$
- If denominators are zero, metrics are reported as `undefined` with reasons.

---

## 3. Ten Standard Research Test Scenarios

The test case manager pre-loads 10 authorized research scenarios defined in the thesis:

1. **TC-01:** Clear speech in a quiet environment (*Baseline read-aloud task*)
2. **TC-02:** Speech containing filler words (*"uh"*, *"um"*, *"well"*)
3. **TC-03:** Stuttered and repeated words (*"I-I"*, *"the, the"*)
4. **TC-04:** Mid-sentence self-corrections and false starts (*"I work—worked in a team"*)
5. **TC-05:** Longer conversational responses (*Multi-sentence discourse*)
6. **TC-06:** Different speaking rates (*Rapid articulation > 170 WPM*)
7. **TC-07:** Speech with background acoustic noise (*Coffee shop ambient speech*)
8. **TC-08:** Device variation (*Handheld smartphone vs built-in mic*)
9. **TC-09:** Accent and pronunciation variation (*Filipino English L2 speaker*)
10. **TC-10:** Short responses and incomplete recordings (*Boundary test, N=3 words*)

Researchers can select any preset scenario, edit reference transcripts and metadata, or add custom test cases.

---

## 4. Setup and Execution Instructions (Windows PowerShell)

### Step 1: Configure Backend Environment
Ensure `backend/.env` contains your AssemblyAI API key and Gemini API key:
```powershell
# Copy template if .env does not exist yet
Copy-Item backend\.env.example backend\.env
```
Open `backend/.env` and insert your keys:
```env
ASSEMBLYAI_API_KEY=your_actual_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash-lite
```

> **Note on Secure Gemini Integration:** The `GEMINI_API_KEY` is loaded strictly by the backend environment. It is never transmitted to the browser, source maps, client code, or frontend state. When `GEMINI_API_KEY` is absent or offline, Articula automatically falls back to its deterministic expert phonetic engine.

### Step 2: Run Automated Backend Unit Tests
To verify all formulas (WER, WPM, pauses, silence detection, MAE, F1, and phoneme comparison):
```powershell
.\backend\venv\Scripts\pytest.exe -v backend
```
*(All 52 tests should pass: 23 evaluation + 13 phoneme analyzer + 16 phoneme comparison tests).*

### Step 3: Start the Backend Server (Terminal 1)
```powershell
.\backend\venv\Scripts\uvicorn.exe main:app --app-dir backend --port 8000 --reload
```

### Step 4: Start the Frontend Web App (Terminal 2)
```powershell
cd frontend
npm run dev
```

### Step 5: Open Browser
Navigate to **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)**.

---

## 5. Expected vs. Predicted Phoneme Comparison Architecture

The hybrid pipeline extends AssemblyAI transcription with Wav2Vec2 acoustic phonetics and multi-tier G2P reference comparison:

```text
              [FULL SPOKEN RESPONSE]
                        |
                        v
                  [AssemblyAI]
                        |
                        v
              [Full Transcription]
                        |
                        v
              [Word-Level Timestamps]
                        |
                        v
                [Extract Word Clips]
                        |
                        v
                [Wav2Vec2Phoneme]
                        |
                        v
              [Predicted Phonemes]
                        |
                        |
          +-------------+-------------+
          |                           |
          v                           v
    [Expected Word]             [Audio Prediction]
          |                           |
          v                           |
    [G2P / Pronunciation               |
      Dictionary]                      |
          |                           |
          v                           |
    [Expected Phonemes]                |
          |                           |
          +-------------+-------------+
                        |
                        v
              [Phoneme Alignment]
                        |
                        v
             [Difference Detection]
                        |
             +----------+----------+
             |          |          |
             v          v          v
        Substitution Deletion  Insertion
             |          |          |
             +----------+----------+
                        |
                        v
              [Pronunciation Findings]
                        |
                        v
              [Feedback Generation]
```

### Phoneme Error Rate (PER) Formula:
$$\text{PER} = \frac{S + D + I}{N} \times 100$$
- $S$ = Phoneme substitutions
- $D$ = Phoneme deletions
- $I$ = Phoneme insertions
- $N$ = Number of expected reference phonemes

### Multiple Valid Pronunciations:
For words with multiple accepted pronunciations (e.g. *either* as `/iː ð ɚ/` or `/aɪ ð ɚ/`), the system aligns against all legitimate variants and automatically matches the variant produced by the speaker, preventing valid accents from being flagged as errors.

### Pronunciation Findings Guardrails:
All observations are recorded with `confidence_level="requires_validation"` and `validation_status="unvalidated_single_occurrence"` to distinguish single-instance acoustic observations from persistent learner habits.

---

## 6. Research Scope, Pronunciation & Limitations (Section 9)

In adherence to the Articula thesis specification:
- **WER $\ne$ Pronunciation:** High transcription accuracy indicates agreement with words spoken, not native-like phonological pronunciation.
- **Provider Confidence $\ne$ Learner Fluency:** AssemblyAI confidence represents acoustic decoding confidence, not speaker proficiency or confidence.
- **Acoustic Silence $\ne$ Timestamp Gaps:** Gaps between word timestamps in ASR output are only candidate pauses. Silence is verified against the acoustic audio signal.
- **Wav2Vec2Phoneme Predictions $\ne$ Correctness Scores:** Predicted IPA phonemes from `facebook/wav2vec2-lv-60-espeak-cv-ft` provide observational acoustic data. Dialectal variations (e.g., rhoticity, vowel shifts) and isolated word slicing effects mean phonetic divergence must not be simplistically scored as an error.
- **No Standardized Proficiency Scores:** Articula does not assign CEFR levels, IELTS bands, or infer emotional states or anxiety. It is designed as an experimental formative practice prototype.

---

## 6. Export Capabilities

Under **Research Data & Reproducibility Export**, researchers can download:
1. **Raw Transcript TXT:** Verbatim AssemblyAI text.
2. **Per-Test CSV:** Complete row containing all 30+ recording, reference, AssemblyAI, and evaluation variables.
3. **Token Alignment CSV:** Reference vs recognized word tokens with S, D, I classifications.
4. **Phonetic Diagnostics CSV:** Word-level timestamps, ASR confidence, Wav2Vec2 predicted IPA phonemes, and reference IPA.
5. **Reproducibility Record JSON:** Provenance audit document containing formulas, thresholds used, normalization policy, software environment, inputs, and word-level phonetic predictions.
6. **Session Summary CSV:** Aggregate table across all tests run during the browsing session.
