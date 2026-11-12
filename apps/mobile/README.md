# apps/mobile

App para dueños y responsables de mascotas (React Native + Expo + TypeScript, Android e iOS).

> Estado: **mascotas y citas.** Además del inicio de sesión, la recuperación de sesión al abrir
> la app y la recuperación de contraseña, muestra las mascotas vinculadas con su perfil y la
> próxima cita, y permite ver, solicitar, reprogramar y cancelar citas. El seguimiento en vivo
> llega en la fase 3.

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
    ├── index.tsx               inicio: próxima cita y mascotas
    ├── mascotas/[petId].tsx    perfil de la mascota
    └── citas/                  listado, detalle, nueva y reprogramar/[id]
src/
├── components/     componentes del sistema de diseño (ui.tsx), citas y mascotas
├── session/        sesión, almacenamiento seguro del refresh token
├── lib/            errores de la API, entorno, TanStack Query, hora de la sede, reglas de citas
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

## Mascotas y citas

- Las horas se muestran siempre en la hora de la sede (America/Lima), sin depender de la zona
  del teléfono ni de los datos de `Intl` del motor (`src/lib/time.ts`).
- La app solo ve lo que la API le entrega: las mascotas donde el cliente tiene una tutela activa
  y, de ellas, las alergias solo si su tutela permite ver información clínica.
- Al solicitar o reprogramar solo se ofrecen los horarios libres que informa la API, para los
  próximos 14 días. Si el horario se ocupa mientras se elige, la API responde 409 y se vuelven a
  pedir los libres. Cada solicitud lleva una `Idempotency-Key`: reintentar no la duplica.
- Una cita confirmada se reprograma o cancela con al menos 2 horas de anticipación; una
  reprogramación vuelve a quedar por confirmar. La app oculta las acciones fuera de plazo, pero
  la API decide: si rechaza algo (por ejemplo, una tutela sin permiso para reservar), se muestra
  su mensaje.

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
- `fireEvent` de React Native Testing Library 14 es asíncrono: en las pruebas nuevas se espera
  (`await fireEvent.press(...)`). Sin `await`, dos acciones seguidas se solapan y React puede
  descartar la actualización de la pantalla.
- Las pruebas abren la app en el inicio y navegan con `goTo` (`src/test/render-app.tsx`). Abrir
  la app directamente en una ruta protegida antes de recuperar la sesión no funciona todavía;
  hará falta para los enlaces de las notificaciones (fase 3).
- `renderApp(handlers, "/", { now })` fija la hora del reloj falso para las reglas de fechas.
