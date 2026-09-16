# Opus Audit — peer subagents' work, 2026-09-03

- **Auditor:** Software Architect (Audit), Opus 5 (1M context), ad-hoc dispatch — NOT the spec pipeline. Spec-hash resolution, Implementation Outline, and CIC deliberately skipped per directive.
- **Bootstrap:** `AI-Dev-Shop/agents/programmer/skills.md` (Programmer Agent v1.7.1) read before any work.
- **Mode:** READ-ONLY. No file in either tree was edited, staged, or committed by this audit. The only file created is this report.
- **Scope:** Tovu `/Users/la/Programming/Tovu` @ `restructure/apps-website-phased`, 45 commits since 2026-09-03 09:45; Jini `/Users/la/Programming/Jini`, 15 commits. Excluded per directive: Tovu `03e6637e`, `807aad7d`, `9dbfa0e7`, `06624d8c`; Jini `95f24174`.
- **npm observations timestamped** — an agent named `jini-publish` was publishing concurrently. Two passes recorded: **2026-09-03T18:59Z** and **2026-09-03T19:19Z**.

---

## Findings, worst first

### 1. CONFIRMED — Four Jini packages carry today's source under an ALREADY-PUBLISHED version number; production installs the stale tarball

**Where:** `/Users/la/Programming/Tovu/package.json` (caret ranges) + `/Users/la/Programming/Tovu/Dockerfile:44` (`RUN npm install`, not `npm ci`).

**Evidence (recorded 2026-09-03T19:19:36Z, after `jini-publish` had already moved daemon 0.3.1→0.3.2, protocol 0.3.0→0.3.1, agent-runtime 0.3.1→0.3.2):**

| package | local version | published version | today's commits inside it | in the published tarball? |
|---|---|---|---|---|
| `@jini-ai/http-kit` | 0.3.2 | **0.3.2** | `fc8391ec`, `fb1c52cb` | **NO** — `grep withReadOnlyToolConstraint` → 0 hits; `constrainPrincipalToReadOnlyTools` → 0 hits |
| `@jini-ai/cms` | 0.3.4 | **0.3.4** | `c00871ac`, `b41b1fe3` | **NO** — `grep ENOENT` → 0 hits |
| `@jini-ai/integrations` | 0.3.4 | **0.3.4** | `7d564955`, `9b1797f5`, `1666fc71` | **NO** — `grep SqliteAsyncOperationStore` → 0 hits |
| `@jini-ai/chat` | 0.3.3 | **0.3.3** | `fc083332` | **NO** (version unchanged since 2026-09-02T22:23Z) |
| `@jini-ai/ui` | 0.3.4 | 0.3.4 (pub. 18:26Z) | `03a230ef`, `a48a86bf` | YES — `buildIsolatedSandboxProxyHtml` present. `ab370d95`'s pin is valid. |

Method: `npm pack` each published version into the scratchpad, extract, grep the `dist/`. Not inferred from version strings.

**This is the FIFTH through EIGHTH instance of the symlink trap**, beyond the four already known (`@jini-ai/cms` chat-hang, `@jini-ai/ui`, `daemon`+`protocol`, `agent-runtime`/`reasoningInModelId`). The mechanism is the same: Tovu's `node_modules/@jini-ai/*` are symlinks to the local checkout, so every local test passes against local source, while the Docker build's `npm install` resolves `^0.3.4` → the stale 0.3.4 tarball. **Because the version number did not change, there is no signal anywhere that the installed code is different from the tested code.** A version *mismatch* would at least be visible; an unchanged version under changed source is silent.

**Failure scenario:** deploy the current Tovu image. `LocalFsBlobStore.exists()` still returns `false` on an EPERM stat (`c00871ac` absent). A failed post-upload hook still leaves orphaned media rows (`b41b1fe3` absent). A queued chat turn can still misroute into another conversation (`fc083332` absent).

**Fix:** bump the patch version of `http-kit`, `cms`, `integrations`, `chat` and publish with `pnpm publish` (never `npm publish` — it ships literal `workspace:*`). Then confirm Tovu's caret ranges admit the new versions.

**Mitigation already in place for http-kit only:** see finding 6 — Tovu does not depend on http-kit's copy of the read-only control.

---

### 2. CONFIRMED — `dc326086` makes `markNeedsReauth` throw on a path that must never lose the terminal signal; the model will keep hammering a dead OAuth connection

- **SHA:** `dc326086` (`fix(external-mcp-oauth): retry a failed re-seal, then surface it instead of a silent mismatch`)
- **Defect:** the new `throw error` after `CLEAR_TOKEN_RESEAL_ATTEMPTS` exhaustion (`/Users/la/Programming/Tovu/apps/website/src/assistant/external-mcp-oauth.ts:694-703`) propagates out of `setOAuthStatus`, and `markNeedsReauth`'s two real call sites do not guard it.

`/Users/la/Programming/Tovu/apps/website/src/platform/oauth/token-refresh.ts:141`:
```ts
await deps.port.markNeedsReauth(key, "the provider issued no refresh token and the access token has expired");
throw needsReauthError("no refresh token");        // line 142 — NEVER REACHED if line 141 throws
```
`/Users/la/Programming/Tovu/apps/website/src/platform/oauth/token-refresh.ts:153`:
```ts
await deps.port.markNeedsReauth(key, "the provider rejected the stored refresh token");
throw needsReauthError("the provider rejected the stored refresh token");   // line 154 — same
```

