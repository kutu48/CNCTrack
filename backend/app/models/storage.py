from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class StorageType(str, enum.Enum):
    RACK = "rack"
    CABINET = "cabinet"
    SHELF = "shelf"
    FLOOR = "floor"
    CUSTOM = "custom"

class Storage(Base):
    __tablename__ = "storages"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False)
    type = Column(SQLEnum(StorageType), default=StorageType.RACK, nullable=False)
    location = Column(String(200), nullable=True)
    capacity = Column(Integer, default=0, nullable=False)
    current_count = Column(Integer, default=0, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    templates = relationship("Template", back_populates="storage")
    parts = relationship("Part", back_populates="storage")

    def __repr__(self):
        return f"<Storage {self.code} - {self.name}>"