# apps/mobile

App para dueños y responsables de mascotas (React Native + Expo + TypeScript, Android e iOS).

> Estado: **base de la aplicación.** Tiene inicio de sesión, recuperación de sesión al abrir la
> app, cierre de sesión, solicitud de recuperación de contraseña y un inicio con los módulos que
> llegan en las fases 2 a 4. Las mascotas, citas y el seguimiento en vivo se agregan con sus
> endpoints.

## Ejecutar

```bash
npm install                                  # en la raíz del monorepo (workspaces)
docker compose up -d                         # la API en http://localhost:8000
cp apps/mobile/.env.example apps/mobile/.env.local
npm run mobile:start                         # Expo: abre en Expo Go, emulador o simulador
```

`EXPO_PUBLIC_API_URL` depende de dónde corre la app (ver `.env.example`): `localhost` en el
simulador de iOS, `10.0.2.2` en el emulador de Android y la IP de tu computadora en un teléfono
físico. En un teléfono, la API debe escuchar en la red local (docker compose publica el puerto
8000 en todas las interfaces).

Las cuentas de cliente se crean por invitación desde la web de administración. El enlace del
correo abre la web, donde la persona elige su contraseña, y luego ingresa en la app.

## Estructura

```
app/                rutas de Expo Router
├── _layout.tsx     fuentes, proveedores y rutas protegidas según la sesión
├── login.tsx
├── recuperar-contrasena.tsx
└── (app)/          rutas que requieren sesión
src/
├── components/     componentes del sistema de diseño (ui.tsx)
├── session/        sesión, almacenamiento seguro del refresh token
├── lib/            errores de la API, entorno, cliente de TanStack Query
├── theme/          tokens de diseño (los mismos de la web, en hex)
└── test/           API simulada y pruebas de pantallas
```

## Sesión

- El **access token** vive solo en memoria.
- El **refresh token** se guarda en **Expo SecureStore** (Keychain en iOS, Keystore en Android),
  accesible solo con el dispositivo desbloqueado y sin respaldo a otros dispositivos.
- Al abrir la app se recupera la sesión con el refresh token guardado. El access token se renueva
  un minuto antes de vencer, y un 401 en cualquier consulta intenta renovarlo una vez.
- Las renovaciones se serializan y el token rotado se guarda antes de seguir: si se reutilizara
  un refresh token ya rotado, la API cerraría la sesión.
- **La app es solo para el rol cliente.** Una cuenta del personal que inicia sesión aquí recibe un
  mensaje que la envía a la web, y la sesión que abrió se revoca.

## Diseño

Sigue [docs/design/README.md](../../docs/design/README.md): Fredoka y Nunito
(`@expo-google-fonts`, empaquetadas con la app), botones y etiquetas tipo píldora, esquinas
amplias, panel de marca verde azulado y tarjeta destacada oscura. Los colores son los mismos tokens
de la web convertidos a hex (`src/theme/tokens.ts`).

## Comandos

```bash
npm run lint         --workspace @vetcare/mobile
npm run format:check --workspace @vetcare/mobile
npm run typecheck    --workspace @vetcare/mobile
npm test             --workspace @vetcare/mobile
```

### Pruebas

- `src/session/session.test.ts`: la sesión con un almacén en memoria y la API simulada.
- `src/test/screens/*.test.tsx`: la app completa con sus rutas reales (`renderRouter`) y la API
  simulada. Expo Router conserva estado global entre montajes de un mismo archivo, por eso cada
  escenario vive en su propio archivo.
