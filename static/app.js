let sessionId = null;
let useVoice = false;

let profile = {
    role_type: "General",
    competencies: []
};

let resumeText = "";
let resumeFile = null;

let mediaRecorder = null;
let recordedChunks = [];
let recordedBlob = null;


/* =========================================================
   HELPERS
   ========================================================= */

const $ = (id) => document.getElementById(id);

function show(element) {
    element.classList.remove("hidden");
}

function hide(element) {
    element.classList.add("hidden");
}


/* =========================================================
   RESUME FILE SELECTION
   ========================================================= */

$("resumeFile").addEventListener("change", function () {

    const file = this.files[0];

    if (!file) {
        return;
    }

    if (file.type !== "application/pdf") {
        alert("Please select a PDF resume.");
        this.value = "";
        return;
    }

    resumeFile = file;

    $("resumeFileName").textContent = file.name;

    const sizeKB = (file.size / 1024).toFixed(1);
    $("resumeFileSize").textContent = `${sizeKB} KB`;

    show($("resumeInfo"));

    $("resumeStatus").textContent =
        "Resume selected. Click Analyze Resume.";

});


/* =========================================================
   REMOVE RESUME
   ========================================================= */

$("removeResumeBtn").onclick = function () {

    resumeFile = null;
    resumeText = "";

    $("resumeFile").value = "";

    hide($("resumeInfo"));

    $("resumeStatus").textContent =
        "Resume removed.";

};


/* =========================================================
   UPLOAD + ANALYZE RESUME
   ========================================================= */

$("uploadResumeBtn").onclick = async function () {

    if (!resumeFile) {

        $("resumeStatus").textContent =
            "Please select your resume PDF first.";

        return;
    }

    $("uploadResumeBtn").disabled = true;

    $("resumeStatus").textContent =
        "Uploading and analyzing your resume...";

    try {

        const form = new FormData();

        form.append("resume", resumeFile);

        const response = await fetch(
            "/api/resume/upload",
            {
                method: "POST",
                body: form
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "Resume upload failed."
            );
        }

        resumeText = data.text;

        $("resumeStatus").textContent =
            `✓ Resume analyzed successfully. ${data.characters} characters extracted.`;

        $("resumeStatus").className = "success-message";

        // Enable interview settings
        show($("interviewSettings"));

    } catch (error) {

        console.error(error);

        $("resumeStatus").textContent =
            `Error: ${error.message}`;

        $("resumeStatus").className = "error-message";

    } finally {

        $("uploadResumeBtn").disabled = false;

    }

};


/* =========================================================
   JOB DESCRIPTION
   ========================================================= */

$("analyzeJDBtn").onclick = async function () {

    const jobDescription =
        $("jobDescription").value.trim();

    if (!jobDescription) {

        $("jdStatus").textContent =
            "Please paste the job description first.";

        return;
    }

    if (!resumeText) {

        $("jdStatus").textContent =
            "Please analyze your resume first.";

        return;
    }

    $("analyzeJDBtn").disabled = true;

    $("jdStatus").textContent =
        "Analyzing job description...";

    try {

        const form = new FormData();

        form.append("resume_text", resumeText);
        form.append(
            "job_description",
            jobDescription
        );

        const response = await fetch(
            "/api/parse-profile",
            {
                method: "POST",
                body: form
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "JD analysis failed."
            );
        }

        profile = data;

        $("jdStatus").textContent =
            "✓ Job description analyzed.";

        $("jdStatus").className =
            "success-message";

        /*
         * For now, display the competencies returned
         * by the existing backend.
         *
         * We will replace this later with the proper
         * Resume × JD matching engine.
         */

        $("matchPercentage").textContent =
            "--%";

        $("matchingSkills").innerHTML =
            createTags(profile.competencies || []);

        $("missingSkills").innerHTML =
            "<span class='muted'>Matching engine coming next</span>";

        $("relevantProjects").innerHTML =
            "<span class='muted'>Project matching coming next</span>";

        show($("matchSection"));
        show($("interviewSettings"));

    } catch (error) {

        console.error(error);

        $("jdStatus").textContent =
            `Error: ${error.message}`;

        $("jdStatus").className =
            "error-message";

    } finally {

        $("analyzeJDBtn").disabled = false;

    }

};