**Failure scenario:** a connection's refresh token is rejected (`OAUTH_INVALID_GRANT`) at the same time the keyring's active key is briefly unresolvable. `markNeedsReauth` → `setOAuthStatus(clearToken: true)` → open succeeds, re-seal fails 3× → throws `ExternalMcpSecretStoreUnconfiguredError`. That error replaces `needsReauthError`. It then reaches `external-mcp-oauth.ts:924-931`, whose catch is:
```ts
if (isOAuthError(error) && error.code === "OAUTH_INVALID_GRANT") { ... }
```
`ExternalMcpSecretStoreUnconfiguredError` is not an `OAuthError`, so the branch is skipped and the raw secret-store error propagates as a transient-looking failure.

**Why this is a defect and not a judgement call:** `external-mcp-oauth.ts:897-907` documents this exact hazard for the *sibling* path and deliberately avoids it — "Letting that escape would hand the caller an incidental error in place of the terminal one, and every consumer branches on the CLASS: the connection gate would not engage, the in-chat `external_mcp_reauth_prompt` surface would never render, and the 'do not retry' sentence a model needs in order to stop hammering a dead connection would be gone." `dc326086` reintroduces on the `token-refresh.ts` path precisely what that comment forbids on the `reportAuthFailure` path.

**`dc326086`'s own claim is wrong.** Its message says "No new error surface: every caller already reacts to this class … markNeedsReauth's only path … already folds any resolveAccessToken failure into the reason string." The *boot-report string* does absorb it; the *error class consumers branch on* does not. This is the disclosed-but-inaccurate variety, not an undisclosed change.

**Fix:** wrap both `markNeedsReauth` call sites in `token-refresh.ts` the way `external-mcp-oauth.ts:908-916` already does — catch the write failure, carry it as `cause`, and still throw `needsReauthError`.

---

### 3. CONFIRMED — `922f2ef6` + `64e6c029`: the credential redaction has a Basic-auth hole, a false doc comment, and a vacuous regression test

All in `/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/credentialed-request.ts`.

**3a. Basic-auth base64 payload is not covered (security).**
`credentialed-request.ts:715`:
```ts
const responseSecrets: readonly string[] = [authorizationHeader, connection.token];
```
`buildAuthorizationHeader` (`:392-398`) returns `` `Basic ${base64(username:token)}` `` when a username is saved. The base64 payload **on its own** equals neither `authorizationHeader` (which carries the `Basic ` prefix) nor `connection.token` (which is not base64-encoded). The comment immediately above, `credentialed-request.ts:711-713`, claims otherwise:
> "the credential's own raw token (**covers a Basic scheme's base64 payload being echoed**, and a bare token appearing on its own)"

That is false. **Failure scenario:** a Basic credential (memory records name.com requires exactly this shape) against an endpoint whose 401 body reads `{"error":"bad credentials 'dXNlcjpodW50ZXIy'"}` — the base64 of `username:token` reaches the model verbatim. `redactSecretSubstrings` never matches it.
**Fix:** add the base64 payload itself to `responseSecrets` (the substring after `Basic `).

**3b. Short Basic passwords withhold every response body (undisclosed availability regression).**
`credentialed-request.ts:737` gates on the RAW token length:
```ts
bodyText: resolveRedactedResponseBody(response.bodyText, connection.token, responseSecrets),
```
with `MIN_SAFE_BODY_REDACTION_TOKEN_LENGTH = 8`. `922f2ef6`'s message justifies the floor as "far below any realistic API token" — true for Bearer, **false for Basic, where `token` is a password**. Any Basic credential with a <8-character password now returns `[body withheld: credential too short to redact safely]` for **every** request, even though the actually-reflectable secret (the base64 blob) is long and safely scrubbable. The commit does not disclose this.
**Fix:** gate on the length of the shortest secret actually placed in `responseSecrets`, not on `connection.token`.

**3c. `redactResponseHeaders` matches by SUBSTRING while three separate places claim exact match (false comment + silent over-drop).**
`credentialed-request.ts:238`:
```ts
if (secrets.some((secret) => secret !== "" && value.includes(secret))) continue;
```
Contradicted by:
- `922f2ef6`'s commit message: "Response headers are unaffected and keep their **exact-match**, whole-header-drop behavior";
- the module doc at `credentialed-request.ts:93-95`: "every other header passes through unless it **contains the exact** injected `Authorization` value or the raw token";
- the test comment: "they redact by **exact-name/exact-value match**, which has no partial-mangling failure mode regardless of secret length".

**Failure scenario:** token `"ab"`. Every response header whose value contains `ab` anywhere — `Content-Disposition: attachment; filename=…`, any `X-Request-Id` containing `ab` — vanishes silently. The commit's own reasoning ("dropping a header has no partial-mangling failure mode regardless of secret length") is true about *mangling* and false about *over-dropping*, and it is the stated basis for applying no length floor to headers.

**3d. The regression test for 3c passes for the wrong reason.**
`/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/__tests__/credentialed-request.unit.test.ts` (added by `922f2ef6`):
```ts
assert.equal(result.headers["X-Safe-Header"], "safe-value");
```
`"safe-value"` does not contain `"ab"`, so the assertion cannot distinguish the current behaviour from a correct exact-match implementation. It proves nothing about the claim its own comment makes ("Headers are unaffected by the short-token body policy"). A header value of `"table"` would fail.

---

### 4. CONFIRMED — `8b7206f9`: an unreadable credential row is silently excluded from the backfill's pending count, so `--apply` never attempts it

- **SHA:** `8b7206f9` (`fix(backfill): make custom-credential-username backfill's pending count converge`)
- **Location:** `/Users/la/Programming/Tovu/development/scripts/backfill-custom-credential-usernames.ts:268-270`

```ts
    } catch {
      continue;
    }
```

