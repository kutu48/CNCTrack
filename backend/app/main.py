from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
import sys
from pathlib import Path

# Add project root to path so 'app' can be imported directly
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app.core.config import settings
from app.core.database import engine, get_db, Base
from app.api import auth, templates, movements, storage, petboard, sync
import uvicorn

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="CNC Template Tracker",
    description="Sistem Manajemen Template CNC untuk Tracking, Distribusi, dan Perawatan",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for uploads
upload_dir = Path(settings.UPLOAD_FOLDER)
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")

# Include routers
app.include_router(auth.router)
app.include_router(templates.router)
app.include_router(movements.router)
app.include_router(storage.router)
app.include_router(petboard.router)
app.include_router(sync.router)

@app.get("/")
def root():
    return {
        "name": "CNC Template Tracker API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
def health_check(db=Depends(get_db)):
    try:
        db.execute("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
