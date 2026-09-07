# 2026-09-07 — Agent C: admin / MCP / misc website fixes

Branch `restructure/apps-website-phased`. Every finding below was re-read against source before any
edit; the audit reports were treated as claims, not facts.

Scope note: `apps/desktop/*.cjs` and the `expectedVersion`/post-save cluster belong to two other
agents and are untouched here.

---

## SEC-05 — VERIFIED-AND-FIXED (Low severity, high real cost)

**Claim:** egress/SSRF refusals are plain `Error`s thrown from `platform/http/client.ts:242`;
`media-import/tool-registrations.ts:120` does not classify them, so a deliberate security refusal
surfaces as a generic internal error.

**Verified against source — the claim holds, and the collapse is three layers deep, not one:**

1. `apps/website/src/platform/http/client.ts` — `assertNoPrivateAddress` threw a bare
   `new Error("egress to '<host>' (<ip>) rejected: resolved address is <class>")`; `assertAllowedTarget`
   likewise for a disallowed scheme and for credentials embedded in the URL.
2. `apps/website/src/features/media-import/fetch-image.ts:270-274` deliberately lets it propagate
   (its own doc says so, correctly — it is not a shape problem *for that module*).
3. `apps/website/src/features/media-import/tool-registrations.ts` — `isShapeRejection` was
   `(error) => error instanceof MediaImportValidationError`, so the refusal fell through.
4. `@jini-ai/daemon` `tool-executor.ts:336` — `err instanceof ToolInputError ? 'validation' : 'internal'`.
5. `@jini-ai/http-kit` `delegated-tools.ts:359` — `'validation'` → `400 BAD_REQUEST` **with the
   message**; everything else → `reportInternalError`, i.e. a SEC-005-redacted
   `500 INTERNAL_ERROR: "an internal error occurred"`.

So the operator and the model were told the site had fallen over. Route reaching the symptom:
`POST /api/delegated-tool-calls` (`delegatedToolExecuteRoute`, registered by
`server/inbound/assistant/agent-daemon-server.ts`) → `media_import_from_url`. That is the only tool
today that takes an agent-supplied URL through this port, but the untyped throw was in
`platform/http` and therefore reached every consumer (custom-credentials, newsletter, analytics,
webhooks) identically.

### RED (captured before any production edit)

End-to-end, `apps/website/src/assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts`:

```
✖ an SSRF refusal reaches the caller as a BAD_REQUEST naming the blocked address, not a redacted INTERNAL_ERROR
  AssertionError: an egress refusal is the caller's URL being wrong, not this site crashing
                  — got INTERNAL_ERROR: an internal error occurred
  + actual - expected
  + 'INTERNAL_ERROR'
  - 'BAD_REQUEST'

✖ the refusal is a refusal, not an invitation to retry the identical call
  AssertionError: The input did not match /will not resolve on retry without an input change/.
  Input: 'an internal error occurred'

✖ a scheme refusal from the policy layer surfaces the same way — the classification is by TYPE, not by one message
  + 'INTERNAL_ERROR'  - 'BAD_REQUEST'
```

Type half, `apps/website/src/platform/http/__tests__/client.test.ts` (4 fail / 39 pass):

```
✖ a private-address refusal is an EgressRefusedError, recognisable by type and not merely by message
  AssertionError: expected EgressRefusedError, got Error
✖ a disallowed-scheme refusal is an EgressRefusedError            — expected EgressRefusedError, got Error
✖ an embedded-credentials refusal is an EgressRefusedError        — expected EgressRefusedError, got Error
✖ a refusal on a REDIRECT hop is typed too                        — expected EgressRefusedError, got Error
```

**What would these still pass under?** Two negative controls answer that, and both were green during
RED (so they are not free):

- `a DNS failure is NOT an EgressRefusedError` — a `.invalid` host. Blocks a "type everything the
  client throws" fix.
