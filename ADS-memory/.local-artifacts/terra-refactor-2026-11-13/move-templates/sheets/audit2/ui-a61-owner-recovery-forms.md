# UI-A61: owner recovery form hooks -> `@jini-ai/user-management/react` (templates T-UI, T-SPLIT)

Written 2026-11-16 against Tovu `integ/wave-b` (`../code`) and Jini `integ/wave-b` (`/home/user/Jini`). Row `audit2:A61`. Blocker "kit-inject(C9c)": **`packages/user-management/src/react/kit.tsx` does not exist at integ/wave-b** (`ls packages/user-management/src/react` -> `__tests__ auth errors.ts index.ts members models.ts ports.ts testing.ts users`), so the two `.tsx` views (`OwnerRecoverySignIn.tsx`, 29 lines; `RecoveryCodesCard.tsx`) are **PARTIAL: S2 waits for C9c (wave C)**. The three HOOK files have no UI import and move now (S1, S3). Row note "do inside row 82's Login parity sheet": `Login.tsx` mounts `OwnerRecoverySignIn`; if row 82's sheet runs first it must leave `OwnerRecoverySignIn.hooks.ts` byte-identical (blob below) so S3 applies; if S1 runs first, row 82's author re-takes the `Login.tsx` blob only (S3 edits `OwnerRecoverySignIn.tsx` imports, not `Login.tsx`).

Tier: S1 Sonnet + Opus review (credential handling), S2 (blocked) Sonnet, S3 Sonnet. est. executor tokens ≈ 33k (S1 20k, S3 13k; S2 deferred). Chrome look owed after S3: owner recovery on the login screen, desktop owner reset card, recovery-kit download.

