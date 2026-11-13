### jini:packages/core/src/redact.ts
- **Over:** file 601 lines (no function over 100)
- **Phase:** now · **Batch:** size-13
- **Package entry:** not an exports target; `src/index.ts` (entry `.`) has `export * from './redact.js'` → ADD `export * from './redact-shapes.js'` right below it (entry keeps the public API). The two other new modules export only internal names — do not add them to index.ts.
- **Tests:** `src/__tests__/redact.test.ts`, `redact.gap-audit.test.ts`, `redact.characterization.test.ts`, `redact.exact-only.test.ts`, `redaction-union.test.ts`, `security-vocabulary.test.ts` (asserts `core.X === X` identity → must import from `../redact-shapes.js`), `unit/filesystem-redaction-contracts.unit.test.ts`. Cross-package smoke: `pnpm --filter @jini-ai/cli exec vitest run src/__tests__/core-redaction-migration.test.ts --maxWorkers=2`. No `vi.mock` of redact.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A shapes | `SecretShapePattern`, `PEM_PATTERN_NAME`, `PRIVATE_KEY_HEADER`, `PRIVATE_KEY_BLOCK`, `SECRET_SHAPE_PATTERNS`, `createPrivateKeyLineRedactor`, `AGENT_FAILURE_TOKEN_SHAPES`, `AGENT_FAILURE_SECRET_SHAPE_RE`, `CREDENTIAL_FILE_DENY_SEGMENTS`, `LOCAL_OWNER_PROXY_MARKER_PREFIXES`, `LOCAL_OWNER_PROXY_MARKER_HEADERS` (L37-151) | security vocabulary shared with static scans and other packages |
| B spans | `Span`, `AddSpan`, `SpanPass`, `MergedSpan`, `mergeSpans`, `startsSeparateSpan`, `orderedSpanRanks`, `collectMatches` | span bookkeeping + merge order |
| C text scan | `LabelValue`, `isCoveredField`, `coveredLabelFields`, `labelValueExtents`, `unescapedQuoteFinder`, `isBackslashEscaped`, `forwardFinder`, `quotedValueEnd`, `exactNeedles`, `syntaxContainment`, `beginsSecretRun`, `forEachOccurrence`, `nextSearchOffset`, `borderTable` | pure scanners: label value extents, KMP occurrence search |
| D (stays) | patterns/regex constants L153-399, `redactSecrets`, `formatErrorForLog`, `diagnosticJson`, `redactSecretsWithCounts`, `collectSpans`, `trailingValue`, the `collect*` rule passes, `addLabelValue`, `emptyAssignmentRanges`, `collectEmptyQuotedAssignments`, `isLuhnValid`, `isMaskedValue` | the redaction pipeline and its rules |

- **Splits:**
  1. NEW `redact-shapes.ts` — unit A verbatim. The `@module redact` header paragraph(s) that describe the shared vocabulary are copied into its header; keep the original header in redact.ts. Imports nothing local. redact.ts imports `SECRET_SHAPE_PATTERNS` (used by `credentialPatterns`) from it.
  2. NEW `redact-spans.ts` — unit B verbatim (comments incl. the radix-order note). Exports all moved names. Imports nothing local.
  3. NEW `redact-text-scan.ts` — unit C verbatim (KMP and quote-finder comments move). Imports `Span` from `./redact-spans.js`. Before moving, confirm with the outline `uses:` that none of these reads a unit-D constant (per the outline they do not; if one does, leave that function in redact.ts and stop the move for it only).
- **Importers to update:** `src/index.ts` (add `export *` line); `src/__tests__/security-vocabulary.test.ts` (the 4 vocabulary names → `../redact-shapes.js`); `src/__tests__/redaction-union.test.ts` (`SECRET_SHAPE_PATTERNS` → `../redact-shapes.js`); `src/__tests__/redact.test.ts` (`createPrivateKeyLineRedactor` → `../redact-shapes.js`). `text/sanitize-untrusted-text.ts`, `user-facing-error.ts`, `settings/express/stream.ts` import only unit-D names → unchanged. Other packages import from `@jini-ai/core` → unchanged.
- **After:** redact.ts ~355; redact-shapes ~75; redact-spans ~75; redact-text-scan ~100.
- **Risks / notes:** `export *` from two modules: a name clash would silently drop the name — there is none (unit A names are unique). Regex objects with `g` flag are module singletons; `security-vocabulary.test.ts` checks identity via `core.X` — satisfied since index re-exports the same object.
