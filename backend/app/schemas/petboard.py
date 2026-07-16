from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class PetBoardStatusEnum(str, Enum):
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    DAMAGED = "damaged"

class PetBoardBase(BaseModel):
    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=200)
    description: Optional[str] = None

class PetBoardCreate(PetBoardBase):
    pass

class PetBoardUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[PetBoardStatusEnum] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None

class PetBoardResponse(PetBoardBase):
    id: int
    status: PetBoardStatusEnum
    is_active: bool
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True