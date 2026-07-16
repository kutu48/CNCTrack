from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class StorageTypeEnum(str, Enum):
    RACK = "rack"
    CABINET = "cabinet"
    SHELF = "shelf"
    FLOOR = "floor"
    CUSTOM = "custom"

class StorageBase(BaseModel):
    code: str = Field(..., max_length=20)
    name: str = Field(..., max_length=100)
    type: StorageTypeEnum = StorageTypeEnum.RACK
    location: Optional[str] = None
    capacity: int = 0
    description: Optional[str] = None

class StorageCreate(StorageBase):
    pass

class StorageUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[StorageTypeEnum] = None
    location: Optional[str] = None
    capacity: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class StorageResponse(StorageBase):
    id: int
    current_count: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class MovementRequest(BaseModel):
    template_id: int
    type: str  # distribute, return, maintenance_in, maintenance_out, scrap
    machine_number: Optional[str] = None
    work_order: Optional[str] = None
    operator_name: Optional[str] = None
    to_storage_id: Optional[int] = None
    notes: Optional[str] = None

class MovementResponse(BaseModel):
    id: int
    template_id: int
    type: str
    actor_id: int
    machine_number: Optional[str] = None
    work_order: Optional[str] = None
    operator_name: Optional[str] = None
    from_storage_id: Optional[int] = None
    to_storage_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True