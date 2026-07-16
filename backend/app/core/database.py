from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import sys
import os
from pathlib import Path

# Add project root to path so 'app' can be imported directly
BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.config import settings

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    # Create absolute path for sqlite DB to run from anywhere
    db_path = settings.DATABASE_URL.replace("sqlite:///", "")
    if db_path.startswith("./"):
        db_path = str(BASE_DIR / db_path.replace("./", ""))
        settings.DATABASE_URL = f"sqlite:///{db_path}"

engine = create_engine(
    settings.DATABASE_URL, 
    connect_args=connect_args,
    pool_pre_ping=True,  # Handle disconnected MySQL connections
    pool_recycle=3600,   # Recycle connections every hour (good for MySQL)
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()