`countPending()` now decrypts each `username IS NULL` row to decide whether it is genuinely pending. A row whose sealed payload cannot be opened (rotated/lost root-key generation — the file's own header names this as reachable) is silently dropped from the count. `main()` at `:303-306` then short-circuits:

```ts
  const pending = await countPending(db, { sealer, keyring });
  if (pending === 0) {
    console.log("Nothing to migrate — every custom_credential_sets row already has a username column value (or genuinely has none to backfill).");
    return;
  }
```

**Failure scenario:** one corrupted/old-key row, no others pending. The operator sees `Nothing to migrate`, exit 0. `runCustomCredentialUsernameBackfill` — the loop that logs `FAILED` per row and sets `process.exitCode = 1` — never runs. The row is invisible forever.

**This makes two comments in the same file false:** the "Failure isolation" contract at `:37` and `:63-64` ("exits non-zero if ANY row failed … never a short-circuit that stops the sweep partway through"), and `countPending`'s own doc at `:239-241` ("the apply loop's own per-row FAILED log line plus non-zero exit already surfaces it … the first time this row is actually attempted") — the row is now never attempted. No test covers the undecryptable-row case.

**Fix:** count an undecryptable row as pending (or track it separately and force a non-zero exit) rather than `continue`.

---

### 5. CONFIRMED — `6a3c9199`: the TOML dedupe misses a header with a trailing comment, reproducing the crash it exists to prevent

- **SHA:** `6a3c9199` (`fix(daemon): dedupe [mcp_servers.jini] before appending to a real Codex config.toml`)
- **Location:** `/Users/la/Programming/Jini/packages/daemon/src/agent-executor.ts:1315`

```ts
const header = /^\s*\[([^[\]]+)\]\s*$/.exec(line);
```

Verified by direct probe: the regex matches `[mcp_servers.jini]` but returns `null` for `[mcp_servers.jini] # legacy`. A trailing comment is legal TOML and the hand-edited config is exactly the scenario the commit message names as its target. The existing table is not stripped, the fresh table is appended anyway, and Codex fails on the duplicate key. `[[...]]` array-of-tables syntax is likewise unmatched (lower likelihood for this config shape). No test covers either.

**Fix:** strip a trailing `#`-comment before applying the header regex.

---

### 6. CONFIRMED — `fc8391ec` was inert; `fb1c52cb` fixed the inertness, but the result is a SECOND copy of a security control Tovu already owned

- **SHAs:** `fc8391ec` + `fb1c52cb` (Jini `packages/http-kit/src/delegated-tools.ts`)
- **Status of the original defect:** closed. `withReadOnlyToolConstraint` is now invoked at `/Users/la/Programming/Jini/packages/http-kit/src/delegated-tools.ts:422`, inside `delegatedToolExecuteRoute.handle`, whenever `input.requireReadOnly === true`. It is no longer a mechanism nothing calls.
- **Tovu's production posture is unaffected either way**, and this is the reason finding 1's http-kit row is not a production emergency: Tovu supplies its own equivalents.
  - `/Users/la/Programming/Tovu/apps/website/src/assistant/tool-executor-stack.ts:61` wraps the BARE executor with Tovu's own `withReadOnlyToolConstraint` — the innermost composition http-kit's own doc prescribes.
  - `/Users/la/Programming/Tovu/apps/website/src/server/inbound/assistant/agent-daemon-server.ts:797` attenuates the principal via Tovu's own `constrainPrincipalToReadOnlyTools`.
  - `agent-daemon-server.ts:838` passes `toolRegistry: registry`, so the outer check in published http-kit@0.3.2 (`checkReadOnlyConstraint`, which shipped 2026-09-02 in `51f9f03b`) is live and fails closed.
  - The doc claim at `delegated-tools.ts:206` — "see `read-only-tool-constraint.ts` in Tovu's own `apps/website`, the consumer this was ported from" — is TRUE; that file exists, dated 2026-09-02.
- **The residual defect, PLAUSIBLE:** the same security control now has two hand-maintained implementations that must not drift, with **different refusal-message constants** — Tovu's `READ_ONLY_UNCHECKABLE_MESSAGE` (`read-only-tool-constraint.ts:100`) vs http-kit's `READ_ONLY_UNVERIFIABLE_MESSAGE` (`delegated-tools.ts:119`), and `readOnlyToolRefusalMessage` vs `readOnlyRefusalMessage`. Both delegate the core predicate to `@jini-ai/core`'s `isReadOnlyTool`, so the *decision* is shared; the *wrappers and their user-visible text* are not. Once http-kit 0.3.3 ships, Tovu's route will attenuate twice and wrap twice (idempotent, but a second registry scan per constrained call), and a test asserting exact refusal text will match only one of the two. **What would settle it:** decide which copy is canonical and delete or re-export the other before http-kit publishes.

---

### 7. CONFIRMED — `b41b1fe3`: the compensating rollback is itself unguarded and can hide the original error while creating a new partial state

- **SHA:** `b41b1fe3` (Jini)
- **Location:** `/Users/la/Programming/Jini/packages/cms/src/media/tool-registrations.ts:220-238`

```ts
} catch (err) {
  // The original hook error is rethrown unchanged.
  await rollbackUploadedMedia({ ... });   // :227 — not itself wrapped
  throw err;                               // :236 — only reached if rollback succeeds
}
```

`rollbackUploadedMedia` → `removeMediaRowsAndTombstoneBlob` (`/Users/la/Programming/Jini/packages/cms/src/media/media-service.ts:551-561`) performs three sequential unprotected awaits with no transaction (`:555`, `:556`, `:559`).

**Failure scenario:** the post-upload hook throws; rollback deletes the rendition rows at `:555`; `mediaRepo.remove` throws at `:556`. The rollback's error propagates instead of the real cause, `throw err` never runs, and the row set is left in a state that did not exist before this commit — renditions gone, media row orphaned. Pre-fix all three survived together, orphaned but internally consistent.

The comment at `tool-registrations.ts:226` ("The original hook error is rethrown unchanged") and the commit message ("then rethrows the original error unchanged") are both false whenever the rollback fails. No test exercises a failing rollback.

**Fix:** wrap the rollback in its own try/catch, log the rollback failure, and rethrow the original `err` regardless.

---

### 8. CONFIRMED — `95bd5f9d` strengthened a guard no CI job runs, and by its own account leaves it exiting 1

- **SHA:** `95bd5f9d` (`fix(webhooks): scan git history, not just the tip, for secret-scan-guard`)
- The scan itself is real and well built (`git rev-list --objects --all`, blob-SHA dedupe, same patterns/skip-list/allowlist, wired into `main()` at `/Users/la/Programming/Tovu/apps/website/src/features/webhooks/secret-scan-guard.ts` — both scans run, either failing exits 1).
- **But:** `grep -rn "check:secret-scan" .github/` returns **nothing**. The only reference in the repo is `/Users/la/Programming/Tovu/package.json:50`. Consistent with the standing finding that no `check:*` gate can fail a build; this one is not invoked by `ci.yml` or `fly-deploy.yml` at all.
- **And:** the commit's own message reports that running the new history scan against this repo surfaces **19 hits** with **no allowlist entries added** ("whether to accept that known historical exposure is the owner's call"). So `npm run check:secret-scan` now exits 1 on a clean tree. **This is an owner decision that is currently parked, not a defect** — but if anyone wires this into CI without resolving those 19 hits first, CI goes permanently red on the first run.
- `fbc0a37b` (allowlist scoped to the exact matched value) is a genuine tightening and is correct: `isAllowlisted(file, patternName, value)` at `secret-scan-guard.ts` now requires all three. Note its Gemini allowlist entry's own reason admits the entry can never fire ("this pattern's lookaround means this value never actually matches … kept as documentation and a backstop") — honestly documented dead config, not a defect.

---

### 9. CONFIRMED (already disclosed) — `7d564955` + `9b1797f5` + `1666fc71` protect nothing running

`grep -rln "createSqliteAsyncOperationStore\|createInMemoryAsyncOperationStore\|OperationRuntimeDeps"` across both repos (excluding `node_modules`/`dist`) matches only the definition files, the `index.ts` re-export, and `__tests__`. No host constructs an `AsyncOperationStore`. `7d564955`'s message discloses this outright, so it is not a hidden defect — but it means the fail-closed depth-bound fix and the lease-fencing fix are currently inert, **and** compounding with finding 1, the package they live in is unpublished anyway.

Related, PLAUSIBLE and low: `/Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/operation-runtime.ts:334` and siblings increment `completed/failed/pending/unknown` unconditionally after a `store.update(..., {leaseOwner})` that `1666fc71` made a documented no-op under a stale lease. `PollDueStats` can report an outcome the worker did not cause. Unreachable today; revisit when wired.

---

### 10. CONFIRMED, low — `4e031ee3` is labelled `test(...)` but rewrites production source

- **SHA:** `4e031ee3` (Co-Authored-By: Gemini 3.8 Flash)
- **Location:** `/Users/la/Programming/Tovu/apps/website/src/server/inbound/admin-http/routes/redirects/tombstone.ts:31`

A 5-line `res.status(403).json({...})` is collapsed to one 200+ character line. **Behaviour-identical** — same fields, same order, verified against the post-commit file. But `git log --oneline -- tombstone.ts` now attributes the last change to that production file to a `test(...)` commit. This is the same class of history-lies-about-content hazard as `64e6c029`, at much lower severity.

---

### 11. CONFIRMED, low — `c95b3b0e` asserts the error CLASS without the message

`/Users/la/Programming/Tovu/apps/website/src/features/redirects/__tests__/repo.contract.test.ts:247-254`:
```ts
await assert.rejects(
  () => repo.tombstone({ workspaceId: "ws-1", id: "non-existent", revision: makeRevision(record) }),
  RedirectNotFoundError
);
```
Both new `assert.rejects` calls pass only the class — Node checks `instanceof`, no message. The standing rule here is to assert the exact error text; the other 14 test commits in this range do. A wrong-error-type regression is still caught; a wrong-id-in-the-message regression is not.

---

## Known-weak spots — dispositions

**1. The `b80d76c0` / `fbacdf70` revert — CLEAN, and nothing depends on the removed HMAC.**
`git diff b80d76c0~1 fbacdf70 --stat` shows only the files belonging to `922f2ef6`, `c412bc75`, and `8b7206f9` (which landed in between). None of `b80d76c0`'s five files survive in modified form. `grep deriveDelegatedToolCredential|requireDelegatedToolCredential` across both repos returns **zero** hits outside the reverted commit. Jini's `agent-executor.ts` credential-resolver machinery (`JINI_DAEMON_TOKEN`, per-run resolver) predates today and works correctly with the raw boot token that the revert restored. **The underlying vulnerability is real and remains unfixed** — the boot-wide `TOVU_AGENT_DAEMON_TOKEN` is still handed to the spawned CLI's `jini-mcp` subprocess (`mcp-injection.ts`), contradicting the token's own doc. The revert's proposed fix (make the global gate accept either the raw token or the per-run HMAC for a live `runId`) still stands as the correct shape.

**2. The inert-mechanism sweep.** `fc8391ec`'s shape was hunted across all 60 commits. One further instance found (finding 9, `7d564955`'s whole tier — self-disclosed). Every other security/guard-shaped commit in range has a live non-test caller: `c412bc75`'s `openContentDbReadOnly` is wired into the real `--dry-run` branch of all seven scripts with SQLite driver-level `readonly: true`; `9b1797f5`'s depth throw is reachable at `MAX_STATE_DEPTH = 12`; `fbc0a37b`'s `isAllowlisted` is called from the scan loop; `d3834ec2`'s data-URL proxy resolves against a published `@jini-ai/ui@0.3.4` that genuinely contains `buildIsolatedSandboxProxyHtml`. Two commits (`4f02362e`, `c00871ac`) fix a `BlobStorePort.exists()` with **zero production callers in either repo** — but both commit messages say so explicitly, so they are latent-gap closures, not decorative fixes.

