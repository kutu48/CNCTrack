from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class TemplateStatusEnum(str, Enum):
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    DAMAGED = "damaged"
    SCRAPPED = "scrapped"

class TemplateBase(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    part_number: Optional[str] = None
    customer: Optional[str] = None
    material: Optional[str] = None
    thickness: Optional[float] = None
    storage_id: Optional[int] = None
    position_in_storage: Optional[str] = None
    notes: Optional[str] = None

class TemplateCreate(TemplateBase):
    pass

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    part_number: Optional[str] = None
    customer: Optional[str] = None
    material: Optional[str] = None
    thickness: Optional[float] = None
    status: Optional[TemplateStatusEnum] = None
    storage_id: Optional[int] = None
    position_in_storage: Optional[str] = None
    notes: Optional[str] = None
    sketch_url: Optional[str] = None

class TemplateResponse(TemplateBase):
    id: int
    status: TemplateStatusEnum
    sketch_url: Optional[str] = None
    is_active: bool
    registered_by: Optional[int] = None
    storage_code: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TemplateScanResponse(BaseModel):
    template: TemplateResponse
    recent_movements: List[dict] = []
    storage_name: Optional[str] = None