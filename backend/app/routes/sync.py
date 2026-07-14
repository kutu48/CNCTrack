"""Sync routes — PRD §8: /api/sync, /api/sync/outbox"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from ..auth_utils import jwt_user_required, get_current_user
from ..services import sync_service
from ..utils import parse_since

sync_bp = Blueprint("sync", __name__)


@sync_bp.route("", methods=["GET"])
@jwt_user_required
def sync():
    """
    GET /api/sync?since=&days=
    Without since → full sync; with since → incremental sync.
    """
    days = int(request.args.get("days", 7))
    since_str = request.args.get("since")

    if since_str:
        since_dt = parse_since(since_str)
        if since_dt:
            data = sync_service.incremental_sync(since_dt, days)
            return jsonify(ok=True, incremental=True, since=since_str,
                           serverTime=datetime.utcnow().isoformat(), data=data)

    data = sync_service.full_sync(days)
    return jsonify(ok=True, incremental=False, serverTime=datetime.utcnow().isoformat(), data=data)


@sync_bp.route("/outbox", methods=["POST"])
@jwt_user_required
def outbox():
    """
    POST /api/sync/outbox — batch process offline actions idempotently (§9.1)
    Body: { actions: [{client_action_id, action_type, payload}] }
    """
    data = request.get_json(silent=True) or {}
    actions = data.get("actions", [])
    actor = get_current_user()
    results = sync_service.process_outbox(actions, actor)
    return jsonify(ok=True, results=results)
