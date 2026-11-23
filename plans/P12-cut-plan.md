CUT PLAN PARTIAL

| Cut | Repo | Files | Unblocks | Parallel group |
|---|---|---|---|---|
| 1–8 | NOT-CHECKED | P12 audit unavailable | Ranked executor dispatch blocked | NOT-CHECKED |
| P9U P0.T, unranked | Tovu | Settings HTTP client, ledger and execution callers, affected tests | Removes the shared Settings transport’s dependency on the Settings feature directory | A |
| P9U C0b, unranked type cutover | Jini → Tovu | Approved Core contract and fixtures → Dashboard, Security, and Sites type imports | Removes the site-key DTO dependency on the Sites feature from Dashboard and Security | A on disjoint files, with Jini before its Tovu consumer |

`origin/plan/whats-left-1122` resolves locally to `18f1b17c03`. The requested `git show` returns `fatal: path 'plans/P12-tovu-tangle.md' does not exist in 'origin/plan/whats-left-1122'`. I also checked the available Git history and the local copy at the requested path. The P9U plan and review identify two independent steps, detailed below for Opus review. Their P12 ranks are unknown. This was read-only. No tests, builds, installs, or type-checks ran. The lookup budget was not exhausted.

### CUT-1

**STOP — NOT-CHECKED.** The audit entry identifying cut 1 and its downstream files is unavailable.

### CUT-2

**STOP — NOT-CHECKED.** The audit entry identifying cut 2 and its prerequisites is unavailable.

### CUT-3

**STOP — NOT-CHECKED.** The audit entry identifying cut 3 and its contract ownership is unavailable.

### CUT-4

**STOP — NOT-CHECKED.** The audit entry identifying cut 4 and its consumer scope is unavailable.

### CUT-5

**STOP — NOT-CHECKED.** The audit entry identifying cut 5 and its host bindings is unavailable.

### CUT-6

**STOP — NOT-CHECKED.** The audit entry identifying cut 6 and its test surface is unavailable.

### CUT-7

**STOP — NOT-CHECKED.** The audit entry identifying cut 7 and its write set is unavailable.

### CUT-8

**STOP — NOT-CHECKED.** The audit entry identifying cut 8 and its dispatch order is unavailable.

### Unranked executor sheet — P9U P0.T, Settings HTTP transport

**Base.** Tovu `origin/integ/merge-13-2026-11-22` at `f7185f153a`. Treat `origin/codex/ex2-tovu-halves` at `d6590fc72d` and `origin/codex/ex2-holds-tovu` at `8eb8ea568e` as approved prerequisites. The importer anchors below are from merge-13. Use the existing Jini `@jini-ai/admin/core` export from `origin/integ/merge-14-2026-11-22` at `4902a6a1a`. All paths in this sheet are relative to `apps/admin/src/`.

**Tests first.** In `lib/__tests__/ledger-slice.test.ts:61`, add `rethrows the original 403 ApiError from the settings transport`. Reject with a single `new FakeApiError("forbidden", 403)` instance and assert `loadNamespaceValues({ namespace: "core.privacy" })` rejects with that same instance via `toBe`. Keep the existing 404 empty-`Map`, 500, network error, and sequential-write assertions. After the move, keep both cases from the relocated transport test, including the blank namespace rejection before any fetch.

**Named mutation `swallow-all-api-errors`.** In `lib/ledger-slice.ts:17`, remove `&& error.status === 404` from `isUnregisteredNamespace`. The new 403 case and existing non-404 case must fail.

**File operations.**

1. Move `features/settings/api/settings-api.ts:1` to `lib/admin-http/settings-api.ts`. Replace its imports with the following. Keep the request bodies, URLs, options, and effective-read coalescing behavior.

   ```ts
   import type { SettingScope } from "@jini-ai/core/settings";
   import type { SettingValueResponse } from "@jini-ai/admin/core";
   import { WORKSPACE_ID } from "./config";
   import { authenticatedAdminRequest } from "./request";
   import { type SettingResolvedValue, shareSettingsEffectiveRead } from "../settings-effective-reads";
   ```

