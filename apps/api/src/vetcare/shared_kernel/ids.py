import os
import time
import uuid


def new_id() -> uuid.UUID:
    """Genera un UUID v7 (RFC 9562): ordenable por tiempo, útil como clave primaria.

    Python 3.12 no incluye ``uuid.uuid7``; esta implementación sigue el formato del RFC.
    """
    timestamp_ms = time.time_ns() // 1_000_000
    rand = int.from_bytes(os.urandom(10), "big")
    rand_a = rand >> 62 & 0xFFF
    rand_b = rand & ((1 << 62) - 1)
    value = (timestamp_ms & ((1 << 48) - 1)) << 80
    value |= 0x7 << 76
    value |= rand_a << 64
    value |= 0b10 << 62
    value |= rand_b
    return uuid.UUID(int=value)
