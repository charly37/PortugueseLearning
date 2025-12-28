# Python Analytics Container
FROM python:3.11-alpine

# Set working directory
WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy analytics scripts
COPY *.py .

# Run the scheduler
CMD ["python", "scheduler.py"]
