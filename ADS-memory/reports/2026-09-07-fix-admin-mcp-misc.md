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

