# website/features/member-login — 2 READY slices, 3 triaged (W1 #28). Written 2026-11-16 (group F) from Tovu `b28d38c6` / Jini `b7666092` (refactor/terra).
Skeleton facts: `make-sheet.py website/features/member-login --kind all` + CLASSIFY-files.tsv rows 771-774. Feature = 600 source lines (link-policy 39, link-service 174, oidc-login 247, providers 65, plus credentials/ready-providers/types/index/public-path which the backlog does not list).
Re-kinds: `oidc-login.ts` `stateCodec` (lines 87-99 today; the survey said 81-99) is a real HARDEN (one security parity row, P1 below). `link-policy.ts` stays MOVE (pure, no Tovu value: the `MemberRecord` dependency shrinks to a structural `{ id, status }`).
untangle_overlap: C3.repoint.tsv:387 (`link-service.ts` line 3, `isUniqueViolation` -> `@jini-ai/core/contracts/storage`), C4.repoint.tsv:194 (`oidc-login.ts` line 5, `OriginRegistryPort` -> `@jini-ai/core/contracts/server/verified-origin`). Both READY slices edit one of those files, so **both execute after wave B merge**. Each guards those files by exact text (not blob), and neither edits line 3 of link-service.ts or line 5 of oidc-login.ts, so the C3/C4 edits do not invalidate them.
Order: HD-member-login-1, then MV-member-login-1 (independent; either order works). Owner decisions needed: none for the READY slices; one coordinator question for the follow-up (Q-codec-port below).

| id | kind | files | tier | status |
|---|---|---|---|---|
| HD-member-login-1 | HARDEN (security) | oidc-login.ts `stateCodec` -> `@jini-ai/oauth` `createSealerStateCodec` | Sonnet executes; sheet by Opus | READY, after wave B |
| MV-member-login-1 | MOVE | link-policy.ts -> `@jini-ai/user-management/server` | Sonnet | READY, after wave B |
| HD-member-login-2 | HARDEN (Jini only) | the two weaker Jini codec copies in `@jini-ai/integrations` hosted-mcp | Opus | BLOCKED: Q-codec-port |
| SP-member-login-1 | SPLIT | link-service.ts | Opus | NOT FILLED (see triage) |
| SP-member-login-2 | SPLIT | oidc-login.ts flow (begin/complete/continuation) | Opus | NOT FILLED (see triage) |
| SP-member-login-3 | SPLIT | providers.ts | Opus | NOT FILLED: CORE-CONTRACT-NEEDED (agent-plugins contribution loader) |

