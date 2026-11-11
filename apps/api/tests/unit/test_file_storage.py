from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import boto3
import pytest
from botocore.config import Config
from botocore.stub import Stubber
from pydantic import SecretStr

from vetcare.platform.settings import Environment, Settings, StorageBackend
from vetcare.platform.storage import LocalFileStorage, S3FileStorage, build_file_storage

CLAVE = "pets/0192f0a4-0000-7000-8000-000000000001/0192f0a4-0000-7000-8000-000000000002.jpg"
CINCO_MINUTOS = timedelta(minutes=5)


@dataclass
class Reloj:
    ahora: datetime = datetime(2026, 11, 11, 15, 0, tzinfo=UTC)

    def now(self) -> datetime:
        return self.ahora


def almacen(tmp_path: Path, reloj: Reloj, secreto: bytes = b"s" * 32) -> LocalFileStorage:
    return LocalFileStorage(tmp_path, "https://api.example.test/api/v1/files", secreto, reloj)


def firma(url: str) -> tuple[str, int, str]:
    partes = urlsplit(url)
    query = parse_qs(partes.query)
    clave = partes.path.removeprefix("/api/v1/files/")
    return clave, int(query["expires"][0]), query["signature"][0]


# --- Disco ----------------------------------------------------------------------------------


async def test_la_url_firmada_devuelve_el_archivo_con_su_tipo(tmp_path: Path) -> None:
    reloj = Reloj()
    storage = almacen(tmp_path, reloj)
    await storage.save(CLAVE, b"contenido", "image/jpeg")

    url = await storage.signed_url(CLAVE, CINCO_MINUTOS)
    clave, expira, sello = firma(url)

    assert url.startswith(f"https://api.example.test/api/v1/files/{CLAVE}?")
    assert expira == int((reloj.ahora + CINCO_MINUTOS).timestamp())
    assert await storage.read(clave, expira, sello) == (b"contenido", "image/jpeg")


async def test_la_url_vence_a_los_cinco_minutos(tmp_path: Path) -> None:
    reloj = Reloj()
    storage = almacen(tmp_path, reloj)
    await storage.save(CLAVE, b"contenido", "image/jpeg")
    clave, expira, sello = firma(await storage.signed_url(CLAVE, CINCO_MINUTOS))

    reloj.ahora += timedelta(minutes=4, seconds=59)
    assert await storage.read(clave, expira, sello) is not None

    reloj.ahora += timedelta(seconds=2)
    assert await storage.read(clave, expira, sello) is None


async def test_no_se_puede_alargar_el_vencimiento_ni_cambiar_de_archivo(tmp_path: Path) -> None:
    storage = almacen(tmp_path, Reloj())
    otra = CLAVE.replace("0002.jpg", "0003.jpg")
    await storage.save(CLAVE, b"uno", "image/jpeg")
    await storage.save(otra, b"dos", "image/jpeg")
    clave, expira, sello = firma(await storage.signed_url(CLAVE, CINCO_MINUTOS))

    assert await storage.read(clave, expira + 3600, sello) is None
    assert await storage.read(otra, expira, sello) is None
    assert await storage.read(clave, expira, "0" * 64) is None


async def test_una_firma_hecha_con_otra_clave_secreta_no_vale(tmp_path: Path) -> None:
    reloj = Reloj()
    storage = almacen(tmp_path, reloj)
    await storage.save(CLAVE, b"contenido", "image/jpeg")
    ajena = almacen(tmp_path, reloj, secreto=b"x" * 32)

    clave, expira, sello = firma(await ajena.signed_url(CLAVE, CINCO_MINUTOS))

    assert await storage.read(clave, expira, sello) is None


async def test_borrar_quita_el_archivo_y_no_falla_si_ya_no_esta(tmp_path: Path) -> None:
    storage = almacen(tmp_path, Reloj())
    await storage.save(CLAVE, b"contenido", "image/jpeg")
    clave, expira, sello = firma(await storage.signed_url(CLAVE, CINCO_MINUTOS))

    await storage.delete(CLAVE)
    await storage.delete(CLAVE)

    assert await storage.read(clave, expira, sello) is None


