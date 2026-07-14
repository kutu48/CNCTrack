"""
Sync service — PRD §8, §9.1
  - Full sync: all templates/parts/storages/users + movements (N days)
  - Incremental sync (?since=timestamp): only changed rows
  - Outbox: /api/sync/outbox — process offline actions idempotently (§6.10)
"""
from datetime import datetime, timedelta
from sqlalchemy import func
from ..extensions import db
from ..models import (
    Template, TemplatePart, Storage, Movement, User, Sketch,
    SyncActionLog, SyncActionStatus, ActionType,
)
from ..utils import payload_hash, normalize
from . import template_service, distribution_service
from .pet_board_service import record_stock_in


DEFAULT_SYNC_DAYS = 7


def full_sync(days=DEFAULT_SYNC_DAYS):
    """Full data load for initial sync"""
    cutoff = datetime.utcnow() - timedelta(days=days)

    templates = [_template_dict(t) for t in Template.query.all()]
    parts = [_part_dict(p) for p in TemplatePart.query.all()]
    movements = [
        _movement_dict(m)
        for m in Movement.query.filter(Movement.at >= cutoff).all()
    ]
    storages = [_storage_dict(s) for s in Storage.query.all()]
    users = [_user_dict(u) for u in User.query.all()]

    buyers = sorted(set(t["buyer"] for t in templates if t["buyer"]))
    part_names = sorted(set(p["part"] for p in parts if p["part"]))

    return {
        "users": users,
        "storages": storages,
        "templates": templates,
        "parts": parts,
        "movements": movements,
        "movementsTotal": Movement.query.count(),
        "movementsDays": days,
        "masters": {"buyers": buyers, "parts": part_names},
    }


def incremental_sync(since_dt, days=DEFAULT_SYNC_DAYS):
    """Incremental sync — only rows changed after 'since' (§8)"""
    cutoff = datetime.utcnow() - timedelta(days=days)

    templates = [
        _template_dict(t)
        for t in Template.query.filter(Template.updated_at > since_dt).all()
    ]
    parts = [
        _part_dict(p)
        for p in TemplatePart.query.filter(
            (TemplatePart.updated_at > since_dt) | (TemplatePart.created_at > since_dt)
        ).all()
    ]
    movements = [
        _movement_dict(m)
        for m in Movement.query.filter(Movement.at > since_dt).all()
    ]
    storages = [
        _storage_dict(s)
        for s in Storage.query.filter(Storage.updated_at > since_dt).all()
    ]
    users = [
        _user_dict(u)
        for u in User.query.filter(User.updated_at > since_dt).all()
    ]

    return {
        "templates": templates,
        "parts": parts,
        "movements": movements,
        "storages": storages,
        "users": users,
    }


# ---------------------------------------------------------------------------
# Outbox processing — PRD §9.1
# ---------------------------------------------------------------------------
def process_outbox(actions, actor):
    """
    Process array of offline actions idempotently.
    Each action: {client_action_id, action_type, payload}
    Uses client_action_id as idempotency key (§6.10).
    Returns per-action result: applied / conflict / rejected.
    """
    results = []
    for action in actions:
        cid = action.get("client_action_id")
        if not cid:
            results.append({"client_action_id": None, "status": "rejected",
                            "reason": "Missing client_action_id"})
            continue

        # Idempotency: if already processed, return cached result
        existing = SyncActionLog.query.get(cid)
        if existing:
            results.append({
                "client_action_id": cid,
                "status": existing.status.value.lower(),
                "resultRefId": existing.result_ref_id,
                "cached": True,
            })
            continue

        atype = action.get("action_type")
        payload = action.get("payload", {})
        phash = payload_hash(payload)

        try:
            result = _dispatch_action(atype, payload, actor)
            status = "applied" if result.get("ok") else "rejected"
            if result.get("conflict"):
                status = "conflict"

            log = SyncActionLog(
                client_action_id=cid,
                user_id=actor.username,
                action_type=ActionType(atype) if atype in [e.value for e in ActionType] else ActionType.ADD_TEMPLATE,
                status=SyncActionStatus(status.upper()),
                result_ref_id=result.get("id") or result.get("templateId"),
                payload_hash=phash,
                processed_at=datetime.utcnow(),
            )
            db.session.add(log)
            db.session.commit()

            results.append({
                "client_action_id": cid,
                "status": status,
                "resultRefId": result.get("id") or result.get("templateId"),
                "msg": result.get("msg", ""),
                "warnings": result.get("warnings", []),
            })
        except Exception as e:
            db.session.rollback()
            log = SyncActionLog(
                client_action_id=cid,
                user_id=actor.username,
                action_type=ActionType.ADD_TEMPLATE,
                status=SyncActionStatus.REJECTED,
                payload_hash=phash,
                processed_at=datetime.utcnow(),
            )
            db.session.add(log)
            db.session.commit()
            results.append({
                "client_action_id": cid,
                "status": "rejected",
                "reason": str(e),
            })

    return results


