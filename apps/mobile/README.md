# apps/mobile

App para dueños y responsables de mascotas (React Native + Expo + TypeScript, Android e iOS).

> Estado: **navegación por pestañas.** Una barra inferior con cinco destinos (Inicio, Mascotas,
> Citas, Clínica y Cuenta). Mascotas con su perfil dividido en secciones y la foto que sube el
> dueño (cámara o galería); citas próximas e historial, solicitud en tres pasos, reprogramación
> y cancelación; horario y servicios de la sede; datos de contacto y cambio de contraseña. El
> seguimiento en vivo llega en la fase 3.

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

En el emulador de Android conviene usar `http://localhost:8000` y redirigir el puerto con
`adb reverse tcp:8000 tcp:8000`: así también cargan las fotos, cuyas URLs firmadas apuntan a
`localhost` (el `VETCARE_PUBLIC_API_URL` de la API).

Las cuentas de cliente se crean por invitación desde la web de administración. El enlace del
correo abre la web, donde la persona elige su contraseña, y luego ingresa en la app.

## Seguimiento en vivo

Cuando la veterinaria inicia el seguimiento de una cita (baño, cirugía u otra atención), el
inicio muestra "En la veterinaria" con la etapa actual. La pantalla del seguimiento tiene la
línea de tiempo con la hora de cada etapa y los avances publicados, y se vuelve a pedir cada
10 s mientras está abierta (`TRACKING_REFRESH_MS`); el envío por SSE queda para una entrega
posterior.

## Avisos push

La app registra el teléfono al iniciar sesión (`PUT /me/devices`) y lo da de baja al cerrarla.
Al tocar un aviso se abre la cita. Para recibirlos hace falta:

1. Un proyecto de EAS (`npx eas init`), que deja `extra.eas.projectId` en la configuración. Sin
   él la app no pide permiso ni registra nada.
2. Las credenciales de FCM (Android) y APNs (iOS) cargadas en EAS (`npx eas credentials`).
3. Una _development build_ (`npx eas build --profile development`): desde el SDK 53, Expo Go
   no recibe avisos remotos en Android.
4. La API con `VETCARE_PUSH_PROVIDER=expo` y el servicio `worker` corriendo.

Mientras tanto, con la app abierta las citas se actualizan solas cada 30 s.

## Estructura

```
app/                rutas de Expo Router
├── _layout.tsx     fuentes, proveedores y rutas protegidas según la sesión
├── login.tsx
├── recuperar-contrasena.tsx
└── (app)/          rutas que requieren sesión, con la barra inferior (_layout.tsx)
    ├── index.tsx               inicio: próxima cita, accesos rápidos y mascotas
    ├── mascotas/               lista y perfil por secciones, con la foto
    ├── citas/                  próximas e historial, detalle, nueva (3 pasos) y reprogramar
    ├── clinica.tsx             horario de atención, feriados y servicios
    └── cuenta/                 menú, datos de contacto y cambio de contraseña
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
- Al solicitar o reprogramar, el cliente elige a su profesional de confianza o "Cualquiera". Se
  propone el que atendió a la mascota la última vez (o el de la cita, al reprogramar) y solo se
  muestran sus horarios libres. Las citas y el detalle dicen quién atiende.
- Los horarios se eligen como butacas de cine: se ve el día completo por la mañana, la tarde y la
  noche; los ocupados aparecen oscuros y tachados y no se pueden tocar, y los que caen dentro de
  los 30 minutos de antelación, atenuados (lo decide la API con `include_unavailable`).
- Una cita confirmada se reprograma o cancela con al menos 2 horas de anticipación; una
  reprogramación vuelve a quedar por confirmar. La app oculta las acciones fuera de plazo, pero
  la API decide: si rechaza algo (por ejemplo, una tutela sin permiso para reservar), se muestra
  su mensaje.

## Diseño

Usa las fuentes y las formas de [docs/design/README.md](../../docs/design/README.md) (Fredoka
y Nunito, píldoras y esquinas amplias), con una paleta propia de la app de clientes en
`src/theme/tokens.ts`:

- fondo gris azulado y tinta oscura para lo principal (botones, chips activos);
- amarillo (`accent`) para lo activo: la pestaña de la barra y los accesos del inicio;
- celeste (`sky`) para la marca y las portadas, y tarjetas pastel (`mint`, `aqua`) para datos;
- barra inferior flotante en forma de píldora, solo con íconos (los nombres los anuncian los
  lectores de pantalla);
- perfil de la mascota con portada (foto a todo el ancho, nombre y etiquetas) y tarjetas de
  peso y próxima cita.

La web mantiene su paleta verde azulado.

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
