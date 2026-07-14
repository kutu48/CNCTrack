"""
Template service — PRD §8
Ports: addTemplate_, updateTemplate_, findExistingTemplateByKey_ (anti-duplicate),
       bulkImportExisting_ (import lapangan)
"""
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from ..extensions import db
from ..models import (
    Template, TemplatePart, Storage, Movement, PetBoardStockOut, PetBoardMaster,
    TemplateStatus, MovementType, PetBoardOutSource,
)
from ..utils import gen_id, normalize, parts_key
from .pet_board_service import consume_pet_board_for_part


def find_existing_template(buyer, stylekp, parts):
    """
    Anti-duplicate: reject if buyer + style/KP + identical part set already exists.
    Ports findExistingTemplateByKey_ from GAS (PRD §5, §8).
    """
    buyer = normalize(buyer)
    stylekp = normalize(stylekp)
    key = parts_key(parts)

    candidates = Template.query.filter(
        func.upper(Template.buyer) == buyer,
        func.upper(Template.stylekp) == stylekp,
    ).all()

    for t in candidates:
        tkey = "|".join(sorted([
            f"{normalize(p.part)}[{normalize(p.size)}]#{p.qty}"
            for p in t.parts
        ]))
        if tkey == key:
            return t
    return None


def normalize_parts_input(parts):
    """Accept list of dicts → cleaned list"""
    out = []
    for p in parts or []:
        part = normalize(p.get("part") or p.get("name", ""))
        if not part:
            continue
        out.append({
            "part": part,
            "size": normalize(p.get("size") or ""),
            "qty": max(1, int(p.get("qty", 1) or 1)),
            "partId": p.get("partId") or p.get("part_id") or "",
            "pet_board_code": normalize(p.get("pet_board_code") or p.get("petBoardCode") or ""),
        })
    return out


def create_template(data, created_by):
    """
    Create a new template. Also auto-creates pet_board_stock_outs for any
    part with pet_board_code (PRD §8: addTemplate business logic).
    """
    buyer = normalize(data.get("buyer"))
    stylekp = normalize(data.get("stylekp"))
    parts = normalize_parts_input(data.get("parts", []))

    if not buyer or not stylekp or not parts:
        return {"ok": False, "msg": "Buyer, Style/KP, dan minimal 1 part wajib diisi"}

    duplicate = find_existing_template(buyer, stylekp, parts)
    if duplicate:
        return {
            "ok": False,
            "duplicate": True,
            "msg": f"Anti duplicate aktif: Template sudah ada. ID: {duplicate.id}",
            "existing": _template_summary(duplicate),
        }

    template_id = data.get("id") or gen_id("TPL")
    now = datetime.utcnow()
    template = Template(
        id=template_id,
        buyer=buyer,
        stylekp=stylekp,
        status=TemplateStatus.WAITING_DISTRIBUTION,
        created_by=created_by,
        created_at=now,
        updated_at=now,
    )
    db.session.add(template)

    part_rows = []
    for p in parts:
        part = TemplatePart(
            part_id=p["partId"] or gen_id("PRT"),
            template_id=template_id,
            part=p["part"],
            size=p["size"],
            qty=p["qty"],
            pet_board_code=p["pet_board_code"] or None,
            status=TemplateStatus.WAITING_DISTRIBUTION,
            created_at=now,
            updated_at=now,
        )
        db.session.add(part)
        part_rows.append(part)

    db.session.flush()  # ensure IDs assigned

    # Resolve pet_board_code to actual master codes (FK integrity)
    for p in part_rows:
        if p.pet_board_code:
            master = PetBoardMaster.query.filter(
                func.upper(PetBoardMaster.code) == p.pet_board_code.upper()
            ).first()
            if master:
                p.pet_board_code = master.code
            else:
                p.pet_board_code = None

    db.session.flush()

    # Auto Pet Board Out per part (§8, §5.2)
    warnings = []
    for p in part_rows:
        if p.pet_board_code:
            w = consume_pet_board_for_part(
                p.pet_board_code, template_id, p.part_id, created_by, now
            )
            if w:
                warnings.append(w)

    db.session.commit()

    return {
        "ok": True,
        "id": template_id,
        "template": _template_summary(template),
        "parts": [_part_dict(p) for p in part_rows],
        "warnings": warnings,
        "msg": "Template tersimpan dan menunggu distribusi",
    }


