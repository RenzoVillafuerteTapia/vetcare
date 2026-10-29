from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from vetcare.contexts.identity.api import router as identity
from vetcare.contexts.identity.infrastructure.composition import build_identity_service
from vetcare.platform import health
from vetcare.platform.db import create_engine, create_session_factory
from vetcare.platform.errors import register_error_handlers
from vetcare.platform.rate_limit import FixedWindowRateLimiter
from vetcare.platform.settings import Settings, get_settings

API_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        if app.state.engine is not None:
            await app.state.engine.dispose()

    app = FastAPI(
        title="VetCare API",
        version="0.0.0",
        docs_url="/api/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    # El engine no abre conexiones hasta el primer uso, así que crearlo aquí es seguro.
    app.state.engine = (
        create_engine(settings.database_url.get_secret_value()) if settings.database_url else None
    )
    app.state.session_factory = (
        create_session_factory(app.state.engine) if app.state.engine is not None else None
    )
    app.state.settings = settings
    app.state.rate_limiter = FixedWindowRateLimiter()
    app.state.identity = (
        build_identity_service(settings, app.state.session_factory)
        if app.state.session_factory is not None and settings.jwt_secret is not None
        else None
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        )
    register_error_handlers(app)
    app.include_router(health.router, prefix=API_PREFIX)
    app.include_router(identity.auth, prefix=API_PREFIX)
    app.include_router(identity.users, prefix=API_PREFIX)
    return app


app = create_app()