**3. The message/content mismatch sweep.** Every commit's subject was compared against its actual diff paths. **`64e6c029` is the only content-level mismatch** (credential redaction under a taxonomy message), and it already carries a `git notes` correction that accurately describes the real change. One further label-level mismatch: `4e031ee3` (finding 10). No other commit in either repo carries the wrong message.

**4. The fifth "works locally, inert in production" instance.** Found four more, not one — see finding 1. `@jini-ai/ui` was verified *clean* (published 18:26Z with the change), which is what makes the other four stand out rather than being assumed.

**Duplicated/abandoned work.** Beyond `ab3c01cc`/`64e6c029` (already known): `64e6c029` (10:23) and `922f2ef6` (10:28) touch the same file five minutes apart, the second correcting the first's over-scrubbing — a genuine sequential fix, not duplication. `50e582b1` (10:07) and `dc326086` (10:16) are **conflicting designs nine minutes apart**: `50e582b1` chose "leave `sealedOAuth` untouched, report success", wrote a test asserting that outcome, and `dc326086` then rewrote that very test to assert the opposite (rethrow). The final state is coherent but carries finding 2's regression. No other near-duplicate pairs found.

---

## What I could NOT verify, and why

**Audited directly by me (traced to source, evidence quoted above):** Tovu `fbacdf70`, `b80d76c0`, `64e6c029`, `922f2ef6`, `4e031ee3`, `95bd5f9d`, `fbc0a37b`, `50e582b1`, `dc326086`, `ab370d95`, `8b7206f9` (verified independently after a subagent flagged it); Jini `fc8391ec`, `fb1c52cb`, `03a230ef`, `6a3c9199` (verified independently by regex probe). Plus the full published-vs-local tarball sweep across eight Jini packages, and the `check:*` CI wiring.