/* =========================================================
   CREATE SKILL TAGS
   ========================================================= */

function createTags(items) {

    if (!items || items.length === 0) {
        return "<span class='muted'>None detected</span>";
    }

    return items
        .map(
            item =>
                `<span class="skill-tag">${item}</span>`
        )
        .join("");

}


/* =========================================================
   START INTERVIEW
   ========================================================= */

$("startBtn").onclick = async function () {

    useVoice = $("voiceToggle").checked;

    const numQuestions =
        Number($("numQuestions").value);

    if (!profile.competencies ||
        profile.competencies.length === 0) {

        alert(
            "Please analyze the job description first."
        );

        return;
    }

    const form = new FormData();

    form.append(
        "role_type",
        profile.role_type || "General"
    );

    form.append(
        "competencies",
        profile.competencies.join(",")
    );

    form.append(
        "num_questions",
        numQuestions
    );

    form.append(
        "voice",
        useVoice
    );

    try {

        $("startBtn").disabled = true;

        $("startBtn").textContent =
            "Preparing interview...";

        const response = await fetch(
            "/api/session/start",
            {
                method: "POST",
                body: form
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.detail || "Could not start interview."
            );
        }

        sessionId = data.session_id;

        hide($("setup"));
        show($("interview"));

        $("voiceAnswerArea").classList.toggle(
            "hidden",
            !useVoice
        );

        $("textAnswerArea").classList.toggle(
            "hidden",
            useVoice
        );

        renderQuestion(data);

    } catch (error) {

        console.error(error);

        alert(error.message);

    } finally {

        $("startBtn").disabled = false;

        $("startBtn").textContent =
            "Start Personalized Interview →";

    }

};


/* =========================================================
   RENDER QUESTION
   ========================================================= */

function renderQuestion(data) {

    $("questionCounter").textContent =
        `Question ${data.question_number} of ${data.total_questions}`;

    $("questionText").textContent =
        data.question;

    hide($("feedbackBox"));

    hide($("nextBtn"));

    $("answerText").value = "";

    $("transcriptText").textContent =
        "No transcript available.";

    $("feedbackText").textContent = "";

    recordedBlob = null;

    $("recordStatus").textContent = "";

    if (data.question_audio) {

        $("questionAudio").src =
            `/api/audio/${data.question_audio}`;

        show($("questionAudio"));

        $("questionAudio").play().catch(() => {});

    } else {

        hide($("questionAudio"));

    }

}


/* =========================================================
   MICROPHONE
   ========================================================= */

$("recordBtn").onclick = async function () {

    if (
        mediaRecorder &&
        mediaRecorder.state === "recording"
    ) {

        mediaRecorder.stop();

        $("recordBtn").textContent =
            "🎙 Start Recording";

        return;
    }

    try {

        const stream =
            await navigator.mediaDevices.getUserMedia({
                audio: true
            });

        recordedChunks = [];

        mediaRecorder =
            new MediaRecorder(stream);

        mediaRecorder.ondataavailable =
            function (event) {

                if (event.data.size > 0) {
                    recordedChunks.push(
                        event.data
                    );
                }

            };

        mediaRecorder.onstop =
            function () {

                recordedBlob =
                    new Blob(
                        recordedChunks,
                        {
                            type: "audio/webm"
                        }
                    );

                stream
                    .getTracks()
                    .forEach(
                        track => track.stop()
                    );

                $("recordStatus").textContent =
                    "✓ Recording captured. Submit your answer.";

            };

        mediaRecorder.start();

        $("recordBtn").textContent =
            "⏹ Stop Recording";

        $("recordStatus").textContent =
            "Recording...";

    } catch (error) {

        console.error(error);

        $("recordStatus").textContent =
            "Microphone access failed. Please allow microphone permission.";

    }

};


