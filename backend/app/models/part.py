from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Float, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class PartStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    DAMAGED = "damaged"

class Part(Base):
    """
    Sub-part or komponen yang terkait dengan sebuah template.
    Satu template dapat memiliki banyak part (e.g., insert, holder, bushing).
    """
    __tablename__ = "parts"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, nullable=False, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=True)
    storage_id = Column(Integer, ForeignKey("storages.id"), nullable=True)
    quantity = Column(Integer, default=1, nullable=False)
    unit = Column(String(20), default="pcs", nullable=False)
    material = Column(String(100), nullable=True)
    weight_kg = Column(Float, nullable=True)
    status = Column(SQLEnum(PartStatus), default=PartStatus.ACTIVE, nullable=False)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    registered_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    template = relationship("Template", back_populates="parts")
    storage = relationship("Storage", back_populates="parts")
    registerer = relationship("User", foreign_keys=[registered_by])

    def __repr__(self):
        return f"<Part {self.code} - {self.name}>"