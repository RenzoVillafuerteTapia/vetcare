"""Comandos de administración.

    python -m vetcare.cli create-admin --email admin@ejemplo.pe --name "Nombre Apellido"

``create-admin`` solo funciona en una instalación sin usuarios: crea la invitación del primer
administrador y envía el enlace de activación por el proveedor de correo configurado.
"""

import argparse
import asyncio
import sys

from vetcare.contexts.identity.infrastructure.composition import build_identity_service
from vetcare.platform.db import create_engine, create_session_factory
from vetcare.platform.settings import Settings
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="vetcare")
    commands = parser.add_subparsers(dest="command", required=True)
    create_admin = commands.add_parser("create-admin", help="Invitar al primer administrador")
    create_admin.add_argument("--email", required=True)
    create_admin.add_argument("--name", required=True)
    args = parser.parse_args(argv)
    if args.command == "create-admin":
        return asyncio.run(_create_admin(args.email, args.name))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
