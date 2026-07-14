"""Master data routes — PRD §8: autocomplete for buyers/parts"""
from flask import Blueprint, jsonify
from ..auth_utils import jwt_user_required
from ..models import Template, TemplatePart
from sqlalchemy import distinct

masters_bp = Blueprint("masters", __name__)


@masters_bp.route("/buyers", methods=["GET"])
@jwt_user_required
def buyers():
    rows = db.session.query(distinct(Template.buyer)).filter(Template.buyer.isnot(None)).all()
    return jsonify(ok=True, buyers=sorted(r[0] for r in rows if r[0]))


@masters_bp.route("/parts", methods=["GET"])
@jwt_user_required
def parts():
    rows = db_session_parts()
    return jsonify(ok=True, parts=rows)


def db_session_parts():
    from ..extensions import db
    rows = db.session.query(distinct(TemplatePart.part)).filter(TemplatePart.part.isnot(None)).all()
    return sorted(r[0] for r in rows if r[0])