- `a genuine transport failure is STILL a redacted INTERNAL_ERROR` — asserts `INTERNAL_ERROR` *and*
  `doesNotMatch(/EAI_AGAIN/)`. Blocks widening `isShapeRejection` to swallow every rejection, which
  would both mislead the model and put transport internals on the wire.

The pre-existing test `"a transport-level SSRF refusal propagates and nothing is written"`
(`features/media-import/__tests__/tool-registrations.test.ts:320`) is an example of a green test
that tolerated the bug: it throws a plain `Error` and asserts only that the message propagates *at
the handler boundary*, which was always true. The defect lived two layers further out.

### Changes

- **NEW** `apps/website/src/platform/http/errors.ts` — `EgressRefusedError`. One class, documented
  with why `instanceof` (not message matching) is the contract a consumer needs.
- `apps/website/src/platform/http/client.ts` — all three pre-connect refusal sites now throw it
  (first hop and every re-verified redirect hop go through the same two functions). DNS failure,
  connect timeout and transport errors deliberately stay untyped.
- `apps/website/src/platform/http/index.ts` — exports it. This is the deliberate exception to the
  barrel's "interfaces and types only" rule; the header now records why (an `Error` subclass grants
  no construction capability).
- `apps/website/src/features/media-import/tool-registrations.ts` — extracted
  `isImportShapeRejection`, which now also accepts `EgressRefusedError`. Same precedent as
  `features/post`'s `PostVersionConflictError` and `features/media`'s `AttachmentRejectedError`
  re-classifications.

### GREEN

```
node --import tsx --test \
  apps/website/src/assistant/__tests__/tool-registrations.media-import-egress-refusal.integration.test.ts \
  apps/website/src/platform/http/__tests__/client.test.ts \
  apps/website/src/features/media-import/__tests__/tool-registrations.test.ts \
  apps/website/src/features/media-import/__tests__/fetch-image.test.ts
# tests 111 / pass 111 / fail 0
```

`npx tsc -p tsconfig.json --noEmit` → exit 0.
`npx depcruise --config .dependency-cruiser.mjs apps/website/src/features/media-import` → no new
violation attributable to this change (the `no-circular` via `assistant/index.ts` and the two
`no-deep-imports:assistant` warnings on the pre-existing test file are the same shape every other
domain shows, e.g. `features/media-generation`).

### USER-VISIBLE BEHAVIOUR CHANGE — for Leona to rule on

A blocked `media_import_from_url` now answers **`400 BAD_REQUEST` with the refusal reason** instead
of `500 INTERNAL_ERROR: "an internal error occurred"`. The message names the host the caller already
supplied, the address it resolved to, and the classification (`private` / `loopback` / `link-local`
/ `reserved`) — nothing about this deployment. That last clause is the only judgement call: it does
confirm to a caller that e.g. `internal.example.com` resolves to something non-public, which a
determined caller could use as a coarse internal-DNS oracle. My read is that the trade is clearly
worth it (the caller is an authenticated principal who already holds `media.upload`, and the
alternative cost is the debugging time this finding was raised over), but flagging it rather than
deciding it silently.


---

## MCP-01 — VERIFIED-AND-FIXED (Medium)

**Verified.** `trust.ts:301-307` `admitRemoteToolName` admits the FIRST descriptor of a name
(`seen.add`) and refuses only the repeat, so `admitRemoteTools` (`:420-433`) puts the same
`remoteName` in `admitted` AND in `refused`. `refusal-notice.ts` `refusalItems` skipped only
`not-in-operator-allowlist` and never subtracted `report.admitted`, so `PREFIX_INSTRUCTION` asserted
of a registered, callable tool that it is "NOT in `search_tools`", that "`describe_tool` cannot
describe" it, and that "calling it is impossible" — on every turn, for the life of the process.

Route: `agent-daemon-server.ts:1088` → `buildFederatedRefusalPrefix` →
`assemblePromptWithPluginPrefix` → the run's system prompt. Confirmed the admin-facing arm
(`external-mcp-admissions-rules.ts`) is NOT wrong: its `notLoaded` is `saved − live`, and the name
is in `live`.