---------------------------------------------------------------------------------------------------
## Slice HD-member-login-1 (template T-HARDEN) — sealer-backed state codec with the canonical-base64url check
Why HARDEN: Tovu's codec rejects a state whose base64url text is not the canonical encoding of its bytes before it reaches the sealer. Jini has no shared codec; its two hand-written copies (`packages/integrations/src/api-connections/hosted-mcp/sign-in.ts:588-596`, `shared-sign-in.ts:163-166`) lack that check. This slice adds the hardened codec to `@jini-ai/oauth` (new export, no existing Jini caller changes) and Tovu uses it. The integrations copies are HD-member-login-2 (blocked; they cannot import `@jini-ai/oauth`, COMMON rule 5).
Observable Tovu behaviour: unchanged. The non-canonical rejection now throws `OAuthError` (`OAUTH_INVALID_STATE`) instead of `MemberLoginError` `LOGIN_INVALID`, but both Tovu call paths catch every error and rethrow `LOGIN_INVALID`: path 1 `createSealedAuthorizationState.open` (Jini `sealed-state.ts:77-80` catch-all -> invalidState) inside `completeOidcLogin` (`oidc-login.ts:188-190` catch-all); path 2 `continuationCodec(...).open` inside `openLoginEmailContinuation` (`oidc-login.ts:244-246` catch-all). Tovu test `oidc-login.test.ts:82-85` ("tampered or expired state") keeps passing unchanged.
check:seal-aad: `apps/website/src/features/webhooks/seal-aad-invariant.ts` flags every `.seal(` call under `apps/website/src` without an object-literal `aad`. This slice REMOVES no Tovu `sealer.seal` call except the one inside `sealState`, and `sealState` STAYS (line 219 still calls it for the continuation, with its visible `aad`). The new Tovu code contains no `.seal(` call. Do not add one.
```
id: HD-member-login-1
feature: website/features/member-login
tovu_files:
  - apps/website/src/features/member-login/oidc-login.ts | text-guarded (C4 row edits line 5; pre-wave-B blob f82ed4f8cef092f2fc84469bc4c931e872d43269) | reduce-to-binding (stateCodec body only)
jini_survivor: @jini-ai/oauth (barrel) createSealedAuthorizationState at packages/oauth/src/sealed-state.ts | blob b19832aba0b31fbda95089966b149ccabe59837e (read-only; NOT edited). New sibling file packages/oauth/src/sealed-state-codec.ts. Barrel packages/oauth/src/index.ts | blob f80fdc2eb4621e4c1c007d51f66d655feb62fc8a
parity:
  - P1 (SECURITY): open() rejects a state that is not the canonical base64url encoding of its decoded bytes (padding, appended characters, alternate alphabet), before calling the sealer | Tovu oidc-login.ts:93-95 | Jini absent (no shared codec; integrations copies lack it) | generic? yes -> Jini
  - P2: seal() = sealer.seal({ plaintext, key: keyring.activeKey(), aad }) then base64url(JSON(sealed)); open() = sealer.open({ sealed: JSON.parse(...) }, { aad }) | Tovu oidc-login.ts:81-85, 96 | Jini absent as a reusable function | generic? yes -> Jini (carried with P1; no behaviour of its own to test beyond the round trip)
wire_drift: -   (the encoded state format is byte-identical: base64url of JSON of the sealer envelope; in-flight redirects and continuations still open)
jini_failing_tests: |
  NEW packages/oauth/tests/sealed-state-codec.test.ts, exactly (written BEFORE the Jini file; RED on the parent because the module is absent; the P1 cases are also RED against a codec without the check, since the fake sealer opens a padded state):
  import { describe, expect, it } from 'vitest';
  import type { SealedSecret } from '@jini-ai/core/contracts/vault';
  import { createSealerStateCodec } from '../src/sealed-state-codec.js';

  /** Fake AEAD: binds the plaintext to its AAD and refuses a different AAD on open. Counts opens. */
  function harness(aad = 'context-a') {
      const calls = { opens: 0, keys: [] as string[] };
      const sealer = {
          async seal({ plaintext, key, aad: bound }: { plaintext: string; key: { keyId: string }; aad: string }): Promise<SealedSecret> {
              calls.keys.push(key.keyId);
              return { keyId: key.keyId, alg: 'fake', ciphertext: Buffer.from(plaintext, 'utf8').toString('base64'), nonce: Buffer.from(bound, 'utf8').toString('base64') };
          },
          async open({ sealed }: { sealed: SealedSecret }, optional: { aad?: string } = {}): Promise<string> {
              calls.opens += 1;
              if (Buffer.from(sealed.nonce, 'base64').toString('utf8') !== optional.aad) throw new Error('authentication failed');
              return Buffer.from(sealed.ciphertext, 'base64').toString('utf8');
          },
      };
      const keyring = { async activeKey() { return { keyId: 'key-1' }; } };
      return { calls, codec: createSealerStateCodec({ sealer, keyring, aad }) };
  }

  describe('createSealerStateCodec', () => {
      it('round-trips through the sealer under the active key as unpadded base64url', async () => {
          const { calls, codec } = harness();
          const state = await codec.seal({ plaintext: '{"exp":1}' });
          expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
          expect(calls.keys).toEqual(['key-1']);
          expect(await codec.open({ state })).toBe('{"exp":1}');
      });

      it('refuses to open a state sealed under another AAD', async () => {
          const state = await harness('context-a').codec.seal({ plaintext: 'secret' });
          await expect(harness('context-b').codec.open({ state })).rejects.toThrow();
      });

      for (const [name, change] of [
          ['padding appended', (s: string) => `${s}==`],
          ['a line break appended', (s: string) => `${s}\n`],
      ] as const) {
          it(`rejects a non-canonical state (${name}) as OAUTH_INVALID_STATE without opening it`, async () => {
              const { calls, codec } = harness();
              const state = await codec.seal({ plaintext: '{"exp":1}' });
              await expect(codec.open({ state: change(state) })).rejects.toMatchObject({ code: 'OAUTH_INVALID_STATE' });
              expect(calls.opens).toBe(0);
          });
      }

      it('rejects the standard-alphabet spelling of a state that contains - or _', async () => {
          const { calls, codec } = harness();
          let state = '';
          for (let i = 0; !/[-_]/.test(state); i += 1) state = await codec.seal({ plaintext: `{"n":${i},"pad":"???>>>"}` });
          const standard = state.replace(/-/g, '+').replace(/_/g, '/');
          await expect(codec.open({ state: standard })).rejects.toMatchObject({ code: 'OAUTH_INVALID_STATE' });
          expect(calls.opens).toBe(0);
      });
  });
jini_change: |
  NEW packages/oauth/src/sealed-state-codec.ts, exactly:
  /**
   * @module sealed-state-codec
   *
   * The site-key codec for a sealed authorization state: the host's authenticated sealer encrypts the
   * state under a context AAD, and the sealed envelope travels as base64url JSON. No crypto lives here.
   */
  import type { AuthorizationStateCodec } from '@jini-ai/core/contracts/oauth';
  import type { KeyringPort, SecretSealerPort } from '@jini-ai/core/contracts/vault';
  import { invalidState } from './pending-authorizations.js';

  /** What the codec needs: the host's sealer, its keyring, and the AAD this state is bound to. */
  export interface SealerStateCodecPorts {
      readonly sealer: Pick<SecretSealerPort, 'seal' | 'open'>;
      readonly keyring: Pick<KeyringPort, 'activeKey'>;
      /** Context AAD; a state sealed under one AAD never opens under another. */
      readonly aad: string;
  }

  /** Seals with the keyring's active key; opens only the canonical base64url spelling of a sealed envelope.
   * @example createSealedAuthorizationState({ clock, workspaceId, serverId, codec: createSealerStateCodec({ sealer, keyring, aad }) })
   * @throws {OAuthError} `OAUTH_INVALID_STATE` from `open` for a non-canonical state; sealer errors propagate.
   * @complexity O(state bytes) per seal/open.
   */
  export function createSealerStateCodec({ sealer, keyring, aad }: SealerStateCodecPorts, _optional = {}): AuthorizationStateCodec {
      return {
          async seal({ plaintext }) {
              const sealed = await sealer.seal({ plaintext, key: await keyring.activeKey({}), aad });
              return Buffer.from(JSON.stringify(sealed), 'utf8').toString('base64url');
          },
          async open({ state }) {
              const bytes = Buffer.from(state, 'base64url');
              // Node's permissive decoder otherwise accepts appended garbage or alternate encodings.
              if (bytes.toString('base64url') !== state) throw invalidState({});
              return sealer.open({ sealed: JSON.parse(bytes.toString('utf8')) }, { aad });
          },
      };
  }
  EDIT packages/oauth/src/index.ts: after the line
  export type { AuthorizationStateCodec, SealedAuthorizationState } from './sealed-state.js';
  insert the line
  export { createSealerStateCodec, type SealerStateCodecPorts } from './sealed-state-codec.js';
new_options: -   (no option; the codec is new, so no existing Jini caller changes)
changeset: .changeset/oauth-sealer-state-codec.md: '---\n"@jini-ai/oauth": minor\n---\n\nAdd `createSealerStateCodec`: a sealed-authorization-state codec over a host sealer and keyring that opens only canonical base64url state.\n'
tovu_binding_or_repoint: |
  apps/website/src/features/member-login/oidc-login.ts (each OLD must occur exactly once):
  (1) OLD: import { beginAuthorizationCode, completeAuthorizationCode, createSealedAuthorizationState, validateOidcIdToken,
      NEW: import { beginAuthorizationCode, completeAuthorizationCode, createSealedAuthorizationState, createSealerStateCodec, validateOidcIdToken,
  (2) OLD (13 lines):
  function stateCodec({ deps, aad }: { deps: OidcLoginDeps; aad: string }, _optional = {}) {
    return {
      async seal({ plaintext }: { plaintext: string }, _options = {}) {
        return sealState({ deps, plaintext, aad });
      },
      async open({ state }: { state: string }, _options = {}) {
        const bytes = Buffer.from(state, "base64url");
        // Node's permissive decoder otherwise accepts appended garbage or alternate encodings.
        if (bytes.toString("base64url") !== state) throw new MemberLoginError({ code: "LOGIN_INVALID" });
        return deps.sealer.open({ sealed: JSON.parse(bytes.toString("utf8")) }, { aad });
      },
    };
  }
      NEW (4 lines):
  /** This site's sealer, keyring and `aad` bound to `createSealerStateCodec` (`@jini-ai/oauth`); every open error becomes LOGIN_INVALID in the callers. */
  function stateCodec({ deps, aad }: { deps: OidcLoginDeps; aad: string }, _optional = {}) {
    return createSealerStateCodec({ sealer: deps.sealer, keyring: deps.keyring, aad });
  }
  Nothing else changes: `sealState` (lines 81-85) stays (line 219 uses it); `MemberLoginError` is still used elsewhere in the file (keep its import).
tovu_tests: apps/website/src/features/member-login/__tests__/oidc-login.test.ts (blob 56f489b05b9360305e7a2dcf749cf14501f10498): no edit (it drives the binding end to end; line 85's tampered state still ends LOGIN_INVALID).
census: rg -n --no-heading "stateCodec|createSealerStateCodec" apps --glob '!**/node_modules/**' | allowed BEFORE: [oidc-login.ts:87, oidc-login.ts:104, oidc-login.ts:199]; AFTER: [oidc-login.ts:6 (import), the new stateCodec declaration + its body line, oidc-login.ts call sites 104 and 199 shifted up by 9 lines]
jini_msg: "feat(oauth): createSealerStateCodec, a sealer-backed state codec that opens only canonical base64url" | body "Extracted from a host's member-login codec; the integrations copies are a follow-up."
tovu_msg: "refactor(member-login): state codec from @jini-ai/oauth createSealerStateCodec" | body "Tovu keeps sealState for the emailed-code continuation seal (check:seal-aad sees its aad)."
extra_stops: |
  - `rg -n "\.seal\(" apps/website/src/features/member-login/oidc-login.ts` after the edit must print exactly one line (inside sealState). Two or more: STOP.
  - If `rg -n "createSealerStateCodec|SealerStateCodecPorts" packages/oauth/src` prints anything before step 1, STOP (already added).
  - If `rg -n '"./contracts/vault"' packages/core/package.json` prints nothing, STOP (the type import has no subpath).
  - P1 is security-relevant: the four `it` blocks above are the failing tests; never drop or soften one (`toMatchObject({ code })` and `calls.opens === 0` stay).
```
Expected cloud run: Jini `npm --prefix packages/oauth run test -- sealed-state-codec` RED on the parent (module missing), GREEN on the commit; oauth typecheck. Tovu: typecheck after linking, `node --test` of `oidc-login.test.ts`, `npm run check:seal-aad`.