def update_template(template_id, data, actor):
    """
    Update template parts & sketches (admin/super_admin only — enforced in route).
    Ports updateTemplate_ from GAS.
    """
    template = Template.query.get(template_id)
    if not template:
        return {"ok": False, "msg": "Template tidak ditemukan"}

    now = datetime.utcnow()

    if "parts" in data:
        parts = normalize_parts_input(data["parts"])
        if not parts:
            return {"ok": False, "msg": "Minimal 1 part wajib diisi"}

        # Remove existing parts (and their auto pet-board-outs)
        PetBoardStockOut.query.filter_by(template_id=template_id).delete()
        TemplatePart.query.filter_by(template_id=template_id).delete()
        db.session.flush()

        for p in parts:
            tp = TemplatePart(
                part_id=p["partId"] or gen_id("PRT"),
                template_id=template_id,
                part=p["part"],
                size=p["size"],
                qty=p["qty"],
                pet_board_code=p["pet_board_code"] or None,
                status=TemplateStatus.WAITING_DISTRIBUTION,
                created_at=now,
                updated_at=now,
            )
            db.session.add(tp)
            if tp.pet_board_code:
                consume_pet_board_for_part(
                    tp.pet_board_code, template_id, tp.part_id, actor.username, now
                )

    template.updated_at = now
    db.session.commit()

    return {
        "ok": True,
        "template": _template_summary(template),
        "msg": "Template berhasil diperbarui",
    }


def bulk_import(rows, actor_username, default_storage=None,
                force_default_storage=False, create_missing_storage=True):
    """
    Ports bulkImportExisting_ / fieldBulkAddTemplates from GAS (PRD §8).
    Import/update field templates with auto storage creation.
    """
    from ..utils import normalize

    errors = []
    inserted = 0
    updated = 0
    now = datetime.utcnow()

    for idx, r in enumerate(rows):
        buyer = normalize(r.get("buyer"))
        stylekp = normalize(r.get("stylekp"))
        parts = normalize_parts_input(r.get("parts", []))
        row_storage = normalize(r.get("storage") or r.get("currentStorage") or "")
        storage = (
            default_storage
            if (force_default_storage and default_storage)
            else (row_storage or default_storage)
        )
        note = r.get("note", "Update template existing/lapangan")

        if not buyer or not stylekp or not parts:
            errors.append(f"Baris {idx+1}: Buyer/Style/Part wajib")
            continue
        if not storage:
            errors.append(f"Baris {idx+1}: Storage wajib")
            continue

        # Auto-create storage if missing
        if not Storage.query.get(storage):
            if create_missing_storage:
                db.session.add(Storage(code=storage, name=storage, area="Import Lapangan"))
            else:
                errors.append(f"Baris {idx+1}: Storage {storage} belum ada di master")
                continue

        # Find existing by buyer+style+parts key
        existing = find_existing_template(buyer, stylekp, parts)
        if existing:
            old_storage = existing.current_storage or ""
            existing.status = TemplateStatus.DISTRIBUTED
            existing.current_storage = storage
            existing.updated_at = now
            if not existing.distributed_at:
                existing.distributed_at = now
            for pp in existing.parts:
                pp.status = TemplateStatus.DISTRIBUTED
                pp.current_storage = storage
                pp.updated_at = now
                if not pp.distributed_at:
                    pp.distributed_at = now

            db.session.add(Movement(
                id=gen_id("MOV"),
                template_id=existing.id,
                type=MovementType.UPDATE_EXISTING,
                from_storage=old_storage or "LAPANGAN",
                to_storage=storage,
                by=actor_username,
                note=note,
                at=now,
            ))
            updated += 1
        else:
            template_id = gen_id("TPL")
            db.session.add(Template(
                id=template_id, buyer=buyer, stylekp=stylekp,
                status=TemplateStatus.DISTRIBUTED, current_storage=storage,
                created_by=actor_username, created_at=now, updated_at=now,
                distributed_at=now,
            ))
            for p in parts:
                db.session.add(TemplatePart(
                    part_id=p["partId"] or gen_id("PRT"),
                    template_id=template_id, part=p["part"], size=p["size"],
                    qty=p["qty"], status=TemplateStatus.DISTRIBUTED,
                    current_storage=storage, distributed_at=now,
                    created_at=now, updated_at=now,
                ))
            db.session.add(Movement(
                id=gen_id("MOV"),
                template_id=template_id,
                type=MovementType.IMPORT_EXISTING,
                from_storage="LAPANGAN",
                to_storage=storage,
                by=actor_username,
                note=note,
                at=now,
            ))
            inserted += 1

    db.session.commit()
    return {
        "ok": True, "inserted": inserted, "updated": updated,
        "errors": errors, "msg": "Update import lapangan selesai",
    }


def _template_summary(t):
    return {
        "id": t.id,
        "buyer": t.buyer,
        "stylekp": t.stylekp,
        "status": t.status.value if t.status else None,
        "currentStorage": t.current_storage,
        "createdBy": t.created_by,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "updatedAt": t.updated_at.isoformat() if t.updated_at else None,
        "distributedAt": t.distributed_at.isoformat() if t.distributed_at else None,
        "hasSketch": len(t.sketches) > 0,
        "sketchCount": len(t.sketches),
    }


def _part_dict(p):
    return {
        "partId": p.part_id,
        "templateId": p.template_id,
        "part": p.part,
        "size": p.size,
        "qty": p.qty,
        "petBoardCode": p.pet_board_code,
        "status": p.status.value if p.status else None,
        "currentStorage": p.current_storage,
        "distributedAt": p.distributed_at.isoformat() if p.distributed_at else None,
        "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
    }
