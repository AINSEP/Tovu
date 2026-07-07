# admin-shell Overview

Shared admin-shell metadata lives here.

## Purpose

- Define framework-agnostic admin section metadata and menu structure for local admin shells.
- Keep shared shell composition outside individual frontend packages.
- Let Next, Vue, and future frontend shells share one navigation source while keeping routing and rendering local.

## Current scope

- Admin section definitions
- Placeholder section registry
- Shared menu blueprint for the WordPress-shaped admin shell

## Boundary rule

- Frontend shells may import from `admin-shell/`.
- `admin-shell/` may describe UI-shell metadata, but it must not depend on framework runtimes.
- `core/`, `features/`, and `server/` should not depend on `admin-shell/`.