---------------------------------------------------------------------------------------------------
## Slice MV-member-login-1 (template T-MOVE) — the pure link decision into `@jini-ai/user-management/server`
Decision: the Tovu `MemberRecord` import becomes a structural Jini type `LoginLinkMember = { readonly id: string; readonly status: string }` (the only two fields read). Tovu's `MemberRecord` is assignable to it, so no caller changes shape. The blocked statuses `"disabled"`/`"trash"` move verbatim (generic soft-delete/disabled states; no behaviour change).
```
id: MV-member-login-1
feature: website/features/member-login
precondition: -
tovu_files:
  - apps/website/src/features/member-login/link-policy.ts | blob e8e62acab80306a0db5217947bdc0f2aab6b5d6b | delete
  - apps/website/src/features/member-login/index.ts | blob 189497485155198e1a0f1cfc87f6147e9a7df022 | keep-reduced (delete its line 6)
  - apps/website/src/features/member-login/link-service.ts | text-guarded (C3 row edits line 3; pre-wave-B blob 58bbdb3ba7cf3be3cacc903505fd42ceca308af8) | edit line 8 only
tovu_tests:
  - apps/website/src/features/member-login/__tests__/link-policy.test.ts | blob 47d6544eddf462edc2c4856b97d3e0699073ab77 | move-to-jini
jini_target: user-management ./server packages/user-management/src/server/link-policy.ts
jini_guards:
  - packages/user-management/src/server/link-policy.ts must not exist; packages/user-management/src/server/__tests__/link-policy.test.ts must not exist
  - packages/user-management/src/server/index.ts blob 2d460d9a1ee516908df2816a9de92eee088b93f6
  - rg -n "decideMemberLogin|LinkDecision|LoginLinkMember" packages/user-management/src -> prints nothing
symbol_map:
  - decideMemberLogin -> @jini-ai/user-management/server decideMemberLogin (shape already (required, optional = {}); `member` type MemberRecord | null -> LoginLinkMember | null)
  - LinkDecision -> @jini-ai/user-management/server LinkDecision (no Tovu importer today; exported for hosts)
  - (new) LoginLinkMember, exported type
values_injected: -
leaf_import_rewrites:
  - 'import type { MemberRecord } from "../members/index.js";' -> deleted; in its place (line 1) insert the declaration block below after the import of login-types
  - 'import type { VerifiedLoginIdentity } from "./types.js";' -> 'import type { VerifiedLoginIdentity } from "./login-types.js";'
header_rewrite: |
  insert as line 1 (the file has no @file block today):
  /** Pure member-login link decision: which of sign-in, link, create, inbox proof, block or conflict applies. */
  then, after the login-types import line and a blank line, insert:
  /** The two member fields the decision reads; a host's member record is assignable. */
  export interface LoginLinkMember {
    readonly id: string;
    readonly status: string;
  }
  and replace the two occurrences of `MemberRecord | null` (lines 6 and 26) with `LoginLinkMember | null`. Nothing else changes; the "owner 10-24" phrase in the decideMemberLogin doc stays (a date, not a product name).
why_moves: -
deletions_in_copy: -
entry: -   (existing ./server subpath, runtime node)
jini_index: packages/user-management/src/server/index.ts: after "} from './login-types.js';" (occurs once) insert "export { decideMemberLogin, type LinkDecision, type LoginLinkMember } from './link-policy.js';"
census:
  cmd: rg -n --no-heading "link-policy|decideMemberLogin" apps content development --glob '!**/node_modules/**'
  allowed: [apps/website/src/features/member-login/link-service.ts:8, apps/website/src/features/member-login/link-service.ts:70, apps/website/src/features/member-login/index.ts:6, apps/website/src/features/member-login/__tests__/link-policy.test.ts:3 and its decideMemberLogin call lines, apps/website/src/features/member-login/link-policy.ts:24, development/scripts/check-architecture.baseline.json:210 (leave it: the checker fails only on INTRODUCED edges, `introducedCrossFeatureEdges` in check-architecture.ts:279), apps/website/src/features/identity/__tests__/tool-registrations.human-confirm.test.ts:447,452 (unrelated string "link-policy", no edit)]
importer_edits:
  - apps/website/src/features/member-login/link-service.ts: 'import { decideMemberLogin } from "./link-policy.js";' -> 'import { decideMemberLogin } from "@jini-ai/user-management/server";'
  - apps/website/src/features/member-login/index.ts: delete the line 'export { decideMemberLogin } from "./link-policy.js";' (no importer uses it through the facade; COMMON rule 19)
test_edits: |
  NEW packages/user-management/src/server/__tests__/link-policy.test.ts = the Tovu test byte for byte, then:
  - 'import test from "node:test";' -> 'import { test } from "vitest";'
  - 'import { decideMemberLogin } from "../link-policy.js";' unchanged (same relative path)
  - 'import type { MemberRecord } from "../../members/types.js";' -> 'import type { LoginLinkMember } from "../link-policy.js";'
  - 'const member: MemberRecord = { id: "member", workspaceId: "ws", email: "old@example.com", status: "active",' + next line '  version: 1, createdAt: "2026-10-24T12:00:00Z", updatedAt: "2026-10-24T12:00:00Z" };' -> 'const member: LoginLinkMember = { id: "member", status: "active" };'
  - `for (const status of ["disabled", "trash"] as const)` unchanged. Every assertion unchanged.
  Then `git rm -q` the Tovu test.
changeset: .changeset/user-management-member-link-policy.md: '---\n"@jini-ai/user-management": minor\n---\n\nAdd `decideMemberLogin` (with `LinkDecision`, `LoginLinkMember`) to `@jini-ai/user-management/server`: the pure federated-login link decision.\n'
jini_msg: "feat(user-management): decideMemberLogin, the pure federated-login link decision" | body "Moved from a host; the member record is narrowed to the id and status it reads."
tovu_msg: "refactor(member-login): link decision from @jini-ai/user-management/server" | body "link-service imports decideMemberLogin from Jini; the facade export had no importer."
extra_stops: if link-service.ts line 8 text differs from the OLD above, or `rg -c "MemberRecord" packages/user-management/src/server/link-policy.ts` after the copy is not 0, STOP.
```
Expected cloud run: Jini `npm --prefix packages/user-management run test -- link-policy`; Tovu typecheck, `link-service.test.ts`, `link-service.dialects.test.ts`.

