# CNC Template Tracker

Sistem Manajemen Template CNC untuk Tracking, Distribusi, dan Perawatan template di lingkungan manufaktur.

## 🏗️ Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Backend  | Python 3.10+, FastAPI, SQLAlchemy, Uvicorn |
| Frontend | React 18, Vite, Tailwind CSS, PWA       |
| Database | SQLite (dev) / MySQL via XAMPP (prod)    |
| Auth     | JWT (access + refresh token)             |

---

## 📁 Project Structure

```
cnc-template-tracker/
├── backend/
│   ├── app/
│   │   ├── api/          # Route handlers
│   │   ├── core/         # Config, database, security
│   │   ├── models/       # SQLAlchemy models
│   │   └── schemas/      # Pydantic schemas
│   ├── uploads/          # File uploads (auto-created)
│   ├── .env.example      # Environment variables template
│   ├── requirements.txt  # Python dependencies
│   ├── run.py            # Python startup script
│   └── run.bat           # Windows startup script
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios client
│   │   ├── components/   # Shared components
│   │   ├── pages/        # Page components
│   │   └── store/        # Zustand stores
│   ├── .env.example      # Frontend env template
│   ├── .htaccess         # Apache rewrite for SPA
│   └── vite.config.js    # Vite config with proxy
├── docker-compose.yml    # Docker deployment
└── README.md
```

---

## 🚀 Quick Start (Windows + XAMPP)

### Prerequisites

- **Python 3.10+** → [python.org](https://www.python.org/downloads/)
- **Node.js 18+** → [nodejs.org](https://nodejs.org/)
- **XAMPP** → [apachefriends.org](https://www.apachefriends.org/) (untuk MySQL)

### 1. Clone & Setup Backend

```bash
# Clone project
git clone <repository-url>
cd cnc-template-tracker

# Create virtual environment
cd backend
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup environment
copy .env.example .env
# Edit .env sesuai kebutuhan (database, secret key, dll)
```

### 2. Configure Database

#### Option A: SQLite (Paling Mudah – No Setup)

Default `.env` sudah menggunakan SQLite:
```env
DATABASE_URL=sqlite:///./data.db
```

#### Option B: MySQL via XAMPP

1. Start **XAMPP Control Panel** → Start **MySQL**
2. Buka http://localhost/phpmyadmin
3. Buat database baru: `cnc_template_tracker`
4. Edit `.env`:
```env
DATABASE_URL=mysql+pymysql://root:@localhost:3306/cnc_template_tracker
```

### 3. Run Backend

```bash
# Cara 1: Double-click run.bat (Windows)
run.bat

# Cara 2: Python script
python run.py

# Cara 3: Manual uvicorn
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend akan berjalan di: **http://localhost:8000**
- API Docs (Swagger): http://localhost:8000/docs
- API Docs (ReDoc): http://localhost:8000/redoc

### 4. Setup & Run Frontend

```bash
# Buka terminal baru
cd frontend

# Install dependencies
npm install

# Development mode (dengan hot-reload)
npm run dev
```

Frontend akan berjalan di: **http://localhost:3000**

> Vite dev server secara otomatis proxy `/api/*` ke backend di port 8000.

### 5. Build Frontend untuk Production

```bash
cd frontend

# Untuk XAMPP, buat file .env:
# VITE_API_URL=http://localhost:8000

# Build
npm run build

# Output di folder: frontend/dist/
# Copy isi folder dist ke htdocs XAMPP jika ingin serve via Apache
```

---

## 🐳 Docker Deployment

```bash
# Build dan jalankan semua service
docker-compose up --build -d

# Cek status
docker-compose ps

# Lihat logs
docker-compose logs -f
```

---

## 🔑 Default Admin Account

Saat pertama kali dijalankan, sistem akan membuat admin account:

| Field    | Value              |
|----------|--------------------|
| Username | `admin`            |
| Password | `admin123`         |

> ⚠️ **Segera ganti password setelah login pertama!**

---

## 📡 API Endpoints

| Method | Endpoint                    | Description           |
|--------|-----------------------------|-----------------------|
| POST   | `/api/v1/auth/login`        | Login                 |
| POST   | `/api/v1/auth/register`     | Register user         |
| POST   | `/api/v1/auth/refresh`      | Refresh token         |
| GET    | `/api/v1/templates`         | List templates        |
| POST   | `/api/v1/templates`         | Create template       |
| GET    | `/api/v1/templates/{id}`    | Template detail       |
| PUT    | `/api/v1/templates/{id}`    | Update template       |
| GET    | `/api/v1/movements`         | List movements        |
| POST   | `/api/v1/movements`         | Create movement       |
| GET    | `/api/v1/storage`           | List storage locations|
| POST   | `/api/v1/storage`           | Create storage        |
| GET    | `/api/v1/petboard`          | Pet board status      |
| POST   | `/api/v1/sync/push`         | Push offline data     |
| GET    | `/api/v1/sync/pull`         | Pull latest data      |

Dokumentasi lengkap tersedia di `/docs` (Swagger UI).

---

## 🔧 Environment Variables

### Backend (`.env`)

| Variable                    | Default                | Description                |
|-----------------------------|------------------------|----------------------------|
| `ENVIRONMENT`               | `local`                | `local`, `cloud`, `testing`|
| `DATABASE_URL`              | `sqlite:///./data.db`  | Database connection string |
| `SECRET_KEY`                | (random)               | JWT signing key            |
| `ALGORITHM`                 | `HS256`                | JWT algorithm              |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `45`                | Access token expiry        |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `30`                  | Refresh token expiry       |
| `CORS_ORIGINS`              | `http://localhost,...`  | Comma-separated origins    |
| `UPLOAD_FOLDER`             | `./uploads`            | File upload directory      |
| `MAX_UPLOAD_SIZE_MB`        | `5`                    | Max upload size in MB      |
| `HOST`                      | `0.0.0.0`              | Server bind host           |
| `PORT`                      | `8000`                 | Server bind port           |

### Frontend (`.env`)

| Variable        | Default | Description                          |
|-----------------|---------|--------------------------------------|
| `VITE_API_URL`  | (empty) | Backend URL for production build     |

---

## 📱 PWA Support

Aplikasi mendukung Progressive Web App (PWA):
- ✅ Installable di mobile & desktop
- ✅ Offline-capable (cached assets)
- ✅ Push notification ready
- ✅ Responsive design

---

## 🛠️ Development

### Backend

```bash
cd backend
venv\Scripts\activate

# Run dengan auto-reload
python run.py

# Atau manual
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# Development server
npm run dev

# Lint
npm run lint

# Build production
npm run build

# Preview production build
npm run preview
```

---

## 📋 Troubleshooting

### Error: `ModuleNotFoundError`
```bash
cd backend
pip install -r requirements.txt
```

### Error: MySQL connection refused
1. Pastikan XAMPP → MySQL sudah Start
2. Cek `DATABASE_URL` di `.env`
3. Pastikan database sudah dibuat di phpMyAdmin

### Error: CORS blocked
Tambahkan origin frontend ke `CORS_ORIGINS` di `.env`:
```env
CORS_ORIGINS=http://localhost,http://localhost:3000,http://localhost:5173
```

### Frontend proxy error
Pastikan backend sudah berjalan di port 8000 sebelum menjalankan frontend dev server.

---

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.