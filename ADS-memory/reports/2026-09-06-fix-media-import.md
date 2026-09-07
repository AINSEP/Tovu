# Fix: media-import MI-01 / MI-02

Agent: programmer (Opus 5). Branch `restructure/apps-website-phased`.

## MI-01 — complete images falsely rejected — **CONFIRMED**

Static path, re-read at HEAD:

- `apps/website/src/platform/http/client.ts:308` — `capResponse` computes
  `truncated = bodyText !== response.bodyText || bytesOverCap || response.bodyTruncated === true`
  and writes it to the single `bodyTruncated` field.
- `apps/website/src/features/media-import/fetch-image.ts:284` — `fetchImage` passes
  `response.bodyTruncated === true` to `validateImageBytes`.
- `apps/website/src/features/media-import/fetch-image.ts:224` — `validateImageBytes` throws
  "exceeds the 10485760-byte import limit" on that flag.

`fetchImage` never reads `bodyText`. So text-only truncation rejects a complete image.

Numeric proof the window is real, not theoretical (cap 12 MiB = `MEDIA_IMPORT_MAX_RESPONSE_BYTES`,
import limit 10 MiB = `DEFAULT_MAX_UPLOAD_BYTES`):

| raw bytes | lossy-UTF-8 text bytes | ratio | under import limit | text over cap | falsely rejected |
|---|---|---|---|---|---|
| 8.50 MiB | 16,156,244 | 1.813 | yes | yes | **yes** |
| 9.00 MiB | 17,103,614 | 1.812 | yes | yes | **yes** |
| 9.50 MiB | 18,057,419 | 1.813 | yes | yes | **yes** |
| 10.00 MiB | 19,004,319 | 1.812 | yes | yes | **yes** |

(`crypto.randomBytes` stands in for PNG/JPEG compressed data, which is near-random.) The whole
band ~6.94 MiB -> 10 MiB is falsely refused. The 3.29 MB PNG named in `egress-policies.ts`'s own
doc as the motivating incident is below the band, which is why this was not caught by hand.

### Consumers of `bodyTruncated` (all of them, checked individually)

Repo-wide `grep -rn bodyTruncated` excluding `node_modules`/`.git`:

| site | kind | verdict |
|---|---|---|
| `platform/http/types.ts:57` | field declaration | doc updated |
| `platform/http/client.ts:308,313` | producer (`capResponse`) | changed |
| `platform/http/egress-policies.ts:59,88` | prose referencing the flag | doc updated |
| `features/media-import/fetch-image.ts:284` | **the only production reader** | changed |
| `features/media-import/fetch-image.ts:50` | file-header prose | doc updated |
| `platform/http/__tests__/body-bytes.test.ts` (7 sites) | test | unchanged + extended |
| `features/media-import/__tests__/fetch-image.test.ts:93,153,395` | test double / assertion | unchanged |
| `features/media-import/__tests__/tool-registrations.test.ts:113,312` | test double | unchanged |
| `ADS-memory/*`, `development/todos.md` | prose | n/a |

No other production reader exists. `HttpResponse` is declared in `platform/http/types.ts` and is not
re-exported outside `apps/website`.

## MI-02 — redirected import records the requested URL, not the final one — **CONFIRMED**

- `tool-registrations.ts:107` contract comment: `sourceUrl` is "after redirect resolution".
- `tool-registrations.ts:168` emits `fetched.url.href`.
- `fetch-image.ts:285` returns the URL `parseImportUrl` produced from the tool input.
- `client.ts:333-355` `sendWithPolicy` recurses on redirect and returns an `HttpResponse` that
  carries no URL at all, so the final hop is unrecoverable by the caller.

Contract and code disagree. Confirmed.

## Live-system caution

First write under `apps/website/src`: **2026-09-06 23:53:03 PDT** (test files). Production files
followed within the same ~10 minutes. The agent daemon is a child of the tsx-watch API and will have
respawned several times in that window — correlate against `chat-death-debug`'s reproductions.

No dev-server restart, no `kill`, no process touched.

## MI-01 — the fix

**Shape:** `bodyTruncated` keeps its meaning (the OR of both body shapes, so no existing consumer's
behavior changes) and gains a sibling that answers for the byte half alone.

- `platform/http/types.ts` — new optional `bodyBytesTruncated?: boolean`. `bodyTruncated`'s doc
  rewritten: it now states plainly that it is the OR and is **the wrong field for a consumer that
  reads only one shape**, and names why (byte truncation implies text truncation, never the reverse).
  The old doc's claim that the OR lets "a consumer reading either shape learn the response was
  incomplete" was false for a byte consumer; that sentence is gone from `client.ts` too.
- `platform/http/client.ts` — `capResponse` emits `bodyBytesTruncated` whenever it emits `bodyBytes`.
  A producer that reports only the coarse `bodyTruncated` (naming no shape) is propagated into BOTH
  halves rather than downgraded to "the bytes are fine".
- `features/media-import/fetch-image.ts` — reads `response.bodyBytesTruncated ?? response.bodyTruncated === true`.
  The fallback cannot fire in production (`capResponse` always sets the field alongside `bodyBytes`,
  and a byte-less response is already refused one line earlier); it exists so a hand-written double
  reporting only the coarse flag is still refused conservatively.
