#!/usr/bin/env python3
"""
CNC Template Tracker — Single-server development mode
Serves BOTH the Flask API (/api/*) and the PWA frontend (static files) on one port.
For production, use docker-compose (separate nginx + gunicorn).

Run:  python serve.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from flask import send_from_directory

app = create_app()

# Serve PWA frontend from ../frontend
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")


@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    full = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


# FIX 5: import seed_all (bukan seed_if_empty yang lama)
from run import seed_all

if __name__ == "__main__":
    seed_all()
    port = int(os.environ.get("FLASK_PORT", "5000"))
    print(f"\n🚀 CNC Template Tracker running on http://localhost:{port}")
    print(f"   Frontend PWA:  http://localhost:{port}/")
    print(f"   Backend API:   http://localhost:{port}/api/health")
    print(f"   Default login: superadmin / 1234\n")
    app.run(host="0.0.0.0", port=port, debug=True)
