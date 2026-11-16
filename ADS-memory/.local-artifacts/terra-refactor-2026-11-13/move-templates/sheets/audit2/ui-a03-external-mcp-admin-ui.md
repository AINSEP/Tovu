# UI-A03: external-MCP admin UI -> `@jini-ai/ui/features/external-mcp` (templates T-UI + T-SPLIT)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A03`. Owner 11-15: external MCP server side -> `@jini-ai/mcp`; its admin UI joins the existing `ui/features/external-mcp` owner (today: `constants.ts` + `react/components/ExternalMcpTab.tsx`, a `SourceConfigList` mount that Tovu does NOT use: `rg -n "ExternalMcpTab|MCP_SOURCE_FIELD_SPECS" apps/admin/src` hits only `lib/api.ts`/css comments).

Tier: Opus design is this sheet. S1/S2 Sonnet with an Opus review of S1's RED/GREEN pairs and of the ports; S3 Sonnet. est. executor tokens ≈ 130k (S1 35k, S2 60k, S3 35k). Chrome look owed after S3 (owner rule).

## Findings that change the audit row
1. The row's file list omits **`external-mcp-admissions-rules.ts`** (636 lines, blob below). `external-mcp-tool-picker-rules.ts:3` and the banner both import it (`parseSavedToolNames`, drift types, `describeDriftHeadline`), so it must travel with them (S1). Total moved ≈ 3.6k lines, not 1.9k.
2. **No kit slot is needed.** The three components render plain elements and `SeeMore` from `@jini-ai/ui/admin-widgets` (own package). `UiKit` (`ui/src/react/kit.tsx:38`) stays unchanged; COMMON rule 6 is satisfied without C9-ui additions.
3. The Tovu DTOs (`lib/api.ts:257-380`: `AdminToolRefusalReason`, `AdminRemoteToolSurfaceEntry`, `AdminFederatedAdmissionEntry`, `AdminExternalMcpConfigFailure`, `AdminExternalMcpAdmissionsSnapshot`) hand-mirror `@jini-ai/mcp` `federation/trust.ts` (`ToolRefusalReason:160`, `RemoteToolSurfaceEntry:711`). A `ui` file may import only `@jini-ai/core`/`protocol` (COMMON rule 5), so S1 declares **structural view types** in `ui/features/external-mcp/types.ts`; the Tovu DTOs are assignable to them and S3 proves it with a type-level assertion. No new core contract: the design owner of `@jini-ai/mcp` can promote them later without touching this UI.
4. `agentHandle` / `buildAgentListHandles` come from `@jini-ai/core/agent-handles` (C2 landed on wave B). `ExternalMcpToolPicker.hooks.tsx:3` and `ExternalMcpToolPicker.tsx:1` import them: no port, both are core.
5. `ExternalMcpAdmissionsBanner.tsx` and `ExternalMcpSharedChoice.tsx` need no class renames at the CSS level only if the moved classes keep their names; owner rule 15 forces the `jini-` prefix on NEW Jini classes, so S2 renames `external-mcp-*` -> `jini-external-mcp-*` (count table below) and S3 ports `styles/external-mcp-tool-picker.css` + the matching blocks of `styles.css`/`admin-themes/classic/admin.css`.

