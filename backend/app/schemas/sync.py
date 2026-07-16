from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime

class SyncRecord(BaseModel):
    table: str
    action: str  # create, update, delete
    data: dict
    local_id: Optional[str] = None
    timestamp: datetime

class SyncPushRequest(BaseModel):
    device_id: str
    records: List[SyncRecord]
    last_sync_at: Optional[datetime] = None

class SyncPullRequest(BaseModel):
    device_id: str
    last_sync_at: Optional[datetime] = None

class SyncResponse(BaseModel):
    status: str  # success, partial_success, failed
    synced_count: int
    failed_records: List[dict] = []
    server_time: datetime
    data: Optional[dict] = None