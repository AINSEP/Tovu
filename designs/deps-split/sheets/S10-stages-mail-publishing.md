# S10 — stages `mail-http` (F1-F2) and `publishing` (G1-G3)

Responsibility: statements 144-167 (`f0613d9e` 1901-2076). Two stages, one sheet: both are short and G needs F's results only as values. Budget ≤160k. Commits: 7.
Prerequisites: S9. COMMON §2, §3, §9.

| commit | slice | statements | async | getters | returns |
|---|---|---|---|---|---|
| 1 | `slices/mail.ts` | 144-146 (145 reads `mailDurableOutboxReady` declared at 146: inside the slice the order stays and the arrow keeps the closure read) | no | — | `mailResolveDeps`, `resolvedMailer`, `mailDurableOutboxReady` |
| 2 | `slices/content-http-clients.ts` (+ `composeContentHttpClients` from S4) | 147-150 | no | — | `customCredentialsHttpClient`, `siteBackupHttpClient`, `outboundTestOrigins`, `mediaImportHttpClient`, `publishContentPeerHttpClient` |
| 3 | `stages/mail-http.ts` | 144-150 | no | | |
| 4 | `slices/content-stores.ts` | 151-161 | **yes** (155 `if (owner) await protectExistingFormFiles`) | — | `postRepo`, `changeSets`, `mediaRepo`, `assetBlobRepo`, `mediaContentTypeStore`, `publishContentBundleRepo`, `publishContentBaselineRepo`, `publishContentFileBlobIndex`, `publishContentPeerRepo`, `publishContentSeedHash` |
| 5 | `slices/themes.ts` | 162-166; receives `trashAdapters` (the S7 Map) and calls `.set(THEME_ENTITY_TYPE, themeTrashAdapter)` verbatim | no | — | `siteThemes`, `themeTrashAdapter`, `removeTheme` |
| 6 | `slices/publish-apply.ts` (S4's two functions) | 167 | no | — | `publishContentApplyPort` |
| 7 | `stages/publishing.ts` | 151-167 | yes | | |

From commit 4 on, the getters that S5/S7/S8 pass for `mediaRepo`, `postRepo`, `assetBlobRepo`, `mediaContentTypeStore` still read the closure names (the destructuring keeps them) — no change at those call sites.

## STOP
```bash
D=apps/website/src/server/runtime/composition
grep -rn 'trashAdapters.set(THEME_ENTITY_TYPE' $D/site-deps | wc -l | grep -qx 1 || echo "STOP: theme adapter registration moved or duplicated"
grep -nE '^  (const [^=]+= )?await ' $D/site-deps/slices/{mail,content-http-clients,themes,publish-apply}.ts && echo "STOP: became async"
```
Gates: COMMON §5; `site-root.overridden-capabilities.pin.test.ts` (removeTheme) every commit; `publish-content-media-wiring.test.ts` and `mail-sender-identity-wiring.integration.test.ts` at sheet end.
