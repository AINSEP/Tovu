# Reference check

Base: `949c622a1`. Lookups used targeted `git grep -n -F` restricted to `packages/`. No caller imports or tests were changed.

- J02: production imports of `PageWorkBudget` occur at `packages/diagnostics/src/web-evidence/collect-page-evidence.ts:48`, `packages/diagnostics/src/web-evidence/playwright-browser.ts:25`, `packages/diagnostics/src/web-evidence/public-page.ts:6`, and `packages/diagnostics/src/web-evidence/render-page.ts:2`. These triggered the importer STOP rule.
- J02 incidental test importers: `packages/diagnostics/src/web-evidence/__tests__/page-work-budget.test.ts:7` and `packages/diagnostics/src/web-evidence/__tests__/render-page.test.ts:9`. No repoint is needed for an in-place idiom swap.
- J03: `boundedGate` has only its declaration and two callers in its own file; no external importer found.
- J04: `writeMcpConfig` has a production re-export at `packages/mcp/src/index.ts:15`, triggering the importer STOP rule. `resolveRealOrLexical` has only its declaration and a local default-value reference.
- J04 incidental test importers: `packages/mcp/src/__tests__/args-convention.unit.test.ts:2`, `packages/mcp/src/core/__tests__/config.test.ts:12`, `packages/mcp/src/core/__tests__/config.write.unit.test.ts:3`, and `packages/mcp/src/core/__tests__/secret-defaults.test.ts:39`. `packages/mcp/src/__tests__/index.test.ts:11` also names the export. No repoint is needed for an in-place idiom swap.
- J05: `normalizeAllowedDirectoryVariants` has only its declaration and local caller; no external importer found.
- J06: `attachProviderWithin` has only its declaration and local caller; no external importer found.

Combine owns gate counts and the three applied-sheet restore-catch mutations. No gate result or behavioral test result is claimed here.