**Audited by dispatched Sonnet subagents, findings spot-verified by me where they became report findings above:** the 15 test-only commits; the 9 error-surfacing commits (`4f02362e`, `3973418e`, `8204c245`, `4d032ce4`, `704f0a4c`, `726511a4`, `789d9e8d`, `c00871ac`, `b41b1fe3`); the 12 credential/seal/backfill commits (`86df1179`, `a4fe6766`, `80145322`, `d3834ec2`, `c412bc75`, `8b7206f9`, `ab3c01cc`, `9b1797f5`, `1666fc71`, `7d564955`, `6a3c9199`, `83883c6e`). **Their clean verdicts are CLAIMS I did not independently re-trace.** I re-verified only the two that became findings 4 and 5, plus finding 7's line numbers. The "clean" calls on `86df1179`, `a4fe6766`, `80145322`, `ab3c01cc`, `4d032ce4`, `704f0a4c`, `726511a4`, `789d9e8d`, `83883c6e` rest on subagent tracing alone.

**Not audited at all (6 commits):**
- Tovu `92494e7c` + `80e51b32` (menu item attrs across MenuEditor, api.ts, static-render, Liquid tier) — the largest feature diff in the range, 8 files, untouched by any pass.
- Tovu `97003113` (admin slow-run notice UI) — its `@jini-ai/protocol` dependency was resolved by finding 1's sweep (protocol 0.3.1 published 19:19Z), but the React component itself was not read.
- Jini `fc083332` (chat queued-turn misrouting) — flagged only as an unpublished package in finding 1; the fix's correctness was not assessed.
- Jini `a48a86bf` (7-line doc comment) and `393b9823` (68-line test, no production change) — skipped as low-value.

**Verifications deliberately not run:** no test suite was executed in either repo (directive), so every "the regression test would fail pre-fix" statement is a reading of the test, not an observed RED. No coverage run, so the four `100% coverage` claims in the test commits are unverified as numbers. `npm run check:secret-scan` was not executed — finding 8's "19 hits" is `95bd5f9d`'s own reported figure, not my measurement.

**Moving target:** `jini-publish` published three packages *during* this audit (daemon, protocol, agent-runtime, between 18:59Z and 19:19Z). Finding 1's table is a snapshot at **19:19:36Z** and should be re-run before acting on it.

---

# PASS 2 — reprioritized audit (peer Coordinator's candid account received)

The peer Coordinator disclosed that it **never read a test body and never re-ran any agent's test** — its verification was `git show --stat` plus targeted greps, and every "RED proven" claim it relayed came from an agent's own transcript. The regression-test foundation across ~55 commits was therefore unverified. This pass closes that gap and answers the eight reprioritized items.

**Method for the RED spot-checks — no working tree was touched.** `git archive HEAD | tar -x` into `<scratchpad>/redcheck` (113 MB), with `node_modules` symlinked from the real repo at the root and at `apps/website`, `apps/admin`, `apps/site-chat`, `packages/sdk`. Tests run from that scratch root (which is itself a repo root, so `process.cwd()` fixtures resolve correctly). The fix's PRODUCTION hunk is reverse-applied inside the scratch tree only, keeping the new test, and the test is re-run. Harness sanity was established first: `update-username.unit.test.ts` runs 7/7 green there, matching the real tree.

