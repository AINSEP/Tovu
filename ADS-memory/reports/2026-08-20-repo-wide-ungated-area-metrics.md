# Every ungated area — complexity metrics, 2026-08-20

Measured with the SAME tool/threshold the CI gates use: ESLint `complexity` +
`sonarjs/cognitive-complexity` hard-overridden to `error`/9 via `--rule`.
`__tests__`, `__measurements__`, `.test.` and `node_modules` excluded.
Do not compare these to any complexity number produced by a different tool.

## The board

| area | src files | violations | files hit | worst | gated? |
|---|--:|--:|--:|--:|---|
| `src/server/routes` | 238 | 98 | 64 | 33 | **YES** — ratchet, debt 105 |
| `src/assistant` | 53 | 31 | 13 | 26 | **being added** |
| `src/server` (non-route) | 85 | 21 | 13 | 38 | **being added** |
| `src/features` | 188 | **91** | 36 | **51** | no |
| `src/widgets` | 26 | 10 | 4 | 34 | no |
| `src/seo` | 12 | 6 | 4 | 27 | no |
| `src/export` | 4 | 5 | 2 | 30 | no |
| `src/analytics` | 7 | 4 | 2 | 18 | no |
| `src/media` | 5 | 3 | 1 | 11 | no |
| `apps/site-chat/src` | 9 | 1 | 1 | 17 | no |
| `apps/admin/src` | 432 | 12 | 8 | 25 | YES — own gate + debt file |
| `packages` | 1 | 0 | 0 | – | no |

**Ungated debt outside `src/server` + `src/assistant`: 120 violations across 50 files.**

`src/features` is 76% of it. Everything else is a rounding error by comparison —
`widgets`+`seo`+`export`+`analytics`+`media`+`site-chat` together are 29 violations
across 14 files, small enough to close in one pass.

## Worst files, by area

### `src/features` — the real target
| cyc | cog | file |
|--:|--:|---|
| **51** | **47** | `src/features/plugin-runtime/manifest.ts` ← worst file in the repo |
| 37 | 39 | `src/features/theme/handlebars-allowlist.ts` |
| 18 | 36 | `src/features/deployments/static-publish/s3-compatible-target.ts` |
| 35 | 30 | `src/features/site-glue/manifest.ts` |
| 21 | 29 | `src/features/theme/liquid-allowlist.ts` |

⚠️ **`plugin-runtime/` and `site-glue/` are exactly where a concurrent session was
working on 2026-08-20.** Confirm that session has landed before dispatching anyone here.

### The long tail — one pass closes all of it
| cyc | cog | file |
|--:|--:|---|
| 24 | 34 | `src/widgets/config-validation.ts` |
| 17 | 30 | `src/export/route-manifest.ts` |
| 20 | 27 | `src/seo/write-service.ts` |
| 26 | – | `src/seo/seo.ts` (flat wiring) |
| 18 | 17 | `src/analytics/ingest.ts` |
| 13 | 18 | `src/widgets/resolvers/index.ts` |
| 13 | 17 | `src/export/site-exporter.ts` |
| – | 17 | `apps/site-chat/src/site-assistant-transport.ts` |
| 12 | 14 | `src/widgets/resolver-service.ts` |
| 11 | 10 | `src/media/provider-credential-store.ts` |

### `apps/admin/src` — already gated, 12 grandfathered
| cyc | cog | file |
|--:|--:|---|
| 25 | – | `apps/admin/src/features/seo/Seo.tsx` |
| 13 | 21 | `apps/admin/src/features/media/Media.tsx` |
| 17 | 16 | `apps/admin/src/lib/api.ts` |
| 13 | 12 | `apps/admin/src/App.tsx` |

## ⚠️ TRAP — a naive complexity scan of `src/features` CRASHES

```
$ npx eslint --rule '{"sonarjs/cognitive-complexity":["error",9]}' src/features
A configuration object specifies rule "sonarjs/cognitive-complexity",
  but could not find plugin "sonarjs".
```

Exit code **2**, empty stdout. It reads like a config bug. It is not.

**Cause:** `src/features/theme/__tests__/fixtures/astro-bundler-probe/node_modules/`
— a real `node_modules` tree, with `.vite/deps/` prebundles, living inside a test fixture.
It is the same class of trap `eslint.config.mjs` already documents for
`apps/admin/dist-debug/**` and `.claude/worktrees/**`.

**Workaround used here:**
```
--ignore-pattern '**/__tests__/**' --ignore-pattern '**/__measurements__/**'
```

**Before adding `src/features` to `SCOPES` in `check-src-complexity-drift.ts`**, either add
that fixture path to `eslint.config.mjs`'s global `ignores` (alongside `dist-debug` and
`worktrees`), or teach `findViolations()` to pass the ignore patterns. Otherwise the gate
exits 2 on a tooling error and — because exit 2 is not exit 1 — may read as a pass.

## Recommended order

1. **Long tail first** — widgets, seo, export, analytics, media, site-chat.
   29 violations / 14 files, no concurrent-session conflict, closes 6 areas at once.
2. **`src/features`** — 91 violations, but wait for the plugin-runtime session to land,
   and fix the fixture-`node_modules` trap before gating.
3. **`apps/admin/src`** — already gated; the 12 are grandfathered debt to burn down, not a gap.

## Not measured here

Coverage for these areas. `src/features` has 148 test files; the others have few.
`apps/site-chat` has **no `test` script at all** — it needs a runner before it can be gated.