2. Delete `features/settings/api/settings-api.types.ts:1`. `SettingValueResponse` already has a compatible Jini export and the local `SettingResetResponse` has zero consumers in the checked tree. This cut adds zero type or port declarations. Reusing the existing Jini response type is a planning choice beyond P9U’s suggested verbatim companion-file move.
3. Move `features/settings/api/__tests__/settings-api.unit.test.ts:1` to `lib/admin-http/__tests__/settings-api.unit.test.ts`. Its line 3 resolves as `import { settingsApi } from "../settings-api";`.
4. Use `import { settingsApi } from "@/lib/admin-http/settings-api";` at each of these sites:

   | File | Line |
   |---|---:|
   | `__tests__/unit/app-session-boot-token.unit.test.tsx` | 9 |
   | `__tests__/unit/app-session-unauthenticated-kickback.unit.test.tsx` | 8 |
   | `components/__tests__/MediaPickerDialog.hooks.unit.test.tsx` | 7 |
   | `components/__tests__/MediaPickerDialog.unit.test.tsx` | 7 |
   | `features/pages/__tests__/use-pages.unit.test.ts` | 4 |
   | `features/posts/__tests__/use-posts.unit.test.ts` | 5 |
   | `lib/__tests__/api-endpoint-option-branches.unit.test.ts` | 15 |
   | `lib/__tests__/api-request-shapes.clients.ts` | 25 |
   | `lib/__tests__/settings-effective-reads.integration.test.ts` | 3 |
   | `lib/execution-settings.ts` | 71 |
   | `lib/ledger-slice.ts` | 7 |

5. In `lib/__tests__/execution-settings.test.ts:64` and `lib/__tests__/ledger-slice.test.ts:41`, use the exact mock line below. The production host bindings are the two repoints in `lib/execution-settings.ts` and `lib/ledger-slice.ts`.

   ```ts
   vi.mock("@/lib/admin-http/settings-api", () => ({ settingsApi: { getSettingsEffective, setSetting } }));
   ```

**Opus verification, from the Tovu root.**

```bash
npm --prefix apps/admin run typecheck
npm --prefix apps/admin test -- \
  src/lib/admin-http/__tests__/settings-api.unit.test.ts \
  src/lib/__tests__/ledger-slice.test.ts \
  src/lib/__tests__/execution-settings.test.ts \
  src/lib/__tests__/settings-effective-reads.integration.test.ts \
  src/lib/__tests__/api-endpoint-option-branches.unit.test.ts \
  src/lib/__tests__/api-request-shapes.characterization.test.ts \
  src/__tests__/unit/app-session-boot-token.unit.test.tsx \
  src/__tests__/unit/app-session-unauthenticated-kickback.unit.test.tsx \
  src/components/__tests__/MediaPickerDialog.hooks.unit.test.tsx \
  src/components/__tests__/MediaPickerDialog.unit.test.tsx \
  src/features/pages/__tests__/use-pages.unit.test.ts \
  src/features/posts/__tests__/use-posts.unit.test.ts
```

**STOP** if the approved integration tree adds a caller outside this inventory, the linked Admin package lacks `SettingValueResponse`, or a caller writes into the returned response object. Opus should also stop if the mutation fails to make the 403 assertion red. The write set is disjoint from the site-key type cutover below.

### Unranked executor sheet — P9U C0b, site-key DTO cutover