/* =========================================================
   SUBMIT ANSWER
   ========================================================= */

$("submitAnswerBtn").onclick =
    async function () {

    const form = new FormData();

    if (useVoice) {

        if (!recordedBlob) {

            alert(
                "Please record your answer first."
            );

            return;
        }

        form.append(
            "audio",
            recordedBlob,
            "answer.webm"
        );

    } else {

        const answer =
            $("answerText").value.trim();

        if (!answer) {

            alert(
                "Please enter your answer first."
            );

            return;
        }

        form.append(
            "answer_text",
            answer
        );

    }

    try {

        $("submitAnswerBtn").disabled = true;

        $("submitAnswerBtn").textContent =
            "AI is evaluating your answer...";

        const response = await fetch(
            `/api/session/${sessionId}/answer`,
            {
                method: "POST",
                body: form
            }
        );

        const data = await response.json();

        if (!response.ok) {

            throw new Error(
                data.detail ||
                "Answer submission failed."
            );

        }

        show($("feedbackBox"));

        /*
         * Display transcript
         */

        $("transcriptText").textContent =
            data.transcript ||
            "No transcript available.";


        /*
         * Display feedback
         */

        $("feedbackText").textContent =
            data.feedback ||
            "No feedback available.";


        /*
         * Display scores
         */

        if (data.scores) {

            $("technicalScore").textContent =
                data.scores.technical_accuracy ?? "--";

            $("relevanceScore").textContent =
                data.scores.relevance ?? "--";

            $("specificityScore").textContent =
                data.scores.specificity ?? "--";

            $("communicationScore").textContent =
                data.scores.communication ?? "--";

        }


        /*
         * Feedback audio
         */

        if (data.feedback_audio) {

            $("feedbackAudio").src =
                `/api/audio/${data.feedback_audio}`;

            show($("feedbackAudio"));

        }


        /*
         * Save next question
         */

        window._nextQuestion =
            data.next;

        if (data.next) {
            show($("nextBtn"));
        }

    } catch (error) {

        console.error(error);

        alert(error.message);

    } finally {

        $("submitAnswerBtn").disabled =
            false;

        $("submitAnswerBtn").textContent =
            "Submit Answer";

    }

};


/* =========================================================
   NEXT QUESTION
   ========================================================= */

$("nextBtn").onclick = function () {

    const next =
        window._nextQuestion;

    if (!next) {
        return;
    }

    if (next.done) {

        hide($("interview"));

        show($("summary"));

        loadHistory();

    } else {

        renderQuestion(next);

    }

};


/* =========================================================
   HISTORY
   ========================================================= */

async function loadHistory() {

    try {

        const response =
            await fetch("/api/history");

        const rows =
            await response.json();

        if (!rows.length) {

            $("historyTable").innerHTML =
                "<p>No interview history yet.</p>";

            return;
        }

        let html = `
            <table>
                <tr>
                    <th>When</th>
                    <th>Role</th>
                    <th>Competency</th>
                    <th>Average Score</th>
                </tr>
        `;

        for (const row of rows) {

            const average =
                (
                    Number(row.structure || 0) +
                    Number(row.specificity || 0) +
                    Number(row.technical_accuracy || 0) +
                    Number(row.communication || 0)
                ) / 4;

            html += `
                <tr>
                    <td>${row.created_at?.slice(0, 16) || "-"}</td>
                    <td>${row.role_type || "-"}</td>
                    <td>${row.competency || "-"}</td>
                    <td>${average.toFixed(1)}</td>
                </tr>
            `;

        }

        html += "</table>";

        $("historyTable").innerHTML = html;

    } catch (error) {

        console.error(error);

        $("historyTable").textContent =
            "Could not load interview history.";

    }

};