## Guards (blobs at integ/wave-b)
```
tovu_files (move, then delete):
  - apps/admin/src/features/settings/ExternalMcpAdmissionsBanner.tsx | blob 222d119d2078078956e5514e7a33dd9b154249fa
  - apps/admin/src/features/settings/ExternalMcpSharedChoice.hooks.ts | blob f6b5f2941d329364160b179f895663c9dd33b2e7
  - apps/admin/src/features/settings/ExternalMcpSharedChoice.tsx | blob 497b4190a3f23faf905f03b544a7c47b8f227d96
  - apps/admin/src/features/settings/ExternalMcpToolPicker.hooks.tsx | blob 1ea5751501af407ea30ee2a87ed2668f9264ea56
  - apps/admin/src/features/settings/ExternalMcpToolPicker.tsx | blob d719e37a26dee90b16cd4b4ffb01ff1ae1310648
  - apps/admin/src/features/settings/external-mcp-tool-picker-rules.ts | blob 684231e7bfa61a4f6ac592d6466c751ada8639d9
  - apps/admin/src/features/settings/external-mcp-admissions-rules.ts | blob cb4abc2483bb008720c921451f9e35416c423717
  - apps/admin/src/features/settings/hooks/use-external-mcp-admissions.hooks.ts | blob 043bcb88d95c3ea1671f7423e61ea2576d0358b8
  - apps/admin/src/features/settings/hooks/use-external-mcp-oauth-connect.hooks.ts | blob da9bb2ae1b391e33c4ccf34ec7ebca9d9fc5c308
  - apps/admin/src/features/settings/hooks/use-external-mcp-tool-picker.hooks.ts | blob 10072d30e81f83c72cc0e25cecd192bf65ab48c0
tovu_tests (move to Jini, then delete):
  - apps/admin/src/features/settings/__tests__/ExternalMcpAdmissionsBanner.unit.test.tsx | blob b3721248c82a064d0b4d7314a54dbfd48d90c042
  - apps/admin/src/features/settings/__tests__/ExternalMcpSharedChoice.unit.test.tsx | blob eff7a886cee11b37fa7ce747e411e7a6fa429133
  - apps/admin/src/features/settings/__tests__/ExternalMcpToolsModal.unit.test.tsx | blob 915897b867983d39933fb05ef40e1066704e2e1d
  - apps/admin/src/features/settings/__tests__/external-mcp-admissions-rules.unit.test.ts | blob c0c6df2cffc8ee6e152ac4f28e0f69ff2a6910b2
  - apps/admin/src/features/settings/__tests__/external-mcp-tool-picker-rules.unit.test.ts | blob 074ee477d6c49a04f93123bf4310693960b8c369
  - apps/admin/src/features/settings/__tests__/use-external-mcp-tool-picker.cached-server.unit.test.tsx | blob e8e31bdb441fc3c7dd873df2b393506e36b2b14c
  - apps/admin/src/features/settings/__tests__/use-external-mcp-tool-picker.hooks.unit.test.tsx | blob 87cf3b5ecb8e72631d088f52a591a3909de17cf5
  - apps/admin/src/features/settings/__tests__/external-mcp-missing-launcher-recovery.unit.test.tsx | blob 30f483b0c59105ebe4aefaef9072f5e53ca58fe8
  - apps/admin/src/features/settings/hooks/__tests__/use-external-mcp-admissions.unit.test.tsx | blob 066af2fe44fa255e3d9264c04bf26d6d8cdfebd5
  - apps/admin/src/features/settings/hooks/__tests__/use-external-mcp-oauth-connect.unit.test.ts | blob 9ea023e56600e36269f3268e01de7fe8ef4a9281
tovu_edited (stay):
  - apps/admin/src/features/settings/ExternalMcpSettingsPanel.tsx | blob a20f2f889424fc1f0cd3880718b127e77469dedb
  - apps/admin/src/features/settings/ExternalMcpSettingsPanel.hooks.tsx | blob a119500151466ebb09cc4ffa9961385006d8c0ba
  - apps/admin/src/features/settings/ExternalMcpToolsModal.tsx | blob 93d449e019a9c2073a32a7105388020afeeaf80e
  - apps/admin/src/features/settings/__tests__/ExternalMcpSettingsPanel.unit.test.tsx | blob 218d3038fec4baf4a3628b7a3e7f3273adf6bc21
  - apps/admin/src/features/settings/__tests__/external-mcp-agent-drive.unit.test.tsx | blob e89b8cf27deb5e48798264376a6470451bca4783
  - apps/admin/src/styles/external-mcp-tool-picker.css | blob 791e35407f8dd2d3d4e8b6b0b9f8bd2604908d92
  - apps/admin/src/lib/api.ts | blob e0ac6bb6d7e9815fa60fd8ba84d336385dfeb4af
jini_guards:
  - packages/ui/src/features/external-mcp/index.ts | blob 1ae8619f996ff6a9bdb4ea5783bea47f923a4f29
  - packages/ui/src/features/external-mcp/constants.ts | blob 2e4ad7025b151a5ab23d9426f6e9d36e3daf0a2b
  - packages/ui/src/features/external-mcp/react/components/ExternalMcpTab.tsx | blob 0d2988f40e82956b3c73436610b56de01483b119
  - packages/ui/package.json | blob 83c6938b9d18b8c75ad42fa29f84c25124b8f289
  - packages/ui/src/react/kit.tsx | blob 2e161a984eee8aef0fa2f83e83938b85731ddc12
  - packages/ui/src/features/external-mcp/{types.ts,admissions-rules.ts,tool-picker-rules.ts,oauth-connect.ts} must not exist; `rg -n "ExternalMcpToolPicker|useExternalMcpAdmissions|seedToolPickerRows|describeAdmissionDrift" packages/ui/src` prints nothing
```