**Bases and sequence.** Jini `origin/integ/merge-14-2026-11-22` at `4902a6a1a` needs the approved `origin/codex/ex3-c0b-jini` contribution at `a34ea2194`. The merge-14 manifest lacks the subpath. Integrate the approved implementation commits in order, `648f96558`, `fd73c289b`, `56c604159`, or use their already integrated equivalents. The approved write set is `packages/core/src/contracts/site/site-key.ts:1`, `packages/core/src/__tests__/site-key.unit.test.ts:1`, `packages/core/package.json` at the `jini.entries` and `exports` blocks, `api-baseline/jini-ai__core.json` at the `./contracts/site/site-key` block, and `.changeset/p9u-c0b.md:1`. Use the resulting Jini commit for the Tovu cutover on `origin/integ/merge-13-2026-11-22` at `f7185f153a`, with the two approved Tovu branches treated as prerequisites.

This is the type-only portion shared by P9U C5.T and R6.T. Their runtime hook and mount work requires separate approval. This sheet adds zero ports.

**Approved declarations.** Use the branch source with its documentation. The public declarations are:

```ts
export type AdminSiteKeyRuntimeMode = "production" | "local";
export type AdminSiteKeyState = "active" | "missing" | "missing-with-data" | "mismatch" | "invalid";

export interface AdminSiteKeyStatus {
  envVarName?: string;
  reason?: "empty" | "not-hex" | "odd-length" | "too-short";
  active: boolean;
  source: "env" | "file" | "none";
  fingerprint?: string;
  invalid?: boolean;
  keyFilePath: string;
  runtimeMode: AdminSiteKeyRuntimeMode;
  state: AdminSiteKeyState;
}

export type AdminSiteKeyGenerateOutcome = "already-active" | "recovered" | "created";

export interface AdminGeneratedSiteKey {
  outcome: AdminSiteKeyGenerateOutcome;
  fingerprint: string;
  keyFilePath: string;
  runtimeMode: AdminSiteKeyRuntimeMode;
}

export interface AdminImportedSiteKey {
  outcome: "unlocked";
  fingerprint: string;
  keyFilePath: string;
  resealed: number;
  restorePointId?: string;
  runtimeMode: AdminSiteKeyRuntimeMode;
}

export interface AdminSiteKeyAffectedWebhook {
  label: string;
  targetUrl: string;
}

export interface AdminSiteKeyStartFreshPreview {
  removes: number;
  affectedWebhooks: AdminSiteKeyAffectedWebhook[];
  detail: string;
  runtimeMode: AdminSiteKeyRuntimeMode;
}

export interface AdminStartedFreshSiteKey {
  outcome: "started-fresh";
  fingerprint: string;
  keyFilePath: string;
  discarded: number;
  kept: number;
  restorePointId: string;
  affectedWebhooks: AdminSiteKeyAffectedWebhook[];
  runtimeMode: AdminSiteKeyRuntimeMode;
}

export interface AdminRevealedSiteKey extends AdminSiteKeyStatus {
  hex?: string;
}
```

**Tovu tests first.** Paths below are relative to `apps/admin/src/`. In `lib/__tests__/site-key-state-parity.unit.test.ts:1`, add `expectTypeOf` to the Vitest import, add `import type { AdminSiteKeyState } from "@jini-ai/core/contracts/site/site-key";`, and add the following case. Keep the existing runtime comparison with `apps/website/src/contracts/core/site-key-state.ts:38`.

```ts
it("matches the Core state union in both directions", () => {
  expectTypeOf<AdminSiteKeyState>().toEqualTypeOf<(typeof ADMIN_SITE_KEY_STATES)[number]>();
});
```

**Named mutation `core-only-site-key-state`.** In the linked Jini contract used by Tovu, add `| "rotating"` to `AdminSiteKeyState`. Tovu’s Admin type-check must report the parity assertion. For Jini’s existing review mutation, add `hex?: string` to `AdminGeneratedSiteKey`. Core type-check must fail the approved non-reveal shape fixture.

**Tovu file operations.** In `features/sites/api/sites-api.types.ts:108–209`, delete the ten copied declarations and their attached comments. Keep `ADMIN_SITE_KEY_STATES` at line 124 with a comment pointing to the Core union and the website parity test. Update the parity fixture’s header to describe the Core union, the host tuple, and the website union it reads.

