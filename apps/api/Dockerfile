FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

RUN useradd --create-home --uid 10001 vetcare

COPY pyproject.toml ./
COPY src ./src

# Desarrollo: incluye herramientas de prueba y calidad; el código se monta como volumen.
FROM base AS dev
COPY tests ./tests
RUN pip install -e ".[dev]"
USER vetcare
CMD ["uvicorn", "vetcare.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload", "--app-dir", "src"]

# Producción: solo dependencias de ejecución.
FROM base AS prod
RUN pip install .
USER vetcare
EXPOSE 8000
CMD ["uvicorn", "vetcare.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
