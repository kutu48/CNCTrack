"""User management routes — PRD §8"""
from flask import Blueprint, request, jsonify
from ..auth_utils import super_admin_required, get_current_user, hash_password
from ..models import User, Role
from ..extensions import db
from ..utils import normalize

users_bp = Blueprint("users", __name__)


@users_bp.route("", methods=["POST"])
@super_admin_required
def add_user():
    """POST /api/users — super_admin only"""
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    if not username or not password:
        return jsonify(ok=False, msg="Username dan password wajib"), 400
    if User.query.get(username):
        return jsonify(ok=False, msg="Username sudah ada"), 409

    role_val = data.get("role", "operator")
    try:
        role = Role(role_val)
    except ValueError:
        role = Role.OPERATOR

    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        name=data.get("name") or username,
        is_active=True,
    )
    db.session.add(user)
    db.session.commit()
    return jsonify(ok=True, user={
        "username": user.username, "role": user.role.value, "name": user.name,
    })


@users_bp.route("/<username>/reset-password", methods=["POST"])
@super_admin_required
def reset_password(username):
    """POST /api/users/{username}/reset-password — super_admin only"""
    data = request.get_json(silent=True) or {}
    user = User.query.get(username.strip().lower())
    if not user:
        return jsonify(ok=False, msg="User tidak ditemukan"), 404
    user.password_hash = hash_password(data.get("password") or "")
    db.session.commit()
    return jsonify(ok=True, msg="Password direset")
