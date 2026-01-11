# Python Analytics Container
FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Disable Python output buffering for Docker logs
ENV PYTHONUNBUFFERED=1

# Copy requirements and install dependencies
COPY analytics/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy analytics scripts
COPY analytics/*.py .

# Copy challenge data files
COPY data/ /app/data/

# Run the scheduler
CMD ["python", "-u", "scheduler.py"]
