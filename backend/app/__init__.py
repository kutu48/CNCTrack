"""
CNC Template Tracker — Flask Application Factory
FIX 2: Environment-based config (APP_ENV=development|production)
FIX 3: CORS Dynamic via os.getenv — tidak perlu ubah source saat deploy
FIX 4: Database Driver Auto — SQLite (dev) atau MySQL (prod), source sama
"""
import os
from datetime import timedelta
from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv

load_dotenv()  # FIX 2: load .env file

APP_ENV = os.getenv("APP_ENV", "development")


def create_app(config_overrides=None):
    app = Flask(__name__)

    # ================================================================
    # FIX 4 — Database Driver Auto
    #   Development: sqlite:///cnc_tracker.db
    #   Production:  mysql+pymysql://...
    #   Source tidak berubah, cukup ganti DATABASE_URL di .env
    # ================================================================
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        # FIX 2: dev default = SQLite file
        db_url = "sqlite:///cnc_tracker.db"
    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # MySQL needs pooling; SQLite does not support pool_size
    if not db_url.startswith("sqlite"):
        app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
            "pool_size": 10,
            "pool_recycle": 3600,
            "pool_pre_ping": True,
        }

    # ================================================================
    # JWT — FIX 2: secret dari env var
    # ================================================================
    app.config["JWT_SECRET_KEY"] = os.getenv(
        "JWT_SECRET_KEY", "dev-secret-change-in-production"
    )
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
        minutes=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", "45"))
    )
    app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(
        days=int(os.getenv("JWT_REFRESH_TOKEN_EXPIRES_DAYS", "30"))
    )

    # ================================================================
    # Filesystem sketsa (PRD §6.6)
    # ================================================================
    app.config["UPLOAD_FOLDER"] = os.getenv(
        "UPLOAD_FOLDER", os.path.join(app.root_path, "..", "uploads", "sketches")
    )
    app.config["MAX_CONTENT_LENGTH"] = int(
        os.getenv("MAX_CONTENT_LENGTH_MB", "20")
    ) * 1024 * 1024
    app.config["PET_BOARD_HARD_BLOCK"] = (
        os.getenv("PET_BOARD_HARD_BLOCK", "false").lower() == "true"
    )

    if config_overrides:
        app.config.update(config_overrides)

    # ================================================================
    # Extensions
    # ================================================================
    from .extensions import db, migrate
    db.init_app(app)
    migrate.init_app(app, db)
    JWTManager(app)

    # ================================================================
    # FIX 3 — CORS Dynamic via env var (tidak perlu ubah source)
    #   Development: CORS_ORIGINS=*
    #   Production:  CORS_ORIGINS=https://cnc.company.com
    # ================================================================
    cors_origins_raw = os.getenv("CORS_ORIGINS", "*")
    if cors_origins_raw.strip() == "*":
        origins = "*"
    else:
        origins = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": origins,
            }
        },
        supports_credentials=True,
    )

    # Ensure sketch upload directory exists
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    # ================================================================
    # Register Blueprints
    # ================================================================
    from .routes.auth import auth_bp
    from .routes.health import health_bp
    from .routes.templates import templates_bp
    from .routes.movements import movements_bp
    from .routes.storages import storages_bp
    from .routes.users import users_bp
    from .routes.sync import sync_bp
    from .routes.pet_boards import pet_boards_bp
    from .routes.masters import masters_bp
    from .routes.sketches import sketches_bp

    app.register_blueprint(health_bp, url_prefix="/api")
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(templates_bp, url_prefix="/api/templates")
    app.register_blueprint(movements_bp, url_prefix="/api/movements")
    app.register_blueprint(storages_bp, url_prefix="/api/storages")
    app.register_blueprint(users_bp, url_prefix="/api/users")
    app.register_blueprint(sync_bp, url_prefix="/api/sync")
    app.register_blueprint(pet_boards_bp, url_prefix="/api/pet-boards")
    app.register_blueprint(masters_bp, url_prefix="/api/masters")
    app.register_blueprint(sketches_bp, url_prefix="/api")

    return app