- `validateImageBytes`' third parameter renamed `truncated` -> `bytesTruncated`.
- `platform/http/egress-policies.ts` — two prose passages asserted the old behavior ("`client.ts`
  flags `bodyTruncated`, and the feature refuses a truncated response"). Both corrected.

**Absent `bodyBytes` gets no `bodyBytesTruncated`** — a flag about bytes that do not exist would be
an invented answer, matching `bodyBytes`' own "absence is not fabricated into a value" rule.

## MI-02 — the fix

Took the **propagation** option, not the comment fix. It cost one optional field and no ripple:
`tsc` is clean and all 342 tests across every `platform/http` consumer pass unchanged.

- `platform/http/types.ts` — new optional `finalUrl?: string`.
- `platform/http/client.ts` — `sendWithPolicy` stamps `finalUrl: url.href` (the normalized form the
  guard actually resolved and pinned) on the response it returns. A followed redirect returns the
  deeper frame's response untouched, so the value is the LAST hop. On a 3xx that was not followed
  (`maxRedirects` exhausted, or no `Location`) it names the hop that returned the 3xx, never the
  location it pointed at — the bytes in hand came from the former.
- `features/media-import/fetch-image.ts` — new `resolveSourceUrl(requested, reported)`: the reported
  final hop when it parses, else the requested URL. Absent or unparsable falls back rather than
  throwing; the bytes are good and only their label was unavailable.

**Deliberate behavior change, not silent:** `FetchedImage.url` is now the final hop, so on a redirect
BOTH `sourceUrl` and the default stored **filename** follow the bytes. That is what the field's
contract at `tool-registrations.ts:107` always claimed and what provenance requires. Validation error
messages still name the REQUESTED URL — that is the one a caller can act on.

Every value `finalUrl` can carry has already passed the full per-hop guard (scheme, credentials,
DNS, address class, re-pinning), because `sendWithPolicy` re-runs all of it before following.

## Proof

**RED first — 13 failing tests before the fix.** The headline one reproduced the reported message
verbatim:

```
✖ an image whose BYTES are complete is imported even though the response's lossy text half was clipped
  Error: the image at 'https://cdn.example.com/generated/fox.png' exceeds the 10485760-byte import
  limit. Nothing was saved — a partially downloaded image would be a corrupt file, not a smaller one.
      at validateImageBytes (apps/website/src/features/media-import/fetch-image.ts:226:11)
      at fetchImage (apps/website/src/features/media-import/fetch-image.ts:284:23)
```

Tests added (all RED before, GREEN after):

- `apps/website/src/platform/http/__tests__/body-bytes.test.ts` — 5: bytes complete + text over cap
  reports `bodyBytesTruncated:false` while `bodyTruncated` stays `true`; byte truncation reports
  `true`; untruncated reports `false`; a coarse-only producer is not downgraded; no `bodyBytes` means
  no fabricated flag.
- `apps/website/src/platform/http/__tests__/client.test.ts` — 5 `finalUrl` tests including a
  three-hop chain (asserts LAST, not second) and both unfollowed-3xx shapes.
- `apps/website/src/features/media-import/__tests__/fetch-image.test.ts` — 6: the complete-image
  import **succeeds**; `bodyBytesTruncated:true` still refused with the **exact** message string;
  redirect provenance incl. the derived filename; absent and unparsable `finalUrl` fallbacks.
- `apps/website/src/features/media-import/__tests__/tool-registrations.test.ts` — 2: `sourceUrl` is
  the redirected hop, and the no-redirect case still records the requested URL.

"What would this still pass under?" — the two negative-control assertions that stop the suite
tolerating the bug are `assert.equal(response.bodyTruncated, true)` alongside
`bodyBytesTruncated:false` (a fix that simply deleted text truncation would fail this), and
`assert.notEqual(out.media.sourceUrl, SOURCE_URL)` (an assertion that would pass by coincidence if
the two URLs were equal). The two byte-length sanity assertions in the miniature-cap test pin that
24 raw bytes really do re-encode to 72, so the cap is genuinely crossed.

### GREEN

| command | result |
|---|---|
| 4 changed test files + `import-boundary.test.ts` | **115/115 pass, 0 fail** |
| every other `platform/http` consumer test (13 files) | **218/218 pass, 0 fail** |
| lipay + webhooks (8 files) | **124/124 pass, 0 fail** |
| `npx tsc -p tsconfig.json --noEmit` | **rc=0, zero output** |
| `npx eslint` on the 4 changed production files | 0 errors; 1 pre-existing `no-nested-conditional` warning at `client.ts:250` (`resolvePinnedPeer`'s port ternary, untouched) |

### Pre-existing RED, NOT caused by this change

`npx tsx development/scripts/check-src-complexity-drift.ts` exits 1 with 3 new violations —
`features/media/read-chat-attachment.ts`, `server/inbound/admin-http/routes/posts/autosave.ts`,
`server/inbound/assistant/agent-daemon-server.ts`. All three are **clean at HEAD** in
`git status --porcelain` (nobody has modified them in this working tree), so they were already
failing before this task started. None of the four files I changed produced a violation.
`platform/http` is not in that check's scanned scope at all; `features/media-import` is, and passed.

### One correction made mid-run

My first draft of the miniature-cap test asserted the CAPPED text re-encodes to <= 32 bytes. That is
false and the fix is not why: `capBody` clips the pre-cap encoding to the cap, and a 3-byte U+FFFD
split across that boundary decodes into further replacement characters, so the capped string can
re-encode a few bytes over. Pre-existing `capBody` behavior, out of scope. The assertion now measures
lost CONTENT (characters), which is what it was meant to prove.

## Scope

Changed: `platform/http/{types,client,egress-policies}.ts`, `features/media-import/fetch-image.ts`,
and 4 test files. No existing test deleted, weakened, or rewritten. No new imports, so no new
`dependency-cruiser` boundary edges. `HttpResponse` gained two optional fields, so every pre-existing
literal and hand-written double still satisfies the interface — the same additive pattern `bodyBytes`
used on 2026-09-06.
