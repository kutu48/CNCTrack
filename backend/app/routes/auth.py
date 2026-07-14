"""Auth routes — PRD §7: JWT login, refresh, logout"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import (
    create_access_token, create_refresh_token,
    jwt_required, get_jwt_identity,
)
from ..models import User, Role
from ..auth_utils import hash_password, verify_password, get_current_user, jwt_user_required

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/login", methods=["POST"])
def login():
    """POST /api/auth/login → access_token + refresh_token"""
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify(ok=False, msg="Username dan password wajib"), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.is_active or not verify_password(password, user.password_hash):
        return jsonify(ok=False, msg="Username/password salah atau user tidak aktif"), 401

    additional = {"role": user.role.value, "name": user.name or user.username}
    access = create_access_token(identity=user.username, additional_claims=additional)
    refresh = create_refresh_token(identity=user.username, additional_claims=additional)

    return jsonify(
        ok=True,
        access_token=access,
        refresh_token=refresh,
        user={"username": user.username, "role": user.role.value, "name": user.name or user.username},
    )


@auth_bp.route("/refresh", methods=["POST"])
@jwt_required(refresh=True)
def refresh():
    """POST /api/auth/refresh → new access_token"""
    identity = get_jwt_identity()
    user = User.query.filter_by(username=identity).first()
    if not user or not user.is_active:
        return jsonify(ok=False, msg="User tidak aktif"), 401
    additional = {"role": user.role.value, "name": user.name or user.username}
    access = create_access_token(identity=user.username, additional_claims=additional)
    return jsonify(ok=True, access_token=access)


@auth_bp.route("/me", methods=["GET"])
@jwt_user_required
def me():
    user = get_current_user()
    return jsonify(ok=True, user={
        "username": user.username, "role": user.role.value, "name": user.name,
    })
