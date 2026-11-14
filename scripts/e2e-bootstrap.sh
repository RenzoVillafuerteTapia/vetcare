#!/usr/bin/env bash
# Deja la API de docker compose lista para los recorridos E2E de la web: migraciones, la sede
# ficticia y un administrador activo con las credenciales de E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
#
# Pensado para una base recién creada (así corre en el CI). Si la instalación ya tiene usuarios,
# no crea otro administrador: usa en E2E_ADMIN_* las credenciales de uno que ya exista.
#
#   docker compose up -d
#   E2E_ADMIN_EMAIL=admin@vetcare.test E2E_ADMIN_PASSWORD='…' bash scripts/e2e-bootstrap.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${E2E_ADMIN_EMAIL:?define E2E_ADMIN_EMAIL}"
: "${E2E_ADMIN_PASSWORD:?define E2E_ADMIN_PASSWORD (10 caracteres o más, no una clave común)}"
api_url="${E2E_API_URL:-http://localhost:8000}"

echo "› Esperando a la API en ${api_url}…"
for _ in $(seq 1 60); do
  if curl -fs -o /dev/null "${api_url}/api/v1/health/ready"; then break; fi
  sleep 2
done
curl -fsS -o /dev/null "${api_url}/api/v1/health/ready" || { echo "La API no respondió." >&2; exit 1; }

docker compose exec -T api alembic upgrade head
docker compose exec -T api python -m vetcare.cli seed-clinic

# En desarrollo el "correo" de invitación se escribe en la salida: de ahí sale el enlace.
if salida=$(docker compose exec -T api python -m vetcare.cli create-admin \
    --email "$E2E_ADMIN_EMAIL" --name "Admin E2E" 2>&1); then
  token=$(printf '%s' "$salida" | grep -oE '#token=[A-Za-z0-9_-]+' | head -n1 | cut -d= -f2)
  [ -n "$token" ] || { echo "No se encontró el enlace de activación." >&2; exit 1; }
  # La clave va por la entrada estándar, no en la línea de comandos.
  printf '{"token":"%s","password":"%s"}' "$token" "$E2E_ADMIN_PASSWORD" |
    curl -fsS -o /dev/null -X POST "${api_url}/api/v1/auth/invitations/accept" \
      -H "Content-Type: application/json" --data-binary @-
  echo "✓ Administrador de pruebas creado y activado."
else
  echo "› No se creó un administrador (la instalación ya tiene usuarios): se usa el de E2E_ADMIN_*."
fi
echo "✓ Listo. Ejecuta: npm run e2e --workspace @vetcare/web"
