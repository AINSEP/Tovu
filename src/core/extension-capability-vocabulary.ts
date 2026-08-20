/**
 * @file The three capability strings common to Tovu's two extension mechanisms —
 * `plugin-runtime` and `site-glue` — declared exactly once.
 *
 * Both mechanisms' own manifest validators (`features/plugin-runtime/manifest.ts`,
 * `features/site-glue/manifest.ts`) independently need `content.read` / `content.extend` /
 * `hooks.attach`: `plugin-runtime`'s is its entire v1 capability vocabulary; `site-glue`'s is the
 * first three members of its own eight-member superset (the remaining five —
 * `tools.register`, `events.subscribe`, `admin.nav.register`, `render.contribute`,
 * `http.route.register` — are glue-only and never cross into `plugin-runtime`'s surface).
 *
 * This module exists so that overlap is a single declaration, imported by both, rather than two
 * independent by-value literals that happen to agree today and can silently drift tomorrow
 * (2026-08-20 swarm-consensus synthesis, `ADS-memory/reports/swarm-consensus/runs/
 * 2026-08-20-tovu-extension-surface/SYNTHESIS.md`, Result 1: "Shared vocabulary should live
 * *below* both features rather than one sibling importing the other"). Neither feature imports
 * the other — both import here instead, preserving the deliberate boundary each feature's own
 * manifest.ts documents in its own header (no plugin-runtime dependency inside site-glue, and
 * vice versa).
 *
 * Dependency-free, no I/O — same "policy constant `core/` module" shape as `./runtime-mode.ts`.
 */

/** The capability vocabulary `plugin-runtime` and `site-glue` declare identically. */
export type SharedExtensionCapability = "content.read" | "content.extend" | "hooks.attach";

/** Iterable form of {@link SharedExtensionCapability}, so both features build their own
 * (possibly wider) `Set`/vocabulary from this array rather than retyping the three string
 * literals. Frozen — a shared array a caller could mutate would defeat the point of a single
 * source of truth. */
export const SHARED_EXTENSION_CAPABILITIES: readonly SharedExtensionCapability[] = Object.freeze([
  "content.read",
  "content.extend",
  "hooks.attach",
]);
