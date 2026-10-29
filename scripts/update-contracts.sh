#!/usr/bin/env bash
# Regenera el contrato OpenAPI y los tipos de packages/shared después de cambiar la API.
# Requiere Docker (para exportar desde el contenedor de la API) y haber corrido `npm install`.
set -euo pipefail
cd "$(dirname "$0")/.."

shared_dir="$(pwd)/packages/shared"
if command -v cygpath >/dev/null 2>&1; then
  shared_dir="$(cygpath -m "$shared_dir")"   # Git Bash en Windows
fi

MSYS_NO_PATHCONV=1 docker compose run --rm --no-deps \
  -v "${shared_dir}:/shared" api python -m vetcare.cli export-openapi /shared/openapi.json
npm run contracts:generate
echo "✓ Contrato y tipos actualizados. Revisa el diff de packages/shared antes de commitear."
