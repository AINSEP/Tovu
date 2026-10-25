Code Inspection(Review): Personas used: code-inspection + security + tdd.

Locations refer to `review/cov-T3`.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `tovu-int:apps/website/src/platform/site-dir/local-site-child.ts:133` | `import.meta.main` requires Node ≥24.2, while `package.json:12` supports ≥24.0. On Node 24.0–24.1, the child silently exits without booting the site or watchdog. | Use a compatible entrypoint check, or keep an unconditional entry wrapper around the importable runner. Verify launch on the minimum supported runtime. |
| MEDIUM | `tovu-int:apps/website/src/server/inbound/admin-http/routes/media/where-used.ts:10` and `:15`; `routes/consent/routes.ts:23` | Three `?? ''` parameter fallbacks remain deleted despite the report claiming restoration. This violates the explicit preservation rule at `routes/media/route-guards.ts:18`; missing media IDs now reach the repository as `"undefined"`. | Restore all three fallbacks and cover missing parameters through direct-handler assertions. |
| MEDIUM | `tovu-int:apps/website/src/server/inbound/admin-http/routes/entries/write-error-status.ts:19`; `routes/content-types/write-error-status.ts:42` | New exported helpers accept a positional `Error` and omit the required optional object. Similar violations appear in other newly exported helpers. | Apply `(requiredObj, optionalObj = {})` consistently to new exports and update callers. |
| MEDIUM | `tovu-int:apps/website/src/platform/site-dir/key-only-site-meta.ts:124` | The newly exported generic filesystem timestamp helper lives in Tovu, contrary to the Jini-first ownership rule. | Put the reusable helper in `@jini-ai/platform` and retain the site-specific adapter here; record any approved deferral in the required survey. |

**Rules check**

- Plugins never import each other: **OK** in changed code.
- Generic code in Jini: **violated** — `key-only-site-meta.ts:124`.
- Two-object API signatures: **violated** — `entries/write-error-status.ts:19`, `content-types/write-error-status.ts:42`.
- Dependencies injected as ports: **OK**; added ports retain production defaults.
- React data through props: **OK**; no React product changes.
- Cyclomatic complexity ≤10: **OK by source inspection**; metrics were not executed.
- Existing “why” comments preserved: **OK**; relevant explanations were retained or moved.
- ADR-066 TypeScript migrations only: **OK**; no schema migrations changed.
- No data loss: **OK**; no introduced data-loss path identified.
- No unflagged `TEMP: replaced by shared helper`: **OK**; none added.

Coverage percentages remain **unverified**: no raw T3 coverage artifact is committed, and the report acknowledges scoped and unreproduced measurements. No files were edited; no tests, builds, installs, servers, or browsers were run.

**Verdict: MERGEABLE AFTER FIXES** — fix the supported-runtime startup regression, restore the remaining guards, and resolve the explicit owner-rule violations.
