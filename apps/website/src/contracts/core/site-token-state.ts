/**
 * @file Site-key plan (`ADS-memory/.local-artifacts/plan-site-key-2026-09-24.md`) §A.6 — the admin
 * Site Token status banner's state union. Lives in `contracts/core/`, not in `features/webhooks/`
 * or `server/inbound/**` where the value is actually computed
 * (`routes/system/site-token.ts`'s `siteTokenState`): this file is a plain string-literal union with
 * no imports and no I/O, the same "client-safe contract" shape `runtime-mode.ts` (right next to this
 * file) already establishes for `resolveRuntimeMode`'s own union — the one layer both
 * `server/inbound/**` and the admin app may depend on (`apps/admin/tsconfig.json`'s `@tovu/headless`/
 * `@tovu/embed-marker` path aliases are the existing precedent for the admin importing a
 * `contracts/core/**` file directly; this module is not yet wired into that alias list — a later
 * admin-side slice does that, this one only publishes a stable value to import).
 *
 * `apps/admin/src/lib/api.ts`'s `AdminSiteTokenStatus` is today a hand-mirrored DTO (see that
 * file's own `AdminSiteTokenRuntimeMode` comment: "the Site Token tab's own copy" of a server union)
 * rather than an import of a shared type — the admin UI slice that adds a `state` field to that DTO
 * should import {@link SiteTokenState} from here instead of hand-mirroring a sixth string literal
 * union, now that one exists.
 */

/**
 * `GET .../system/site-token`'s `state` field (`routes/system/site-token.ts`'s `siteTokenState`).
 *
 * - `"active"` — a valid key resolves, and either nothing is stamped in `.site-meta.json` yet or the
 *   stamped `siteKeyFingerprint` matches the resolved key's own fingerprint.
 * - `"missing"` — no source resolves to usable material, and this site's `content.db` holds no
 *   data that only a site key could decrypt or verify.
 * - `"missing-with-data"` — no source resolves, but this site's `content.db` DOES hold such data
 *   (`findKeyDependentData`, `site-key-sources.ts`) — a materially more urgent banner than plain
 *   `"missing"`: something the operator saved is stuck behind a key that no longer resolves.
 * - `"mismatch"` — a valid key resolves, but its fingerprint differs from `.site-meta.json`'s own
 *   stamped `siteKeyFingerprint` — the physical key file was substituted for a different one after
 *   the stamp was written (site-key plan §A.4/§A.5's `ensureSiteKey` "mismatch" outcome, surfaced
 *   here independently for the read path).
 * - `"invalid"` — a source was found (env var set, or a key file present) but its content fails hex
 *   validation.
 */
export type SiteTokenState = "active" | "missing" | "missing-with-data" | "mismatch" | "invalid";
