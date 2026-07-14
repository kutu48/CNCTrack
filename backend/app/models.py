"""
SQLAlchemy ORM Models — Implements PRD §6 (Pemetaan Skema Data → MySQL)

All 10 tables:
  §6.1  users                §6.6  sketches
  §6.2  storages             §6.7  pet_board_masters
  §6.3  templates            §6.8  pet_board_stock_ins
  §6.4  template_parts       §6.9  pet_board_stock_outs
  §6.5  movements            §6.10 sync_actions_log
"""
import enum
from datetime import datetime
from .extensions import db


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------
class Role(enum.Enum):
    OPERATOR = "operator"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


class TemplateStatus(enum.Enum):
    WAITING_DISTRIBUTION = "WAITING_DISTRIBUTION"
    DISTRIBUTED = "DISTRIBUTED"
    OUT = "OUT"


class MovementType(enum.Enum):
    DISTRIBUTE = "DISTRIBUTE"
    TRANSFER = "TRANSFER"
    OUT = "OUT"
    UPDATE_EXISTING = "UPDATE_EXISTING"
    IMPORT_EXISTING = "IMPORT_EXISTING"
    REPAIR = "REPAIR"
    RETURN = "RETURN"


class PetBoardUnit(enum.Enum):
    LEMBAR = "LEMBAR"
    PCS = "PCS"


class PetBoardOutSource(enum.Enum):
    TEMPLATE_AUTO = "TEMPLATE_AUTO"
    MANUAL_ADJUST = "MANUAL_ADJUST"


class SyncActionStatus(enum.Enum):
    APPLIED = "APPLIED"
    REJECTED = "REJECTED"
    CONFLICT = "CONFLICT"


class ActionType(enum.Enum):
    ADD_TEMPLATE = "ADD_TEMPLATE"
    UPDATE_TEMPLATE = "UPDATE_TEMPLATE"
    DISTRIBUTE = "DISTRIBUTE"
    MOVE = "MOVE"
    ADD_SKETCH = "ADD_SKETCH"
    PET_BOARD_IN = "PET_BOARD_IN"
    PET_BOARD_OUT = "PET_BOARD_OUT"
    ADD_STORAGE = "ADD_STORAGE"
    BULK_IMPORT = "BULK_IMPORT"


