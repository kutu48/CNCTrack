#!/usr/bin/env python3
"""
CNC Template Tracker — Database Migration & Setup Script
FIX 10: Setelah clone project, cukup jalankan:

    git clone ...
    cd backend
    python -m venv .venv
    source .venv/bin/activate   # (Windows: .venv\\Scripts\\activate)
    pip install -r requirements.txt
    python migrate.py
    python run.py

This script:
  1. Buat SQLite file jika belum ada (atau cek MySQL connection)
  2. Buat folder uploads/sketches
  3. Buat folder instance
  4. Buat semua tabel database
  5. Seed admin, storage, pet board (skip jika sudah ada)
  6. Cek .env, CORS, JWT
  7. Tampilkan ringkasan
"""
import os
import sys

# Add app to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env
from dotenv import load_dotenv
load_dotenv()

from app import create_app
from app.extensions import db


def step(msg):
    print(f"  ⏳ {msg}...")


def ok(msg="OK"):
    print(f"  ✅ {msg}")


def fail(msg):
    print(f"  ❌ {msg}")
    return False


def check_env_file():
    """FIX 10: cek .env"""
    step("Cek .env")
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        env_example = os.path.join(os.path.dirname(__file__), ".env.example")
        if os.path.exists(env_example):
            import shutil
            shutil.copy(env_example, env_path)
            ok(".env dibuat dari .env.example — edit jika perlu")
        else:
            fail(".env tidak ditemukan dan .env.example juga tidak ada")
            return False
    else:
        ok(".env ditemukan")
    return True


def create_folders():
    """FIX 10: buat folder uploads + instance"""
    base = os.path.dirname(os.path.abspath(__file__))
    step("Buat folder uploads/sketches")
    uploads = os.path.join(base, "uploads", "sketches")
    os.makedirs(uploads, exist_ok=True)
    ok(f"uploads/sketches: {uploads}")

    step("Buat folder instance")
    instance = os.path.join(base, "instance")
    os.makedirs(instance, exist_ok=True)
    ok(f"instance: {instance}")

    return True


def create_database():
    """FIX 10: buat database + tabel"""
    step("Inisialisasi aplikasi Flask")
    app = create_app()

    with app.app_context():
        db_url = app.config["SQLALCHEMY_DATABASE_URI"]
        step(f"Koneksi database: {db_url[:60]}...")

        # For SQLite, the file is created when tables are created
        step("Buat semua tabel (db.create_all)")
        db.create_all()
        ok("Semua tabel dibuat")

        # FIX 5: granular seed
        from run import seed_admin, seed_storage, seed_petboard
        step("Seed data awal")
        seed_admin()
        seed_storage()
        seed_petboard()

        # Verify tables exist
        from app.models import User, Storage, PetBoardMaster
        step("Verifikasi tabel")
        user_count = User.query.count()
        storage_count = Storage.query.count()
        pb_count = PetBoardMaster.query.count()
        ok(f"Users: {user_count}, Storages: {storage_count}, PetBoards: {pb_count}")

    return app


def check_cors_jwt():
    """FIX 10: cek CORS + JWT config"""
    step("Cek CORS_ORIGINS")
    cors = os.getenv("CORS_ORIGINS", "(not set)")
    ok(f"CORS_ORIGINS = {cors}")

    step("Cek JWT_SECRET_KEY")
    jwt = os.getenv("JWT_SECRET_KEY", "(not set)")
    if jwt in ("(not set)", "change-this-to-a-long-random-string", "dev-secret-change-in-production"):
        print(f"  ⚠️  JWT_SECRET_KEY masih default — ganti untuk production!")
    else:
        ok(f"JWT_SECRET_KEY = {jwt[:8]}...")

    return True


def main():
    print()
    print("=" * 50)
    print("  CNC Tracker — Database Migration & Setup")
    print("=" * 50)
    print()

    checks = []
    checks.append(("Env file", check_env_file()))
    checks.append(("Folders", create_folders()))
    checks.append(("Database", True))  # set below

    try:
        app = create_database()
        checks[2] = ("Database", True)
    except Exception as e:
        checks[2] = ("Database", False)
        fail(f"Gagal membuat database: {e}")
        import traceback
        traceback.print_exc()
        print()
        print("❌ Setup GAGAL. Perbaiki error di atas lalu jalankan ulang.")
        sys.exit(1)

    checks.append(("CORS/JWT", check_cors_jwt()))

    print()
    print("=" * 50)
    print("  Ringkasan")
    print("=" * 50)
    all_ok = True
    for name, result in checks:
        status = "✅" if result else "❌"
        if not result:
            all_ok = False
        print(f"  {status} {name}")

    print()
    if all_ok:
        print("🎉 Setup SELESAI! Jalankan:  python run.py")
    else:
        print("⚠️  Beberapa langkah gagal. Periksa output di atas.")
    print()


if __name__ == "__main__":
    main()
