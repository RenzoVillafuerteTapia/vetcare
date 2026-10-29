# Cómo trabajamos

## Ramas

```
main                 ← versiones estables y desplegables. Nunca se commitea directo.
└── develop          ← integración. De aquí salen y aquí vuelven los cambios.
    ├── feature/pet-management
    ├── fix/invalid-service-transition
    └── docs/architecture-overview
```

| Prefijo | Para qué | Sale de | Vuelve a |
|---|---|---|---|
| `feature/` | nueva funcionalidad | develop | develop |
| `fix/` | corrección de bug | develop | develop |
| `docs/` | solo documentación | develop | develop |
| `test/` | solo pruebas | develop | develop |
| `refactor/` | reestructuración sin cambio de comportamiento | develop | develop |
| `chore/`, `ci/` | configuración, dependencias, pipelines | develop | develop |
| `hotfix/` | bug urgente en producción | main | main **y** develop |

Nombres en minúscula y con guiones, en inglés: `feature/appointment-scheduling`.

## Flujo de un cambio

1. Toma o crea el Issue con criterios de aceptación verificables.
2. Crea la rama desde `develop` actualizado.
3. Implementa un cambio acotado, con commits pequeños y atómicos.
4. Ejecuta las verificaciones de la app que tocaste (lint, tipos, pruebas).
5. Actualiza la documentación afectada y el `CHANGELOG.md` (sección *Sin publicar*).
6. Abre el Pull Request hacia `develop` con la plantilla y `Closes #N`.
7. Revisa tu propio diff: secretos, archivos ajenos al cambio, código muerto.
8. Fusiona solo con el CI en verde. Borra la rama después.

```bash
git checkout develop && git pull origin develop
git checkout -b feature/pet-management
git commit -m "feat(pets): agregar registro de mascotas"
git push -u origin feature/pet-management
```

## Conventional Commits

Formato: `tipo(alcance): descripción`

- Tipos: `feat` `fix` `docs` `style` `refactor` `perf` `test` `build` `ci` `chore` `revert`.
- Descripción en español, en minúscula y en modo imperativo ("agregar", no "agregado").
- Máximo 100 caracteres en la primera línea.
- Un cambio que rompe el contrato de la API lleva `!`: `feat(appointments)!: renombrar status a state`.
- Alcances habituales: `auth`, `pets`, `clients`, `appointments`, `tracking`, `clinical`,
  `treatments`, `billing`, `inventory`, `notifications`, `reporting`, `web`, `mobile`, `api`,
  `shared`, `db`, `ci`, `deps`, `architecture`, `adr`.

Los commits y Pull Requests aparecen solo a nombre de quien los hace, con la identidad de git del
repositorio. No se agregan líneas `Co-Authored-By`, firmas ni pies generados por herramientas.

El hook `commit-msg` valida el formato en local y el workflow `commitlint` lo valida en cada PR.
Actívalo después de clonar:

```bash
bash scripts/setup-hooks.sh
```

## Merges y versiones

- **rama de trabajo → develop**: *Squash and merge*.
- **develop → main**: merge `--no-ff` al cerrar una fase, con etiqueta semántica:

```bash
git checkout main && git pull
git merge --no-ff develop -m "chore(release): v0.1.0"
git tag -a v0.1.0 -m "Fase 1: fundamentos"
git push origin main --tags
```

## Revisión de código

Un PR está listo para fusionar cuando:

- [ ] El CI pasa (lint, tipos, pruebas, build y commitlint).
- [ ] Las reglas de negocio están en el dominio o en los casos de uso, no en routers ni en componentes.
- [ ] Los permisos se verifican en el backend y hay pruebas de acceso denegado.
- [ ] Si cambió la API, se regeneraron los tipos de `packages/shared`.
- [ ] Si cambió la base de datos, hay migración de Alembic.
- [ ] La documentación refleja el estado real (implementado, planificado o pendiente).
- [ ] No hay secretos, datos personales reales ni archivos ajenos al cambio.
