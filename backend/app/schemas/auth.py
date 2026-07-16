from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class RoleEnum(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"
    ENGINEER = "engineer"
    VIEWER = "viewer"

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    full_name: str = Field(..., min_length=1, max_length=100)
    email: Optional[str] = None
    role: RoleEnum = RoleEnum.OPERATOR

class UserCreate(UserBase):
    password: str = Field(..., min_length=6)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    photo_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse

class RefreshRequest(BaseModel):
    refresh_token: str