---

## P1. `86df1179` (username clear + reseal) — NOT data-destroying. RED PROVEN. Cleared.

**The AAD is byte-identical. No credential row was put at risk.**

- `sealConnection` builds `buildCustomCredentialAad({ workspaceId: input.workspaceId, id: input.id })` — `/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/store.ts` (`sealConnection` body).
- `decryptRecord` builds `buildCustomCredentialAad({ workspaceId: record.workspaceId, id: record.id })` — same file.
- The reseal added by `86df1179` (`store.ts:463-466`) calls `sealConnection(deps, { workspaceId: input.workspaceId, id: input.id, ... })` with the same two inputs that `findById({ workspaceId: input.workspaceId, id: input.id })` used to fetch the row. **Same AAD, same function, same arguments.** Nothing about the AAD shape changed, so no existing row becomes unopenable.
- **The agent's `aad_version` claim is CONFIRMED TRUE.** `custom_credential_sets` (`/Users/la/Programming/Tovu/apps/website/src/platform/db/schema.postgres.ts`) declares `username`, `sealed_key_id`, `sealed_ciphertext`, `sealed_nonce`, `sealed_alg` — and **no `aad_version` column**, unlike `composio_connector_credentials`, `admin_execution_credentials`, `media_provider_credentials` and the four other tables that do carry one. There was no version contract to preserve.
- **No collateral field loss.** The reseal writes `connection: { token: oldConnection.token }`, dropping everything else. `CustomProviderConnectionInput` (`/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/types.ts:38-41`) has exactly two members — `token` and optional `username`. Dropping `username` is the entire point of the fix; nothing else exists to lose.
- The reseal does move the row onto the keyring's **active** key. That is normal rotation behaviour and only happens after `decryptRecord` has already succeeded, so it cannot strand a row.

**RED PROVEN (strong).** Reverse-applied `store.ts` in the scratch tree; 6 of 7 tests stayed green and exactly the new one failed, with the resurrection the commit describes:

```
✖ updateCustomCredential: `username: null` (no connection) also strips the sealed payload's own
  embedded username, so the real decrypting read path (resolveCustomCredentialByLabel) does not resurrect it
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
    + actual - expected
      { token: 'sk_live_original',
    +   username: 'old-username' }
```

This is a genuine RED: the assertion discriminates the fixed behaviour from the broken one, and it fails for the stated reason, not an import error.

---

## P2. `c412bc75` (backfill `--dry-run`) — the row-level verification the peer asked for is already in the test. RED is WEAK.

- **The test compares ROWS, not file hashes — CONFIRMED, and it says so itself.** `/Users/la/Programming/Tovu/development/scripts/__tests__/backfill-execution-credential-aad.test.ts:259`:
  > `// any row content — read rows and compare, not a file hash (a WAL-mode db's SHA is not evidence`

  It reads the row back with `SELECT * FROM admin_execution_credentials WHERE principal_id = ?` at `:255` and `:271` and compares content. It **also** guards migration side effects independently, via `SELECT COUNT(*) as c FROM __drizzle_migrations` at `:72` — which is the right control given that migrations auto-apply against the live DB here. The peer's specific worry is addressed.
- **RED is WEAK, not absent.** Reverse-applying `content-db.ts` + `backfill-execution-credential-aad.ts` in the scratch tree makes `content-db-readonly.unit.test.ts` fail at **module load** — `openContentDbReadOnly` does not exist pre-fix — rather than on a behavioural assertion. `1 test, 0 pass, 1 fail`. That proves the test needs the new code but does not prove the assertions discriminate correct from incorrect read-only behaviour. Same shape as `95bd5f9d`'s own honestly-disclosed RED ("does not provide an export named"). **Not a defect; a weaker grade of evidence.** What would settle it: keep `openContentDbReadOnly` exported but have it return a writable handle, then re-run.

---

## P3. Jini `400d07fa` (slow-run watchdog) — genuinely non-terminating, but it WILL fire on healthy runs

- **Cannot terminate a run — CONFIRMED.** `handleSlowRunNotice` (`/Users/la/Programming/Jini/packages/daemon/src/run-lifecycle.ts:763-782`) only calls `lifecycle.emit(...)` with `{type:'slow_running'}`. It never reaches `finish()`, `cancel()`, or `record.status.state`. Its own try/catch (`:768-781`) swallows an emit failure into `onInternalError`. Contrast the crash watchdog's `handleInactivityTimeout` (`:719-740`), which *does* call `lifecycle.finish({status:'failed'})`. The two are structurally parallel and only one is terminating. The subject line is accurate.
- **Armed by default — CONFIRMED.** `DEFAULT_SLOW_RUN_THRESHOLD_MS = 45_000` (`run-lifecycle.ts:368`); resolution at `:556` turns an omitted field into `45000`, and only an explicit `null` opts out. `start()` arms it unconditionally at `:863-865`. Every production caller today omits the field, so every run is armed.
- **It fires on healthy-but-quiet runs — CONFIRMED, and this is the real finding.** The ONLY reset is `record.slowRunWatchdog?.noteActivity()` inside `emit()` (`run-lifecycle.ts:929-930`). Nothing else touches the timer. **Concrete false-positive:** a single tool call that streams no events for 45s — an `npm install`, a large build, a repo-wide scan — or a run parked on a human confirmation surface. The user sees a "slow run" notice on a run that is working correctly. Since Tovu `97003113` renders this inline in the admin transcript, that notice is user-visible.
- **No timer leak.** `finish()` cancels both watchdogs at `:955-956`, and the timer is `.unref()`'d (`close-status.ts:116-118`).
- **Adjacent gap, PLAUSIBLE:** `resume()` (`run-lifecycle.ts:979-998`) never re-arms the slow-run watchdog, so a resumed run gets no notice for the rest of its life. Asymmetric with `start()`; probably unintended.