def _dispatch_action(atype, payload, actor):
    """Route outbox action to appropriate service"""
    if atype == ActionType.ADD_TEMPLATE.value:
        return template_service.create_template(payload, actor.username)

    elif atype == ActionType.UPDATE_TEMPLATE.value:
        tid = payload.get("id") or payload.get("templateId")
        return template_service.update_template(tid, payload, actor)

    elif atype == ActionType.DISTRIBUTE.value:
        tid = payload.get("templateId") or payload.get("id")
        return distribution_service.distribute(
            tid, payload.get("storage") or payload.get("to"),
            actor, payload.get("splitParts"), payload.get("note", ""),
        )

    elif atype == ActionType.MOVE.value:
        tid = payload.get("templateId") or payload.get("id")
        return distribution_service.move(
            tid, payload.get("type", "TRANSFER"),
            payload.get("from"), payload.get("to"),
            actor, payload.get("note", ""),
        )

    elif atype == ActionType.PET_BOARD_IN.value:
        return record_stock_in(
            payload.get("boardCode"), payload.get("qty"), actor.username,
            in_date=payload.get("inDate"),
            supplier=payload.get("supplier"), note=payload.get("note"),
        )

    elif atype == ActionType.ADD_STORAGE.value:
        from ..models import Storage
        if Storage.query.get(normalize(payload.get("code"))):
            return {"ok": False, "msg": "Kode storage sudah ada"}
        s = Storage(code=normalize(payload.get("code")),
                     name=payload.get("name", ""), area=payload.get("area", ""))
        db.session.add(s)
        db.session.commit()
        return {"ok": True, "id": s.code, "msg": "Storage ditambahkan"}

    elif atype == ActionType.BULK_IMPORT.value:
        return template_service.bulk_import(
            payload.get("rows", []), actor.username,
            payload.get("defaultStorage"), payload.get("forceDefaultStorage", False),
            payload.get("createMissingStorage", True),
        )

    return {"ok": False, "msg": f"Unknown action type: {atype}"}


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------
def _template_dict(t):
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
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
    }


def _movement_dict(m):
    return {
        "id": m.id,
        "templateId": m.template_id,
        "type": m.type.value if m.type else None,
        "from": m.from_storage,
        "to": m.to_storage,
        "by": m.by,
        "note": m.note,
        "at": m.at.isoformat() if m.at else None,
    }


def _storage_dict(s):
    return {
        "code": s.code,
        "name": s.name,
        "area": s.area,
        "createdAt": s.created_at.isoformat() if s.created_at else None,
        "updatedAt": s.updated_at.isoformat() if s.updated_at else None,
    }


def _user_dict(u):
    return {
        "username": u.username,
        "role": u.role.value if u.role else "operator",
        "name": u.name or u.username,
        "active": u.is_active,
    }
