import tempfile
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from src.orchestrator import InterviewSession
from src.agents.resume_parser import ResumeParserAgent
from src.memory import db as memory
from src.voice.stt import transcribe
from src.resume_parser import extract_resume_text


# ============================================================
# APP
# ============================================================

app = FastAPI(title="InterviewIQ")


# ============================================================
# STATIC FILES
# ============================================================

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app.mount(
    "/static",
    StaticFiles(directory=str(STATIC_DIR)),
    name="static"
)


# ============================================================
# MEMORY / SESSION
# ============================================================

memory.init_db()

SESSIONS: dict[str, InterviewSession] = {}

parser = ResumeParserAgent()


# ============================================================
# HOME
# ============================================================

@app.get("/")
def root():
    return FileResponse(
        str(STATIC_DIR / "index.html")
    )


# ============================================================
# RESUME PDF UPLOAD
# ============================================================

@app.post("/api/resume/upload")
async def upload_resume(
    resume: UploadFile = File(...)
):
    """
    Upload a PDF resume and extract its text.
    """

    if not resume.filename:
        raise HTTPException(
            status_code=400,
            detail="No resume file was selected."
        )

    if not resume.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a PDF resume."
        )

    try:
        # Read uploaded PDF
        file_data = await resume.read()

        # Save temporarily
        with tempfile.NamedTemporaryFile(
            suffix=".pdf",
            delete=False
        ) as tmp:

            tmp.write(file_data)
            tmp_path = tmp.name

        # Extract text
        resume_text = extract_resume_text(
            tmp_path
        )

        return {
            "success": True,
            "filename": resume.filename,
            "text": resume_text,
            "characters": len(resume_text)
        }

    except Exception as e:

        raise HTTPException(
            status_code=400,
            detail=f"Could not process resume: {str(e)}"
        )


# ============================================================
# RESUME / JOB DESCRIPTION PROFILE ANALYSIS
# ============================================================

@app.post("/api/parse-profile")
def parse_profile(
    resume_text: str = Form(""),
    job_description: str = Form("")
):

    if not resume_text and not job_description:

        return {
            "role_type": "General",
            "competencies": [
                "communication",
                "ambiguity"
            ]
        }

    return parser.parse(
        resume_text,
        job_description
    )


# ============================================================
# START INTERVIEW
# ============================================================

@app.post("/api/session/start")
def start_session(
    role_type: str = Form(...),
    competencies: str = Form(""),
    num_questions: int = Form(5),
    voice: bool = Form(False),
):

    comp_list = [
        c.strip()
        for c in competencies.split(",")
        if c.strip()
    ]

    session = InterviewSession(
        role_type,
        comp_list,
        num_questions,
        voice
    )

    SESSIONS[session.session_id] = session

    first_question = session.next_question()

    return {
        "session_id": session.session_id,
        **first_question
    }


# ============================================================
# SUBMIT INTERVIEW ANSWER
# ============================================================

@app.post("/api/session/{session_id}/answer")
async def submit_answer(
    session_id: str,
    answer_text: str = Form(""),
    audio: UploadFile = File(None),
):

    # Check session
    if session_id not in SESSIONS:

        raise HTTPException(
            status_code=404,
            detail="Interview session not found."
        )

    session = SESSIONS[session_id]

    final_answer_text = answer_text

    # --------------------------------------------------------
    # VOICE ANSWER
    # --------------------------------------------------------

    if audio is not None:

        with tempfile.NamedTemporaryFile(
            suffix=".webm",
            delete=False
        ) as tmp:

            tmp.write(
                await audio.read()
            )

            tmp_path = tmp.name

        try:

            final_answer_text = transcribe(
                tmp_path
            )

        except Exception as e:

            raise HTTPException(
                status_code=400,
                detail=f"Could not transcribe audio: {str(e)}"
            )

    # --------------------------------------------------------
    # AI EVALUATION
    # --------------------------------------------------------

    feedback_result = session.submit_answer(
        final_answer_text
    )

    # Get next question
    next_q = session.next_question()

    return {
        "transcript": final_answer_text,
        **feedback_result,
        "next": next_q
    }


# ============================================================
# INTERVIEW HISTORY
# ============================================================

@app.get("/api/history")
def history():

    return memory.get_history()


# ============================================================
# AUDIO FILES
# ============================================================

@app.get("/api/audio/{filename}")
def get_audio(
    filename: str
):

    audio_path = (
        STATIC_DIR
        / "audio"
        / filename
    )

    return FileResponse(
        str(audio_path),
        media_type="audio/mpeg"
    )