"""
Shared utility functions
"""
import hashlib
from datetime import datetime, timedelta


def gen_id(prefix: str) -> str:
    """Generate IDs matching the client-side pattern: TPL-<ts>-<rand>"""
    import time
    import random
    import string

    ts = format(int(time.time() * 1000), "X")
    rand = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"{prefix}-{ts}-{rand}"


def normalize(v) -> str:
    """Uppercase + collapse whitespace — matches norm_() in GAS backend"""
    return str(v or "").strip().replace("  ", " ").upper()


def parts_key(parts) -> str:
    """
    Anti-duplicate key: sorted "PART[SIZE]#QTY" joined by '|'
    Mirrors partsKey_() in GAS backend (PRD §8)
    """
    normalized = []
    for p in parts:
        part = normalize(p.get("part", ""))
        size = normalize(p.get("size", ""))
        qty = int(p.get("qty", 1) or 1)
        normalized.append(f"{part}[{size}]#{qty}")
    return "|".join(sorted(normalized))


def payload_hash(payload) -> str:
    """SHA-256 hash for idempotency ledger (§6.10)"""
    import json

    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def dt_to_iso(dt) -> str:
    if dt is None:
        return None
    if isinstance(dt, datetime):
        return dt.isoformat()
    return str(dt)


def parse_since(since_str):
    """Parse ?since= ISO timestamp for incremental sync (§8)"""
    if not since_str:
        return None
    try:
        return datetime.fromisoformat(since_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
