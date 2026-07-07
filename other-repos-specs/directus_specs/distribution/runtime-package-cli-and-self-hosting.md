# Directus Runtime Package, CLI, And Self-Hosting Shape

**Source files analyzed:**
- `other-repos/directus/directus/package.json`
- `other-repos/directus/directus/cli.js`
- `other-repos/directus/directus/readme.md`
- `other-repos/directus/Dockerfile`
- `other-repos/directus/docker-compose.yml`
- `other-repos/directus/package.json`

---

## 1. Overview

The repo contains a distinct `directus/` package that represents the runtime users install and execute.

This package is not where the application logic lives. It is the distribution wrapper around:

- `@directus/api`
- update-check logic
- the published CLI binary

That separation is important when documenting Directus as a product:

- `api/` describes server implementation
- `directus/` describes what self-hosters and operators actually install and run

---

## 2. Published Runtime Package

The inspected `directus/package.json` declares:

- package name: `directus`
- version: `11.15.4`
- binary:
  - `directus -> cli.js`

Dependencies are intentionally small:

- `@directus/api`
- `@directus/update-check`

This means the package is a thin operational wrapper over the API package rather than a parallel implementation.

---

## 3. CLI Bootstrap

`directus/cli.js` performs exactly three things:

1. import `updateCheck`
2. import the current version
3. run update check when version exists
4. dynamically import `@directus/api/cli/run.js`

So the distributed CLI lifecycle is:

```text
user runs `directus`
  ->
CLI script starts
  ->
optional update check
  ->
handoff into API CLI runtime
```

The package itself does not contain custom command implementations. It hands off to the API package CLI.

---

## 4. Self-Hosting Positioning

From the inspected runtime readme:

Directus presents itself as:

- a real-time API
- an app dashboard
- SQL-native
- multi-database
- deployable locally, on-prem, or in cloud
- extensible and white-labelable

That product framing matters because it explains why the repo includes:

- storage drivers
- auth providers
- extensions marketplace
- admin app embedding
- websocket support
- CLI entrypoints

This is an operational platform, not only a library.

---

## 5. Operational Surface In The Repo Root

The repository root includes deployment and ops artifacts such as:

- `Dockerfile`
- `docker-compose.yml`
- `ecosystem.config.cjs`

These files indicate that the product expects:

- containerized deployments
- local orchestration / development setups
- process-manager-driven runtime execution

This justifies a dedicated distribution-layer spec rather than collapsing everything into API implementation docs.

---

## 6. Spec Implication

When translating Directus into a Tovu-oriented understanding, keep these roles separate:

- `directus/` = operator-facing package boundary
- `api/` = runtime implementation boundary
- `app/` = browser admin surface
- `sdk/` = consumer integration boundary

Failing to separate them will blur:

- what gets published
- what gets executed
- what gets embedded
- what gets imported by consumers

---

## 7. Tovu Reconstruction Notes

### 7.1 Why this exists

This distribution layer exists so “the product people install” is not confused with “the runtime code developers import.” Directus is explicit that packaging, CLI entrypoints, and operational artifacts are part of the platform boundary.

### 7.2 What Tovu should preserve

- Separate published/runtime/embedded/consumer roles
- A thin operational package or entrypoint distinct from core implementation modules
- Clear self-hosting and CLI expectations owned by the distribution layer

### 7.3 What Tovu can simplify

- V1 can ship one primary runtime package and one CLI path
- Docker/process-manager artifacts can stay minimal at first
- The separation matters more than matching Directus’s exact packaging shape

### 7.4 Possible Tovu seams

- `src/server/` and `src/core/` stay implementation boundaries
- one thin runtime entrypoint package/script owns CLI handoff and operator-facing startup
- deployment artifacts live beside distribution concerns, not inside feature modules

### 7.5 Suggested priority

- `V1`: thin runtime entrypoint, clear self-hosted startup path, minimal operational artifacts
- `Later`: richer CLI distribution, multi-package publishing strategy, deeper operator tooling