# ---------------------------------------------------------------------------
# §6.1  users
# ---------------------------------------------------------------------------
class User(db.Model):
    __tablename__ = "users"
    username = db.Column(db.String(64), primary_key=True)
    password_hash = db.Column(db.String(255), nullable=False)  # bcrypt, NOT plaintext
    role = db.Column(db.Enum(Role), nullable=False, default=Role.OPERATOR)
    name = db.Column(db.String(128))
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ---------------------------------------------------------------------------
# §6.2  storages
# ---------------------------------------------------------------------------
class Storage(db.Model):
    __tablename__ = "storages"
    code = db.Column(db.String(64), primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    area = db.Column(db.String(128))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ---------------------------------------------------------------------------
# §6.3  templates  (kolom sketch lama DIHAPUS — pindah ke tabel sketches)
# ---------------------------------------------------------------------------
class Template(db.Model):
    __tablename__ = "templates"
    id = db.Column(db.String(64), primary_key=True)  # TPL-xxxx
    buyer = db.Column(db.String(255), nullable=False, index=True)
    stylekp = db.Column(db.String(255), nullable=False, index=True)
    status = db.Column(
        db.Enum(TemplateStatus),
        nullable=False,
        default=TemplateStatus.WAITING_DISTRIBUTION,
    )
    current_storage = db.Column(
        db.String(64), db.ForeignKey("storages.code"), nullable=True, index=True
    )
    created_by = db.Column(
        db.String(64), db.ForeignKey("users.username"), nullable=True
    )
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True
    )
    distributed_at = db.Column(db.DateTime, nullable=True)

    parts = db.relationship(
        "TemplatePart", backref="template", cascade="all, delete-orphan"
    )
    sketches = db.relationship(
        "Sketch", backref="template", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# §6.4  template_parts  (+ kolom pet_board_code)
# ---------------------------------------------------------------------------
class TemplatePart(db.Model):
    __tablename__ = "template_parts"
    part_id = db.Column(db.String(64), primary_key=True)
    template_id = db.Column(
        db.String(64), db.ForeignKey("templates.id"), nullable=False, index=True
    )
    part = db.Column(db.String(255), nullable=False)
    size = db.Column(db.String(128), default="")
    qty = db.Column(db.Integer, nullable=False, default=1)
    pet_board_code = db.Column(
        db.String(64), db.ForeignKey("pet_board_masters.code"), nullable=True, index=True
    )  # §6.4: "Uk Pet Board" per part
    status = db.Column(
        db.Enum(TemplateStatus),
        nullable=False,
        default=TemplateStatus.WAITING_DISTRIBUTION,
    )
    current_storage = db.Column(
        db.String(64), db.ForeignKey("storages.code"), nullable=True
    )
    distributed_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ---------------------------------------------------------------------------
# §6.5  movements
# ---------------------------------------------------------------------------
class Movement(db.Model):
    __tablename__ = "movements"
    id = db.Column(db.String(64), primary_key=True)
    template_id = db.Column(
        db.String(64), db.ForeignKey("templates.id"), nullable=False, index=True
    )
    type = db.Column(db.Enum(MovementType), nullable=False, index=True)
    from_storage = db.Column(db.String(64), nullable=True)
    to_storage = db.Column(db.String(64), nullable=True)
    by = db.Column(db.String(64), db.ForeignKey("users.username"), nullable=True)
    note = db.Column(db.Text)
    at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    template = db.relationship("Template", backref="movements", foreign_keys=[template_id])


# ---------------------------------------------------------------------------
# §6.6  sketches  (file_path filesystem, bukan base64)
# ---------------------------------------------------------------------------
class Sketch(db.Model):
    __tablename__ = "sketches"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    template_id = db.Column(
        db.String(64), db.ForeignKey("templates.id"), nullable=False, index=True
    )
    seq_index = db.Column(db.Integer, nullable=False, default=0)
    file_path = db.Column(db.String(512), nullable=False)  # lokasi fisik di server
    mime_type = db.Column(db.String(64), default="image/jpeg")
    size_bytes = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# §6.7  pet_board_masters  (BARU)
# ---------------------------------------------------------------------------
class PetBoardMaster(db.Model):
    __tablename__ = "pet_board_masters"
    code = db.Column(db.String(64), primary_key=True)
    size_label = db.Column(db.String(128), nullable=False)  # "120×240 cm"
    unit = db.Column(db.Enum(PetBoardUnit), nullable=False, default=PetBoardUnit.LEMBAR)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


# ---------------------------------------------------------------------------
# §6.8  pet_board_stock_ins  (BARU)
# ---------------------------------------------------------------------------
class PetBoardStockIn(db.Model):
    __tablename__ = "pet_board_stock_ins"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    board_code = db.Column(
        db.String(64),
        db.ForeignKey("pet_board_masters.code"),
        nullable=False,
        index=True,
    )
    qty = db.Column(db.Float, nullable=False, default=0)
    in_date = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    supplier = db.Column(db.String(255), nullable=True)
    note = db.Column(db.Text)
    created_by = db.Column(db.String(64), db.ForeignKey("users.username"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# §6.9  pet_board_stock_outs  (BARU)
# ---------------------------------------------------------------------------
class PetBoardStockOut(db.Model):
    __tablename__ = "pet_board_stock_outs"
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    board_code = db.Column(
        db.String(64),
        db.ForeignKey("pet_board_masters.code"),
        nullable=False,
        index=True,
    )
    qty = db.Column(db.Float, nullable=False, default=1)
    template_id = db.Column(
        db.String(64), db.ForeignKey("templates.id"), nullable=True, index=True
    )
    part_id = db.Column(
        db.String(64), db.ForeignKey("template_parts.part_id"), nullable=True
    )
    out_date = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    source = db.Column(
        db.Enum(PetBoardOutSource), nullable=False, default=PetBoardOutSource.TEMPLATE_AUTO
    )
    created_by = db.Column(db.String(64), db.ForeignKey("users.username"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


# ---------------------------------------------------------------------------
# §6.10  sync_actions_log  (Idempotency Ledger — Offline Outbox)
# ---------------------------------------------------------------------------
class SyncActionLog(db.Model):
    __tablename__ = "sync_actions_log"
    client_action_id = db.Column(db.String(64), primary_key=True)  # UUID dari client
    user_id = db.Column(
        db.String(64), db.ForeignKey("users.username"), nullable=True
    )
    action_type = db.Column(db.Enum(ActionType), nullable=False)
    status = db.Column(db.Enum(SyncActionStatus), nullable=False)
    result_ref_id = db.Column(db.String(64), nullable=True)
    payload_hash = db.Column(db.String(64), nullable=True)
    processed_at = db.Column(db.DateTime, default=datetime.utcnow)
