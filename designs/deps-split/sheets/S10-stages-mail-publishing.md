# S10 — slices for mail, content HTTP clients, content stores, themes, publish apply (F1-G3) around the owner await

Responsibility: bindings `mailResolveDeps` … `publishContentApplyPort` (`b5fbf2a5` 1898-2073). The conditional owner await `if ((overrides.storeRole ?? "owner") === "owner") await protectExistingFormFiles(…)` (1976) **stays in the root, verbatim**, between `assetBlobRepo` and `mediaContentTypeStore`. Budget ≤150k. Commits: 6. Prerequisites: S9; COMMON §1-§4, §9 (`DS_SHEET=S10`).

| commit | slice (sync) | bindings | returns |
|---|---|---|---|
| 1 | `slices/mail.ts` | `mailResolveDeps`, `resolvedMailer`, `mailDurableOutboxReady` (the mailer's arrow keeps reading `mailDurableOutboxReady` declared after it, inside the same slice, in the same order) | same |
| 2 | `slices/content-http-clients.ts` (+ `composeContentHttpClients` from S4) | `customCredentialsHttpClient` … `publishContentPeerHttpClient` | same |
| 3 | `slices/content-stores.ts` | `postRepo`, `changeSets`, `mediaRepo`, `assetBlobRepo` — **ends before the owner await** | same |
| 4 | `slices/publish-stores.ts` | `mediaContentTypeStore` … `publishContentSeedHash` — **starts after the owner await** | same |
| 5 | `slices/themes.ts` | `siteThemes`, `themeTrashAdapter`, the `trashAdapters.set(THEME_ENTITY_TYPE, themeTrashAdapter)` statement, `removeTheme` — receives the S7 Map as a value | `siteThemes`, `themeTrashAdapter`, `removeTheme` |
| 6 | `slices/publish-apply.ts` (S4's two functions) | `publishContentApplyPort` | same |

## Carries
| behaviour (base lines) | pin |
|---|---|
| mail readiness: the mailer resolves through the durable outbox only after it is ready (1898-1919) | `mail-sender-identity-wiring.integration.test.ts` + new `$D/__tests__/mail.unit.test.ts` with a pending outbox promise → send waits |
| owner-only protection: runs only for the owner role, awaited before the publish stores are built (1976) | the widened await list (S0 pin 6) keeps the line in `composeSiteRouteDeps`; new `owner-protection.pin` case in `create-site-route-deps-boot-options.integration.test.ts` style: `overrides.storeRole: "client"` → protection not called (recording fake via its existing seam, else characterize by file-system effect) |
| one trash Map; the theme adapter is set on it after `siteThemes` exists (1998-2009) | STOP block; S0 pin 2 (`removeTheme`) |
| publish apply port wiring and media apply (2010-2073) | `server/__tests__/routes/publish-content-media-wiring.test.ts`; S4's unit tests |

```bash
SHEET_TESTS=(
  apps/website/src/server/runtime/composition/__tests__/mail-sender-identity-wiring.integration.test.ts
  apps/website/src/server/__tests__/routes/publish-content-media-wiring.test.ts
  apps/website/src/server/runtime/composition/__tests__/create-site-route-deps-boot-options.integration.test.ts
)   # plus SR_TESTS and CHANGED_TESTS (COMMON §5)
```

## STOP (before the report commit; COMMON §9 rule 8 form)
```bash
set -euo pipefail
D=apps/website/src/server/runtime/composition
grep -rnE 'trashAdapters\.set\(THEME_ENTITY_TYPE' "$D/deps.ts" "$D/site-deps" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S10-THEME-ADAPTER-ONCE"; exit 1; }
grep -rnE '^  if \(\(overrides\.storeRole \?\? "owner"\) === "owner"\) await protectExistingFormFiles\(' "$D/deps.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 1 || { cat "$W/hits"; echo "STOP-S10-OWNER-AWAIT-IN-ROOT"; exit 1; }
grep -rnE '^(export )?async function|^  (const [^=]+= )?await ' "$D/site-deps/slices/mail.ts" "$D/site-deps/slices/content-http-clients.ts" "$D/site-deps/slices/content-stores.ts" "$D/site-deps/slices/publish-stores.ts" "$D/site-deps/slices/themes.ts" "$D/site-deps/slices/publish-apply.ts" > "$W/hits" || [ $? -eq 1 ]
test "$(wc -l < "$W/hits")" -eq 0 || { cat "$W/hits"; echo "STOP-S10-ASYNC-SLICE"; exit 1; }
```
Gates: COMMON §5.
