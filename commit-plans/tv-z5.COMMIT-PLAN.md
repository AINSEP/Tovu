# tv-z5 catch idiom swaps

Branch: `codex/tv-z5`. Base for every sheet: `7e5c158ca6754c1fef90e663d99956e225e7788a`.
All source paths below are relative to `apps/website/src/`; each ledger key is
`(apps/website/src/<path>, catch-reads-error)`. Reductions are expected, not gate results.
No tests added or changed; no bug-sheet test names/red reasons apply. No tests,
builds, installs, type checks, linters, gate runs, or gate updates were executed.
Chrome/Electron looks: none, per CULL. No package, lock, changeset, or Jini edits.
The coordinator stages and commits; `.git` remains unmodified by this job.

## B01 — DONE

Base: `7e5c158ca6`.

| Files touched / ledger paths | Expected reduction |
| --- | ---: |
| `assistant/assistant-vault.ts` | 1 |
| `assistant/runtime-preferences.ts` | 1 |
| `assistant/tool-approval-policy.ts` | 1 |
| `contracts/core/operator-locale.ts` | 1 |

Gate mutations owed to combine: separately restore each replaced catch in
`openTokenHint`, `readPreference`, approval `describe`, and `resolveOperatorLocale`.
Disclosure and safety decision order retained. Tests: none. Chrome look: none.
Diff re-read deletions: none beyond the prescribed catch replacements.

## B02 — STOPPED

Base: `7e5c158ca6`. Files touched: none.
Stop: `assistant/tool-search-keywords.ts:28–29`, `readBundledToolKeywords`.
The `if (!optional.sources)` guard narrows a mutable optional property only at the
direct call. Moving that call verbatim into the required callback loses its
TypeScript narrowing. Preserving the literal work statement would require a
forbidden assertion; a captured callable would rewrite the named work expression.
No assertion, capture, additional guard, or partial sheet edits were introduced.

| Retained ledger paths | Expected reduction |
| --- | ---: |
| `assistant/tool-search-keywords.ts` (2 targeted catches) | 0 |
| `cli/commands/deploy-config.ts` (1) | 0 |
| `features/custom-credentials/tool-registrations.ts` (2) | 0 |
| `features/deployments/deploy-ops/registry.ts` (2) | 0 |
| `server/inbound/assistant/assistant-runtime-guidance.ts` (1) | 0 |

Gate mutation owed: none while stopped. Tests: none. Chrome look: none.
`tool-registrations.ts` has 504 lines on the base; it is untouched, and its size
is not the stop reason. Diff re-read deletions: none.

## B03 — DONE

Base: `7e5c158ca6`.

| Files touched / ledger paths | Expected reduction |
| --- | ---: |
| `cli/commands/owner-store.ts` | 1 |
| `features/webhooks/site-key-sources.ts` | 1 |

Gate mutations owed: restore the dry-run promise catch in `legacyStatus` and the
metadata read catch in `readSiteMetaJson`. The dry-run promise is evaluated before
wrapping. Invalid-input refusal and separate JSON parse remain unchanged; no key
contents or diagnostics were added to results. Tests: none. Chrome look: none.
Diff re-read deletions: none beyond the prescribed catch replacements.

## B04 — DONE

Base: `7e5c158ca6`.

| Files touched / ledger paths | Expected reduction |
| --- | ---: |
| `features/analytics/forwarding.ts` | 1 |

Gate mutation owed: restore the provider-hooks read catch in
`createPluginAnalyticsHooks`. Chain composition and its reporter remain outside
the fallback. Tests: none. Chrome look: none.
Diff re-read deletions: none beyond the prescribed catch replacement.

## B05 — DONE

Base: `7e5c158ca6` (includes tv-b2).

| Files touched / ledger paths | Expected reduction |
| --- | ---: |
| `features/publish-content/composite-blob-source.ts` | 1 |
| `features/publish-content/raw-file-contributor.ts` | 1 |
| `features/publish-content/raw-row-contributor.ts` | 2 |
| `features/publish-content/seed-hash.ts` | 2 |
| `features/site-export/public-origin-policy.ts` | 1 |

Gate mutations owed: separately restore catches for `readAndVerify`,
`inspectRawFile`, `decodeId`, `inspectRawRow`, `resolveSeedDeps`, the returned
seed-hash inspector, and `exportPublicOrigin`. Hashing remains after the null
return; primary reads, apply handling, private-column policy, origin verification,
and source selection remain unchanged. Tests: none. Chrome look: none.
Diff re-read deletions: none beyond the prescribed catch replacements.

## B06 — DONE

Base: `7e5c158ca6`.

| Files touched / ledger paths | Expected reduction |
| --- | ---: |
| `features/sites/site-preview/site-preview-store.ts` | 2 |
| `features/theme/theme-preview-image.ts` | 1 |
| `features/theme/validation/validate-theme-package.ts` | 1 |

Gate mutations owed: separately restore the timestamp and image read catches,
the `themeContentVersion` walk catch, and the `checkMarkupFiles` read catch.
Both preview write-side catches remain. Partial `walk.newest` and markup validity
checks remain unchanged. Tests: none. Chrome look: none (CULL removes the design's
look requirement). Diff re-read deletions: none beyond prescribed replacements.

## C06 — DONE

Base: `7e5c158ca6` (includes tv-b2).

| Files touched / ledger paths | Expected reduction |
| --- | ---: |
| `server/inbound/admin-http/routes/publish-content/apply-report.ts` | 1 |

Gate mutation owed: restore the whole advisory `readBackstopApplyReport` catch.
Targeted importer lookup found only the expected `import.ts` route and existing
`__tests__/apply-report.test.ts`; no import repoints. `import.ts:285–289` reads the
report after successful apply and spreads its optional result into the reply.
The existing report cast is retained verbatim; no cast was added.
Tests: none. Chrome look: none. Diff re-read deletions: none beyond the prescribed
catch replacement.

Expected total reduction: 19 across 16 source files. Eight B02 targeted catches
remain. Existing residual catches are retained. All edited functions and work
callbacks were read for the 50-line/complexity-10 limits; no tooling was run.