### RED

`apps/website/src/assistant/__tests__/mcp-federation.refusal-notice.test.ts` — 2 fail / 16 pass:

```
✖ a tool that was ADMITTED is never listed as withheld, even when a later descriptor of the same name was refused
✖ the prefix stays empty when the only refusal is a duplicate of an admitted name
  actual: "EXTERNAL TOOL AVAILABILITY — … They are NOT in `search_tools`, `describe_tool` cannot
           describe them, and calling them is impossible …
           - 'image_lookup' on external server 'vendor': the server advertised the same tool name
             twice, and Tovu refuses the repeat …"
  expected: ''
```

Built on the REAL `admitRemoteTools`, not a hand-written report — the collision is a property of the
gate, and a synthetic snapshot could assert it in a shape the gate never produces. A fourth test
pins that premise explicitly.

**What would this still pass under?** Three negative controls, all green during RED:
a duplicate whose name was NOT admitted must still be reported (blocks "just drop every
`duplicate-remote-tool-name`"); the subtraction must be per connection (`vendor:image_lookup` being
callable says nothing about `other-vendor:image_lookup`); and the gate-premise test.

### Change

`refusalItems` subtracts the per-connection admitted set. **By admitted set, not by refusal
reason** — the property that makes an item true is "the model cannot call this", and a reason-based
skip states the same rule in terms that stop being equivalent the moment the gate grows another
refusal an admitted name can also collect. Recorded as R-E in the file's own rule list.

### GREEN
`mcp-federation.refusal-notice.test.ts` 18/18; `trust`/`registrations`/`config` 95/95.

---

## ADM-002 — VERIFIED-AND-FIXED (Medium)

**Verified.** `use-external-mcp-admissions.hooks.ts` — `useFetchQuery({key, fetch})` with no
`staleTime` override and no polling; `useFetchMutation({run})` with **no `invalidates`**, so
`adapter.tanstack.tsx:185-196`'s `onSuccess` loop iterates an empty list. Client defaults
(`adapter.tanstack.tsx:96`): `staleTime: 10_000, retry: false, refetchOnWindowFocus: false` —
nothing refetches a mounted query on its own. `restartAccepted` was `outcome?.ok === true` and never
cleared.

The audit's caveat is correct and load-bearing: **`invalidates` alone would be wrong.** The restart
route's own header (`routes/system/assistant-daemon.ts:22-32`) states it returns as soon as a
restart is INITIATED and structurally cannot wait for health, and points the caller at polling. A
refetch fired on the 200 is guaranteed to read the dying daemon or a 503.

### RED
`apps/admin/src/features/settings/hooks/__tests__/use-external-mcp-admissions.unit.test.tsx` —
2 fail / 3 pass. The port answers the stale snapshot until `restartAssistantDaemon` is called AND a
5s boot delay has elapsed, so the timing is the real timing rather than an instant swap.

```
✖ re-reads admissions after a restart it triggered  → connections still [needs-write-grant] after 15s
✖ stops claiming 'Restarting…' once the watch window closes  → expected true to be false
```

**Negative controls (all green during RED):** an unrestarted panel must never poll (blocks a blanket
`refetchInterval`); a REFUSED restart must not arm the watch; no timer may fire after unmount.

