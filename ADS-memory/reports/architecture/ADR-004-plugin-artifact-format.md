# ADR-004: Plugin Artifact Format — Prebuilt ESM + Signed Manifest in the Install Dir

- Status: ACCEPTED
- Date: 2026-07-01
- Author: Claude Fable 5 / Leon Aburime (design session, `tovu-v1-design.md` §8 W3)

## Context

WordPress plugins are interpreted PHP dropped into a folder. A TypeScript
runtime has no equivalent unless we define one: what file set constitutes an
installed plugin, who builds it, how its admin UI ships, and how it pins
against the SDK. Without this, "plugins" silently become workspace packages and
the single-binary install-dir product model dies.

## Decision

A Tovu plugin artifact (`.tovu-plugin`, a tarball) contains:

```
my-plugin/
├── tovu.plugin.json        # manifest (see below)
├── server/index.mjs        # prebuilt ESM entry — the definePlugin() export
├── admin/panel.mjs         # optional prebuilt admin-UI bundle(s), React (ADR-002)
├── admin/panel.css         # scoped styles (CSS modules output / prefixed)
├── assets/                 # static assets
└── LICENSE, README.md
```

Manifest (`tovu.plugin.json`) required fields:

- `id`, `name`, `version` (semver)
- `sdkRange` — compatible `@tovu/sdk` semver range (refuse activation outside it)
- `capabilities` — declared capability list (`tovu-v1-design.md` §3)
- `contentTypes` / `fields` — schema-registry declarations incl. `queryable`/`searchable` flags (ADR-003)
- `hooks` — hook points consumed and any new points offered
- `adminSurfaces` — descriptor list mapping to `admin/*.mjs` bundles
- `integrity` — SHA-256 per file (subresource-integrity style)
- `provenance` — `sourceUrl`, optional `signature` (ed25519, key published by author), `publisher`
- `dependencies` — other plugin ids + semver ranges (lockfile-style resolution at install)

Rules:

1. **Plugins ship prebuilt ESM.** The site never compiles TypeScript; authors
   build with `tovu plugin build` (SDK CLI), which bundles, externalizes shared
   deps, and stamps integrity hashes.
2. **Shared deps are externalized:** `react`, `react-dom`, the block/editor
   runtime, and `@tovu/sdk` are provided by the host at pinned major versions;
   plugin bundles import them as externals. Everything else is bundled in.
3. **Loading:** the runtime verifies integrity (+signature if present), checks
   `sdkRange`, resolves dependency order, then dynamic-`import()`s
   `server/index.mjs` and registers through the capability-scoped SDK.
4. **Install dir layout:** `<site>/plugins/<id>/<version>/…` with an `active`
   pointer — versioned side-by-side installs make rollback a pointer flip
   (pairs with ADR-003's no-DDL rule to make UF-01 rollback near-total).
5. **Dev mode:** `tovu dev --plugin ./path` loads a workspace source directory
   with live rebuild — explicitly a development affordance, not the
   distribution format.
6. Integrity/provenance fields are **required from day one** even with no
   marketplace: local installs still get tamper detection, and a future
   marketplace (UF-04/UF-11) needs the fields to already exist in the wild.

## Consequences

- Capability enforcement is API-surface-level, not a security sandbox: an
  in-process ESM module can touch `fs`/`process.env`/network. Acceptable for
  v1 (first-party + local installs); never market it as sandboxing. The
  artifact format is runtime-neutral so a stricter loader (worker threads,
  isolates) can be introduced without changing the format.
- Themes use the same envelope with `tovu.theme.json` (renderer field per
  ADR-002, templates instead of server entry).
