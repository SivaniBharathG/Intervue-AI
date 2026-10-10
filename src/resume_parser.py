from pathlib import Path
from pypdf import PdfReader


def extract_resume_text(file_path: str) -> str:
    """
    Extract text from a PDF resume.
    """

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError("Resume PDF was not found.")

    if path.suffix.lower() != ".pdf":
        raise ValueError("Only PDF files are supported.")

    reader = PdfReader(str(path))

    pages = []

    for page in reader.pages:
        text = page.extract_text()

        if text:
            pages.append(text)

    resume_text = "\n\n".join(pages).strip()

    if not resume_text:
        raise ValueError(
            "Could not extract text from this PDF. "
            "Please make sure the PDF contains selectable text."
        )

    return resume_text