For each row use `import type { <bindings> } from "@jini-ai/core/contracts/site/site-key";` with the exact listed bindings. Replace the old import in full except at `sites-api.ts:4`.

| Importer | Line | Bindings |
|---|---:|---|
| `features/dashboard/hooks/dashboard-dependencies.hooks.ts` | 1 | `AdminSiteKeyState` |
| `features/dashboard/hooks/dashboard-port.hooks.ts` | 1 | `AdminSiteKeyState` |
| `features/dashboard/rules.ts` | 1 | `AdminSiteKeyState` |
| `features/security/__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx` | 8 | `AdminSiteKeyStatus` |
| `features/security/__tests__/SiteKeyTab.unit.test.tsx` | 10 | `AdminSiteKeyStatus` |
| `features/security/__tests__/use-site-key-recovery.unit.test.ts` | 4 | `AdminSiteKeyStatus` |
| `features/security/__tests__/use-site-key.unit.test.tsx` | 4 | `AdminSiteKeyStatus` |
| `features/security/hooks/site-key-status.rules.ts` | 1 | `AdminSiteKeyStatus` |
| `features/security/hooks/use-site-key.hooks.ts` | 4 | `AdminSiteKeyStatus` |
| `features/security/hooks/use-site-key-recovery.hooks.ts` | 3 | `AdminSiteKeyAffectedWebhook, AdminSiteKeyStartFreshPreview, AdminSiteKeyStatus` |
| `features/security/hooks/site-key-port.hooks.ts` | 1 | `AdminGeneratedSiteKey, AdminImportedSiteKey, AdminRevealedSiteKey, AdminSiteKeyStartFreshPreview, AdminSiteKeyStatus, AdminStartedFreshSiteKey` |
| `features/sites/api/sites-api.ts` | 4 | `AdminGeneratedSiteKey, AdminImportedSiteKey, AdminRevealedSiteKey, AdminSiteKeyStartFreshPreview, AdminSiteKeyStatus, AdminStartedFreshSiteKey` |

At `features/sites/api/sites-api.ts:4`, the second import is:

```ts
import type { AdminCreatedSite, AdminCreatedSiteAgentPluginTokens, AdminLocalSiteAction, AdminSiteActivation, AdminSitesSnapshot, AdminTokenSignInPlugin, SitesUserConfig, SitesUserConfigPatch } from "./sites-api.types";
```

**Opus verification.** From the Jini root:

```bash
pnpm --filter @jini-ai/core run typecheck
pnpm --filter @jini-ai/core test src/__tests__/site-key.unit.test.ts
pnpm api:check
```

From the Tovu root on the paired Jini baseline:

```bash
npm --prefix apps/admin run typecheck
npm --prefix apps/admin test -- \
  src/lib/__tests__/site-key-state-parity.unit.test.ts \
  src/lib/__tests__/api-request-shapes.characterization.test.ts \
  src/lib/__tests__/api-remaining-endpoints.unit.test.ts \
  src/features/dashboard/__tests__/Dashboard.unit.test.tsx \
  src/features/dashboard/__tests__/use-dashboard-port.unit.test.ts \
  src/features/security/__tests__/Security.unit.test.tsx \
  src/features/security/__tests__/SiteKeyTab.agent-secrecy.unit.test.tsx \
  src/features/security/__tests__/SiteKeyTab.unit.test.tsx \
  src/features/security/__tests__/use-site-key-recovery.unit.test.ts \
  src/features/security/__tests__/use-site-key.unit.test.tsx
```

**STOP** before Tovu dispatch if the paired Jini subpath is missing, if the approved integration adds another consumer of the copied DTOs, or if the approved DTOs differ from the Tovu wire shapes. Opus should stop if either mutation survives its specified type-check. This cut can run alongside P0.T on disjoint files.
