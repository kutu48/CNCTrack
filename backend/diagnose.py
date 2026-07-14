#!/usr/bin/env python3
"""
CNC Template Tracker — Startup Diagnostics
FIX 11: Jalankan SEBELUM aplikasi untuk mengecek semua dependency.

    python diagnose.py

Berhenti dengan pesan jelas jika ada yang salah.
"""
import os
import sys
import platform
import importlib
import subprocess

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()


def run_check(name, check_fn):
    """Run a check and print ✔ or ✖"""
    try:
        result = check_fn()
        if result is True or (isinstance(result, str)):
            detail = result if isinstance(result, str) else ""
            print(f"  ✔ {name}" + (f"  ({detail})" if detail else ""))
            return True
        else:
            print(f"  ✖ {name}")
            return False
    except Exception as e:
        print(f"  ✖ {name}  — {e}")
        return False


def check_python():
    v = sys.version_info
    if v.major >= 3 and v.minor >= 10:
        return f"{v.major}.{v.minor}.{v.micro}"
    raise Exception(f"Python {v.major}.{v.minor} — butuh 3.10+")


def check_venv():
    venv = os.environ.get("VIRTUAL_ENV")
    if venv:
        return os.path.basename(venv)
    # Check if we're in a venv by looking at sys.prefix
    if hasattr(sys, "real_prefix") or (hasattr(sys, "base_prefix") and sys.base_prefix != sys.prefix):
        return "active"
    raise Exception("Tidak ada virtual environment aktif. Jalankan: python -m venv .venv && source .venv/bin/activate")


def check_dotenv():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        return True
    raise Exception(".env tidak ditemukan. Copy dari .env.example")


def check_db_url():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise Exception("DATABASE_URL tidak diset di .env")
    if url.startswith("sqlite"):
        return "SQLite"
    elif url.startswith("mysql"):
        return "MySQL"
    return "unknown driver"


def check_db_connection():
    from app import create_app
    from app.extensions import db
    from sqlalchemy import text
    app = create_app()
    with app.app_context():
        db.session.execute(text("SELECT 1"))
        db.session.rollback()
    return True


def check_packages():
    required = ["flask", "flask_sqlalchemy", "flask_jwt_extended", "flask_cors", "bcrypt", "pymysql", "dotenv"]
    missing = []
    for pkg in required:
        try:
            importlib.import_module(pkg.replace("-", "_"))
        except ImportError:
            missing.append(pkg)
    if missing:
        raise Exception(f"Package belum terinstall: {', '.join(missing)}. Jalankan: pip install -r requirements.txt")
    return True


def check_upload_folder():
    base = os.path.dirname(__file__)
    upload = os.getenv("UPLOAD_FOLDER", os.path.join(base, "uploads", "sketches"))
    if not os.path.isabs(upload):
        upload = os.path.join(base, upload)
    os.makedirs(upload, exist_ok=True)
    if os.path.isdir(upload) and os.access(upload, os.W_OK):
        return upload
    raise Exception("Folder uploads tidak bisa ditulis")


def check_instance_folder():
    base = os.path.dirname(__file__)
    instance = os.path.join(base, "instance")
    os.makedirs(instance, exist_ok=True)
    return True


def check_jwt():
    secret = os.getenv("JWT_SECRET_KEY")
    if not secret:
        raise Exception("JWT_SECRET_KEY tidak diset")
    if secret in ("change-this-to-a-long-random-string", "dev-secret-change-in-production"):
        return "default (ganti untuk production!)"
    return f"{secret[:8]}..."


def check_cors():
    cors = os.getenv("CORS_ORIGINS")
    if not cors:
        raise Exception("CORS_ORIGINS tidak diset")
    return cors


def check_health_route():
    from app import create_app
    app = create_app()
    client = app.test_client()
    r = client.get("/api/health")
    if r.status_code != 200:
        raise Exception(f"GET /api/health → HTTP {r.status_code}")
    data = r.get_json()
    if not data.get("ok"):
        raise Exception(f"health.ok = False, database = {data.get('database')}")
    return f"v{data.get('version')}"


def check_frontend_config():
    frontend_config = os.path.join(os.path.dirname(__file__), "..", "frontend", "config.js")
    if not os.path.exists(frontend_config):
        raise Exception("frontend/config.js tidak ditemukan")
    return True


def check_indexeddb_module():
    db_js = os.path.join(os.path.dirname(__file__), "..", "frontend", "js", "db.js")
    if not os.path.exists(db_js):
        raise Exception("frontend/js/db.js tidak ditemukan")
    with open(db_js) as f:
        content = f.read()
    required = ["export const STORES", "export const idb", "export const settings", "export const cache"]
    for req in required:
        if req not in content:
            raise Exception(f"'{req}' tidak ditemukan di db.js")
    return "exports OK"


def main():
    print()
    print("=" * 50)
    print("  CNC Tracker — System Check")
    print("=" * 50)
    print()

    results = []

    results.append(run_check("Python Version", check_python))
    results.append(run_check("Virtual Environment", check_venv))
    results.append(run_check("Python Packages", check_packages))
    results.append(run_check(".env Loaded", check_dotenv))
    results.append(run_check("DATABASE_URL", check_db_url))
    results.append(run_check("Database Connection", check_db_connection))
    results.append(run_check("Upload Folder", check_upload_folder))
    results.append(run_check("Instance Folder", check_instance_folder))
    results.append(run_check("JWT Secret", check_jwt))
    results.append(run_check("CORS Config", check_cors))
    results.append(run_check("API Health Route", check_health_route))
    results.append(run_check("Frontend config.js", check_frontend_config))
    results.append(run_check("IndexedDB Module", check_indexeddb_module))

    print()
    print("=" * 50)
    all_ok = all(results)
    if all_ok:
        print("  Status: READY ✅")
        print()
        print("  Jalankan aplikasi:")
        print("    python run.py")
    else:
        failed = sum(1 for r in results if not r)
        print(f"  Status: FAILED ❌  ({failed} check gagal)")
        print()
        print("  Perbaiki error di atas, lalu jalankan ulang:")
        print("    python diagnose.py")
    print()
    print("=" * 50)

    sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
