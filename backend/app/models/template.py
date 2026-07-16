from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class TemplateStatus(str, enum.Enum):
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    DAMAGED = "damaged"
    SCRAPPED = "scrapped"

class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    part_number = Column(String(100), nullable=True, index=True)
    customer = Column(String(100), nullable=True)
    material = Column(String(100), nullable=True)
    thickness = Column(Float, nullable=True)
    status = Column(SQLEnum(TemplateStatus), default=TemplateStatus.AVAILABLE, nullable=False)
    storage_id = Column(Integer, ForeignKey("storages.id"), nullable=True)
    position_in_storage = Column(String(50), nullable=True)
    sketch_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    registered_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    storage = relationship("Storage", back_populates="templates")
    registerer = relationship("User", foreign_keys=[registered_by])
    movements = relationship("Movement", back_populates="template")
    parts = relationship("Part", back_populates="template")

    def __repr__(self):
        return f"<Template {self.code} - {self.name}>"