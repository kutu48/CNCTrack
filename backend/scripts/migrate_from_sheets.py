#!/usr/bin/env python3
"""
Data Migration Script — PRD §11
Migrates data from Google Sheets CSV exports to MySQL/SQLAlchemy.

Usage:
  python scripts/migrate_from_sheets.py --users users.csv --storages storages.csv ...

Transformations (§11.2):
  - Password plaintext → bcrypt hash
  - Sketch base64 chunks → (would need special handling, see notes)
  - Date strings → datetime
  - Pet Board: no historical data (opening balance input manually post-go-live)
"""
import argparse
import csv
import sys
import os
from datetime import datetime

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import create_app
from app.extensions import db
from app.models import (
    User, Storage, Template, TemplatePart, Movement,
    Role, TemplateStatus, MovementType,
)
from app.auth_utils import hash_password


def safe_date(v):
    if not v or str(v).strip() == "":
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", ""))
    except (ValueError, TypeError):
        try:
            return datetime.strptime(str(v)[:19], "%Y-%m-%dT%H:%M:%S")
        except ValueError:
            return None


def migrate_users(csv_path):
    """§6.1: username, password→hash, role, name, active"""
    count = 0
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            username = (row.get("username") or "").strip().lower()
            if not username or User.query.get(username):
                continue
            role_val = (row.get("role") or "operator").strip()
            try:
                role = Role(role_val)
            except ValueError:
                role = Role.OPERATOR
            # MIGRATION: plaintext password → bcrypt hash (§11.2)
            plain_pw = row.get("password") or "1234"
            user = User(
                username=username,
                password_hash=hash_password(plain_pw),
                role=role,
                name=row.get("name") or username,
                is_active=str(row.get("active", "TRUE")).upper() != "FALSE",
            )
            db.session.add(user)
            count += 1
    db.session.commit()
    print(f"  ✅ Migrated {count} users (passwords hashed with bcrypt)")
    return count


def migrate_storages(csv_path):
    count = 0
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = (row.get("code") or "").strip()
            if not code or Storage.query.get(code):
                continue
            db.session.add(Storage(
                code=code,
                name=row.get("name") or code,
                area=row.get("area") or "",
            ))
            count += 1
    db.session.commit()
    print(f"  ✅ Migrated {count} storages")
    return count


def migrate_templates(csv_path):
    count = 0
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            tid = (row.get("id") or "").strip()
            if not tid or Template.query.get(tid):
                continue
            status_val = (row.get("status") or "WAITING_DISTRIBUTION").strip()
            try:
                status = TemplateStatus(status_val)
            except ValueError:
                status = TemplateStatus.WAITING_DISTRIBUTION
            db.session.add(Template(
                id=tid,
                buyer=(row.get("buyer") or "").strip().upper(),
                stylekp=(row.get("stylekp") or "").strip().upper(),
                status=status,
                current_storage=row.get("currentStorage") or None,
                created_by=row.get("createdBy") or None,
                created_at=safe_date(row.get("createdAt")),
                updated_at=safe_date(row.get("updatedAt")) or datetime.utcnow(),
                distributed_at=safe_date(row.get("distributedAt")),
            ))
            count += 1
    db.session.commit()
    print(f"  ✅ Migrated {count} templates")
    return count


def migrate_parts(csv_path):
    count = 0
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = (row.get("partId") or "").strip()
            if not pid or TemplatePart.query.get(pid):
                continue
            status_val = (row.get("status") or "WAITING_DISTRIBUTION").strip()
            try:
                status = TemplateStatus(status_val)
            except ValueError:
                status = TemplateStatus.WAITING_DISTRIBUTION
            try:
                qty = int(float(row.get("qty") or 1))
            except ValueError:
                qty = 1
            db.session.add(TemplatePart(
                part_id=pid,
                template_id=row.get("templateId"),
                part=(row.get("part") or "").strip().upper(),
                size=(row.get("size") or "").strip().upper(),
                qty=qty,
                status=status,
                current_storage=row.get("currentStorage") or None,
                created_at=safe_date(row.get("createdAt")),
                distributed_at=safe_date(row.get("distributedAt")),
                updated_at=safe_date(row.get("updatedAt")) or datetime.utcnow(),
            ))
            count += 1
    db.session.commit()
    print(f"  ✅ Migrated {count} template parts")
    return count


def migrate_movements(csv_path):
    count = 0
    with open(csv_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            mid = (row.get("id") or "").strip()
            if not mid or Movement.query.get(mid):
                continue
            type_val = (row.get("type") or "TRANSFER").strip()
            try:
                mtype = MovementType(type_val)
            except ValueError:
                mtype = MovementType.TRANSFER
            db.session.add(Movement(
                id=mid,
                template_id=row.get("templateId"),
                type=mtype,
                from_storage=row.get("from") or None,
                to_storage=row.get("to") or None,
                by=row.get("by") or None,
                note=row.get("note") or None,
                at=safe_date(row.get("at")) or datetime.utcnow(),
            ))
            count += 1
    db.session.commit()
    print(f"  ✅ Migrated {count} movements")
    return count


def verify(totals):
    """§11.4: Verifikasi — compare row counts & checksums"""
    print("\n📊 Verification:")
    print(f"  Users:      {User.query.count()} (expected ~{totals.get('users', '?')})")
    print(f"  Storages:   {Storage.query.count()}")
    print(f"  Templates:  {Template.query.count()} (expected ~{totals.get('templates', '?')})")
    print(f"  Parts:      {TemplatePart.query.count()}")
    print(f"  Movements:  {Movement.query.count()}")
    # Checksum: templates per buyer
    from sqlalchemy import func
    per_buyer = db.session.query(Template.buyer, func.count(Template.id)).group_by(Template.buyer).all()
    print(f"  Templates per buyer: {dict(per_buyer)}")


def main():
    parser = argparse.ArgumentParser(description="Migrate CNC Tracker data from Sheets CSV to MySQL")
    parser.add_argument("--users", help="Path to USERS.csv")
    parser.add_argument("--storages", help="Path to STORAGES.csv")
    parser.add_argument("--templates", help="Path to TEMPLATES.csv")
    parser.add_argument("--parts", help="Path to TEMPLATE_PARTS.csv")
    parser.add_argument("--movements", help="Path to MOVEMENTS.csv")
    parser.add_argument("--all", help="Directory containing all CSVs")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        db.create_all()

        print("🚀 Starting migration...\n")

        totals = {}
        if args.all:
            d = args.all
            for name, fn in [("users", migrate_users), ("storages", migrate_storages),
                             ("templates", migrate_templates), ("parts", migrate_parts),
                             ("movements", migrate_movements)]:
                path = os.path.join(d, f"{name.upper()}.csv")
                if not os.path.exists(path):
                    path = os.path.join(d, f"{name}.csv")
                if os.path.exists(path):
                    totals[name] = fn(path)
                else:
                    print(f"  ⚠ {name}: file not found at {path}")

        if args.users:
            totals["users"] = migrate_users(args.users)
        if args.storages:
            migrate_storages(args.storages)
        if args.templates:
            totals["templates"] = migrate_templates(args.templates)
        if args.parts:
            migrate_parts(args.parts)
        if args.movements:
            migrate_movements(args.movements)

        verify(totals)
        print("\n✅ Migration complete!")
        print("\n📌 Next steps:")
        print("  1. Input Pet Board opening balance via /api/pet-boards/in (§11.2)")
        print("  2. Archive old Spreadsheet as read-only backup (§11.6)")
        print("  3. Run parallel UAT before cutover (§11.5)")


if __name__ == "__main__":
    main()
