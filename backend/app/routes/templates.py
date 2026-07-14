"""Template routes — PRD §8"""
from flask import Blueprint, request, jsonify
from ..auth_utils import jwt_user_required, admin_required, get_current_user
from ..services import template_service, distribution_service
from ..models import Template, TemplatePart
from ..extensions import db

templates_bp = Blueprint("templates", __name__)


@templates_bp.route("", methods=["POST"])
@jwt_user_required
def add_template():
    """POST /api/templates — create new template"""
    data = request.get_json(silent=True) or {}
    actor = get_current_user()
    result = template_service.create_template(data, actor.username)
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@templates_bp.route("/<template_id>", methods=["PUT", "PATCH"])
@admin_required
def update_template(template_id):
    """PUT /api/templates/{id} — admin/super_admin only"""
    data = request.get_json(silent=True) or {}
    data["id"] = template_id
    actor = get_current_user()
    result = template_service.update_template(template_id, data, actor)
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@templates_bp.route("/<template_id>/distribute", methods=["POST"])
@jwt_user_required
def distribute(template_id):
    """POST /api/templates/{id}/distribute — split part distribution"""
    data = request.get_json(silent=True) or {}
    actor = get_current_user()
    result = distribution_service.distribute(
        template_id, data.get("storage") or data.get("to"),
        actor, data.get("splitParts"), data.get("note", ""),
    )
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@templates_bp.route("/<template_id>/move", methods=["POST"])
@jwt_user_required
def move(template_id):
    """POST /api/templates/{id}/move — transfer/out/repair/return"""
    data = request.get_json(silent=True) or {}
    actor = get_current_user()
    result = distribution_service.move(
        template_id, data.get("type", "TRANSFER"),
        data.get("from"), data.get("to"),
        actor, data.get("note", ""),
    )
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@templates_bp.route("/bulk-import", methods=["POST"])
@jwt_user_required
def bulk_import():
    """POST /api/templates/bulk-import — import lapangan"""
    data = request.get_json(silent=True) or {}
    actor = get_current_user()
    result = template_service.bulk_import(
        data.get("rows", []), actor.username,
        data.get("defaultStorage"), data.get("forceDefaultStorage", False),
        data.get("createMissingStorage", True),
    )
    return jsonify(result)


@templates_bp.route("/<template_id>/sketches", methods=["GET"])
@jwt_user_required
def get_sketches(template_id):
    """GET /api/templates/{id}/sketches — list sketch metadata"""
    from ..models import Sketch
    sketches = Sketch.query.filter_by(template_id=template_id).order_by(Sketch.seq_index).all()
    return jsonify(ok=True, templateId=template_id, sketches=[
        {"id": s.id, "seqIndex": s.seq_index, "filePath": s.file_path,
         "mimeType": s.mime_type, "sizeBytes": s.size_bytes,
         "createdAt": s.created_at.isoformat() if s.created_at else None}
        for s in sketches
    ])
