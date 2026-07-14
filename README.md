# CNC Template Tracker v2.0

> Migrasi dari **Google Apps Script + Google Sheets** ke **PWA (offline-first) + Flask REST API + JWT + SQLAlchemy + MySQL + Filesystem**.

[![PRD](https://img.shields.io/badge/PRD-v2.0-blue)]() [![Python](https://img.shields.io/badge/Python-3.10+-green)]() [![Flask](https://img.shields.io/badge/Flask-3.0.3-red)]() [![License](https://img.shields.io/badge/License-MIT-yellow)]()

---

## Daftar Isi

1. [Arsitektur](#-arsitektur)
2. [Struktur Project](#-struktur-project)
3. [Instalasi — Cepat (3 cara)](#-instalasi)
   - [A. Local Development (paling cepat)](#a-local-development-paling-cepat)
   - [B. Docker Compose](#b-docker-compose)
   - [C. Production (VPS / Server Lokal)](#c-production-vps--server-lokal)
4. [Diagnosa & Health Check](#-diagnosa--health-check)
5. [Migrasi Data dari Sheets](#-migrasi-data-dari-sheets)
6. [Fitur Utama](#-fitur-utama)
7. [Role & Akses Menu](#-role--akses-menu)
8. [Alur Kerja](#-alur-kerja)
9. [API Endpoints](#-api-endpoints)
10. [Konfigurasi](#-konfigurasi)
11. [Android APK](#-android-apk)
12. [Checklist PRD](#-checklist-prd)

---

## 📐 Arsitektur

```
┌───────────────────────────────┐
│  Android (APK WebView / TWA)   │
└───────────────┬────────────────┘
                │ HTTPS
┌───────────────▼────────────────┐
│  Web / PWA (Frontend)           │  ← Service Worker + manifest.json
│   • IndexedDB: cache data       │     config.js (auto-detect hostname)
│   • IndexedDB: Outbox Queue     │     Offline-first penuh
└───────────────┬────────────────┘
                │ REST/JSON + Bearer JWT
┌───────────────▼────────────────┐
│  REST API (Flask 3.0)           │  ← Blueprint per resource
│   • /api/sync (incremental)     │     /api/sync/outbox (idempotent)
└───────────────┬────────────────┘
                │
┌───────────────▼────────────────┐
│  JWT (Flask-JWT-Extended)       │  ← access (45m) + refresh (30d)
└───────────────┬────────────────┘
                │
┌───────────────▼────────────────┐
│  SQLAlchemy ORM (10 tabel)      │
└───────┬───────────────┬────────┘
        │               │
┌───────▼──────┐  ┌─────▼──────────┐
│   MySQL /     │  │  Filesystem     │  ← Sketsa sebagai file fisik
│   SQLite      │  │  (uploads/)     │     (bukan base64 di DB)
└──────────────┘  └────────────────┘
```

---

## 📁 Struktur Project

```
cnc-tracker/
├── backend/
│   ├── app/
│   │   ├── __init__.py              # App factory + CORS dynamic + DB auto-detect
│   │   ├── models.py                # 10 tabel SQLAlchemy (§6)
│   │   ├── auth_utils.py            # JWT + bcrypt + role decorators (§7)
│   │   ├── utils.py                 # ID gen, normalize, parts_key, payload_hash
│   │   ├── extensions.py            # db, migrate
│   │   ├── routes/                  # REST endpoints (§8)
│   │   │   ├── health.py            # GET  /api/health (+ DB check)
│   │   │   ├── auth.py              # POST /api/auth/login, /refresh, /me
│   │   │   ├── templates.py         # CRUD + distribute + move + bulk-import
│   │   │   ├── movements.py         # GET  /api/movements (filter)
│   │   │   ├── storages.py          # GET/POST /api/storages
│   │   │   ├── users.py             # POST /api/users (super_admin)
│   │   │   ├── sync.py              # GET /api/sync, POST /api/sync/outbox
│   │   │   ├── pet_boards.py        # masters, stock, in, out, report
│   │   │   ├── masters.py           # autocomplete buyers/parts
│   │   │   └── sketches.py          # multipart upload → filesystem
│   │   └── services/                # Business logic (dipindah dari GAS)
│   │       ├── template_service.py
│   │       ├── distribution_service.py
│   │       ├── pet_board_service.py
│   │       └── sync_service.py
│   ├── scripts/
│   │   └── migrate_from_sheets.py   # CSV → MySQL migration (§11)
│   ├── .env.example                 # Template konfigurasi
│   ├── migrate.py                   # FIX 10: setup DB + folders + seed
│   ├── diagnose.py                  # FIX 11: startup diagnostics (13 checks)
│   ├── serve.py                     # Single-server (API + PWA)
│   ├── run.py                       # Production entry (Gunicorn-ready)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── index.html                   # Semua halaman
│   ├── config.js                    # FIX 1: auto-detect API URL (hostname-based)
│   ├── manifest.json                # PWA manifest
│   ├── sw.js                        # Service Worker (SWR + network-first)
│   ├── css/app.css
│   └── js/
│       ├── db.js                    # IndexedDB (cache + outbox + settings)
│       ├── api.js                   # fetch + JWT (JSONP dihapus)
│       ├── outbox.js                # Offline outbox + idempotency
│       ├── app.js                   # Main app logic (semua halaman)
│       └── qrcode.min.js            # QR code generator (offline)
├── docker-compose.yml
└── README.md
```

---

## 🚀 Instalasi

### A. Local Development (paling cepat)

> Prasyarat: **Python 3.10+**, browser modern (Chrome/Firefox/Edge)

```bash
# 1. Clone project
git clone <repo-url> cnc-tracker
cd cnc-tracker/backend

# 2. Buat virtual environment
python -m venv .venv

# 3. Aktifkan venv
source .venv/bin/activate        # Linux / macOS
# .venv\Scripts\activate          # Windows (PowerShell)

# 4. Install dependencies
pip install -r requirements.txt

# 5. Buat file konfigurasi
cp .env.example .env
#   → Edit JWT_SECRET_KEY menjadi string acak yang panjang
#   → DATABASE_URL default sudah SQLite (cnc_tracker.db) — tidak perlu install MySQL

# 6. Setup database + folder + seed data
python migrate.py

# 7. Jalankan diagnosa (optional tapi disarankan)
python diagnose.py

# 8. Jalankan server (API + PWA di satu port)
python serve.py
```

Buka browser: **http://localhost:5000**

```
Login default:
  Username: superadmin     Password: 1234     Role: super_admin
  Username: admin          Password: 1234     Role: admin
  Username: operator       Password: 1234     Role: operator
```

> 💡 `serve.py` menyajikan **API** (`/api/*`) dan **PWA frontend** di port yang sama.
> Tidak perlu server terpisah untuk development.

---

### B. Docker Compose

> Prasyarat: **Docker** + **Docker Compose**

```bash
# 1. Set environment variables
export JWT_SECRET_KEY="ganti-dengan-secret-acak-yang-panjang"
export CORS_ORIGINS="http://localhost:3000"

# 2. Edit docker-compose.yml jika perlu (password MySQL, port, dll)

# 3. Build & jalankan semua service
docker-compose up -d --build
```

Akses:
| Service | URL |
|---------|-----|
| Frontend PWA | http://localhost:3000 |
| Backend API | http://localhost:5000/api/health |
| MySQL | localhost:3306 |

```bash
# Lihat log
docker-compose logs -f backend

# Stop
docker-compose down

# Reset database
docker-compose down -v
docker-compose up -d --build
```

---

### C. Production (VPS / Server Lokal)

> Backend **wajib** di VPS/server dengan filesystem persisten (untuk sketsa).

#### Step 1: Install MySQL

```bash
# Ubuntu/Debian
sudo apt update && sudo apt install mysql-server -y
sudo mysql_secure_installation

# Buat database & user
sudo mysql -e "CREATE DATABASE cnc_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
sudo mysql -e "CREATE USER 'cnc_user'@'localhost' IDENTIFIED BY 'password-kuat';"
sudo mysql -e "GRANT ALL ON cnc_tracker.* TO 'cnc_user'@'localhost';"
sudo mysql -e "FLUSH PRIVILEGES;"
```

#### Step 2: Deploy Backend

```bash
# Clone & setup
cd /opt
git clone <repo-url> cnc-tracker
cd cnc-tracker/backend

python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Konfigurasi production
cp .env.example .env
```

Edit `.env` untuk production:

```ini
APP_ENV=production
DATABASE_URL=mysql+pymysql://cnc_user:password-kuat@localhost:3306/cnc_tracker?charset=utf8mb4
JWT_SECRET_KEY=secret-acak-min-32-karakter-disini!!!!!
UPLOAD_FOLDER=/opt/cnc-tracker/backend/uploads/sketches
CORS_ORIGINS=https://cnc.company.com
FLASK_PORT=5000
```

```bash
# Setup database
python migrate.py
python diagnose.py    # pastikan semua 13 check ✔

# Jalankan dengan Gunicorn (production WSGI)
gunicorn -w 4 -b 0.0.0.0:5000 --timeout 120 "run:app"
```

#### Step 3: Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/cnc-api
server {
    listen 80;
    server_name api.cnc.company.com;

    client_max_body_size 25M;  # untuk upload sketch

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/cnc-api /etc/nginx/sites-enabled/
sudo certbot --nginx -d api.cnc.company.com   # HTTPS
sudo systemctl reload nginx
```

#### Step 4: Frontend (Vercel / Nginx terpisah)

Frontend adalah file statis murni — bisa di-host di mana saja:

```bash
# Opsi 1: Vercel
cd frontend
npx vercel --prod

# Opsi 2: Nginx
sudo cp -r frontend/* /var/www/cnc-pwa/
```

Pastikan `config.js` mendeteksi API URL dengan benar. Jika frontend dan backend di domain berbeda, set manual:

```javascript
// Di browser console (sekali saja, disimpan di localStorage):
localStorage.setItem("cnc_api_base", "https://api.cnc.company.com/api")
```

#### Step 5: Systemd Service (auto-restart)

```ini
# /etc/systemd/system/cnc-tracker.service
[Unit]
Description=CNC Template Tracker API
After=network.target mysql.service

[Service]
User=www-data
WorkingDirectory=/opt/cnc-tracker/backend
EnvironmentFile=/opt/cnc-tracker/backend/.env
ExecStart=/opt/cnc-tracker/backend/.venv/bin/gunicorn -w 4 -b 127.0.0.1:5000 --timeout 120 "run:app"
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable cnc-tracker
sudo systemctl start cnc-tracker
sudo systemctl status cnc-tracker
```

---

## 🔍 Diagnosa & Health Check

### `diagnose.py` — Cek semua dependency sebelum run

```bash
python diagnose.py
```

Output jika semua OK:

```
==================================================
  CNC Tracker — System Check
==================================================

  ✔ Python Version           (3.12.3)
  ✔ Virtual Environment      (.venv)
  ✔ Python Packages
  ✔ .env Loaded
  ✔ DATABASE_URL             (SQLite)
  ✔ Database Connection
  ✔ Upload Folder
  ✔ Instance Folder
  ✔ JWT Secret               (g6h2k9...)
  ✔ CORS Config              (*)
  ✔ API Health Route         (v2.0.0)
  ✔ Frontend config.js
  ✔ IndexedDB Module         (exports OK)

==================================================
  Status: READY ✅
==================================================
```

Jika ada yang gagal, aplikasi **tidak akan jalan** sampai diperbaiki — dengan pesan error yang jelas.

### Health Endpoint

```bash
curl http://localhost:5000/api/health
```

```json
{
  "ok": true,
  "version": "2.0.0",
  "database": "connected"
}
```

Frontend otomatis cek ini saat startup. Jika gagal → popup **"Backend Offline"** dengan diagnosa (bukan error "Failed to fetch" yang membingungkan).

---

## 📦 Migrasi Data dari Sheets

### Step 1: Export CSV dari Google Sheets

Export setiap sheet sebagai CSV:
- `USERS.csv`
- `STORAGES.csv`
- `TEMPLATES.csv`
- `TEMPLATE_PARTS.csv`
- `MOVEMENTS.csv`

Simpan di satu folder, misal `~/migration/`.

### Step 2: Jalankan Migration Script

```bash
cd backend
source .venv/bin/activate

# Set DATABASE_URL ke MySQL production
export DATABASE_URL="mysql+pymysql://cnc_user:password@localhost:3306/cnc_tracker?charset=utf8mb4"
export JWT_SECRET_KEY="your-secret"

# Jalankan migrasi
python scripts/migrate_from_sheets.py --all ~/migration/
```

Transformasi yang dilakukan otomatis:
| Data | Transformasi |
|------|-------------|
| Password | Plaintext → **bcrypt hash** |
| Tanggal | String → `DATETIME` |
| Sketch base64 | Dilewati (perlu re-upload manual) |
| Pet Board | Tidak ada data lama (input manual setelah go-live) |

### Step 3: Verifikasi

Script akan menampilkan verifikasi otomatis:

```
📊 Verification:
  Users:      15 (expected ~15)
  Storages:   42
  Templates:  1280 (expected ~1280)
  Parts:      3450
  Movements:  8900
  Templates per buyer: {'PUMA': 120, 'ADIDAS': 85, ...}
```

### Step 4: Arsipkan Spreadsheet Lama

Setelah cutover, setel spreadsheet lama menjadi **read-only**:
- File → Share → restrict to viewer
- Atau download sebagai backup `.xlsx`

---

## ⭐ Fitur Utama

### 1. Input Template Baru

```
Menu: ➕ Input Template
```

- Isi Buyer, Style/KP
- Tambah **multiple part** (Nama, Size, Qty, Uk Pet Board)
- Upload **multiple sketch**:
  - Pilih file dari kamera/galeri
  - **Ctrl+V** paste dari PrintScreen
  - Semua gambar masuk **mode Crop** otomatis
  - Crop: zoom (slider/pinch/wheel), drag, grid guide
- Status hasil: `WAITING_DISTRIBUTION`

### 2. Distribusi Template (Split)

```
Menu: 📦 Distribusi
```

- Ambil semua template `WAITING_DISTRIBUTION`
- Pilih storage tujuan
- **Split per Part/Size/Qty**:
  - Contoh: Front Body qty 10 → 5 ke Storage A, 5 ke Storage B
  - Sisanya tetap `WAITING_DISTRIBUTION`
- Status hasil: `DISTRIBUTED`

### 3. List Template

```
Menu: 📋 List Template
```

- Master list semua template
- Filter: Search, Status, Tanggal Distribusi
- Klik → Detail (part, sketch, history movement)
- Admin/Super Admin: tombol **✏️ Edit Part & Sketch**

### 4. Update Lapangan per Storage

```
Menu: 🧾 Update Lapangan
```

- Pilih storage → tambah 1/10 baris template sekaligus
- Isi Buyer, Style/KP, Part (pisah koma)
- Upload sekali → semua template masuk ke storage tsb
- Cocok untuk **opname** kondisi aktual

### 5. Edit Part & Sketch (Admin+)

- Ubah/hapus/tambah part
- Ubah Qty & Size
- Upload sketch baru (Ctrl+V + Crop)
- Hapus sketch lama
- Load sketch existing dari server

### 6. Offline-First (Outbox)

- **Semua aksi tulis** bisa dilakukan tanpa internet
- Tersimpan di IndexedDB Outbox
- Sinkron otomatis saat online kembali
- **Idempotent** (via `client_action_id`) — tidak ada duplikasi
- Konflik ditampilkan di panel **"Sync Status → Perlu Ditinjau"**

### 7. PET/PVC Board Stock

```
Menu: 🪧 PET/PVC Board (Admin+)
```

- Master ukuran (100×100, 120×240, dll)
- Available Stock = In − Out (real-time)
- **Auto Out** saat Input Template mengisi Uk Pet Board
- Manual In (kedatangan) dan Manual Out (koreksi)
- Report pemakaian (Tanggal | Ukuran | Storage | Buyer | Style)

### 8. Print QR Storage

```
Menu: ⚙️ Master Storage → 🖨️ Print QR
```

- Pilih storage (atau "Pilih Semua")
- Generate QR code offline (canvas, no CDN)
- Print / Save as PDF

---

## 👤 Role & Akses Menu

| Menu | Operator | Admin | Super Admin |
|------|:--------:|:-----:|:-----------:|
| ➕ Input Template | ✅ | ✅ | ✅ |
| 📦 Distribusi | ✅ | ✅ | ✅ |
| 📋 List Template | ✅ | ✅ | ✅ |
| 🔁 Movement | ✅ | ✅ | ✅ |
| 🕘 History | ✅ | ✅ | ✅ |
| 📷 Cek Storage | ✅ | ✅ | ✅ |
| ⚙️ Master Storage | ✅ | ✅ | ✅ |
| 🧾 Update Lapangan | ✅ | ✅ | ✅ |
| 📤 Sync Status | ✅ | ✅ | ✅ |
| ☁️ Sync Data | ✅ | ✅ | ✅ |
| 🪧 PET/PVC Board | ❌ | ✅ | ✅ |
| ✏️ Edit Part & Sketch | ❌ | ✅ | ✅ |
| 👥 User Management | ❌ | ❌ | ✅ |

Menu card dan bottom nav otomatis show/hide berdasarkan role login.

---

## 🔄 Alur Kerja

```
                    ┌──────────────────┐
                    │  Input Template   │
                    │  (WAITING_DIST)   │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │    Distribusi     │
                    │  (split per part) │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │   DISTRIBUTED     │
                    │  (di storage X)   │
                    └────────┬─────────┘
                             │
               ┌─────────────┼─────────────┐
               │             │             │
      ┌────────▼───┐  ┌─────▼─────┐  ┌───▼──────┐
      │  Transfer   │  │  Repair   │  │   OUT    │
      │ (ke Y)      │  │           │  │ (keluar) │
      └─────────────┘  └───────────┘  └──────────┘

      Semua aksi tercatat di History Movement
      Semua bisa dilakukan OFFLINE (Outbox)
```

---

## 🔌 API Endpoints

| Method | Endpoint | Auth | Deskripsi |
|--------|----------|------|-----------|
| GET | `/api/health` | Public | Health + DB status |
| POST | `/api/auth/login` | Public | Login → access + refresh token |
| POST | `/api/auth/refresh` | Refresh | Refresh access token |
| GET | `/api/auth/me` | JWT | Current user info |
| GET | `/api/sync?since=&days=` | JWT | Full/incremental sync |
| POST | `/api/sync/outbox` | JWT | Batch offline actions (idempotent) |
| POST | `/api/templates` | JWT | Add template |
| PUT | `/api/templates/{id}` | Admin | Update template |
| POST | `/api/templates/{id}/distribute` | JWT | Distribute (split) |
| POST | `/api/templates/{id}/move` | JWT | Transfer/Out/Repair |
| POST | `/api/templates/bulk-import` | JWT | Import lapangan |
| GET | `/api/templates/{id}/sketches` | JWT | List sketch metadata |
| POST | `/api/templates/{id}/sketches` | JWT | Upload sketch (multipart) |
| GET | `/api/sketches/{id}` | JWT | Serve sketch image |
| GET | `/api/movements?...` | JWT | Filter movements |
| GET | `/api/storages` | JWT | List storages |
| POST | `/api/storages` | Admin | Add storage |
| POST | `/api/users` | Super | Add user |
| POST | `/api/users/{u}/reset-password` | Super | Reset password |
| GET | `/api/pet-boards/masters` | JWT | Pet Board sizes |
| POST | `/api/pet-boards/masters` | Admin | Add size |
| GET | `/api/pet-boards/stock` | JWT | Available stock |
| POST | `/api/pet-boards/in` | JWT | Record arrival |
| POST | `/api/pet-boards/out` | Admin | Manual adjust |
| GET | `/api/pet-boards/report` | JWT | Usage report |
| GET | `/api/masters/buyers` | JWT | Autocomplete buyers |
| GET | `/api/masters/parts` | JWT | Autocomplete parts |

---

## ⚙️ Konfigurasi

Semua konfigurasi via `.env` — **tidak pernah edit source code**:

```ini
# ===== Environment =====
APP_ENV=development          # development | production

# ===== Database =====
DATABASE_URL=sqlite:///cnc_tracker.db
# MySQL: mysql+pymysql://user:pass@host:3306/cnc_tracker?charset=utf8mb4

# ===== JWT =====
JWT_SECRET_KEY=change-this   # MIN 32 karakter!
JWT_ACCESS_TOKEN_EXPIRES_MINUTES=45
JWT_REFRESH_TOKEN_EXPIRES_DAYS=30

# ===== Filesystem =====
UPLOAD_FOLDER=uploads/sketches
MAX_CONTENT_LENGTH_MB=20

# ===== CORS =====
CORS_ORIGINS=*               # dev: *, prod: https://cnc.company.com

# ===== Pet Board =====
PET_BOARD_HARD_BLOCK=false   # true = block jika stok minus

# ===== Server =====
FLASK_PORT=5000
```

### Frontend Config (`frontend/config.js`)

URL API **otomatis** dari `window.location.hostname`:

| Akses dari | API URL |
|------------|---------|
| localhost | `http://localhost:5000/api` |
| 127.0.0.1 | `http://127.0.0.1:5000/api` |
| 192.168.x.x (HP) | `http://192.168.x.x:5000/api` |
| VPS domain | `http://vps.company.com:5000/api` |

Override manual (jika perlu):
```javascript
localStorage.setItem("cnc_api_base", "https://api.company.com/api")
```

---

## 📱 Android APK

PWA dapat dibungkus menjadi APK via **Trusted Web Activity (Bubblewrap)**:

```bash
npm install -g @bubblewrap/cli

bubblewrap init --manifest=https://your-domain/manifest.json
bubblewrap build

# Output: app-release-signed.apk
```

Keuntungan vs APK lama:
- Update UI **tidak perlu rebuild APK** — cukup update PWA di server
- Support Service Worker + IndexedDB + Background Sync
- Kamera via Web API (`getUserMedia`)

---

## ✅ Checklist PRD

### Backend (Flask + SQLAlchemy + JWT)

| PRD | Feature | Status |
|-----|---------|:------:|
| §6 | 10 tabel MySQL/SQLAlchemy | ✅ |
| §6.1 | users (bcrypt, bukan plaintext) | ✅ |
| §6.6 | sketches (filesystem, bukan base64) | ✅ |
| §6.7-9 | Pet Board (masters, ins, outs) | ✅ |
| §6.10 | sync_actions_log (idempotency) | ✅ |
| §7 | JWT auth + server-side role check | ✅ |
| §8 | REST endpoints per resource (22 endpoint) | ✅ |
| §8 | Anti-duplicate (buyer+style+parts) | ✅ |
| §8 | Distribute with split part/qty | ✅ |
| §8 | Incremental sync (since=timestamp) | ✅ |
| §8 | Outbox idempotent processing | ✅ |
| §8 | Pet Board auto-out on template create | ✅ |

### Frontend (PWA)

| Feature | Status |
|---------|:------:|
| manifest.json (installable) | ✅ |
| Service Worker (SWR + network-first) | ✅ |
| IndexedDB (replaces localStorage) | ✅ |
| fetch + Bearer JWT (JSONP removed) | ✅ |
| Offline Outbox (write offline, sync online) | ✅ |
| Conflict resolution panel | ✅ |
| Ctrl+V paste sketch + Crop + Zoom | ✅ |
| Role-based menu (operator/admin/super) | ✅ |
| PET/PVC Board module | ✅ |
| Print QR Storage (offline) | ✅ |
| Update Lapangan per Storage | ✅ |
| Edit Part & Sketch (admin+) | ✅ |
| Boot diagnostics (SW + manifest + IDB + API) | ✅ |

### DevOps

| Feature | Status |
|---------|:------:|
| config.js (hostname auto-detect) | ✅ |
| .env (dev/prod toggle) | ✅ |
| CORS dynamic (env var) | ✅ |
| DB driver auto (SQLite/MySQL) | ✅ |
| Auto-seed (roles, admin, storage, petboard) | ✅ |
| migrate.py (setup DB + folders) | ✅ |
| diagnose.py (13 dependency checks) | ✅ |
| Docker Compose (MySQL + Flask + Nginx) | ✅ |
| Health check (/api/health + DB status) | ✅ |

### Migrasi Data (§11)

| Step | Status |
|------|:------:|
| Export CSV dari Sheets | ✅ |
| Password → bcrypt | ✅ |
| Date normalization | ✅ |
| Verification (row counts) | ✅ |
| Archive spreadsheet (read-only) | ✅ |

---

## 🆘 Troubleshooting

| Masalah | Solusi |
|---------|--------|
| "Backend Offline" popup | Jalankan `python diagnose.py`, cek apakah backend running |
| Login gagal | Cek username/password (default: superadmin/1234), atau re-seed: `python migrate.py` |
| Template tidak muncul di Distribusi | Klik tombol 🔄 Refresh di halaman Distribusi |
| Sketch tidak ter-upload | Cek `uploads/sketches` folder writable, dan `MAX_CONTENT_LENGTH_MB` |
| CORS error | Set `CORS_ORIGINS` di `.env` ke domain frontend |
| "db.js export invalid" | Clear browser cache (Ctrl+Shift+R), atau cek file JS tidak rusak |
| Database locked (SQLite) | Pastikan tidak ada proses lain pakai file `.db`, atau pakai MySQL |

---

## 📄 License

MIT — bebas digunakan untuk kebutuhan internal.
