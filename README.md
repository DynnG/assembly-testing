# Articula: AssemblyAI ASR Testing Web App

A functional, standalone web application built to evaluate **AssemblyAI's Speech-to-Text (ASR) API** for our thesis project:
> **Articula: An AI-Based Speech Coach for Clear and Effective English Communication Through Conversational Voice Analysis.**

This prototype allows researchers and developers to test speech recognition accuracy, assess word-level timestamps and confidence scores, and critically evaluate **speech disfluency preservation** (e.g., filler words like *"um"* and *"uh"*, stuttered repetitions like *"I-I"*, false starts, self-corrections, and unaltered grammatical errors) necessary for downstream speech fluency coaching algorithms.

---

## 1. System Architecture & Features

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS.
- **Backend:** Python 3.13 + FastAPI + Uvicorn + HTTPX.
- **ASR Provider:** AssemblyAI Speech-to-Text API (`v2`).
- **Privacy & Audio Handling:** Preserves original audio formats; never permanently stores uploaded audio or transcripts on the backend server.
- **API Key Security:** Key is strictly kept on the backend in `backend/.env` and never exposed to the frontend or browser.

### Key Capabilities
1. **API Connection & Authentication Status:**
   - Lightweight, official verification request (`GET /v2/transcript?limit=1`) that authenticates your key without spending quota on unnecessary audio transcription.
   - Distinguishes missing keys, invalid keys (HTTP 401), rate limits, and network errors.
2. **Audio Input Options:**
   - **Upload Audio:** Accepts WAV, MP3, M4A, WebM, OGG, and FLAC (up to 50 MB for testing). Validates file format and displays duration and size preview.
   - **Record Audio (Optional):** In-browser microphone recorder using native `MediaRecorder` API. Requests permission only when clicked. Real-time timer and playback preview before submission.
3. **Disfluency Preservation Control (`disfluencies=true`):**
   - By default, AssemblyAI cleans up verbal pauses and filler words. This prototype provides an explicit toggle (enabled by default) to instruct AssemblyAI to retain raw filler words.
4. **Verbatim Transcript Display:**
   - Outputs the exact transcription string returned by AssemblyAI without synthetic cleanup or grammar alterations.
   - Includes one-click clipboard copy, plain-text (`.txt`) download, duration metrics, word counts, and word-level timestamps/confidence inspectors.
5. **Dedicated Disfluency & Fluency Experiment Section:**
   - Pre-configured speaking prompts targeting fillers, repetitions, false starts, and grammatical slips.
   - Side-by-side comparison between expected spoken utterances and raw ASR output.
6. **Ephemeral Session History:**
   - In-memory test run log for comparing multiple test recordings during your browsing session.

---

## 2. Project Structure

```text
testing/
├── frontend/                     # React + Vite + TypeScript web dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx                 # Application header & data privacy notice
│   │   │   ├── ApiStatusCard.tsx          # Backend status & AssemblyAI auth tester
│   │   │   ├── AudioInputCard.tsx         # File upload & MediaRecorder microphone
│   │   │   ├── DisfluencyTestCard.tsx     # Prompts, comparison & fluency inspection
│   │   │   ├── TranscriptionResultsCard.tsx# Raw transcript viewer & metadata
│   │   │   └── SessionHistoryCard.tsx     # In-memory test run log
│   │   ├── services/
│   │   │   └── api.ts                     # HTTP client communicating with backend
│   │   ├── types.ts                       # TypeScript interfaces
│   │   ├── App.tsx                        # Main dashboard coordinator
│   │   ├── index.css                      # Tailwind dark navy styling
│   │   └── main.tsx                       # React application entry point
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts                     # Dev server & API proxy config
├── backend/                      # FastAPI Python backend
│   ├── main.py                   # REST endpoints (/health, /test-connection, /transcribe)
│   ├── requirements.txt          # Python dependencies
│   ├── .env.example              # Template for API credentials
│   └── venv/                     # Python virtual environment (ignored in git)
├── .gitignore                    # Git ignore file protecting .env & node_modules
└── README.md                     # Beginner-friendly setup instructions
```

---

## 3. Prerequisites

Ensure you have the following installed on your Windows machine:
- **Python 3.10+** (Python 3.13 tested): Verify with `python --version`
- **Node.js v18+** (Node.js v24 tested): Verify with `node --version`
- **npm v9+**: Verify with `npm --version`
- **Windows PowerShell**

---

## 4. Setup Instructions (Step-by-Step for Windows)