@pytest.mark.parametrize(
    "clave",
    ["../secreto.jpg", "/etc/passwd", "pets/../../x.jpg", "pets/Luna Pérez.jpg", "pets\\x.jpg", ""],
)
async def test_rechaza_claves_que_salen_de_la_carpeta_o_llevan_nombres(
    tmp_path: Path, clave: str
) -> None:
    storage = almacen(tmp_path, Reloj())

    with pytest.raises(ValueError, match="inválida"):
        await storage.save(clave, b"x", "image/jpeg")
    with pytest.raises(ValueError, match="inválida"):
        await storage.signed_url(clave, CINCO_MINUTOS)
    assert await storage.read(clave, 9999999999, "0" * 64) is None


# --- S3 -------------------------------------------------------------------------------------


def cliente_s3() -> object:
    # Credenciales falsas: firmar una URL y el Stubber no hacen llamadas de red.
    return boto3.client(
        "s3",
        region_name="us-east-1",
        aws_access_key_id="AKIAEXAMPLE",
        aws_secret_access_key="secreto-de-prueba",
        config=Config(signature_version="s3v4"),
    )


async def test_s3_guarda_cifrado_con_su_tipo_y_borra() -> None:
    client = cliente_s3()
    storage = S3FileStorage("vetcare-privado", client)

    with Stubber(client) as stub:
        stub.add_response(
            "put_object",
            {},
            {
                "Bucket": "vetcare-privado",
                "Key": CLAVE,
                "Body": b"contenido",
                "ContentType": "image/jpeg",
                "ServerSideEncryption": "AES256",
            },
        )
        stub.add_response("delete_object", {}, {"Bucket": "vetcare-privado", "Key": CLAVE})

        await storage.save(CLAVE, b"contenido", "image/jpeg")
        await storage.delete(CLAVE)

        stub.assert_no_pending_responses()


async def test_s3_firma_una_url_de_lectura_de_cinco_minutos() -> None:
    storage = S3FileStorage("vetcare-privado", cliente_s3())

    url = await storage.signed_url(CLAVE, CINCO_MINUTOS)
    query = parse_qs(urlsplit(url).query)

    assert urlsplit(url).path.endswith(CLAVE)
    assert "vetcare-privado" in url
    assert query["X-Amz-Expires"] == ["300"]
    assert query["response-content-disposition"] == ["inline"]
    assert "X-Amz-Signature" in query


async def test_s3_rechaza_claves_con_nombres() -> None:
    storage = S3FileStorage("vetcare-privado", cliente_s3())

    with pytest.raises(ValueError, match="inválida"):
        await storage.save("pets/Luna Pérez.jpg", b"x", "image/jpeg")


# --- Elección del adaptador -----------------------------------------------------------------


def test_por_defecto_se_usa_el_disco(tmp_path: Path) -> None:
    settings = Settings(
        environment=Environment.LOCAL,
        jwt_secret=SecretStr("clave-de-firma-solo-para-pruebas-0123456789"),
        storage_local_dir=tmp_path,
    )

    assert isinstance(build_file_storage(settings), LocalFileStorage)


def test_produccion_exige_s3_y_s3_exige_un_bucket(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="S3"):
        build_file_storage(Settings(environment=Environment.PRODUCTION))
    with pytest.raises(RuntimeError, match="BUCKET"):
        build_file_storage(Settings(storage_backend=StorageBackend.S3))


def test_con_s3_configurado_se_usa_el_bucket(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "AKIAEXAMPLE")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "secreto-de-prueba")
    settings = Settings(
        environment=Environment.PRODUCTION,
        storage_backend=StorageBackend.S3,
        storage_s3_bucket="vetcare-privado",
        storage_s3_region="us-east-1",
    )

    assert isinstance(build_file_storage(settings), S3FileStorage)
