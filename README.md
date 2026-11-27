# Articula: AI English Conversation Companion

> **"Your Space to Speak, Express, and Grow."**  
> *Core Philosophy: "English is not just something you study. It is something you practice by using it."*

---

## 1. Project Purpose & Philosophy

Articula is an AI-powered English conversation companion designed to provide learners with accessible, judgment-free opportunities to practice expressing thoughts, ideas, opinions, and experiences in English through interactive and supportive communication.

### Important Direction
- **Articula is NOT an English proficiency examiner, pronunciation evaluator, or fluency scoring system.**
- The goal is **not** to judge how good someone's English is.
- The goal **is** to give them someone to talk to in English, helping them find the right words, express their ideas naturally, and build genuine communication confidence.

---

## 2. Core Features & Architecture

### A. AI Conversation Companion
- **Active Listening & Natural Dialogue:** Gemini 3.5 Flash-Lite engages in natural, contextual conversation, asking one relevant, thoughtful follow-up question per turn without turning conversations into rigid questionnaires.
- **Supportive Modes:**
  1. `Natural Conversation` (default): Authentic peer-to-peer dialogue with curious, engaging questions.
  2. `Gentle Guidance`: Slightly simplified vocabulary, warmer pacing, and gentle modeling of natural phrasing.
  3. `Learning Support`: Scaffolding support with sentence starters and vocabulary encouragement when learners struggle.
- **Multi-Turn Context Memory:** Remembers preceding turns across dialogue sessions.

### B. Conversation Categories
Learners can choose and switch between 6 engaging discussion domains at any time:
1. **Everyday Conversations:** Daily routines, hobbies, food, weather, weekend plans, and friends.
2. **School and Academic Life:** Classes, study habits, presentations, group discussions, and favorite subjects.
3. **Work and Professional Life:** Workplace communication, meetings, sharing updates, career goals, and teamwork.
4. **Opinions and Discussions:** Perspectives on modern trends, technology, social topics, and different viewpoints.
5. **Storytelling and Experiences:** Memorable journeys, childhood memories, funny stories, and overcoming challenges.
6. **Situational Practice:** Practical scenarios like ordering at a cafe, asking for directions, making appointments, and customer service.

### C. English Expression Assistance (On-Demand Help)
Learners can access the Expression Assistant at any moment during the conversation without interrupting dialogue:
- 💡 **"How else can I say this?"** (`how_else`): Provides 2-3 natural alternatives (casual everyday, clear/polite, idiomatic).
- ✍️ **"Help me express an idea"** (`help_express`): Takes raw thoughts and suggests clear ways to articulate them.
- ❓ **"What does this word mean?"** (`explain_word`): Clarifies nuance, meaning, and conversational examples.
- ✨ **"Help me expand my answer"** (`expand_answer`): Provides guided elaboration points and sentence structures.
- 💬 **"Give me an example"** (`give_example`): Real-world conversational examples.

### D. Conversation Reflection (Replacing Evaluative Scoring)
When learners wrap up their speaking session, Articula provides a supportive, judgment-free **Conversation Reflection**:
1. **Conversation Summary:** A warm narrative overview of what the learner discussed and the perspectives they shared.
2. **Useful Expressions:** Practical phrases used or encountered during dialogue, natural alternatives, and new vocabulary with example sentences.
3. **Thought Development:** Celebrating moments where the learner communicated ideas clearly and effectively.
4. **Further Practice:** Engaging follow-up questions and topics to explore in future chats.
5. **Personal Reflection Prompts:** Reflective questions encouraging learners to consider how they felt speaking and expressing themselves.
- **Zero numerical scores, zero CEFR grades, and zero error percentages.**

---

## 3. Technology Stack

- **Backend:** FastAPI (Python 3.13), Uvicorn, HTTPX, Pydantic, PyTorch, AssemblyAI REST API.
- **LLM Engine:** Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`).
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons.
- **Audio Processing:** In-browser MediaRecorder API, Web Audio API, AssemblyAI Speech-to-Text API.
- **Privacy:** Zero server audio storage; temporary memory buffers are cleared immediately.

---

## 4. Setup & Running Locally

### Backend
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# Configure environment variables in backend/.env:
# ASSEMBLYAI_API_KEY=your_assemblyai_key
# GEMINI_API_KEY=your_gemini_api_key
# GEMINI_MODEL=gemini-3.5-flash-lite

uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run build
npm run dev
```

### Running Tests
```bash
cd backend
.\venv\Scripts\pytest test_gemini_integration.py test_conversation_companion.py -v
```
