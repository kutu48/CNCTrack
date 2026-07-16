@echo off
TITLE CNC Template Tracker - Backend Server

echo ================================================
echo   CNC Template Tracker - Backend Server
echo ================================================

:: Check if virtual environment exists
IF EXIST "venv\Scripts\activate.bat" (
    echo [OK] Activating virtual environment...
    call venv\Scripts\activate.bat
) ELSE IF EXIST ".venv\Scripts\activate.bat" (
    echo [OK] Activating virtual environment...
    call .venv\Scripts\activate.bat
) ELSE (
    echo [INFO] No virtual environment found, using system Python
)

:: Check if .env exists, if not copy from example
IF NOT EXIST ".env" (
    IF EXIST ".env.example" (
        echo [INFO] Creating .env from .env.example...
        copy .env.example .env
        echo [ACTION REQUIRED] Please edit .env with your configuration before running
    ) ELSE (
        echo [WARNING] No .env file found. Using defaults.
    )
)

:: Check if requirements are installed
echo [INFO] Checking dependencies...
python -c "import fastapi, uvicorn, sqlalchemy" 2>nul
IF ERRORLEVEL 1 (
    echo [ACTION REQUIRED] Installing dependencies...
    pip install -r requirements.txt
    IF ERRORLEVEL 1 (
        echo [ERROR] Failed to install dependencies. Check requirements.txt and pip.
        pause
        exit /b 1
    )
)

:: Run the server
echo.
echo [START] Starting FastAPI server...
python run.py

pause