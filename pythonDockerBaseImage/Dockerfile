# Python Services Container (analytics + weekly challenge + vocal lesson creator)
FROM python:3.14-alpine

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -u 1000 -G appuser -D appuser

# Set working directory
WORKDIR /app

# Install system dependencies (as root)
RUN apk add --no-cache ffmpeg

# Create virtual environment (as root) and use it
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Disable Python output buffering
ENV PYTHONUNBUFFERED=1

# Copy requirements files
COPY analytics/requirements.txt analytics-requirements.txt
COPY usefulness_aggregator/requirements.txt usefulness-requirements.txt
COPY weekly_challenge/requirements.txt weekly-requirements.txt
COPY story_writter/requirements.txt story_writter-requirements.txt
COPY VocabularyUpdaterAgent/requirements.txt vocabulary-updater-agent-requirements.txt
COPY vocal_lesson_creator/requirements.txt vocal-requirements.txt

# Install Python dependencies into the venv (as root)
RUN pip install --no-cache-dir -r analytics-requirements.txt \
    -r usefulness-requirements.txt \
    -r weekly-requirements.txt \
    -r story_writter-requirements.txt \
    -r story_writter-requirements.txt \
    -r vocabulary-updater-agent-requirements.txt \
    -r vocal-requirements.txt
# Switch to non-root user
USER appuser

# Copy application code (with correct ownership)
COPY --chown=appuser:appuser analytics/*.py .
COPY --chown=appuser:appuser usefulness_aggregator/*.py .
COPY --chown=appuser:appuser weekly_challenge/create_weekly_challenge.py .
COPY --chown=appuser:appuser story_writter/StoryCreatorAgent.py .
COPY --chown=appuser:appuser story_writter/StoryCreatorWrapper.py .
COPY --chown=appuser:appuser VocabularyUpdaterAgent/VocabularyUpdaterAgent.py .
COPY --chown=appuser:appuser scripts/db_utils.py .
COPY --chown=appuser:appuser vocal_lesson_creator/combine_mp3.py .
COPY --chown=appuser:appuser data/ /app/data/

# Default command
CMD ["python", "-u", "analyze_weaknesses.py"]