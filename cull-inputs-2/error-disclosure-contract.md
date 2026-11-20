# Error disclosure contract (DRAFT 2026-11-20, for coordinator approval)

Inputs: error-system design r2 (`origin/plan/error-system-design-2026-11-16:designs/error-system/DESIGN.md` §3.2–3.4, §9), owner rule "no generic errors: plain words + redacted details" (11-03), debt decisions 2 and 4 (11-20), owner 11-17 "OK to proceed on recommendations" for ER-6 / ER-D12. Mechanisms are the ones already on Jini merge-6 `packages/core/src/errors/` (reporter, disclosure, approved-cause, error-id, idioms). No new layer, port or field beyond what the design names.

**Rules for every audience**
1. Words are operation-specific: "<what failed, in plain words>. <what to do next>." Never a catch-all sentence, never "Something went wrong". The reporter's `fallback` is required at every call; that is the only source of incident words.
2. A refusal (expected, the caller can fix it) = stable `code` + its sentence (+ `details.params`). No incident, no ID.
3. Anything else = an incident: ONE `ERR-XXXX-XXXX-XXXX-XXXX` ID (minted once, reused by every layer; ID-maker failure → `ERR-0000-0000-0000-0000`, ER-8), words = `"<fallback.message> (error <ID>)"`.
4. Never shown to any caller: error message text, stack, raw provider/HTTP body, file paths, request body/headers/cookies/query, tokens or secrets, SQL. A cause reaches a caller only via `approveCause` from that operation's owner (allowlisted callers), for an `authorized` caller, matching step. Redaction is a second layer, never the permission.
5. The full cause goes to the host incident record (server log, operator only), keyed by the same ID.

| Audience | Must say | Detail shown | Redacted / never | Full cause goes to |
|---|---|---|---|---|
| Site owner in admin (signed-in) | operation-specific localized words + next step (i18n key in all 21 locales, caller + key change together) | Copy details: ID, step, fixed cause sentence "The error ID identifies the server report.", app + Jini version, time | message text, stack, payload, labels | host record |
| Site owner authorised for the operation | same | same + listed class/code label (`Error(SQLITE_BUSY)`); approved redacted cause only where the owner approved it (export pilot today) | unapproved message text, stack | host record |
| Site visitor (anonymous, site chat, embed, public routes) | words + "Report this error ID." | ID only (`ErrorNotice disclosure="id-only"`) | details, step internals, versions, labels | host record |
| In-app agent / tool result (model) | refusal: `CODE: text. guidance`; incident: `Error ERR-…: <reason with secret values blanked>` (D12 / ER-D12: unchanged, per rec) | — | Copy details, stack, exact secrets, the host's `exactSecrets` | host record |
| Electron IPC / sidecar | handler still rejects with words + `(error ERR-…)`; sidecar bad frame = fixed `BAD_FRAME` sentence, no input echo; handler incident keeps `HANDLER_ERROR` + `requestId` | ID | raw message, input echo | main-process / host record |
| CLI | sentence words for refusals; incident prints the ID + where the record is (log path / "server log") | ID | message, stack, paths outside the record pointer | host record |
| Logs: host incident record (operator only) | ID, step, code/label, message + stack (30 lines), labels of up to 3 causes, versions, time | — | `redactSecrets` shapes + host and per-call `exactSecrets` blanked; reporter attaches no request body/header/cookie/query | (is the record) |
| Logs: tracker (ER-6, per rec) | the ORIGINAL error object (keeps stack grouping / de-dup) + the call's `exactSecrets`; the tracker adapter blanks secret shapes and exact secrets before anything leaves the process | — | same as host record; if the tracker is a third party, label + ID only (D10) | tracker |
| Logs: library console line (Jini, no host) | step, ID, class label, listed code | — | message, stack | host record via the host reporter |
| Persisted rows (outbox `lastError`, operation rows) | a code from the owner's closed list, else the class label | row ID + attempt as the reference | any message text, any appended ID | one log entry per failure keyed by row ID + attempt |

**Boundaries (decision 4):** at every tool / CLI / HTTP / IPC boundary the cause stays private; headless code uses the existing idioms (`orFallback`, `orFallbackSync`, `absentWhen`, `bestEffort` with an injected logger, `observed`, `afterSettled`), never a console logger in Jini and never a new port. **Client (decision 3):** errors go to the feature's existing notice owner via `useReportFailure` / `ErrorNotice`; a hook never stores a caught value's own text in state; drafts and cached views are kept.

**ER-6 APPROVED (coordinator 11-20; owner accepted the recommendation 11-17):** the tracker shape above changes `IncidentTrackerReport` (adds `exactSecrets`; `trackerCarrier` no longer replaces the original); a third-party tracker gets label + ID only. Everything else restates the design.
