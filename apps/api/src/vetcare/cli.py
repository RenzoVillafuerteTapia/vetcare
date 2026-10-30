"""Comandos de administración.

    python -m vetcare.cli create-admin --email admin@ejemplo.pe --name "Nombre Apellido"
    python -m vetcare.cli export-openapi ../../packages/shared/openapi.json

``create-admin`` solo funciona en una instalación sin usuarios: crea la invitación del primer
administrador y envía el enlace de activación por el proveedor de correo configurado.

``export-openapi`` escribe el contrato OpenAPI sin base de datos ni secretos: no depende del
entorno, así que el CI puede comparar el archivo versionado con el que genera el código.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from vetcare.contexts.identity.infrastructure.composition import build_identity_service
from vetcare.main import create_app
from vetcare.platform.db import create_engine, create_session_factory
from vetcare.platform.settings import Environment, Settings
from vetcare.shared_kernel.errors import DomainError


async def _create_admin(email: str, name: str) -> int:
    settings = Settings()
    if settings.database_url is None:
        print("Define VETCARE_DATABASE_URL.", file=sys.stderr)
        return 2
    engine = create_engine(settings.database_url.get_secret_value())
    try:
        service = build_identity_service(settings, create_session_factory(engine))
        user = await service.invite_first_admin(email, name)
    except DomainError as error:
        print(error.message, file=sys.stderr)
        return 1
    finally:
        await engine.dispose()
    print(f"Invitación enviada a {user.email}. Revisa el correo para activar la cuenta.")
    return 0


def _export_openapi(destination: Path) -> int:
    settings = Settings(
        environment=Environment.TEST, database_url=None, jwt_secret=None, cors_origins=[]
    )
    document = create_app(settings).openapi()
    destination.write_text(
        json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Contrato OpenAPI escrito en {destination}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="vetcare")
    commands = parser.add_subparsers(dest="command", required=True)
    create_admin = commands.add_parser("create-admin", help="Invitar al primer administrador")
    create_admin.add_argument("--email", required=True)
    create_admin.add_argument("--name", required=True)
    export_openapi = commands.add_parser("export-openapi", help="Escribir el contrato OpenAPI")
    export_openapi.add_argument("destination", type=Path)
    args = parser.parse_args(argv)
    if args.command == "create-admin":
        return asyncio.run(_create_admin(args.email, args.name))
    if args.command == "export-openapi":
        return _export_openapi(args.destination)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
