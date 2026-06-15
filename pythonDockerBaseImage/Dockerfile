# Python Services Container (analytics + weekly challenge + vocal lesson creator)
FROM python:3.14-alpine

# let s try non root
RUN addgroup -g 1000 appuser && \
    adduser -u 1000 -G appuser -D appuser

USER appuser

# Set working directory
WORKDIR /app

# Disable Python output buffering for Docker logs
ENV PYTHONUNBUFFERED=1

# ffmpeg is required by pydub (combine_mp3.py) for MP3 encoding/decoding
RUN apk add --no-cache ffmpeg

# Copy and install dependencies from all services
COPY analytics/requirements.txt analytics-requirements.txt
COPY weekly_challenge/requirements.txt weekly-requirements.txt
COPY vocal_lesson_creator/requirements.txt vocal-requirements.txt
RUN pip install --no-cache-dir -r analytics-requirements.txt -r weekly-requirements.txt -r vocal-requirements.txt

# Copy scripts from all services
COPY analytics/*.py .
COPY weekly_challenge/create_weekly_challenge.py .
COPY vocal_lesson_creator/combine_mp3.py .

# Copy challenge data files
COPY data/ /app/data/

# Default: run analytics jobs (weakness analysis + usefulness aggregation)
# Weekly challenge CronJob overrides this via Kubernetes command:
CMD ["python", "-u", "analyze_weaknesses.py"]