## Findings that change the audit row
1. **Four hooks, not three.** `RecoveryCodesCard.hooks.ts` holds THREE (`useRecoveryKit`, `createRecoveryKitDownload`, `useDesktopOwnerReset`) and `OwnerRecoverySignIn.hooks.ts` holds `useOwnerRecoverySignIn`: all four share one lifecycle ("collect secret fields, submit, ALWAYS clear secrets in `finally`, surface a typed failure"). The clearing is the security property: `finally { setPassword(''); setCode(''); setConfirmation(''); setBusy(false) }` runs on success AND failure; Jini tests pin it per hook.
2. **Ports to inject (nothing Tovu stays in the hooks):** `OwnerRecoveryPort` shape (`recover({ code, password })`, `issue({ password, code? }) -> { codes: string[] }`, `reset({ password })`: see `lib/owner-recovery-api.ts:9`; Tovu keeps the HTTP binding and `ownerRecoveryPort`), a `describeFailure({ error, scope }) -> UserFacingError` port (Tovu: `ownerRecoveryFailure` with its redaction config and the per-scope `message`/`action` copy: **the five copy strings inside the hook bodies are Tovu copy** -> they move into `failureCopy` passed by Tovu), a `saveTextFile({ text, filename })` port (replaces `document.createElement('a')`/`URL.createObjectURL`: DOM access out of the hook; Tovu keeps the `tovu-owner-recovery-codes.txt` filename and the anchor-click implementation), and `t: Translate`. The mismatch message text and success messages are `t(...)` English phrase keys unchanged (the "Details: owner-recovery-confirmation" suffix is part of Tovu's key text and is passed as `messages.mismatch` so Jini holds no product wording).
3. **Password-confirmation is a rule:** `password !== confirmation` -> message, NO request, secrets NOT cleared (only the mismatch message is set; today the early `return` skips `finally`, so fields stay): preserve exactly (test).
4. **STAYS in Tovu (row list confirmed):** HTTP binding (`lib/owner-recovery-api.ts`, blob below), the download filename, field limits (in the `.tsx` inputs), redaction config inside `ownerRecoveryFailure`, desktop eligibility (`OwnerRecoveryStatus.desktopOwnerReset`/`available` gating in `Security.tsx`), copy.
5. Jini already has `react/auth/*` (Login, Passkeys, TotpSettings with `.hooks.ts`): the new files sit beside them as `react/auth/OwnerRecovery.hooks.ts` + `index.ts` export lines; the controller style to copy is `react/auth/TotpSettings.hooks.ts` (read it first for the established `useState`-vs-store pattern; this sheet keeps the Tovu `useState` bodies).

## Guards (blobs at integ/wave-b)
```
tovu_files:
  - apps/admin/src/features/auth/OwnerRecoverySignIn.hooks.ts | blob 12ecb2e68bef7e4bc319e535729f2ec30e535f7f | keep-reduced (binding)
  - apps/admin/src/features/security/RecoveryCodesCard.hooks.ts | blob 603f62ffb4bf3d5b40b7ad33958d1b829aeae994 | keep-reduced (binding)
  - apps/admin/src/features/auth/OwnerRecoverySignIn.tsx | blob 96234d5cb3436a109be0a36e41c567ef0dd713f3 | S2 (blocked on C9c)
  - apps/admin/src/lib/owner-recovery-api.ts | blob e99c1234cbee40a961a7776591f41b90360ba7eb | keep (HTTP binding; read-only)
tovu_importers: apps/admin/src/features/auth/Login.tsx (OwnerRecoverySignIn), features/security/{Security.tsx,RecoveryCodesCard.tsx} (hooks); `rg -n "OwnerRecoverySignIn|RecoveryCodesCard|useRecoveryKit|useDesktopOwnerReset|createRecoveryKitDownload" apps/admin/src` must list only these + tests
tovu_tests: every test matching `rg -l "OwnerRecoverySignIn|RecoveryCodesCard|useRecoveryKit|useDesktopOwnerReset" apps/admin` (record at step 0; keep all, re-point imports only)
jini_guards:
  - packages/user-management/src/react/index.ts | blob (take with `git hash-object` at step 0; edited: +export lines)
  - packages/user-management/package.json | blob 441edd24c2eaea5777b43becdfc23c0ffb94230e (NO new subpath: `./react` exists)
  - `rg -n "useOwnerPasswordReset|useRecoveryCodeSignIn|useRecoveryKit" packages/user-management/src` prints nothing
```

## Contracts (Jini `packages/user-management/src/react/auth/OwnerRecovery.hooks.ts`)
```ts
export interface OwnerRecoveryPorts {
  recover(required: { code: string; password: string }, optional?: Record<string, never>): Promise<unknown>;
  issue(required: { password: string; code?: string }, optional?: Record<string, never>): Promise<{ codes: string[] }>;
  reset(required: { password: string }, optional?: Record<string, never>): Promise<unknown>;
}
export interface OwnerRecoveryCopy { readonly mismatch: string; readonly recovered: string; readonly reset: string }   // already-translated or t-keys resolved by the host
export type DescribeRecoveryFailure = (required: { error: unknown; scope: 'recover' | 'issue' | 'reset' }, optional?: Record<string, never>) => UserFacingError;
export function useRecoveryCodeSignIn(required: { recover: OwnerRecoveryPorts['recover']; describeFailure: DescribeRecoveryFailure; t: Translate; copy: OwnerRecoveryCopy }, optional: Record<string, never> = {}): RecoveryCodeSignInController;
export function useRecoveryKit(required: { issue: OwnerRecoveryPorts['issue']; describeFailure: DescribeRecoveryFailure }, optional: Record<string, never> = {}): RecoveryKitController;
export function createRecoveryKitDownload(required: { codes: readonly string[]; dismiss: () => void; saveTextFile: (required: { text: string; filename: string }, optional?: Record<string, never>) => void; filename: string }, optional: Record<string, never> = {}): () => void;
export function useOwnerPasswordReset(required: { reset: OwnerRecoveryPorts['reset']; describeFailure: DescribeRecoveryFailure; t: Translate; copy: OwnerRecoveryCopy }, optional: Record<string, never> = {}): OwnerPasswordResetController;
```
Controller return shapes = exactly the current hook return objects (same field names: `code,setCode,password,setPassword,confirmation,setConfirmation,failure,busy,message,submit` etc.) so the `.tsx` views are untouched in S3. `createRecoveryKitDownload` joins codes with `\n` plus a trailing `\n` (text/plain) and calls `dismiss()` AFTER `saveTextFile` (parity: dismiss after revoke).

```
id: UI-A61-1 .. UI-A61-3
feature: owner recovery forms
jini_target: user-management src/react/auth/OwnerRecovery.hooks.ts (+ react/index.ts export lines); S2 (blocked): react/auth/{OwnerRecoverySignIn,RecoveryCodesCard,DesktopOwnerReset}.tsx behind the user-management kit
kit_injection: S1/S3 none; S2 needs user-management `react/kit.tsx` (C9c): Button, TextField, Notice, ErrorNotice
class_renames: S2 only (table taken from the .tsx files at that time)
agent_handles: S2 only: handle strings unchanged
changeset: @jini-ai/user-management: minor | "react/auth: owner recovery sign-in, recovery kit and password-reset hooks"
```

## UI-A61-1 — Jini hooks (commit 1, Opus review of secret handling)
0. Branch rule; blobs; guard `rg` prints nothing; read `react/auth/TotpSettings.hooks.ts` and `react/__tests__` helpers for the renderHook convention.
1. Tests first: per hook: secrets cleared on success; secrets cleared on failure (`recover` rejects); mismatch -> message set, port NOT called, fields NOT cleared, `busy` stays false; `busy` true during the request; `failure` null at start of a new submit; `issue` with and without `code` (the key is omitted, not `undefined`: assert `Object.keys`); `codes` cleared at the start of a new issue; `saveTextFile` receives the joined text and the host filename, then `dismiss` called once; an exception thrown by `describeFailure` itself must not leave `busy` stuck true (NEW hardening: `finally` already covers it: pin it). Add one leak test: a rejected error whose message contains a sentinel (`SENTINEL-SECRET`) never appears in the controller state (only `describeFailure`'s output does).
2. Code: the four functions from the Tovu bodies; split `submit` bodies into small named async helpers (each ≤ 50 lines, complexity ≤ 9); no `document`/`URL`/`Blob` use (downloads via `saveTextFile`); no `console`. Why-comment: "secrets are cleared in finally so a failed or successful attempt never leaves a password in component state".
3. Export lines in `react/index.ts`, changeset, commit `feat(user-management/react): owner recovery sign-in, recovery kit, password reset hooks`. Checks COMMON 2-9: `rg -n -i "tovu|owner-recovery-codes|desktop" <new file>` prints nothing (the word "owner" is a user-management concept and is allowed).

## UI-A61-3 — Tovu hook binding (commit 2, Sonnet; after S1; independent of S2)
1. `OwnerRecoverySignIn.hooks.ts` (edit): `useOwnerRecoverySignIn({ recover, t })` becomes a binding: `useRecoveryCodeSignIn({ recover, t, describeFailure: ({ error }) => ownerRecoveryFailure({ error, message: 'The owner account could not be recovered.', action: '<the existing action string, copied byte-for-byte>' }), copy: { mismatch: t('The passwords do not match. Enter the same password in both fields. Details: owner-recovery-confirmation'), recovered: t('Owner password reset. Sign in with your new password. Authenticators, passkeys, sessions and recovery codes were invalidated.'), reset: '' } }, {})`; the same pattern for `useRecoveryKit` (scope `issue`, message `Recovery codes could not be generated.`), `useDesktopOwnerReset` (-> `useOwnerPasswordReset`, scope `reset`, message `The owner password could not be reset.`), and `createRecoveryKitDownload({ codes, dismiss })` -> Jini's with `filename: 'tovu-owner-recovery-codes.txt'` and `saveTextFile` = the anchor-click implementation kept here (`URL.createObjectURL(new Blob([text], { type: 'text/plain' }))`, `link.download = filename`, `link.click()`, `URL.revokeObjectURL(url)`). The `action` strings are long Tovu copy: copy them from the file text at execution, do NOT retype.
2. The exported names (`useOwnerRecoverySignIn`, `useRecoveryKit`, `createRecoveryKitDownload`, `useDesktopOwnerReset`) and their argument/return shapes are unchanged, so `.tsx` views, `Login.tsx` and `Security.tsx` need no edits. Tests run unchanged; record that.
3. Census + eslint; commit `refactor(admin): owner recovery hooks from @jini-ai/user-management/react`.

## UI-A61-2 — Jini views (BLOCKED until C9c; not written here)
Re-open this sheet after `packages/user-management/src/react/kit.tsx` exists: add the three views behind the user-management kit, rename the feature classes, adapt the Tovu `.tsx` tests, swap `Login.tsx`/`Security.tsx` mounts. Do not start it without a fresh blob check of the two `.tsx` files (guards above).

## untangle overlap
- C9c (kit for user-management/react) blocks S2 only. Row 82 (`Login` parity sheet) overlaps `OwnerRecoverySignIn.tsx`: land S1/S3 first or hand S2 to row 82's sheet.
- R-admin/C11 edits `user-management/react/index.ts`: re-take the blob before S1.

## STOP specific to this sheet
- A hook's return object field differs from the sheet's list (the views depend on it).
- The `finally` clearing order cannot be preserved when splitting `submit`.
- A Tovu test needs an assertion changed.
