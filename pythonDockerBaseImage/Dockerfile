# Python Services Container (analytics + weekly challenge)
FROM python:3.14-alpine

# Set working directory
WORKDIR /app

# Disable Python output buffering for Docker logs
ENV PYTHONUNBUFFERED=1

# Copy and install dependencies from both services
COPY analytics/requirements.txt analytics-requirements.txt
COPY weekly_challenge/requirements.txt weekly-requirements.txt
RUN pip install --no-cache-dir -r analytics-requirements.txt -r weekly-requirements.txt

# Copy scripts from both services
COPY analytics/*.py .
COPY weekly_challenge/create_weekly_challenge.py .

# Copy challenge data files
COPY data/ /app/data/

# Default: run analytics scheduler
# Weekly challenge CronJob overrides this via Kubernetes command:
CMD ["python", "-u", "scheduler.py"]
