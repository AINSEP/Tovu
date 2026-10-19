# chatsite-c2 — chat history tools read another registered site (2026-10-16)

## Commits
- Jini `2d54d300` (branch general-work, not pushed): `packages/chat/src/store/runtime/history-tools.ts` + its test.
- Tovu `e69d2973c`: `server/runtime/composition/{site-chat-history,registered-sites,assistant-history-tools,local-credential-copy,deps}.ts`, `server/routes/types.ts`, tests `site-chat-history.test.ts`, `assistant-history-tools.test.ts`.

## Design
- Jini: optional `siteName` on `assistant_chats_list` / `assistant_chat_read`; optional `ports.siteHistory { listSiteNames, openStore }` on the existing ports object (a host built against the old type still compiles). No port → "not supported on this host". Unknown name → error listing registered sites (max 50). Store closed in `finally`. The local and site paths share one handler body, so caps and redaction are unchanged. `siteName` is echoed in the result only when set.
- Identity: users are per-site (zoran owner `dae5f839…` ≠ tovu-dev owner `7499d195…`, both username `admin`, no email). The rule: the caller must be THIS installation's owner (`ownerPrincipalId`) and pass `admin.assistant.use`. The target site's chats are read only for the TARGET site's single `owner`-role principal in its own workspace. Zero or more than one owner → refuse.
- Tovu: reuses the credential-copy precedent. `registeredSources` and the local-host predicate moved unchanged to `registered-sites.ts`. Exact registry-name match only, local hosts only, SQLite only. content.db is opened read-only (workspace + owner lookup). chat.db is opened read-only (`readonly`, `fileMustExist`, no migration). The current site's own name is treated as if siteName were omitted.

## Verification
- Jini RED→GREEN: the test file run against HEAD's history-tools.ts had 5 failures and 9 passes (all 5 new siteName cases failed). With the change: 14/14. `tsc -p packages/chat` clean.
- Tovu: site-chat-history + assistant-history-tools + local-credential-copy.integration: 19/19. Root `tsc -p tsconfig.json` clean. The new Tovu tests are RED at HEAD only by construction (the module and the seam don't exist there); I didn't run them against HEAD.
- Real-data read-only probe (current = zoran): names = luvira, plannie, tovu-dev, order-pinch; listing and reading tovu-dev's latest chats worked; `../tovu-dev` came back unknown.
- Home: the sites.json md5 changed, but only zoran's `lastOpened` (the live server). Entries and site-keys are unchanged.

## Codex rounds
- r1: the implementation plus tests.
- r2: fixed a Jini test-only `exactOptionalPropertyTypes` tsc error at history-tools.test.ts:226. Also, `isCurrentSite` now checks for a local host before it reads the registry.

## To ship
1. Release `@jini-ai/chat` (contains 2d54d300). 2. Tovu adopts it. No Tovu code change is needed; the wiring is already committed. 3. After adopting, refresh `apps/website/src/assistant/__tests__/fixtures/tool-metadata.baseline.json` if it pins the input schema or description. Codex left it untouched. Then an optional E2E: on zoran ask "see the last chat in tovu-dev".

## Leftovers
- PRE-EXISTING (not this change): 4 tests in `apps/website/src/assistant/__tests__/tool-contribution-registry.test.ts` fail with "Test home isolation required". The file lacks `import "../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js"`, which became necessary since fec2a6a9f (10-15). The stack goes through `server/runtime/composition/app.ts` createRouteDeps → describeSiteBinding, not this code. A one-line fix is needed.
- No mutation run. Candidate rows for the lanes: the owner gate in assistant-history-tools.ts, the owners.length check, and `assertLocal` in site-chat-history.ts.
