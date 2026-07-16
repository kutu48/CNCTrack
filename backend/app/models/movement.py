from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class MovementType(str, enum.Enum):
    DISTRIBUTE = "distribute"
    RETURN = "return"
    MAINTENANCE_IN = "maintenance_in"
    MAINTENANCE_OUT = "maintenance_out"
    SCRAP = "scrap"

class Movement(Base):
    __tablename__ = "movements"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    type = Column(SQLEnum(MovementType), nullable=False)
    
    # User who performs the action (Operator/Admin)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Destination/Source Details
    machine_number = Column(String(50), nullable=True) # e.g. "CNC-01"
    work_order = Column(String(100), nullable=True)
    operator_name = Column(String(100), nullable=True) # If operator doesn't have an account
    
    # From/To Storage tracking
    from_storage_id = Column(Integer, ForeignKey("storages.id"), nullable=True)
    to_storage_id = Column(Integer, ForeignKey("storages.id"), nullable=True)
    
    notes = Column(Text, nullable=True)
    sync_status = Column(String(20), default="synced", nullable=False) # pending, syncing, synced, error
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Relationships
    template = relationship("Template", back_populates="movements")
    actor = relationship("User", foreign_keys=[actor_id])
    from_storage = relationship("Storage", foreign_keys=[from_storage_id])
    to_storage = relationship("Storage", foreign_keys=[to_storage_id])

    def __repr__(self):
        return f"<Movement {self.type.value} - Template {self.template_id}>"