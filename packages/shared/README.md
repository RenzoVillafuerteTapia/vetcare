# @vetcare/shared

Contrato entre la API y sus clientes (web de administración y app móvil).

| Archivo | Qué es | ¿Se edita a mano? |
|---|---|---|
| `openapi.json` | Contrato OpenAPI exportado desde el código de `apps/api` | No |
| `src/schema.d.ts` | Tipos TypeScript generados desde `openapi.json` | No |
| `src/index.ts` | Cliente HTTP tipado (`openapi-fetch`) y utilidades para errores | Sí |

## Uso

```ts
import { createApiClient, fieldErrors, isProblemDetails } from "@vetcare/shared";

const api = createApiClient({
  baseUrl: "http://localhost:8000",
  getAccessToken: () => session.accessToken,
  credentials: "include", // solo en la web: envía la cookie del refresh token
});

const { data, error } = await api.POST("/api/v1/auth/login", {
  body: { email, password, client: "web" },
});
if (isProblemDetails(error) && error.status === 422) {
  const porCampo = fieldErrors(error); // { password: ["Debe tener al menos 10 caracteres."] }
}
```

Las rutas, los cuerpos y las respuestas se comprueban en tiempo de compilación: si la API cambia
un campo, la web y la app dejan de compilar hasta adaptarse.

## Actualizar después de cambiar la API

```bash
bash scripts/update-contracts.sh
```

El script exporta el contrato desde el contenedor de la API y regenera los tipos. Commitea
`openapi.json` y `src/schema.d.ts` en el mismo PR que el cambio de la API. El workflow
`Contratos` falla si los archivos versionados no coinciden con el código.

## Comandos

```bash
npm run generate  --workspace @vetcare/shared   # tipos desde openapi.json
npm run typecheck --workspace @vetcare/shared
npm test          --workspace @vetcare/shared
```