---

## P4. `95bd5f9d` — the "19 hits" number is ACCURATE. The owner's public-mirror decision stands. One correction to the composition.

**I re-ran the scan myself** (`npx tsx apps/website/src/features/webhooks/secret-scan-guard.ts`, exit 1) and independently enumerated every AIza-shaped string across all 17,883 blobs reachable from `--all`.

**Reproduced exactly: 19 hits, and no unknown secret among them.**

| count | file (historical path) | pattern |
|---|---|---|
| 6 | `src/webhooks/__tests__/secret-sealer.aesgcm.test.ts` | Google API key (AIza) |
| 6 | `src/integrations/__tests__/secret-sealer.aesgcm.test.ts` | Google API key (AIza) |
| 6 | `apps/website/src/features/webhooks/__tests__/secret-sealer.aesgcm.test.ts` | Google API key (AIza) |
| 1 | `apps/website/src/features/webhooks/__tests__/secret-scan-guard.test.ts` | PEM private key block |

Three paths, one fixture file under its pre-restructure names. Distinct AIza VALUES in history (`git cat-file --batch` over every blob, matched against the guard's own regex charset):

| blobs | value | assessment |
|---|---|---|
| 9 | `AIzaSyCUyt…` (39 chars, real Google key shape) | **the already-known, already-revoked Gemini key** |
| 9 | `AIzaFAKEFAKEFAKE…` | self-identifying placeholder, not a credential |
| 8 | the self-labeled `AIza`-prefixed "Test-FAKE-GEMINI-KEY-NOT-REAL" placeholder (already allowlisted in `secret-scan-guard.ts` for `development/e2e/byok-google-tool-schema.spec.ts`) | the 44-char synthetic fixture; the guard's lookahead means it does not actually produce a hit |

*(The real key's full value is deliberately not written into this report — writing it here would create a new tracked file containing it.)*

**Verdict: report this as GOOD news, promptly.** `95bd5f9d`'s claim was "19 hits, all traced to the one already-known, already-revoked credential plus one already-fixed literal PEM header." That is **substantially accurate**. The one correction: only about half the AIza hits are the real key — the other nine are an obviously-synthetic `AIzaFAKEFAKE…` placeholder the commit did not separately call out. **No third, unaccounted-for real secret exists in this repo's history.** The owner's decision to accept pushing to the public mirror was made on sound information.

**The standing fact that remains true:** the revoked key is still recoverable from 9 blobs. Impact is nil because it is revoked, but if the public mirror shares this history, it is public. That is a known, accepted exposure — not a new one.

---

## P5. Jini `7d564955` (SQLite AsyncOperationStore) — `RETURNING` is safe, but the primary polling query full-scans and the lockfile is stale

- **`UPDATE … RETURNING` support — CONFIRMED SAFE, and the agent's claim holds.** `packages/integrations/package.json:80,90` pins `better-sqlite3: "^13.0.0"`; the installed 13.0.3 bundles SQLite **3.53.4**, well past the 3.35.0 `RETURNING` floor.
- **UNDISCLOSED lockfile drift, CONFIRMED.** `pnpm-lock.yaml`'s `packages/integrations` importer still resolves `better-sqlite3` to `specifier: ^11.10.0 / version: 11.10.0` — never regenerated after the Aug 31 bump to `^13.0.0`. `pnpm install --frozen-lockfile` would not deliver what is on disk. Harmless for `RETURNING` only by luck (11.10.0 bundles 3.49.2, also past the floor), but the module doc's "verified against this repo's pinned version" is verifying a specifier the lockfile does not deliver.
- **CONFIRMED performance defect: the store's primary polling query does a full table scan.** `claimDueStmt` (`/Users/la/Programming/Jini/packages/integrations/src/media-providers/dispatch/sqlite-async-operation-store.ts:166-178`) filters `status NOT IN (...) AND next_poll_at <= ?`. `EXPLAIN QUERY PLAN` against a live SQLite 3.53.4 returns `SCAN jini_async_operations` + `USE TEMP B-TREE FOR ORDER BY` — the `idx_jini_async_operations_claim (status, next_poll_at)` index created for it at `:140` is never used, because `NOT IN` on the leading column is not sargable. **Failure scenario:** every poll cycle scans the whole operations table; cost grows linearly with lifetime operation count, and nothing in the file evicts or archives terminal rows. Fix: invert to `status IN (<non-terminal states>)`.
- `listByOwnerStmt` (`:158-160`) is `SELECT * … ORDER BY created_at ASC` with **no LIMIT** — unbounded per-owner result set, same no-eviction caveat.
- Schema is self-creating (`CREATE TABLE IF NOT EXISTS` at `:118-141`); no missing migration.
- All of this is currently inert — see finding 9 in pass 1, nothing constructs the store.

---

## P6. `726511a4` — "only one producer" is TRUE today. RED PROVEN.

- **CONFIRMED TRUE, with a caveat that matters.** Exhaustive grep for `remedyToolId` across both repos (excluding `node_modules`/`dist`) finds exactly one production value-construction site: `/Users/la/Programming/Tovu/apps/website/src/features/custom-credentials/credentialed-request.ts:491` (`remedyToolId: SET_USERNAME_TOOL_ID`, inside `buildAuthFailureDiagnostic`). Two call sites (`:677-678`, `:771-778`), one producer. Other matches are prose inside tool descriptions (`agent-tools.ts:225,233`), the interface declaration (`contracts/core/tool-failure-diagnostics.ts:95`), and Jini test scaffolding.
- **The caveat the agent should have recorded:** `findActionableDiagnostic`/`walkForDiagnostic` (`tool-failure-recovery.ts:174-193`) walks a completed tool call's **entire output tree** (depth ≤6, ≤500 nodes) for the first plain object carrying non-empty string `hint` **and** `remedyToolId`. It is not scoped to an `authDiagnostic` key or to any tool. So "only one producer" is a fact about today's tree, not a structural guarantee — any future tool that emits that two-field shape anywhere in its output gets silently picked up by the recovery decorator. That is a real latent hazard the skip-decision papered over, and it should be recorded as tech debt even though it is not a live defect.
- **RED PROVEN (strong).** Reverse-applied `tool-failure-recovery.ts`; 17 of 18 tests stayed green and exactly the new one failed on its own assertion:
```
✖ the remedy tool completing but reporting {saved: false} … never triggers a retry
  Error: the original must NEVER be retried when the remedy reported {saved: false}
```

---

## P7. Jini `83883c6e` / Tovu `789d9e8d` — the `codex exec --help` claim is TRUE

Ran both commands against the installed binary (`/Users/la/.npm-global/bin/codex`, `codex-cli 0.153.0`):
- `codex exec --help` → `Usage: codex exec [OPTIONS] [PROMPT]`, with `-i, --image <FILE>...` under Options.
- `codex exec resume --help` → `Usage: codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]`, with `-i, --image <FILE>` under Options.

`-i/--image` is accepted on **both** paths. Flag ordering is correct: `/Users/la/Programming/Jini/packages/agent-runtime/src/defs/codex.ts:203-215` pushes every `-i <path>` before `args.push(resumeSessionId)`, matching the `[OPTIONS] [SESSION_ID]` synopsis. **The agent's claim was accurate.** One drift note: the code comment cites CLI `0.151.0`; the installed binary is `0.153.0`. Behaviour unchanged, but the comment's version is now stale.

---

## P8. `d3834ec2` / `03a230ef` — the SecurityError proof was NOT re-observed

Not verified in this pass. I confirmed statically that `buildIsolatedSandboxProxyHtml` bakes `hostOrigin` in as a literal rather than reading `window.location.origin`, and that the published `@jini-ai/ui@0.3.4` contains it — but **nobody, including me, watched the live Playwright `SecurityError` happen.** The cross-origin-isolation claim rests on the agent's transcript alone. What would settle it: load the data-URL proxy in a real Chromium frame and assert `window.location.origin === "null"` plus a thrown `SecurityError` on a parent-storage reach.

---

## Pass-2 coverage statement

**RED spot-checks actually executed (3 of 3 required, plus one in flight):** `86df1179` STRONG, `726511a4` STRONG, `c412bc75` WEAK (module-load, not behavioural). A fourth on the `64e6c029`/`922f2ef6` credential-leak pair — the one the peer flagged as having lost its RED capture for one of four tests — was launched against the pre-`64e6c029` source in the scratch tree; that file's suite runs past two minutes even green, and the result had not landed when this section was written. **Its RED is therefore still UNVERIFIED, and it is the single most important remaining check**, because it is the one test the owning agent itself admitted it could not capture RED for.

**Still not verified by anyone:** the RED of every other regression test in the ~55-commit range. Three strong spot-checks out of roughly thirty test-bearing commits is a sample, not a sweep — and all three passed, which is evidence that the agents' RED discipline was real, not proof of it.

**Unchanged from pass 1:** Tovu `92494e7c` + `80e51b32`, `97003113`, and Jini `fc083332` remain entirely unaudited.

---

## ADDENDUM — the fourth RED check: `credentialed-request.unit.test.ts` HANGS against pre-fix source

**Observation, reproduced twice (full suite, and again with `--test-name-pattern` isolating one test):** with `apps/website/src/features/custom-credentials/credentialed-request.ts` replaced by its `64e6c029^` content in the scratch tree, `credentialed-request.unit.test.ts` **never terminates**. Both runs emitted the module-scope `[custom-credentials] request label=…` audit lines and then stopped producing output entirely — no `ℹ tests`, no `✖`, no exit. Confirmed still alive at 2m53s and beyond via `ps -wwo pid,etime,args=`.

This is not a timeout artifact: the same suite completes normally against HEAD source in the same scratch tree, and `--test-name-pattern` (which still executes the file's module scope and every test's setup) hangs identically.

**Consequence for the audit:** the RED for `64e6c029` + `922f2ef6` is **UNVERIFIED and could not be captured by reverse-application.** This is the pair the peer flagged as having lost its RED capture for one of four tests, from the agent (`fix-cred-leak`) that stalled three times. The disclosure was honest; the underlying evidence gap is real and remains open.

**PLAUSIBLE explanation, not confirmed:** a test in the current file awaits a promise the pre-fix implementation never settles — most likely a `FakeHttpClient` queue consumed in a different order, leaving an `await` with no queued response. `makeCredentialedRequest` passes `CREDENTIALED_REQUEST_TIMEOUT_MS` to the client, but `FakeHttpClient` does not honor it, so nothing breaks the wait. **What would settle it:** run the suite pre-fix with `--test-timeout` set, or bisect the file by commenting out tests, in a scratch tree.

**Housekeeping note for the lead:** two of my background `node --test` processes (PIDs 68291/68296 and the `--test-name-pattern` pair) are still hung on this. They only read the scratchpad copy of the tree and touch nothing in either repo, but they will not exit on their own. I have not killed them — flagging instead, per the standing rule about killing processes.
