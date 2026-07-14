"""
Authentication helpers & role-checking decorators — PRD §7
Password di-hash bcrypt; role divalidasi di SERVER (bukan hanya klien).
"""
import bcrypt
from functools import wraps
from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
from .models import User, Role


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    if not hashed:
        return False
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def get_current_user():
    username = get_jwt_identity()
    if not username:
        return None
    return User.query.filter_by(username=username).first()


def role_required(*allowed_roles):
    """Server-side role enforcement — closes the security gap from §2 (role only checked in client)."""

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = get_current_user()
            if not user or not user.is_active:
                return jsonify(msg="User tidak aktif / tidak ditemukan"), 401
            role_names = [r.value for r in allowed_roles]
            if user.role.value not in role_names:
                return jsonify(msg=f"Akses ditolak. Wajib salah satu: {role_names}"), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator


def admin_required(fn):
    return role_required(Role.ADMIN, Role.SUPER_ADMIN)(fn)


def super_admin_required(fn):
    return role_required(Role.SUPER_ADMIN)(fn)


def jwt_user_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        verify_jwt_in_request()
        user = get_current_user()
        if not user or not user.is_active:
            return jsonify(msg="User tidak aktif / tidak ditemukan"), 401
        return fn(*args, **kwargs)

    return wrapper
