#!/usr/bin/env python
"""
CNC Template Tracker - Backend Startup Script
Run this from the project root or backend directory:
    python backend/run.py
    or
    cd backend && python run.py
"""
import os
import sys
import subprocess
from pathlib import Path

# Add backend directory to Python path
BACKEND_DIR = Path(__file__).parent
sys.path.insert(0, str(BACKEND_DIR))

def check_env_file():
    """Check if .env file exists, if not copy from .env.example"""
    env_file = BACKEND_DIR / ".env"
    env_example = BACKEND_DIR / ".env.example"
    
    if not env_file.exists() and env_example.exists():
        import shutil
        shutil.copy(env_example, env_file)
        print(f"✓ Created .env from .env.example")
        print(f"  Please edit {env_file} with your configuration")
    elif not env_file.exists():
        print("⚠ No .env file found. Using defaults.")

def check_dependencies():
    """Check if required packages are installed"""
    try:
        import fastapi
        import uvicorn
        import sqlalchemy
        import pydantic
        import jose
        import passlib
        import pymysql
        print("✓ All core dependencies found")
        return True
    except ImportError as e:
        print(f"✗ Missing dependency: {e}")
        print("  Run: pip install -r requirements.txt")
        return False

def init_database():
    """Initialize database tables"""
    try:
        from app.core.database import engine, Base
        from app.models import __all__ as models  # noqa: F401
        Base.metadata.create_all(bind=engine)
        print("✓ Database tables initialized")
    except Exception as e:
        print(f"⚠ Database initialization warning: {e}")

def create_upload_folder():
    """Create upload folder if not exists"""
    from app.core.config import settings
    upload_path = Path(settings.UPLOAD_FOLDER)
    upload_path.mkdir(parents=True, exist_ok=True)
    print(f"✓ Upload folder ready: {upload_path}")

def main():
    print("=" * 50)
    print("  CNC Template Tracker - Backend Server")
    print("=" * 50)
    
    # Check environment
    check_env_file()
    
    # Check dependencies
    if not check_dependencies():
        sys.exit(1)
    
    # Initialize database
    init_database()
    
    # Create upload folder
    create_upload_folder()
    
    # Import settings after env is loaded
    from app.core.config import settings
    
    print(f"\n🚀 Starting server...")
    print(f"   Environment: {settings.ENVIRONMENT}")
    print(f"   Database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else settings.DATABASE_URL}")
    print(f"   Host: {settings.HOST}:{settings.PORT}")
    print(f"   Docs: http://{settings.HOST}:{settings.PORT}/docs")
    print(f"   Redoc: http://{settings.HOST}:{settings.PORT}/redoc")
    print("=" * 50)
    
    # Run uvicorn
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT != "production",
        log_level="info" if settings.ENVIRONMENT == "production" else "debug",
    )

if __name__ == "__main__":
    main()