---------------------------------------------------------------------------------------------------
## Triage (not executable this run)
- **HD-member-login-2** — BLOCKED, Q-codec-port: the two integrations copies (`sign-in.ts:588-596`, `shared-sign-in.ts:163-166`) lack P1, but `@jini-ai/integrations` may not import `@jini-ai/oauth` (COMMON rule 5). It already reaches oauth through the injected `ports.flow` (`OAuthFlowOperations` in `packages/core/src/contracts/oauth/flow.ts:210`). Recommended: add `createSealerStateCodec(required: SealerStateCodecPorts, optional?): AuthorizationStateCodec` to `OAuthFlowOperations` (core contract, minor), have the oauth flow-operations object return it, and replace both inline codecs with `ports.flow.createSealerStateCodec({ sealer, keyring, aad })`. Behaviour change in Jini (non-canonical states refused earlier; same public error) = failing tests first in `packages/integrations/src/api-connections/hosted-mcp/__tests__/`. Coordinator: confirm the contract addition.
- **SP-member-login-1 (link-service.ts, 174)** — NOT FILLED, Opus. Survey: MOVE `decisionFor/assertSubjectOwner/proofMatchesTarget/linkInTransaction` to `user-management/server` behind ports (identities, members, sessions, lockKey, transaction). It imports 5 names from Tovu `members` (`completeSignIn`, `createMember`, `issueMemberSession`, `requestSignInLink`, `notifyMemberCreated`) plus `ContentKernel` types: 6+ ports, over the 3-port Sonnet cap. After MV-member-login-1 and the C3 merge.
- **SP-member-login-2 (oidc-login.ts flow, ~230 after HD-1)** — NOT FILLED, Opus. Moving begin/complete/continuation into `user-management` would import `@jini-ai/oauth` (rule 5: STOP); it must take the flow through `OAuthFlowOperations` (core contract) as integrations does, and the hard-coded `"Tovu members"` / `"tovu-member-login"` client identity and the `/api/members/v1/...` callback path become required values. After HD-1 and the C4 merge.
- **SP-member-login-3 (providers.ts, 65)** — NOT FILLED, CORE-CONTRACT-NEEDED: `fingerprint`/pin compare depend on `@jini-ai/agent-plugins/manifest` + Tovu's contribution loader; the file name `tovu-login-providers.json` stays in Tovu.
