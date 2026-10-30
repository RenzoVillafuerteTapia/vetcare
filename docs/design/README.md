# Sistema de diseño

> Estado: **aplicado en la web de administración** (`apps/web`) y en la app móvil
> (`apps/mobile`, tokens en `src/theme/tokens.ts`).

## Principios

- **Cercano y confiable.** Tipografía redondeada, esquinas amplias y un tono cálido: transmite
  cuidado animal sin perder la seriedad de una clínica.
- **Calma visual.** Superficies suaves sobre un fondo neutro, una sola tarjeta destacada por
  pantalla y nada decorativo que compita con la información.
- **Solo datos reales.** Si un módulo aún no existe, se dice ("en preparación"); no hay cifras ni
  gráficos de muestra.

## Color

Paleta propia: verde azulado de cuidado animal sobre neutros cálidos. Los tokens viven en
`apps/web/src/index.css` (convención de shadcn/ui) y se usan siempre por nombre, nunca con
valores directos.

| Token | Uso |
|---|---|
| `primary` | Acción principal, panel de marca, iconos destacados, casillas marcadas |
| `surface-strong` | Tarjeta destacada (oscura) e ítem activo de la navegación |
| `background` | Panel de contenido |
| `sidebar` | Fondo de la aplicación y de las tarjetas suaves sobre el panel |
| `card` | Formularios, píldora de usuario, iconos sobre superficies suaves |
| `field` | Relleno de los campos de texto (más oscuro que `sidebar` y que `card`) |
| `muted` / `muted-foreground` | Fondos suaves y texto secundario |
| `secondary` | Selección suave (roles marcados, botón sobre superficie oscura) |
| `destructive`, `success` | Errores y confirmaciones |

- El texto cumple contraste WCAG AA sobre su fondo.
- El tema claro es el predeterminado: la página declara `color-scheme: light` para que los
  controles nativos (casillas, barras de desplazamiento) no se vuelvan oscuros cuando el sistema
  operativo usa modo oscuro. El tema oscuro (`.dark`) tiene sus propios tokens y su propio
  `color-scheme`.

## Tipografía

| Familia | Uso | Pesos |
|---|---|---|
| **Fredoka** | Títulos (`h1`–`h3`, marca, cifras grandes) | 400–500 |
| **Nunito** | Texto, etiquetas, botones | 400–700 |

Se sirven desde el propio proyecto con `@fontsource-variable/fredoka` y
`@fontsource-variable/nunito` (licencia OFL): no hay solicitudes a servicios de terceros.

| Rol | Tamaño |
|---|---|
| Saludo / título de página | 36–48 px, Fredoka 500 |
| Título de sección o tarjeta destacada | 20–30 px, Fredoka 500 |
| Texto | 15 px, Nunito 400 |
| Etiquetas y botones | 13–14 px, Nunito 600 |

## Forma

| Elemento | Forma |
|---|---|
| Botones, etiquetas, ítems de navegación, píldora de usuario | `rounded-full` |
| Campos de texto | `rounded-2xl`, relleno `field` y borde `input`; al enfocar, fondo `card` y anillo `ring` |
| Tarjetas | `rounded-3xl` |
| Paneles grandes (contenido, marca, tarjeta destacada) | `rounded-[2rem]` |
| Iconos dentro de tarjetas | Cuadro `rounded-2xl` de 44 px |

Alturas táctiles: botones de 44 px por defecto (`h-11`), campos de 44 px.

## Componentes

En `apps/web/src/components/ui` (shadcn/ui, estilo "new-york", adaptados a esta forma):
`Button` (variantes `default`, `strong`, `secondary`, `outline`, `ghost`, `destructive`,
`link`), `Input`, `Label`, `Card`, `Alert` (`default`, `destructive`, `success`) y `Badge`
(`outline`, `soft`, `glass`).

Componentes de la app: `Brand`, `FormField` (etiqueta, ayuda y error accesibles), `PageHeader`,
`FullPageSpinner` y `AppShell`.

## Patrones

- **Navegación:** fondo neutro con el ítem activo en píldora `surface-strong`. La barra lateral y
  el encabezado quedan fijos; solo se desplaza el panel de contenido. En móvil, un
  panel lateral accesible (Radix Dialog) con las mismas píldoras.
- **Contenido:** panel `background` de esquinas amplias sobre el fondo `sidebar`.
- **Tarjeta destacada:** una por pantalla, `surface-strong`, con una etiqueta `glass`, un título,
  un texto breve y, si corresponde, una acción secundaria.
- **Acceso:** panel de marca `primary` a la izquierda (solo en escritorio) y formulario a la
  derecha.
- **Formularios:** mensajes en español junto al campo; los errores de la API (422) se muestran en
  el campo correspondiente y los demás en un `Alert`.
- **Estados:** carga con `FullPageSpinner` o botón deshabilitado con spinner; vacío o "en
  preparación" con texto explicativo; error con `Alert destructive`.

## Accesibilidad

- Foco visible con anillo de 3 px en todos los controles.
- Campos con `aria-invalid` y `aria-describedby` hacia su error o su ayuda.
- Iconos decorativos con `aria-hidden`; los botones solo con icono tienen `aria-label`.
- Navegación con `aria-label="Principal"`; un solo `h1` por página.
