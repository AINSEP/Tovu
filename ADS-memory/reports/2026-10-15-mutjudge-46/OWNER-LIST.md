# mutjudge-46 — survivors judged NOT load-bearing-untested (no code change; for later)

Source of survivors: `ADS-memory/reports/2026-10-15-mutation-46/run/SURVIVORS.md`. Guards here were NOT deleted; each line says why no test was added.

| file:line | guard | mutation | verdict | why |
|---|---|---|---|---|
| apps/admin/src/features/security/security-i18n.ts:1883 | `COPY_REASON_TEXT[result.reasonCode ?? ""]` | drop `?? ""` | REDUNDANT (equivalent mutant) | Indexing the table with `undefined` yields `undefined`, which the outer `?? "Copying keys failed. Try again."` already maps to the same text. The `?? ""` exists only for the index type. |
| apps/website/src/features/agent-plugins/import-access-token.ts:61 | `input.principalId ?? AGENT_PLUGIN_TOKEN_IMPORT_ACTOR` | drop fallback | REDUNDANT (no observable effect today) | `principalId` reaches storage only via `external-mcp-store.ts` `resolveWriteGrantAttribution` (~line 1868), which reads it ONLY when a save changes `writeAllowedToolNames`; token import and provisioning never do. Becomes load-bearing if an import ever writes grants or the store gains an `updatedBy` column. (Codex r1 confirmed: no honest readback through the repo seam.) |
| apps/admin/src/features/security/hooks/use-access-tokens.hooks.ts:480 | `accessTokensLoadError(...) ?? reloadError` | drop `?? reloadError` | REDUNDANT (equivalent) | This branch runs only while `hasReloadedOnce` is false, and `reloadError` is set (line ~463) in the same batch as `setHasReloadedOnce(true)` (~464), so here it is always its initial `null` — the same value `accessTokensLoadError` returns when no store failed. |
| use-access-tokens.hooks.ts:524 | `prev[rowId]?.saving ?? false` | drop `?? false` | REDUNDANT (equivalent) | `undefined` vs `false`: every consumer reads `saving` for truthiness (no `=== false` anywhere in features/security). |
| use-access-tokens.hooks.ts:529 | `persistedRow?.name ?? ""` | drop `?? ""` | UNREACHABLE | `setExistingField` is called only from a rendered existing row, and rows render from `rows`, so `persistedRow` is always found. |
| use-access-tokens.hooks.ts:578, :599 | `row.username ?? ""` (publish/source-control draft) | drop `?? ""` | REDUNDANT (documented no-op today) | The source comment says these two kinds never carry `username`; the only `.username.trim()` readers (`rules.ts` ~829/853/879) are custom-row paths. Forward-compat for a future provider with a saved username. |
| use-access-tokens.hooks.ts:641, :642 | `withPromotedDefault(prev ?? [], ...)` | drop `?? []` | UNREACHABLE | `prev` is undefined only before the store loads; "Make default" renders only for loaded rows (`rows` is undefined until every store settles). |
| use-access-tokens.hooks.ts:680, :681 | `prev[key] ?? blankAddFormEntry()` | drop fallback | UNREACHABLE | The add form renders only when `addForm.visible` (`AccessTokensTab.tsx` ~296), which only `openAddForm` (~673) sets, creating the entry first — so `setAddField` always finds `prev[key]`. |
| apps/website/src/server/inbound/admin-http/publish-trust-auth.ts:196 | `...?.publicKeyB64u ?? ""` | drop `?? ""` | REDUNDANT (equivalent) | `admitPublish` (`revocations.ts` ~216) refuses any key not equal to a provisioned non-empty key; `undefined` is refused as `superseded-key` exactly like `""`. |
| publish-trust-auth.ts:231 | `if (!token) { next(); return; }` | never fires | REDUNDANT (perf only) | `verifyPublishSession(...).catch(() => null)` fails closed on a null token and the gate calls the same `next()`. The guard only skips one HKDF per tokenless request (the file's @complexity note). |
| publish-trust-auth.ts:239 | `if (targetInstallationId === null)` | never fires | REDUNDANT (fail-closed downstream) | Verification against a null audience cannot match a token's string audience, so it falls to the same `next()`. |

## mutjudge-46b additions (dev-auth.ts, sweeps v1+v2a+v2b)

| file:line | guard | mutation | verdict | why |
|---|---|---|---|---|
| apps/website/src/server/inbound/admin-http/dev-auth.ts:210 | `req.socket?.localPort ?? 0` | drop `?? 0` | UNREACHABLE | Every Express request served by a listener has a socket with a numeric `localPort`; only a hand-built fake req lacks it. |
| dev-auth.ts:296 | `currentPrincipal(...)?.principal ?? null` | drop `?? null` | REDUNDANT at runtime (type-required) | All three callers (`:625`, `:636`, `:698`) test truthiness; `undefined` and `null` behave the same. tsc needs it for the declared `| null` return type. |
| dev-auth.ts:528, :529 | `String(req.body?.username ?? "")` / password | drop `?? ""` | EQUIVALENT in practice | A missing field becomes the string `"undefined"` instead of `""`; both reach Jini `login`, which answers the same 401 unless an account literally named `undefined` with password `undefined` exists. |
| dev-auth.ts:540 | `req.get("user-agent") ?? undefined` | drop `?? undefined` | REDUNDANT (no-op) | `req.get` already returns `string | undefined`. Could be deleted. |
