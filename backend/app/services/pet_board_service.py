"""
PET/PVC Board Stock service — PRD §5.2, §6.7–§6.9, §8
  - Available stock = SUM(ins) - SUM(outs)
  - Pet Board Out auto-records when template part has pet_board_code
  - Stock validation: soft-warning (default) or hard-block (config)
"""
from datetime import datetime
from flask import current_app
from sqlalchemy import func
from ..extensions import db
from ..models import (
    PetBoardMaster, PetBoardStockIn, PetBoardStockOut,
    PetBoardOutSource, PetBoardUnit,
)


def get_available_stock(board_code=None):
    """Returns list of {code, sizeLabel, unit, inQty, outQty, available}"""
    query = PetBoardMaster.query
    if board_code:
        query = query.filter_by(code=board_code)
    masters = query.filter_by(is_active=True).all()
    result = []
    for m in masters:
        ins = (
            db.session.query(func.coalesce(func.sum(PetBoardStockIn.qty), 0))
            .filter_by(board_code=m.code)
            .scalar()
        )
        outs = (
            db.session.query(func.coalesce(func.sum(PetBoardStockOut.qty), 0))
            .filter_by(board_code=m.code)
            .scalar()
        )
        avail = float(ins) - float(outs)
        result.append({
            "code": m.code,
            "sizeLabel": m.size_label,
            "unit": m.unit.value if m.unit else "LEMBAR",
            "inQty": float(ins),
            "outQty": float(outs),
            "available": avail,
        })
    return result


def consume_pet_board_for_part(board_code, template_id, part_id, actor, at=None):
    """
    Auto-create PetBoardStockOut (TEMPLATE_AUTO) for a part using pet_board_code.
    Returns a warning string if stock insufficient (soft-warning mode).
    """
    at = at or datetime.utcnow()
    master = PetBoardMaster.query.filter(
        db.func.upper(PetBoardMaster.code) == board_code.upper(),
        PetBoardMaster.is_active == True,
    ).first()
    if not master:
        return f"⚠ Uk Pet Board '{board_code}' tidak ditemukan di master — Out tidak dicatat."

    # Check available stock (soft-warning / hard-block)
    stock = get_available_stock(board_code)
    available = stock[0]["available"] if stock else 0
    warning = None
    if available < 1:
        msg = f"⚠ Stok Pet Board '{board_code}' tidak cukup (sisa {available})."
        if current_app.config.get("PET_BOARD_HARD_BLOCK"):
            return f"BLOCKED:{msg}"
        warning = msg

    out = PetBoardStockOut(
        board_code=master.code,  # use actual master code, not input
        qty=1,  # §17.1 assumption: 1 board per part row
        template_id=template_id,
        part_id=part_id,
        out_date=at,
        source=PetBoardOutSource.TEMPLATE_AUTO,
        created_by=actor,
        created_at=at,
    )
    db.session.add(out)
    return warning


def record_stock_in(board_code, qty, actor, in_date=None, supplier=None, note=None):
    """Record Pet Board arrival (In)"""
    if not PetBoardMaster.query.get(board_code):
        return {"ok": False, "msg": f"Master Pet Board '{board_code}' tidak ditemukan"}
    qty = float(qty)
    if qty <= 0:
        return {"ok": False, "msg": "Qty harus > 0"}
    si = PetBoardStockIn(
        board_code=board_code,
        qty=qty,
        in_date=in_date or datetime.utcnow(),
        supplier=supplier,
        note=note,
        created_by=actor,
    )
    db.session.add(si)
    db.session.commit()
    return {"ok": True, "id": si.id, "msg": "Pet Board In tercatat"}


def record_stock_out_manual(board_code, qty, actor, out_date=None, note=None):
    """Manual adjustment (MANUAL_ADJUST) — admin only"""
    if not PetBoardMaster.query.get(board_code):
        return {"ok": False, "msg": f"Master Pet Board '{board_code}' tidak ditemukan"}
    qty = float(qty)
    so = PetBoardStockOut(
        board_code=board_code,
        qty=qty,
        out_date=out_date or datetime.utcnow(),
        source=PetBoardOutSource.MANUAL_ADJUST,
        created_by=actor,
    )
    if note:
        so.note = note
    db.session.add(so)
    db.session.commit()
    return {"ok": True, "id": so.id, "msg": "Pet Board Out (manual) tercatat"}


def get_usage_report(from_date=None, to_date=None, board_code=None,
                     storage=None, buyer=None, style=None):
    """
    Report: Tanggal | Ukuran Pet Board | Tujuan Meja/Storage | Buyer | Style
    §5.2 & §17.3: Tujuan follows the template's LAST distribution storage (live join).
    """
    from ..models import Template
    from sqlalchemy import and_

    query = (
        db.session.query(
            PetBoardStockOut, Template,
        )
        .outerjoin(Template, PetBoardStockOut.template_id == Template.id)
    )

    if from_date:
        query = query.filter(PetBoardStockOut.out_date >= from_date)
    if to_date:
        query = query.filter(PetBoardStockOut.out_date <= to_date)
    if board_code:
        query = query.filter(PetBoardStockOut.board_code == board_code)
    if buyer:
        query = query.filter(Template.buyer.ilike(f"%{buyer}%"))
    if style:
        query = query.filter(Template.stylekp.ilike(f"%{style}%"))

    rows = query.order_by(PetBoardStockOut.out_date.desc()).all()
    # For storage filter, we need the live template current_storage
    result = []
    for out, template in rows:
        live_storage = template.current_storage if template else None
        if storage and live_storage != storage:
            continue
        master = PetBoardMaster.query.get(out.board_code)
        result.append({
            "outDate": out.out_date.isoformat() if out.out_date else None,
            "boardCode": out.board_code,
            "sizeLabel": master.size_label if master else out.board_code,
            "storage": live_storage or "-",
            "buyer": template.buyer if template else "-",
            "style": template.stylekp if template else "-",
            "qty": out.qty,
            "source": out.source.value if out.source else None,
            "templateId": out.template_id,
        })
    return result
