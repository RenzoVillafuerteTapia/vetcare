"""Adaptadores del puerto ``FileStorage``: disco (desarrollo y pruebas) y S3 privado (producción).

En disco, la URL firmada apunta a esta misma API (``/api/v1/files/...``) y lleva un vencimiento
y una firma HMAC. En S3 es una URL prefirmada del bucket, que no tiene acceso público.
"""

import asyncio
import hashlib
import hmac
import re
import secrets
from datetime import timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response

from vetcare.platform.settings import Environment, Settings, StorageBackend
from vetcare.shared_kernel.clock import Clock, SystemClock
from vetcare.shared_kernel.storage import FileStorage

FILES_PATH = "/files"

# Solo minúsculas, dígitos y guiones: sin "..", sin rutas absolutas y sin nombres de usuario.
_KEY = re.compile(r"[a-z0-9-]+(/[a-z0-9-]+)*\.[a-z0-9]+")

_CONTENT_TYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "pdf": "application/pdf",
}


def _check_key(key: str) -> None:
    if not _KEY.fullmatch(key):
        raise ValueError("Clave de archivo inválida.")


class LocalFileStorage:
    """Guarda los archivos en una carpeta del servidor. Solo para desarrollo y pruebas."""

    def __init__(self, root: Path, base_url: str, secret: bytes, clock: Clock) -> None:
        self._root = root
        self._base_url = base_url.rstrip("/")
        self._secret = secret
        self._clock = clock

    async def save(self, key: str, content: bytes, content_type: str) -> None:
        path = self._path(key)

        def write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)

        await asyncio.to_thread(write)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._path(key).unlink, missing_ok=True)

    async def signed_url(self, key: str, ttl: timedelta) -> str:
        _check_key(key)
        expires = int((self._clock.now() + ttl).timestamp())
        return f"{self._base_url}/{key}?expires={expires}&signature={self._sign(key, expires)}"

    async def read(self, key: str, expires: int, signature: str) -> tuple[bytes, str] | None:
        """Contenido y tipo del archivo, o None si la firma no vale, venció o ya no existe."""
        if not _KEY.fullmatch(key):
            return None
        if not hmac.compare_digest(self._sign(key, expires), signature):
            return None
        if expires < self._clock.now().timestamp():
            return None
        path = self._path(key)
        try:
            content = await asyncio.to_thread(path.read_bytes)
        except FileNotFoundError:
            return None
        extension = key.rsplit(".", 1)[-1]
        return content, _CONTENT_TYPES.get(extension, "application/octet-stream")

    def router(self) -> APIRouter:
        router = APIRouter()

        @router.get(FILES_PATH + "/{key:path}", include_in_schema=False)
        async def download(
            key: str,
            expires: int = Query(),
            signature: str = Query(max_length=64),
        ) -> Response:
            found = await self.read(key, expires, signature)
            if found is None:
                # La misma respuesta para firma inválida, vencida o archivo inexistente.
                raise HTTPException(status_code=403)
            content, content_type = found
            return Response(
                content,
                media_type=content_type,
                headers={
                    "Content-Disposition": "inline",
                    "Cache-Control": "private, max-age=300",
                    "X-Content-Type-Options": "nosniff",
                },
            )

        return router

    def _path(self, key: str) -> Path:
        _check_key(key)
        return self._root / key

    def _sign(self, key: str, expires: int) -> str:
        message = f"{key}\n{expires}".encode()
        return hmac.new(self._secret, message, hashlib.sha256).hexdigest()


class S3FileStorage:
    """Bucket S3 privado. Las credenciales salen de la cadena estándar de AWS (rol de la
    instancia o variables de entorno), nunca de la configuración de la aplicación."""

    def __init__(self, bucket: str, client: Any) -> None:
        self._bucket = bucket
        self._client = client

    async def save(self, key: str, content: bytes, content_type: str) -> None:
        _check_key(key)
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self._bucket,
            Key=key,
            Body=content,
            ContentType=content_type,
            ServerSideEncryption="AES256",
        )

    async def delete(self, key: str) -> None:
        _check_key(key)
        await asyncio.to_thread(self._client.delete_object, Bucket=self._bucket, Key=key)

    async def signed_url(self, key: str, ttl: timedelta) -> str:
        _check_key(key)
        url: str = await asyncio.to_thread(
            self._client.generate_presigned_url,
            "get_object",
            Params={
                "Bucket": self._bucket,
                "Key": key,
                "ResponseContentDisposition": "inline",
            },
            ExpiresIn=int(ttl.total_seconds()),
        )
        return url


def s3_client(region: str | None) -> Any:
    # Import diferido: en desarrollo y pruebas con disco no hace falta cargar boto3.
    import boto3
    from botocore.config import Config

    return boto3.client("s3", region_name=region, config=Config(signature_version="s3v4"))


def build_file_storage(settings: Settings, clock: Clock | None = None) -> FileStorage:
    if settings.storage_backend is StorageBackend.S3:
        if not settings.storage_s3_bucket:
            raise RuntimeError("Define VETCARE_STORAGE_S3_BUCKET para usar el almacenamiento S3.")
        return S3FileStorage(settings.storage_s3_bucket, s3_client(settings.storage_s3_region))
    if settings.environment is Environment.PRODUCTION:
        raise RuntimeError("En producción los archivos van a S3: usa VETCARE_STORAGE_BACKEND=s3.")
    # Clave de firma propia, derivada de la de los tokens. Sin ella (API sin autenticación) se
    # usa una aleatoria: las URLs dejan de valer al reiniciar.
    secret = (
        hmac.new(
            settings.jwt_secret.get_secret_value().encode(), b"file-storage", hashlib.sha256
        ).digest()
        if settings.jwt_secret
        else secrets.token_bytes(32)
    )
    return LocalFileStorage(
        root=settings.storage_local_dir,
        base_url=f"{settings.public_api_url.rstrip('/')}/api/v1{FILES_PATH}",
        secret=secret,
        clock=clock or SystemClock(),
    )
