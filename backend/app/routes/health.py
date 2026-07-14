"""
Health check — FIX 6 + PRD §8
GET /api/health returns ok, version, database status.
Frontend checks this on startup — if fails, shows "Backend Offline" popup.
"""
from flask import Blueprint, jsonify
from datetime import datetime

health_bp = Blueprint("health", __name__)

VERSION = "2.0.0"


@health_bp.route("/health")
def health():
    # FIX 6: check database connectivity
    db_status = "connected"
    try:
        from ..extensions import db
        from sqlalchemy import text
        db.session.execute(text("SELECT 1"))
        db.session.rollback()
    except Exception as e:
        db_status = f"error: {e}"

    ok = db_status == "connected"
    return jsonify(
        ok=ok,
        version=VERSION,
        database=db_status,
        now=datetime.utcnow().isoformat(),
    )
