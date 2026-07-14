"""PET/PVC Board routes — PRD §8, §5.2"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from ..auth_utils import jwt_user_required, admin_required, super_admin_required, get_current_user
from ..services import pet_board_service
from ..models import PetBoardMaster, PetBoardUnit
from ..extensions import db
from ..utils import normalize

pet_boards_bp = Blueprint("pet_boards", __name__)


@pet_boards_bp.route("/masters", methods=["GET"])
@jwt_user_required
def list_masters():
    masters = PetBoardMaster.query.all()
    return jsonify(ok=True, masters=[
        {"code": m.code, "sizeLabel": m.size_label,
         "unit": m.unit.value if m.unit else "LEMBAR", "isActive": m.is_active}
        for m in masters
    ])


@pet_boards_bp.route("/masters", methods=["POST"])
@admin_required
def add_master():
    """POST /api/pet-boards/masters — admin only"""
    data = request.get_json(silent=True) or {}
    code = normalize(data.get("code"))
    if not code or not data.get("sizeLabel"):
        return jsonify(ok=False, msg="Kode dan size label wajib"), 400
    if PetBoardMaster.query.get(code):
        return jsonify(ok=False, msg="Kode sudah ada"), 409
    m = PetBoardMaster(
        code=code, size_label=data["sizeLabel"],
        unit=PetBoardUnit(data.get("unit", "LEMBAR")),
    )
    db.session.add(m)
    db.session.commit()
    return jsonify(ok=True, master={
        "code": m.code, "sizeLabel": m.size_label, "unit": m.unit.value,
    })


@pet_boards_bp.route("/masters/<code>", methods=["DELETE"])
@super_admin_required
def delete_master(code):
    """DELETE /api/pet-boards/masters/{code} — super_admin only"""
    m = PetBoardMaster.query.get(code)
    if not m:
        return jsonify(ok=False, msg="Master tidak ditemukan"), 404
    # Check if any stock transactions exist
    from ..models import PetBoardStockIn, PetBoardStockOut
    has_ins = PetBoardStockIn.query.filter_by(board_code=code).count()
    has_outs = PetBoardStockOut.query.filter_by(board_code=code).count()
    if has_ins or has_outs:
        # Soft-delete: deactivate instead of hard delete
        m.is_active = False
        db.session.commit()
        return jsonify(ok=True, msg=f"Master '{code}' dinonaktifkan (ada transaksi stok). Data historis tetap ada.")
    db.session.delete(m)
    db.session.commit()
    return jsonify(ok=True, msg=f"Master '{code}' dihapus.")


@pet_boards_bp.route("/stock", methods=["GET"])
@jwt_user_required
def stock():
    """GET /api/pet-boards/stock?code="""
    code = request.args.get("code")
    return jsonify(ok=True, stock=pet_board_service.get_available_stock(code))


@pet_boards_bp.route("/in", methods=["POST"])
@jwt_user_required
def stock_in():
    """POST /api/pet-boards/in — record arrival"""
    data = request.get_json(silent=True) or {}
    actor = get_current_user()
    in_date = None
    if data.get("inDate"):
        try:
            in_date = datetime.fromisoformat(data["inDate"].replace("Z", ""))
        except ValueError:
            pass
    result = pet_board_service.record_stock_in(
        data.get("boardCode"), data.get("qty"), actor.username,
        in_date=in_date, supplier=data.get("supplier"), note=data.get("note"),
    )
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@pet_boards_bp.route("/out", methods=["POST"])
@admin_required
def stock_out():
    """POST /api/pet-boards/out — manual adjustment (admin only)"""
    data = request.get_json(silent=True) or {}
    actor = get_current_user()
    out_date = None
    if data.get("outDate"):
        try:
            out_date = datetime.fromisoformat(data["outDate"].replace("Z", ""))
        except ValueError:
            pass
    result = pet_board_service.record_stock_out_manual(
        data.get("boardCode"), data.get("qty", 1), actor.username,
        out_date=out_date, note=data.get("note"),
    )
    code = 200 if result.get("ok") else 400
    return jsonify(result), code


@pet_boards_bp.route("/report", methods=["GET"])
@jwt_user_required
def report():
    """GET /api/pet-boards/report?from=&to=&code=&storage=&buyer=&style="""
    from_date = to_date = None
    if request.args.get("from"):
        from_date = datetime.fromisoformat(request.args["from"].replace("Z", ""))
    if request.args.get("to"):
        to_date = datetime.fromisoformat(request.args["to"].replace("Z", ""))

    rows = pet_board_service.get_usage_report(
        from_date=from_date, to_date=to_date,
        board_code=request.args.get("code"),
        storage=request.args.get("storage") or None,
        buyer=request.args.get("buyer") or None,
        style=request.args.get("style") or None,
    )
    return jsonify(ok=True, total=len(rows), rows=rows)
