"""
Distribution & Movement service — PRD §8
Ports: distributeTemplate_ (split part logic), moveTemplate_ (anti-duplicate movement)
"""
from datetime import datetime
from sqlalchemy import and_
from ..extensions import db
from ..models import (
    Template, TemplatePart, Storage, Movement,
    TemplateStatus, MovementType,
)
from ..utils import gen_id, normalize
from .template_service import normalize_parts_input


def is_part_waiting(p):
    """A part is 'waiting' if not distributed and no current_storage"""
    return p.status != TemplateStatus.DISTRIBUTED and not p.current_storage


def distribute(template_id, storage_code, actor, split_parts=None, note=""):
    """
    Distribute template — supports split per part/size/qty.
    Ports distributeTemplate_ from GAS (PRD §5, §8):
      - partial distribution: only selected parts distributed, rest stays waiting
      - if qty < max: remaining becomes a new WAITING part row
    """
    template = Template.query.get(template_id)
    if not template:
        return {"ok": False, "msg": "Template tidak ditemukan"}
    storage = Storage.query.get(storage_code)
    if not storage:
        return {"ok": False, "msg": "Storage tujuan belum ada di master"}

    now = datetime.utcnow()
    all_parts = TemplatePart.query.filter_by(template_id=template_id).all()

    # If no split_parts specified, distribute all waiting parts
    if not split_parts:
        split_parts = [
            {"partId": p.part_id, "part": p.part, "size": p.size, "qty": p.qty}
            for p in all_parts if is_part_waiting(p)
        ]
    if all_parts and not split_parts:
        return {"ok": False, "msg": "Tidak ada part waiting yang dipilih untuk distribusi."}

    changed = []
    for sp in split_parts:
        part_row = _find_part_row(all_parts, sp)
        if not part_row or not is_part_waiting(part_row):
            continue

        max_qty = max(1, part_row.qty)
        qty = min(max_qty, max(1, int(sp.get("qty", max_qty))))

        part_row.qty = qty
        part_row.status = TemplateStatus.DISTRIBUTED
        part_row.current_storage = storage_code
        part_row.distributed_at = now
        part_row.updated_at = now
        changed.append(part_row)

        # Split: if distributed qty < max, create remaining waiting part
        if qty < max_qty:
            remain = TemplatePart(
                part_id=gen_id("PRT"),
                template_id=template_id,
                part=part_row.part,
                size=part_row.size,
                qty=max_qty - qty,
                pet_board_code=part_row.pet_board_code,
                status=TemplateStatus.WAITING_DISTRIBUTION,
                created_at=part_row.created_at or now,
                updated_at=now,
            )
            db.session.add(remain)
            all_parts.append(remain)
            changed.append(remain)

    if all_parts and not changed:
        return {
            "ok": False,
            "msg": "Part yang dipilih tidak ditemukan / sudah terdistribusi. Sync data lalu coba lagi.",
        }

    # Recompute template status from parts
    remaining_waiting = any(is_part_waiting(p) for p in all_parts)
    template.status = TemplateStatus.WAITING_DISTRIBUTION if remaining_waiting else TemplateStatus.DISTRIBUTED
    template.current_storage = None if remaining_waiting else storage_code
    template.distributed_at = now if not remaining_waiting else (template.distributed_at or None)
    template.updated_at = now

    # Build movement
    split_text = ", ".join([
        f"{normalize(sp.get('part',''))}" +
        (f" [{normalize(sp.get('size',''))}]" if sp.get("size") else "") +
        f" x{max(1, int(sp.get('qty', 1) or 1))}"
        for sp in split_parts
    ])
    full_note = note
    if split_text and "Split Part/Size/Qty:" not in (note or ""):
        full_note = f"{note or 'Distribusi template jadi'} | Split Part/Size/Qty: {split_text}"

    movement = Movement(
        id=gen_id("MOV"),
        template_id=template_id,
        type=MovementType.DISTRIBUTE,
        from_storage=template.current_storage or "WORKSHOP",
        to_storage=storage_code,
        by=actor.username,
        note=full_note,
        at=now,
    )
    db.session.add(movement)
    db.session.commit()

    return {
        "ok": True,
        "template": {
            "id": template_id,
            "status": template.status.value,
            "currentStorage": template.current_storage,
            "distributedAt": template.distributed_at.isoformat() if template.distributed_at else None,
            "updatedAt": template.updated_at.isoformat(),
        },
        "parts": [_part_dict(p) for p in all_parts],
        "movement": {
            "id": movement.id,
            "templateId": movement.template_id,
            "type": movement.type.value,
            "from": movement.from_storage,
            "to": movement.to_storage,
            "by": movement.by,
            "note": movement.note,
            "at": movement.at.isoformat(),
        },
        "partial": remaining_waiting,
        "msg": "Distribusi split tersimpan" if remaining_waiting else "Template berhasil didistribusikan",
    }


def move(template_id, move_type, from_storage, to_storage, actor, note=""):
    """
    Move template: TRANSFER / OUT / REPAIR / RETURN.
    Ports moveTemplate_ from GAS — anti-duplicate: skip if from == to.
    """
    template = Template.query.get(template_id)
    if not template:
        return {"ok": False, "msg": "Template tidak ditemukan"}

    move_type = move_type.upper()
    from_val = from_storage or template.current_storage or ""
    to_val = "" if move_type == "OUT" else normalize(to_storage)

    if move_type != "OUT" and to_val and not Storage.query.get(to_val):
        return {"ok": False, "msg": "Storage tujuan belum ada di master"}

    # Anti-duplicate: from == to → no movement recorded
    if move_type != "OUT" and normalize(from_val) == normalize(to_val):
        return {
            "ok": True,
            "noChange": True,
            "msg": "Anti duplicate aktif: Storage asal dan tujuan sama.",
            "template": {
                "id": template_id,
                "status": "DISTRIBUTED",
                "currentStorage": to_val,
                "updatedAt": template.updated_at.isoformat() if template.updated_at else None,
            },
        }

    now = datetime.utcnow()
    new_status = TemplateStatus.OUT if move_type == "OUT" else TemplateStatus.DISTRIBUTED
    template.status = new_status
    template.current_storage = to_val
    template.updated_at = now

    mt = {
        "TRANSFER": MovementType.TRANSFER,
        "OUT": MovementType.OUT,
        "REPAIR": MovementType.REPAIR,
        "RETURN": MovementType.RETURN,
    }.get(move_type, MovementType.TRANSFER)

    movement = Movement(
        id=gen_id("MOV"),
        template_id=template_id,
        type=mt,
        from_storage=from_val,
        to_storage=to_val,
        by=actor.username,
        note=note,
        at=now,
    )
    db.session.add(movement)
    db.session.commit()

    return {
        "ok": True,
        "template": {
            "id": template_id,
            "status": template.status.value,
            "currentStorage": template.current_storage,
            "updatedAt": template.updated_at.isoformat(),
        },
        "movement": {
            "id": movement.id,
            "templateId": movement.template_id,
            "type": movement.type.value,
            "from": movement.from_storage,
            "to": movement.to_storage,
            "by": movement.by,
            "note": movement.note,
            "at": movement.at.isoformat(),
        },
        "msg": "Movement tersimpan",
    }


def _find_part_row(all_parts, sp):
    part_id = sp.get("partId") or sp.get("part_id")
    if part_id:
        for p in all_parts:
            if p.part_id == part_id:
                return p
    part_match = normalize(sp.get("part", ""))
    size_match = normalize(sp.get("size", ""))
    for p in all_parts:
        if is_part_waiting(p) and p.part == part_match and (p.size or "") == size_match:
            return p
    return None


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