## Ports (all declared in `ui/features/external-mcp/ports.ts`; nothing optional unless stated)
```ts
export interface ExternalMcpErrorPort {
  /** True for "the assistant is still starting": daemon unavailable, network down, timeout, any 5xx. Tovu: ApiError code/status test (use-external-mcp-admissions.hooks.ts:110-115). */
  isAssistantStarting(required: { error: unknown }, optional?: Record<string, never>): boolean;
  /** Operator-safe message for a failed call. Tovu: describeApiError. */
  describe(required: { error: unknown; fallback: string }, optional?: Record<string, never>): string;
  /** Matches the server's picker-probe failure classes (rules.ts:101 describeProbeUnreachable reads ApiError.code). */
  codeOf(required: { error: unknown }, optional?: Record<string, never>): string | null;
}
export interface ExternalMcpAdmissionsPort {            // moved verbatim from hooks:43
  getAdmissions(required?: Record<string, never>, optional?: { signal?: AbortSignal }): Promise<ExternalMcpAdmissionsSnapshot>;
  me(required?: Record<string, never>, optional?: Record<string, never>): Promise<{ effectivePermissions?: readonly string[] }>;
  restartAssistantDaemon(required?: Record<string, never>, optional?: Record<string, never>): Promise<{ ok: boolean; reason?: string }>;
}
export interface ExternalMcpToolProbePort {            // hooks/use-external-mcp-tool-picker.hooks.ts:50
  probe(required: { serverId: string }, optional?: { signal?: AbortSignal }): Promise<{ tools: readonly ExternalMcpToolEntry[]; probedAt: string }>;
}
export interface ExternalMcpOAuthPort {                // use-external-mcp-oauth-connect.hooks.ts:25
  connect(required: { serverId: string }, optional?: { destination?: 'shared' }): Promise<ExternalMcpOAuthStart>;
  pollDevice(required: { serverId: string }, optional?: Record<string, never>): Promise<ExternalMcpOAuthPoll>;
}
export interface ExternalMcpSharedPort {               // ExternalMcpSharedChoice.hooks.ts:7 (api.listSharedMcpConnections + the choose call it makes)
  list(required: { serverId: string }, optional?: Record<string, never>): Promise<ExternalMcpSharedView>;
  choose(required: { serverId: string; credentialId: string | null }, optional?: Record<string, never>): Promise<void>;
}
export interface ExternalMcpClock { now(): number; setTimer(required: { run: () => void; ms: number }): () => void }  // default in hooks = window timers; tests pass a fake
export interface ExternalMcpWindowPort { open(required: { url: string }, optional?: Record<string, never>): { location: { href: string }; close(): void } | null; addEventListener: Window['addEventListener']; removeEventListener: Window['removeEventListener']; origin: string }
```
Exact shapes of `ExternalMcpOAuthStart/Poll/SharedView` are taken from `api.connectExternalMcpOAuth` (lib/api.ts:3353), `api.pollExternalMcpOAuthDevice` (:3365) and `api.listSharedMcpConnections` (:3360): the executor copies the return types as structural interfaces into `types.ts` (STOP if a return type reads a Tovu-only brand).
Stays Tovu (values passed in options): `callbackMessageType = "tovu:external-mcp-connected"` (the server page `routes/oauth/callback-page.ts` posts it: wire contract), retry numbers (default 3000 ms x 60), `fallbackError`, i18n dictionary `external-mcp-i18n.ts` (the English phrase is the key, as today), destructive-tool lock rule (`isToolRowLocked` reads `destructiveDeclared`, a server fact: it MOVES, because the lock mirrors `mcp/federation/trust.ts`'s refusal and the UI must not offer a grant the gate refuses; a Jini test pins the equivalence to `refusalReason`), default-recommended rule `isRecommendedByDefault` (Tovu policy: **stays**, passed in as `optional.isRecommended`, default `() => false`), `parseSavedToolNames` ", "-joined shape (moves with the rules).

```
id: UI-A03-1 .. UI-A03-3
feature: admin/features/settings external-MCP UI -> @jini-ai/ui external-mcp
jini_target: ui src/features/external-mcp/{types.ts,ports.ts,admissions-rules.ts,tool-picker-rules.ts} + react/{hooks,components}; index.ts; package.json exports "./external-mcp" (+ jini.entries "browser") if absent
kit_injection: -
agent_handles: UNCHANGED (wire contract for the assistant): every `handle:` literal/template in the moved JSX keeps its text (cards `*-tools`, `*-search`, `*-select-all`, `*-select-none`, `*-refresh`, row `*-write`, banner restart/grant handles). The moved code passes `base`/`cardHandle` in; nothing is renamed.
changeset: @jini-ai/ui: minor | "external-MCP admin UI: tool picker, admissions drift banner, OAuth connect, shared-connection choice"
```

## UI-A03-1 — Jini rules + types (commit 1, pure, no React)
0. Branch rule; blobs; `rg` guard above prints nothing.
1. Failing tests first = the moved Tovu rule tests, adapted (they are green on Tovu today; on the Jini parent they fail by missing module = RED): `ui/src/features/external-mcp/__tests__/admissions-rules.test.ts` (from `external-mcp-admissions-rules.unit.test.ts`), `tool-picker-rules.test.ts` (from `external-mcp-tool-picker-rules.unit.test.ts`). Plus ONE new behaviour test where the move changes behaviour: `isRecommendedByDefault` becomes the injected `optional.isRecommended`, so `seedToolPickerRows({ tools, saved }, { isRecommended })` with and without the option (default false seeds NOTHING pre-checked for a fresh server; with Tovu's rule it seeds today's set; the legacy fixture passes Tovu's rule as the option, so every legacy assertion stays valid).
2. New `types.ts`: the five structural view types of Finding 3, field-for-field from `lib/api.ts:257-380` (copy the comments neutral: "mirrors the federation trust gate" without Tovu paths). New `admissions-rules.ts` = Tovu `external-mcp-admissions-rules.ts` (types come from `./types.js`; replace `@/lib/api` type imports). New `tool-picker-rules.ts` = Tovu `external-mcp-tool-picker-rules.ts` with: (a) `import { ApiError, describeApiError }` removed: `describeProbeUnreachable({ error, t }, { errors })` takes the `ExternalMcpErrorPort` as an option (required for the picker, default `{ codeOf: () => null, ... }` is NOT provided: the hook passes it), (b) `isRecommendedByDefault` removed (stays Tovu), `seedToolPickerRows` gains `optional.isRecommended`, (c) the `EXTERNAL_TOOL_WRAPPER_PREFIX` regex stays (it mirrors the provenance wrapper `describeFederatedTool` writes; add a Jini test that feeds a string built from the documented wrapper shape, and put "keep in step with mcp/federation/trust.ts describeFederatedTool" in its doc comment), (d) the "owner decision D-1", INV-003, outline paths in comments are Tovu-specific: reword neutral ("the trust gate refuses destructive tools regardless of both lists").
3. Positional args: Tovu's picker rules use `(rows)` single positional and `(tool)`; owner rule 10 requires `(required, optional = {})`: convert the 9 exported functions (`isToolRowLocked`, `countEnabledToolRows`, `toolPickerFieldValues`, `isToolPickerDirty`, `toolPickerFooterLocks`, `setToolRowEnabled`, `setToolRowMayWrite`, `seedToolPickerRows`, `refreshToolRowDeclarations`, `describeDriftHeadline`, `admissionRestartHelps`, `describeConnectionDrift`, `describeAdmissionDrift`, `grantWriteFieldValue`) to `({ ... }, optional = {})` in the move; the matching Tovu callers disappear in S3 (the hook/components move), so the conversion has no Tovu churn except the panel's own calls (`ExternalMcpSettingsPanel.tsx`: 5 import sites, listed in S3).
4. `rg -n -i "tovu|site-chat|apps/(admin|website)|@/lib" <new files>` prints nothing; no `console.*`; eslint; changeset; commit `feat(ui/external-mcp): admissions and tool-picker rules`.

## UI-A03-2 — Jini React (commit 2, Opus review of ports and hook effects)
Files (new, under `ui/src/features/external-mcp/react/`): `hooks/useExternalMcpAdmissions.ts` (from `use-external-mcp-admissions.hooks.ts`: `useUnavailableRetry` keeps its logic, timers go through `ExternalMcpClock`, defaults `retry = { intervalMs: 3000, attempts: 60 }`; `useFetchQuery/useFetchMutation` imported from `../../../panel-kit/fetch-query/...` leaf paths, not the barrel; `hasPermission` from `../../../panel-kit/...` leaf), `hooks/useExternalMcpOAuthConnect.ts` (window and message type injected), `hooks/useExternalMcpToolPicker.ts`, `hooks/useExternalMcpSharedChoice.ts`, `hooks/toolPickerView.ts` (the pure `describeToolRowBadges/Lock/Count`, `matchesToolQuery`, `toolPickerHandle`, `useToolRowHandles`, `useToolPickerFilter` from `ExternalMcpToolPicker.hooks.tsx`), `components/ExternalMcpToolPicker.tsx`, `ExternalMcpAdmissionsBanner.tsx`, `ExternalMcpSharedChoice.tsx`. Tovu's `useWired*` hooks (module-level default ports built on `lib/api`) do NOT move: the `useX(deps)` half moves, the `useWiredX()` half is replaced by Tovu's binding file in S3.
Class renames (each ONCE; the new text contains the old): `external-mcp-tool-*` -> `jini-external-mcp-tool-*`, `external-mcp-drift*` -> `jini-external-mcp-drift*`, `external-mcp-banner` -> `jini-external-mcp-banner`, `external-mcp-status` -> `jini-external-mcp-status`, `external-mcp-shared-choice` -> `jini-external-mcp-shared-choice`. Counts per file are produced by the executor with `rg -c` BEFORE the edit and listed in the report; Tovu CSS/tests are renamed in S3, same counts.
i18n: components take `t: Translate` (required prop); no `useT` import. Strings stay the English phrase keys of `external-mcp-i18n.ts`.
Tests (red first, `react/__tests__/`): moved from Tovu with their fakes: `ExternalMcpAdmissionsBanner`, `ExternalMcpSharedChoice`, `ExternalMcpToolPicker` (from `ExternalMcpToolsModal.unit.test.tsx`: the 5 picker cases; the modal wrapper stays Tovu), `useExternalMcpToolPicker` (hooks + cached-server), `useExternalMcpAdmissions` (+ missing-launcher recovery), `useExternalMcpOAuthConnect`. Each fixture's `api`/`ApiError` becomes an `ExternalMcpErrorPort` fake: `isAssistantStarting: ({ error }) => (error as { status?: number }).status >= 500` etc. New cases: retry stops after `attempts`; clock fake proves one refetch per interval; `callbackMessageType` option respected (message with another type ignored); a message from another origin is ignored.
Complexity: `use-external-mcp-admissions.hooks.ts` is 329 lines with one 100-line hook: split into `useAdmissionsQuery`, `useUnavailableRetry`, `useRestartAction` (each ≤ 50 lines) in the move.
Commit `feat(ui/external-mcp/react): tool picker, drift banner, OAuth connect, shared choice`.

## UI-A03-3 — Tovu binding + delete (commit 3, Sonnet; after wave B and S1/S2 landed)
1. New `apps/admin/src/features/settings/external-mcp-ports.ts` (binding, not a forwarder: it constructs the six ports from `api`): `errors = { isAssistantStarting: isAssistantStartingError (kept here, ~8 lines moved from the hook), describe: describeApiError, codeOf: ({ error }) => (error instanceof ApiError ? error.code : null) }`, `admissions = { getAdmissions: () => api.getExternalMcpAdmissions(), me: () => api.me(), restartAssistantDaemon: () => api.restartAssistantDaemon() }`, `toolProbe`, `oauth`, `shared`, `callbackMessageType = "tovu:external-mcp-connected"`, `isRecommended = isRecommendedByDefault` (moved here from the deleted rules file, with its destructive/recommended why-comment). Add the type-level proof: `const _dtoMatchesView: ExternalMcpAdmissionsSnapshot = {} as AdminExternalMcpAdmissionsSnapshot;` (same for tool entry): a drift between Tovu DTO and the Jini view fails `tsc`.
2. Edit `ExternalMcpSettingsPanel.tsx` (5 imports: lines 1, 17, 25-28, plus the `useWiredExternalMcpAdmissions` default at :474/:487), `ExternalMcpSettingsPanel.hooks.tsx` (drop the `external-mcp-admissions-rules` import :6, import `grantWriteFieldValue` from `@jini-ai/ui/external-mcp`), `ExternalMcpToolsModal.tsx` (:6 `ExternalMcpToolPicker` -> `@jini-ai/ui/external-mcp`, pass `t`, `ports`, `isRecommended`). `ExternalMcpSettingsPanel` keeps the `useExternalMcpAdmissionsHook` test seam, typed `typeof useExternalMcpAdmissions` with `ports` closed over by a one-line `useAdmissions = (saved) => useExternalMcpAdmissions({ ports, t, saved })` defined in the panel file (not exported).
3. Delete the ten `tovu_files` and the ten `tovu_tests`; keep `external-mcp-agent-drive.unit.test.tsx` and `ExternalMcpSettingsPanel.unit.test.tsx` (edited imports only; STOP if either asserts a moved class name: rename per the count table).
4. CSS: move `styles/external-mcp-tool-picker.css` selectors to `jini-external-mcp-*` (the file stays Tovu CSS: presentation is host-owned, per the kit contract) and the `external-mcp-*` blocks in `styles.css` / `admin-themes/classic/admin.css`; e2e pins: `rg -n "external-mcp-(tool|drift|banner|status|shared)" apps tests --glob '!**/node_modules/**'` before/after, same counts.
5. `lib/api.ts` blob must still match at edit time; this slice does not touch it (types stay as wire DTOs).
6. Census: `rg -n "features/settings/(ExternalMcpToolPicker|ExternalMcpAdmissionsBanner|ExternalMcpSharedChoice|external-mcp-(tool-picker|admissions)-rules)|use-external-mcp-(admissions|oauth|tool-picker)" apps` prints nothing; eslint on touched files; commit `refactor(admin/settings): external-MCP UI from @jini-ai/ui`.
Look (owed, Chrome, Settings -> external MCP): add server, OAuth connect popup + device flow, shared-connection choice, Tools dialog (search, select all/none, refresh, locked destructive row, absent row), drift banner with restart (assistant stopped, starting, drifted), one non-English locale.

## untangle overlap (execute after wave B merge)
- C2 touches `ExternalMcpToolPicker.hooks.tsx` / `.tsx` `agentHandle` imports (R lanes via the applier); B0 pass must have landed (re-take blobs).
- C9-ui landed `ui/src/react/kit.tsx` and `panel-kit/fetch-query` leaf paths: confirm the leaf file names with `ls packages/ui/src/panel-kit/fetch-query` before S2.
- C11 `R-settings` edits `use-external-mcp-admissions.hooks.ts` (`describeErrorForLog` import) only if it is in `C11.repoint.tsv`: `rg -n "external-mcp" ADS-memory/.local-artifacts/terra-refactor-2026-11-13/untangle/sheets/*.tsv` before S2 (this sheet found no row; re-check at run time).
- A01 (`use-site-confirm`) and A31 (`admin/plugins` provider settings) edit other `features/settings` files; disjoint from these.

## STOP specific to this sheet
- A moved function still imports `@/lib/*` or `ApiError`.
- Any `handle:` string changes (agent contract).
- A Tovu test asserts a moved `external-mcp-*` class and the count table is missing it.
- `isToolRowLocked` and the server refusal list disagree (add a Jini test row, do not edit server code).
