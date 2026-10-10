
## What it does

- Paste a resume and/or job description, it detects the role and the
  competencies worth probing
- Pulls questions from a tagged bank (RAG) instead of generating them fresh
  each time, so every question is traceable to a specific competency
- Scores each answer on a fixed rubric, gives two actionable tips and a
  rewritten stronger answer
- Remembers past scores, so the next session targets whatever competency I've
  historically scored lowest on
- Optional voice mode - speak your answer, hear the question and feedback
  read back

## Architecture

```
Resume + job description
          |
          v
   Resume/JD parser agent  --->  detects role_type + target competencies
          |
          v
      Orchestrator  <--------------------+
     /     |      \                      |
    v      v       v                     |
Interviewer  Evaluator  Coach            |
 agent       agent      agent            |
    |         |           |              |
    +---------+-----------+              |
              |                          |
              v                          |
       Session memory (SQLite) ----------+
       tracks per-competency scores,
       biases the next question toward
       whatever's weakest
```

Each agent has one job and a narrow system prompt - I found that far more
reliable than one prompt trying to ask, score, and coach at once. The
orchestrator is plain Python, not an LLM call, so the control flow is
deterministic: the model never decides what happens next, my code does.

## RAG design

The interviewer doesn't invent questions - it retrieves them from
`data/question_bank.json` (tagged by role, competency, difficulty), embedded
and indexed in ChromaDB using its bundled local model (no API cost). Retrieval
tries an exact `(role_type, competency)` match first, falls back to
`role_type` alone, then falls back to anything unused - so a small question
bank never dead-ends.

Before each question, the orchestrator checks SQLite for whichever
competency has the lowest average score across past sessions for that role,
and biases retrieval toward it. That's the whole adaptive loop - a simple,
explainable heuristic, not a learned ranking model. I'm calling that out
directly because it's an honest limitation, not something I'd want to oversell
as more sophisticated than it is.

## Voice layer

Optional. Speech-to-text via Groq's free Whisper endpoint, text-to-speech via
`edge-tts` (free, no key needed). Both go through the same orchestrator
methods as the text flow.

## Tech stack

- **LLM:** Groq, `llama-3.3-70b-versatile` (free tier)
- **Retrieval:** ChromaDB, local bundled embeddings
- **Memory:** SQLite
- **Voice:** Groq Whisper (STT), edge-tts (TTS)
- **Backend:** FastAPI
- **Frontend:** vanilla HTML/JS

Total cost to run: $0.

## Setup

1. `python -m venv venv` then activate it
   (Mac/Linux: `source venv/bin/activate` · Windows: `venv\Scripts\activate`)
2. `pip install -r requirements.txt`
3. Free key at https://console.groq.com/keys
4. `cp .env.example .env` (Windows: `copy`), paste the key in
5. `python main.py`
6. Open (http://127.0.0.1:8000/)

## Using it

Paste a job description/resume (or skip it), click Analyze, set how many
questions, optionally turn on voice, click Start. Answer each question,
review the scores and feedback, repeat. History persists across runs.

## What I'd build next / known limitations

- Sessions live in server memory - restarting the server ends an in-progress
  interview, though saved scores in `memory.sqlite3` persist
- The question bank is small (~20 questions) on purpose, to start - meant to
  grow by appending more entries with the same schema
- Adaptive targeting is a simple "lowest historical average" heuristic, not
  anything more sophisticated
- No authentication - single-user, local tool, not a multi-tenant service
- Single biggest next step: refactor the orchestrator into LangGraph, since
  it's already conceptually a hand-written state machine