### Change
`useRestartWatch` — a bounded chain of `setTimeout`s, 8 × 2.5s, armed only by an accepted restart.
`refetch` is read through a ref because `useFetchQuery` rebuilds it every render (its `useCallback`
closes over TanStack's per-render result object), so depending on it directly would re-arm the timer
every render — a spin, not a schedule. `restartAccepted` is now scoped to that window.

Bounded rather than "until the snapshot changes" because **nothing in the snapshot identifies which
daemon answered** — a restart into an identical configuration produces a byte-identical reply, so
"it changed" is not a signal that exists.

### GREEN
5/5; `apps/admin` settings 195/195.

---

## ADM-001 — VERIFIED-AND-FIXED (Low/Medium), plus a trap the audit did not name

**Verified.** `describeAdmissionDrift` iterated `snapshot.connections` only; `describeConnectionDrift`
computed `saved − live` (`notLoaded`) and never `live − saved`.

**The trap.** `mcp-federation/bootstrap.ts:128-131` merges roster connections with env-registered
PRESET connections (`resolveRegisteredPresets`, e.g. the Supabase MCP plugin) into ONE report list,
and a preset has no roster card by design — the existing test *"treats a connection with no matching
roster card as having saved nothing"* is exactly that case. A naive `live − saved` that read "no
saved entry" as "the operator allowlisted nothing" would have reported **every preset tool as
removed-but-still-running, on every boot, forever.** `undefined` (no intent recorded) and `""` (an
intent, and it was none) are now explicitly different, with a test for each.

**Second constraint, also unnamed:** `external-mcp-store.ts:845` `readEnabledExternalMcpConfigs`
skips a switched-off server, so "saved but not live" is the CORRECT state for one. Reporting it
would have thrown the operator's own most deliberate action back at them as a fault. `enabled` is
therefore threaded into a new `SavedConnectionIntent` rather than inferred.

### RED
`external-mcp-admissions-rules.unit.test.ts` — 5 fail / 17 pass. Negative controls green during RED:
preset connection → `null`; switched-off-and-not-running → `[]`; `undefined` snapshot → `[]`
(a failed daemon read must not be turned into "not running" rows — that would put a wrong diagnosis
under a right one).

### Change
Three new kinds — `still-live-after-removal` (per tool), `not-running` and `disabled-but-running`
(per connection, `remoteName: null`). Copy is English-only, the same deliberate choice the file
already records for its four rare structural strings (`createDictionaryTranslator` falls back to the
English key). One pre-existing test call site was updated for the new `savedById` value type; no
assertion was weakened.

### GREEN
22/22; `apps/admin` settings 195/195.

### USER-VISIBLE BEHAVIOUR CHANGE — for Leona
Three new row types in Settings → External MCP's banner, each naming the restart as the fix. English
copy in all locales until translated.

---

## ESC-01 — VERIFIED-AND-FIXED (Low). Full census below.

`page-head.ts:194` escaped `& < > "` only. **Not exploitable at HEAD:** all six sinks in that module
are double-quoted attributes or text nodes (`<title>`, `content="…"`, `href="…"`, `rel="…"`,
`hreflang="…"`), and `grep "='"` over the file returns nothing. Fixed; the commit's false claim is
recorded in the function's own doc so the next reader does not re-trust it.

**The audit said nine copies. There are eleven.** It missed `sitemap.ts` (named `escapeXml`) and
counted `static-render.ts` once where it has two. Every one read individually:

| # | File:line | Name | Escapes | Verdict |
|---|---|---|---|---|
| 1 | `assistant/mcp-ui.ts:190` | `escapeHtml` | `& < > " '` | correct |
| 2 | `platform/export/site-exporter.ts:313` | `escapeHtmlAttr` | `& " < > '` | correct (touched by `1044e2d5`) |
| 3 | `features/theme/static-render.ts:107` | `escapeHtmlText` | `& < > " '` | correct (touched) |
| 4 | `features/theme/static-render.ts:168` | `escapeHtml` | `& < > " '` | correct (touched) |
| 5 | `.../http/site/form-render.ts:164` | `escapeHtml` | `& < > " '` | correct (touched) |
| 6 | `.../http/site/render.ts:201` | `escapeHtml` | `& < > " '` | correct |
| 7 | `.../http/site/page-head.ts:194` | `escapeHtml` | `& < > "` | **FIXED — was missing `'`** |
| 8 | `.../routes/site/newsletter-unsubscribe.ts:45` | `escapeHtml` | `& < >` | correct **as used** — sinks are `<title>`/`<h1>`/`<p>`, text nodes only (read, not assumed) |
| 9 | `.../routes/site/newsletter-confirm.ts:40` | `escapeHtml` | `& < >` | correct as used, identical sinks |
| 10 | `.../routes/site/store.ts:16` | `escapeHtml` | `& < > " '` | correct |
| 11 | `.../routes/site/sitemap.ts:9` | `escapeXml` | `& < > " '` (`&apos;`) | correct — XML, where `&apos;` IS defined |

**NOT consolidated.** Eleven copies of one function is real duplication, but collapsing them is
structural work Leona has not approved, and #8/#9 are deliberately narrower while #11 is a different
language. Flagged as a Refactor-Agent candidate, not done here.

Second test added: a character-for-character equivalence between `page-head.ts` and its four sibling
copies, so the next divergence fails loudly instead of silently.

**GREEN:** page-head + contributors + registry 18/18.

---

## PG-01 — VERIFIED-AND-FIXED (Low). The claim holds, and the guard was already RED.

`schema.postgres.ts` had **zero** occurrences of `autosave` (`grep` exit 1, count 0) while
`schema.ts:166` carries `autosaveJson: text("autosave_json")` (added by `e94da8f8`).

**What the audit missed:** this repo already has the guard —
`platform/db/__tests__/schema-postgres-drift.test.ts` — and it was **already failing at HEAD** and
had been since `e94da8f8`:

```
DRIFT: src/platform/db/schema.postgres.ts does not match what schema.ts generates.
Run `npx tsx development/scripts/generate-postgres-schema.ts` and commit the result.
```

The guard worked. Nothing was running it. That is a data point for
`project_tovu_check_gates_all_report_only` / the CI-off checklist, not a missing test.

Fixed the way that test's own failure message instructs — ran the generator. The diff is exactly one
line (`+  autosaveJson: text("autosave_json"),`) with nothing else swept in, which also confirms no
other schema change was sitting unregenerated.

**GREEN:** drift + parity + migration-manifest + schema-migration-drift 81/81.

---

## C03 — VERIFIED-AND-FIXED (Medium)

**Verified, and the reachability argument needed one more link than the audit gave.**
`cleanupAndRethrow` (`init-site.ts:103`) removes the target only `if (wroteAnything)`, and both
places `duplicateSite` raised that flag are conditional:

- `duplicate-site.ts:181-184` — `mkdirSync` + the flag are skipped when the target exists, and
  `validateInitTarget` (`init-site.ts:132-157`) **accepts an existing empty directory**.
- `copyPortableEntries`' `onBeforeFirstWrite` never fires for a source with **no portable entries**.

The audit asserted the second condition is reachable without showing it. It is: `readSiteDir`
(`read-site-dir.ts:81-86`) requires only `config.json` and `.site-meta.json`, while every name on
`layout.ts`'s `PORTABLE_ENTRY_NAMES` is a **directory** — and archive/restore round-trips routinely
drop empty directories.

`config.json` and `content.db` are then both written with the flag still false.

### RED
```
✖ a source with no portable entries: a content.db failure into a pre-existing empty target leaves nothing behind
  AssertionError: a failed duplicate must leave nothing behind — INV-02 admits no partial install
                  dir. Survivors: config.json
✖ after such a failure the operator's retry is not refused as 'not an empty directory'
```

**The existing test tolerated this.** `"a mid-copy failure leaves no half-populated directory behind,
even in a pre-existing empty target"` asserts the identical property and was green throughout —
its source has portable entries, so the flag was always already set. Right assertion, one arm.

**Negative control (green during RED):** a SUCCESSFUL duplicate into a pre-existing empty target
must still succeed, with its uploads intact. This blocks the cheaper wrong fix of setting the flag
unconditionally at the top of the `try`.

### Change
One `wroteAnything = true` before the first UNCONDITIONAL write, so the invariant
`cleanupAndRethrow` depends on is true by construction rather than by whichever earlier branch
happened to run. Before the write, not after — same reasoning `copyPortableEntries` documents for
taking a callback instead of returning a count.

### GREEN
duplicate-site + duplicate-content-db 21/21; site-dir integration 37/37; site-dir unit 78/78.

---

## DS-01 — VERIFIED (code shape holds), NOT FIXED — out of my scope, and WORSE than reported

The fix would land in `apps/desktop/*.cjs`, which the dispatch assigns to another agent. Verified
and handed over rather than edited.

**The claim holds verbatim.** `desktop-auth.cjs:192-195` `hasActiveSessionCookie` is
`cookies.get({name}).length > 0`; `main.cjs:482,493,503` then sets `emitBootToken: !alreadyAuthenticated`
and skips `authenticateSiteSession`. Cookie PRESENCE, not validity.

**Partly mitigated, and the file says so honestly** — its own doc already states "A cookie present
here is not proof the session is still valid server-side … A stale cookie fails exactly like a
missing one: the admin's own session check 401s and the ordinary login screen shows."

**But that recovery is not wired on one of the two paths, which the audit did not catch.** The
comment's fallback depends on `endSiteSession` clearing the cookie so the NEXT launch mints a boot
token. `/auth/logout` (`dev-auth.ts:355-366`) does clear it unconditionally, including for an unknown
token — good. However `endSiteSession` is called from exactly one place, `main.cjs:565`, inside
`openSiteWindow`'s `window.on("closed")`. The **fleet `<webview>` path** (`openSiteServer`) never
calls it — its own comment says "Nothing here ever closes what it opens." So for a site opened from
the Projects grid, a stale cookie is never cleared and persists across launches: every subsequent
launch skips the boot token, the admin 401s, and quit-and-relaunch does **not** recover it.

Combined with `project_tovu_desktop_no_site_password`, that is a lockout with no in-app exit.

**Recommended shape** (for whoever owns `apps/desktop`): probe validity rather than presence — one
authenticated `GET /api/admin/v1/auth/me` through the partition's session before deciding
`emitBootToken`. Minting an unused boot token is cheap; the accumulation problem
`hasActiveSessionCookie` was added to solve is about 30-day SESSIONS, not tokens.

Severity: raise from Low to **Medium** on the fleet path.

---

## Cross-cutting notes

- **`apps/admin` tsc baseline is stale.** The dispatch says 31 pre-existing errors. A full
  `npx tsc --noEmit -p tsconfig.json` from `apps/admin` (332 test files in `--listFiles`) reports
  **0**. Someone cleared it; I did not.
- **One tsc error in `apps/admin` is not mine:**
  `src/lib/__tests__/assistant-transport.run-status.unit.test.ts(8,40) TS2305 'terminalFailureError'`.
  That file is **untracked** in the shared tree — another agent's in-flight work. My earlier run on
  this package was clean.
- **Complexity.** `npx eslint` on the changed files initially reported three errors over the
  ceiling of 9, all mine (`describeAdmissionDrift` 10/cognitive 11, `useExternalMcpAdmissions` 10,
  plus a `too-many-break-or-continue` warning). All refactored out in `ed40d6b5`; every changed file
  now reports 0 problems. Worth recording that `tsc` caught a regression the refactor introduced
  (TS7053) — a `filter().map()` cannot narrow `refusal.reason` the way falling past a `continue`
  does, so the loop stayed a loop rather than acquiring a cast.
- **Not consolidated, flagged instead:** the eleven `escapeHtml` copies (ESC-01 table above).

## Commits

| SHA | Finding |
|---|---|
| `77629140` | SEC-05 |
| `659b98ec` | MCP-01, ADM-001, ADM-002 |
| `c773a779` | ESC-01, PG-01 |
| `bfe35eca` | C03 |
| `ed40d6b5` | complexity-ceiling refactor of the above |
