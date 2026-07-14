"""
Sketch routes — PRD §6.6: sketsa disimpan sebagai FILE FISIK di filesystem server.
  - POST /api/templates/{id}/sketches (multipart upload)
  - GET  /api/sketches/{sketch_id} (serve image file)
"""
import os
import uuid
from flask import Blueprint, request, jsonify, current_app, send_file
from ..auth_utils import jwt_user_required
from ..models import Sketch, Template
from ..extensions import db

sketches_bp = Blueprint("sketches", __name__)


@sketches_bp.route("/templates/<template_id>/sketches", methods=["POST"])
@jwt_user_required
def upload_sketch(template_id):
    """POST /api/templates/{id}/sketches — multipart upload to filesystem (§6.6)"""
    template = Template.query.get(template_id)
    if not template:
        return jsonify(ok=False, msg="Template tidak ditemukan"), 404

    files = request.files.getlist("sketches")
    if not files:
        files = [request.files.get("file")] if request.files.get("file") else []
    if not files or not files[0]:
        return jsonify(ok=False, msg="Tidak ada file sketsa"), 400

    upload_dir = current_app.config["UPLOAD_FOLDER"]
    os.makedirs(upload_dir, exist_ok=True)

    existing = Sketch.query.filter_by(template_id=template_id).count()
    created = []
    for idx, f in enumerate(files):
        if not f or not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1].lower() or ".jpg"
        if ext not in (".jpg", ".jpeg", ".png", ".webp"):
            ext = ".jpg"
        filename = f"{template_id}_{uuid.uuid4().hex[:8]}{ext}"
        filepath = os.path.join(upload_dir, filename)
        f.save(filepath)

        size = os.path.getsize(filepath)
        mime = f.mimetype or "image/jpeg"
        sketch = Sketch(
            template_id=template_id,
            seq_index=existing + idx,
            file_path=filepath,
            mime_type=mime,
            size_bytes=size,
        )
        db.session.add(sketch)
        created.append(sketch)

    db.session.commit()
    return jsonify(ok=True, templateId=template_id, sketchCount=len(template.sketches), sketches=[
        {"id": s.id, "seqIndex": s.seq_index, "sizeBytes": s.size_bytes}
        for s in created
    ])


@sketches_bp.route("/sketches/<int:sketch_id>", methods=["GET"])
@jwt_user_required
def get_sketch_file(sketch_id):
    """GET /api/sketches/{id} — serve the actual image file from filesystem"""
    sketch = Sketch.query.get(sketch_id)
    if not sketch or not os.path.exists(sketch.file_path):
        return jsonify(ok=False, msg="Sketsa tidak ditemukan"), 404
    return send_file(sketch.file_path, mimetype=sketch.mime_type or "image/jpeg")
