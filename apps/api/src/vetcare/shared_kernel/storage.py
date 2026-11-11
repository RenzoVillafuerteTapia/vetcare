from datetime import timedelta
from typing import Protocol


class FileStorage(Protocol):
    """Almacén privado de archivos (fotos, documentos).

    Nada es público: un archivo solo se lee con una URL firmada de corta duración, que el
    contexto dueño del dato entrega después de verificar el acceso. Las claves las elige ese
    contexto y no llevan nombres ni datos personales.
    """

    async def save(self, key: str, content: bytes, content_type: str) -> None: ...

    async def delete(self, key: str) -> None:
        """Borra el archivo. No falla si ya no existe."""
        ...

    async def signed_url(self, key: str, ttl: timedelta) -> str: ...
