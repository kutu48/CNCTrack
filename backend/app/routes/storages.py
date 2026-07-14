"""Storage routes — PRD §8"""
from flask import Blueprint, request, jsonify
from ..auth_utils import jwt_user_required, admin_required, get_current_user
from ..models import Storage, TemplateStatus, Template, TemplatePart
from ..extensions import db
from ..utils import normalize, gen_id

storages_bp = Blueprint("storages", __name__)


@storages_bp.route("", methods=["GET"])
@jwt_user_required
def list_storages():
    storages = Storage.query.all()
    return jsonify(ok=True, storages=[
        {"code": s.code, "name": s.name, "area": s.area} for s in storages
    ])


@storages_bp.route("", methods=["POST"])
@admin_required
def add_storage():
    """POST /api/storages — admin only"""
    data = request.get_json(silent=True) or {}
    code = normalize(data.get("code"))
    name = (data.get("name") or "").strip()
    if not code or not name:
        return jsonify(ok=False, msg="Kode dan nama storage wajib"), 400
    if Storage.query.get(code):
        return jsonify(ok=False, msg="Kode storage sudah ada"), 409

    s = Storage(code=code, name=name, area=data.get("area", ""))
    db.session.add(s)
    db.session.commit()
    return jsonify(ok=True, storage={"code": s.code, "name": s.name, "area": s.area})
