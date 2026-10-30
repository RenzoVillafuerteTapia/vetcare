import hashlib
import secrets


def generate_token() -> str:
    """Token opaco de 256 bits, seguro para URL."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    # Los tokens son aleatorios de alta entropía: SHA-256 basta (no hace falta un hash lento).
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
