"""Movements routes — PRD §8: /api/movements with filters"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import and_
from ..auth_utils import jwt_user_required
from ..models import Movement, Template
from ..extensions import db

movements_bp = Blueprint("movements", __name__)


@movements_bp.route("", methods=["GET"])
@jwt_user_required
def filter_movements():
    """
    GET /api/movements?from=&to=&type=&storage=&templateId=&q=&limit=
    Ports filterMovements_ from GAS.
    """
    from ..utils import normalize

    from_date = request.args.get("from")
    to_date = request.args.get("to")
    mtype = normalize(request.args.get("type"))
    storage = normalize(request.args.get("storage"))
    template_id = request.args.get("templateId", "").strip()
    q = normalize(request.args.get("q"))
    limit = min(2000, max(1, int(request.args.get("limit", 500))))

    query = db.session.query(Movement).outerjoin(Template, Movement.template_id == Template.id)

    if from_date:
        query = query.filter(Movement.at >= datetime.fromisoformat(from_date.replace("Z", "")))
    if to_date:
        td = datetime.fromisoformat(to_date.replace("Z", ""))
        td = td.replace(hour=23, minute=59, second=59)
        query = query.filter(Movement.at <= td)
    if mtype:
        query = query.filter(Movement.type == mtype)
    if storage:
        query = query.filter(
            (Movement.from_storage == storage) | (Movement.to_storage == storage)
        )
    if template_id:
        query = query.filter(Movement.template_id == template_id)
    if q:
        like = f"%{q}%"
        query = query.filter(
            (Movement.type.ilike(like)) | (Movement.from_storage.ilike(like)) |
            (Movement.to_storage.ilike(like)) | (Movement.by.ilike(like)) |
            (Movement.note.ilike(like)) | (Movement.template_id.ilike(like)) |
            (Template.buyer.ilike(like)) | (Template.stylekp.ilike(like))
        )

    total = query.count()
    rows = query.order_by(Movement.at.desc()).limit(limit).all()

    return jsonify(
        ok=True,
        total=total,
        returned=len(rows),
        movements=[
            {
                "id": m.id,
                "templateId": m.template_id,
                "type": m.type.value if m.type else None,
                "from": m.from_storage,
                "to": m.to_storage,
                "by": m.by,
                "note": m.note,
                "at": m.at.isoformat() if m.at else None,
                "buyer": m.template.buyer if m.template else "",
                "stylekp": m.template.stylekp if m.template else "",
            }
            for m in rows
        ],
    )
