import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path

# Create base directory for uploads if not exists
BASE_DIR = Path(__file__).resolve().parent.parent.parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseSettings):
    ENVIRONMENT: str = "local"

    # Database
    # SQLite  : sqlite:///./data.db
    # MySQL   : mysql+pymysql://root:@localhost/cnc_tracker
    # PostgreSQL: postgresql://user:pass@localhost/cnc_tracker
    DATABASE_URL: str = "sqlite:///./data.db"

    # Security
    SECRET_KEY: str = "your-super-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 45
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS - comma-separated allowed origins
    CORS_ORIGINS: str = "http://localhost,http://localhost:5173,http://localhost:3000,http://127.0.0.1,http://127.0.0.1:5173"

    # File Uploads
    UPLOAD_FOLDER: str = "./uploads"
    MAX_UPLOAD_SIZE_MB: int = 5

    # Business Logic
    PET_BOARD_HARD_BLOCK: bool = False

    # Server Config (for run.py)
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    def get_cors_origins(self) -> list[str]:
        """Parse CORS_ORIGINS string into a list."""
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

settings = Settings()