"""
CNC Template Tracker — Flask entry point
FIX 5: Granular auto-seed (seed_roles, seed_admin, seed_storage, seed_petboard)
       Kalau tabel kosong → seed; kalau sudah ada → skip.
FIX 6: Health check dengan database connectivity check.

Run:  python run.py
Or via Gunicorn (§12):  gunicorn -w 4 -b 0.0.0.0:5000 "run:app"
"""
import os
from app import create_app
from app.extensions import db
from app.models import User, Storage, Role, PetBoardMaster, PetBoardUnit
from app.auth_utils import hash_password

app = create_app()


# ================================================================
# FIX 5 — Granular seed functions
# ================================================================
def seed_roles():
    """Ensure all roles exist in the enum (informational — roles are enum values)"""
    pass  # roles are SQLAlchemy enums, not table rows; nothing to seed


def seed_admin():
    """Seed default admin users if users table is empty."""
    if User.query.count() > 0:
        return False
    for uname, role, name in [
        ("superadmin", Role.SUPER_ADMIN, "Super Admin"),
        ("admin", Role.ADMIN, "Administrator"),
        ("operator", Role.OPERATOR, "Operator"),
    ]:
        db.session.add(User(
            username=uname,
            password_hash=hash_password("1234"),
            role=role, name=name, is_active=True,
        ))
    db.session.commit()
    print("  ✅ Seeded default users (superadmin/admin/operator · password: 1234)")
    return True


def seed_storage():
    """Seed default storages if storages table is empty."""
    if Storage.query.count() > 0:
        return False
    for code, name, area in [
        ("WORKSHOP", "Workshop / Engraving", "Workshop"),
        ("CNC-MEJA-01", "Meja CNC 01", "Area CNC"),
        ("CNC-MEJA-02", "Meja CNC 02", "Area CNC"),
        ("STORAGE-A", "Storage Template A", "Storage"),
    ]:
        db.session.add(Storage(code=code, name=name, area=area))
    db.session.commit()
    print("  ✅ Seeded default storages")
    return True


def seed_petboard():
    """Seed default Pet Board masters if table is empty."""
    if PetBoardMaster.query.count() > 0:
        return False
    for code, label in [
        ("PB-100x100", "100×100 cm"),
        ("PB-120x240", "120×240 cm"),
        ("PB-122x244", "122×244 cm"),
    ]:
        db.session.add(PetBoardMaster(code=code, size_label=label,
                                       unit=PetBoardUnit.LEMBAR))
    db.session.commit()
    print("  ✅ Seeded default Pet Board masters")
    return True


def seed_all():
    """Run all seed functions — skip if data already exists."""
    with app.app_context():
        db.create_all()
        seed_roles()
        seed_admin()
        seed_storage()
        seed_petboard()


if __name__ == "__main__":
    print("\n🚀 CNC Template Tracker — Starting...\n")
    seed_all()
    port = int(os.getenv("FLASK_PORT", "5000"))
    print(f"\n   Frontend PWA:  http://localhost:{port}/")
    print(f"   Backend API:   http://localhost:{port}/api/health")
    print(f"   Default login: superadmin / 1234\n")
    app.run(host="0.0.0.0", port=port, debug=(os.getenv("APP_ENV") != "production"))
