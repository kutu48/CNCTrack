# CNC Template Tracker Backend — Dockerfile
# PRD §12: Backend runs on VPS/Server Lokal with persistent filesystem
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc default-libmysqlclient-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Persistent volume for sketch files (§6.6)
RUN mkdir -p /app/uploads/sketches
VOLUME ["/app/uploads/sketches"]

EXPOSE 5000

# Gunicorn for production (§12: scalable behind Nginx)
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "--timeout", "120", "run:app"]
