# S10 — mail, content HTTP clients, content stores, themes, publish apply (F1-G3) around the owner await

Responsibility: bindings `mailResolveDeps` … `publishContentApplyPort` (`f0613d9e` 1901-2076). The conditional owner await `if ((overrides.storeRole ?? "owner") === "owner") await protectExistingFormFiles(…)` (1979) **stays in the root, verbatim**, between `assetBlobRepo` and `mediaContentTypeStore`. Budget ≤160k. Commits: 7. Prerequisites: S9; COMMON §1-§3, §9 (`DS_SHEET=S10`).

| commit | slice (sync) | bindings | returns |
|---|---|---|---|
| 1 | `slices/mail.ts` | `mailResolveDeps`, `resolvedMailer`, `mailDurableOutboxReady` (the mailer's arrow keeps reading `mailDurableOutboxReady` declared after it, inside the same slice, in the same order) | same |
| 2 | `slices/content-http-clients.ts` (+ `composeContentHttpClients` from S4) | `customCredentialsHttpClient` … `publishContentPeerHttpClient` | same |
| 3 | `stages/mail-http.ts` | 1-2 | union |
| 4 | `slices/content-stores.ts` | `postRepo`, `changeSets`, `mediaRepo`, `assetBlobRepo` — **ends before the owner await** | same |
| 5 | `slices/publish-stores.ts` | `mediaContentTypeStore` … `publishContentSeedHash` — **starts after the owner await** | same |
| 6 | `slices/themes.ts` | `siteThemes`, `themeTrashAdapter`, the `trashAdapters.set(THEME_ENTITY_TYPE, themeTrashAdapter)` statement, `removeTheme` — receives the S7 Map as a value | `siteThemes`, `themeTrashAdapter`, `removeTheme` |
| 7 | `slices/publish-apply.ts` (S4's two functions) + `stages/publishing.ts` (sync: 5, 6, 7) | `publishContentApplyPort` | same |

## Carries
| behaviour (base lines) | pin |
|---|---|
| mail readiness: the mailer resolves through the durable outbox only after it is ready (1901-1922) | `mail-sender-identity-wiring.integration.test.ts` (wide) + new `mail.unit.test.ts` with a pending outbox promise → send waits |
| owner-only protection: runs only for the owner role, awaited before the publish stores are built (1979) | the widened await list (S0 pin 6) keeps the line in `composeSiteRouteDeps`; new `owner-protection.pin` case in `create-site-route-deps-boot-options.integration.test.ts` style: `overrides.storeRole: "client"` → protection not called (recording fake via its existing seam, else characterize by file-system effect) |
| one trash Map; the theme adapter is set on it after `siteThemes` exists (2001-2012) | `expect-count` below; S0 pin 2 (`removeTheme`) |
| publish apply port wiring and media apply (2013-2076) | `publish-content-media-wiring.test.ts` (wide); S4's unit tests |

## STOP
```bash
set -euo pipefail
G="bash designs/deps-split/work/gates.sh"; D=apps/website/src/server/runtime/composition
$G expect-count S10-THEME-ADAPTER-ONCE 1 'trashAdapters\.set\(THEME_ENTITY_TYPE' $D/deps.ts $D/site-deps
$G expect-count S10-OWNER-AWAIT-IN-ROOT 1 '^  if \(\(overrides\.storeRole \?\? "owner"\) === "owner"\) await protectExistingFormFiles\(' $D/deps.ts
$G forbid S10-ASYNC-SLICE '^(export )?async function|^  (const [^=]+= )?await ' $D/site-deps/slices/mail.ts $D/site-deps/slices/content-http-clients.ts $D/site-deps/slices/content-stores.ts $D/site-deps/slices/publish-stores.ts $D/site-deps/slices/themes.ts $D/site-deps/slices/publish-apply.ts $D/site-deps/stages/mail-http.ts $D/site-deps/stages/publishing.ts
```
Gates: COMMON §5.