### Step 1: Obtain an AssemblyAI API Key
1. Go to the official AssemblyAI website: [https://www.assemblyai.com](https://www.assemblyai.com)
2. Sign up or log into your account dashboard: [https://www.assemblyai.com/app](https://www.assemblyai.com/app)
3. Copy your API key from the dashboard home page.

### Step 2: Configure the Backend Environment
1. In the `backend` folder, create a file named `.env` by copying `backend/.env.example`.
2. In PowerShell, you can run:
   ```powershell
   Copy-Item backend\.env.example backend\.env
   ```
3. Open `backend\.env` in any text editor (Notepad, VS Code) and paste your key:
   ```env
   ASSEMBLYAI_API_KEY=your_actual_api_key_here
   ```
   *(Note: Never commit `.env` to version control. It is already excluded in `.gitignore`.)*

### Step 3: Setup the Python Virtual Environment
Open **Terminal 1** (PowerShell) in the project root directory (`testing`):

```powershell
# 1. Create virtual environment (if not already created)
python -m venv backend\venv

# 2. Activate virtual environment
.\backend\venv\Scripts\Activate.ps1

# Note: If PowerShell reports an execution policy error, run:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 3. Install Python dependencies
pip install -r backend\requirements.txt
```

### Step 4: Install Frontend Dependencies
Open **Terminal 2** (PowerShell) in the project root directory:

```powershell
# Navigate into the frontend folder
cd frontend

# Install Node modules
npm install
```

---

## 5. Running the Application

You will run the backend and frontend in two separate terminals.

### Terminal 1: Start the FastAPI Backend
From the project root directory:

```powershell
.\backend\venv\Scripts\uvicorn.exe main:app --app-dir backend --port 8000 --reload
```

You should see:
```text
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
INFO:     Application startup complete.
```

### Terminal 2: Start the Vite React Frontend
From the `frontend` directory:

```powershell
cd frontend
npm run dev
```

You should see:
```text
  VITE ready in ... ms
  ➜  Local:   http://127.0.0.1:5173/
```

### Step 5: Open the Application in your Browser
Open your browser and navigate to:
👉 **[http://127.0.0.1:5173/](http://127.0.0.1:5173/)** (or `http://localhost:5173/`)

---

## 6. How to Test the Application

### A. Test API Connection
1. In the top card **API Connection & Status**, verify that:
   - **FastAPI Backend** shows **Connected** (green).
   - **AssemblyAI Configuration** shows **Configured** (green).
2. Click **Test API Connection**.
3. The backend sends a minimal authenticated check to `GET https://api.assemblyai.com/v2/transcript?limit=1`.
4. A green alert box will confirm: *"Successfully authenticated with AssemblyAI API."*
   *(If your key is invalid, it will display a clear 401 Unauthorized explanation without crashing.)*

### B. Transcribe an Uploaded Audio File
1. Under **Audio Input**, ensure the **Upload File** tab is active.
2. Drag and drop any `.wav`, `.mp3`, `.m4a`, or `.webm` file, or click to browse.
3. Review the file name, detected duration, and file size. Play the audio preview to verify quality.
4. Ensure **Preserve Speech Disfluencies (`disfluencies=true`)** is toggled ON.
5. Click **Transcribe Audio**.
6. The app displays real-time processing elapsed seconds while streaming to AssemblyAI and polling for results.
7. Once complete, inspect the verbatim transcript, word count, confidence score, and optional word-level timestamp breakdown.

### C. Transcribe Microphone Audio (Optional)
1. Under **Audio Input**, click the **Record Mic (Optional)** tab.
2. Click **Start Recording** (your browser will request microphone permission).
3. Speak a test sentence aloud.
4. Click **Stop Recording**.
5. Listen to the audio preview using the player.
6. Click **Transcribe Audio** to process your recording.

### D. Systematic Speech Disfluency Experiment (For Articula Thesis)
The core research question for Articula is whether AssemblyAI accurately preserves speech hesitations needed to compute speaker fluency scores.

Use the **Articula Disfluency & Fluency Experiment** section:
1. Select one of the pre-configured prompt cards:
   - **Prompt 1 (Filler):** *"Um, I think I can do this task."*
   - **Prompt 2 (Stuttered Repetition):** *"I-I want to explain my idea."*
   - **Prompt 3 (Word Repetition):** *"The, the main reason is communication."*
   - **Prompt 4 (Self-Correction):** *"I wanted to go—actually, I stayed home."*
   - **Prompt 5 (Grammar Error):** *"Yesterday I go to school and meet my friend."*
2. Or click **Add Custom Prompt** to define your own test utterance.
3. Read the prompt displayed in the teleprompter into the microphone and record.
4. Transcribe the recording.
5. Review the **Transcript Disfluency Inspection** panel:
   - Compares expected phrase with raw transcript.
   - Highlights whether fillers or repetitions were preserved or filtered out.
   - Notes potential impacts on Articula's downstream speech coaching metrics (hesitation index, speech rate).

---

## 7. Troubleshooting

| Issue | Likely Cause | Solution |
| :--- | :--- | :--- |
| **Backend Disconnected** | FastAPI server is not running or running on wrong port. | Start the backend using `.\backend\venv\Scripts\uvicorn.exe main:app --app-dir backend --port 8000 --reload` in Terminal 1. |
| **Missing API Key** | `backend/.env` does not exist or has placeholder text. | Create `backend/.env` and set `ASSEMBLYAI_API_KEY=your_actual_key`. The backend automatically reloads `.env` changes. |
| **401 Unauthorized Error** | AssemblyAI key was mistyped or revoked. | Copy a fresh API key from [AssemblyAI Dashboard](https://www.assemblyai.com/app). |
| **Microphone Permission Denied** | Browser blocked mic access or no mic detected. | Click the lock/tune icon in the browser address bar, set Microphone to **Allow**, and reload the page. Note that file upload works independently without a microphone. |
| **CORS Error** | Direct backend access without Vite proxy. | Access the app via `http://127.0.0.1:5173`. The backend is preconfigured to permit CORS origins for localhost ports 5173 and 3000. |
| **Unsupported Audio Format** | File is not a supported audio container. | Use standard formats: WAV, MP3, M4A, WebM, OGG, or FLAC. |

---

## 8. API Pricing & Free Tier Limits

- **Free Tier:** AssemblyAI provides free credits upon account registration to test their Speech-to-Text API.
- **Speech-to-Text Rates:** Audio transcription is billed by processed audio duration (typically ~$0.15 to ~$0.37 per audio hour depending on the model tier).
- **Official Documentation:** [https://www.assemblyai.com/docs/](https://www.assemblyai.com/docs/)
- **Pricing Information:** [https://www.assemblyai.com/pricing](https://www.assemblyai.com/pricing)
