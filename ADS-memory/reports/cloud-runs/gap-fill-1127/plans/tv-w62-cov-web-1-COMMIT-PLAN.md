# Coverage gap-fill handoff

Mutation candidates were reviewed statically against the Author Checklist. No test, build, coverage, typecheck, or mutation run was executed.

## Site chat

- `site-assistant-errors.test.ts:normalizes trailing punctuation and preserves the original cause for diagnostics` → remove the trailing-punctuation loop or omit the cause from either error constructor.
- `site-assistant-errors.test.ts:does not mistake a server message containing a network phrase for a browser fetch failure` → remove the `instanceof TypeError` guard.
- `site-chat-i18n.test.ts:an unset page language uses English and region-specific translations match case-insensitively` → drop the English language default or compare the regional locale case-sensitively.
- `tool-confirmation.test.ts:confirmation defaults to the browser fetch and sends only same-origin JSON credentials` → change credentials to `omit`, remove the JSON header, invert the decision bit, or replace the 10,000 ms timeout.
- `visitor-page-path.unit.test.ts:visitor navigation allows a decoded public character at the depth limit but rejects unresolved escapes` → change the decode budget from five to four/six or accept malformed encoding.
- `visitor-page-control.recovery.test.ts:closing an attached page drops its live headers and does not reattach on a later read` → return empty headers while attached, or stop closing/invalidation from clearing the live binding.

## Website assistant

- `admin-ag-ui-approvals.unit.test.ts:the card's earlier deadline removes its checkpoint without answering the daemon` → use the host cap instead of the minimum deadline, omit the parked-record removal in the timer, or drop the saved cursor.
- `admin-ag-ui-approvals.unit.test.ts:one owner cannot fill another owner's slots and expiry reopens a slot` → treat the four-slot limit as global, allocate a timer before park succeeds, or replace the fifteen-minute default.
- `admin-ag-ui-approvals.unit.test.ts:a daemon refusal consumes the approval, clears its timer and cannot be retried` → return resumed regardless of the daemon's boolean, skip timer cancellation, or pass an allow decision for a deny.
- `admin-ag-ui-approvals.unit.test.ts:Stop removes only the approval for the supplied owner and daemon run` → drop either Stop filter or send an answer to the exchange when Stop claims it.
- `ask-choice-custom-answer.test.ts:the reveal adapter leaves text without a stylesheet and non-text resources intact` → drop the optional resource access, drop the HTML text guard, or reconstruct the resource even without a closing style tag.
- `site-assistant-transport.ag-ui-approval.test.ts:idle expiry cancels a parked approval and reports one timeout while disposing the resume response` → omit the idle failure, reuse stale credentials after the second binding read fails, disable keepalive, or leave the cancelled-resume body open.
- `site/__tests__/tools.test.ts:quarantines malformed membership fields without silently dropping neighboring public posts` → remove the raw column type gate, let JSON null escape, or return unrestricted published rows.
- `site/__tests__/tools.test.ts:a failed workspace read is not reported to callers as an empty site` → swallow a listPublishedPosts rejection and return [].
- `mcp-federation.reload.test.ts:reload preserves the preset origin of a late connection without reclassifying stored connections` → pass both connections as extraConnections or both as preset connections.
- `vanilla-host.adapters.test.ts:vanilla mount restores the conversation open state without a page open hint` → discard the persisted-open operand.
- `entries.test.ts:main creates a missing React root, installs the host font, and reuses an existing root` (extended) → drop the font override or ignore an existing mount node and append another.
- `public-assistant-settings.test.ts:a non-boolean public switch cannot mutate a valid widget selection in the same patch` → allow non-boolean setting input or start applying the widget before validating the first field.
- `persistence/__tests__/chat-expiry-sweep.dialects.test.ts:startup without explicit options expires against the host clock and preserves the next millisecond` → omit the boot sweep at the binding or replace the default clock/boundary so that a chat expiring now is not deleted.
- `visitor-page-control.recovery.test.ts:an approved form submits once, only after its acknowledgement and terminal transcript` → remove deferSubmit, omit the special acknowledgement, execute before saving the final transcript, or retain the accepted submission after executing.
- `admin-frontend-owner.unit.test.ts:the tab identifier cap applies to both request carriers and cannot fall back from an invalid header` → change the 128-character bound or fall back to the query after rejecting a supplied header.
- `site-chat-comparison.test.ts:an explicit null storage root does not inherit the current comparison pane` → use a nullish default for root and accidentally namespace callers that opted out.
- `persistence/__tests__/chat-history-store.dialects.test.ts:the default host clock timestamps stored chat history` → replace the Date.now default with a constant or skip forwarding the clock and use a different time source.
- `persistence/__tests__/store-factory.test.ts:bulk deletion uses the same owner partition and rechecks which chats are open at apply` → substitute an incorrect scope, a detached database, or a constant open-conversations port.
- `mcp-injection.unit.test.ts:HTTP preparation requires sessions and receives only run-scoped inputs` (extended) → disable session mode at the listener or omit the host warning adapter.
- `external-mcp-federation-runtime.test.ts:an installed catalog change invalidates discovery without starting federation early` → omit the beforeReload binding or eagerly read the external roster from a cold invalidation.
- `SiteAssistantWidget.confirmation.test.ts:unmount aborts the browser page attachment while credentials are still pending` → remove the widget hook's frontend close effect or leave the attachment fetch detached from the document's abort signal.
- `admin-ag-ui-approvals.unit.test.ts:the process-wide approval cap is shared across owners and Stop frees a slot` → remove the 50-entry global cap or leave the claimed slot occupied after Stop.
- `site-assistant-transport.test.ts:uses the public no-reply wording for a server-coded NO_REPLY terminal, not the internal detail` → always use RUN_ERROR.message rather than mapping NO_REPLY, or keep consuming frames after settlement.
- `component-catalog-tool.test.ts:invalid component search limits are refused before reading the catalog` → coerce nonfinite/wrong-type limits to defaults, or read the snapshot before validating.
- `admin-screen-link-tool.test.ts:a whitespace-only tab is omitted, while padding around a real tab is trimmed` → use the untrimmed value as the condition or as the query parameter.
- `site-assistant-transport.ag-ui-approval.test.ts:Stop aborts an in-flight answer without posting a second cancellation for the same approval` → remove the parked-answer claim check before sending a cancellation.
- `byok-tool-surface.test.ts:a tool removed from the live registry cannot run under its previously published name` → dispatch without the current availability check, falling through to the delegated "unknown tool" result or serving the stale handler.
- `mcp-federation.stdio-launch-resolver.test.ts:launch failure guidance recognizes Windows executable suffixes and the uv alias` → drop the uv alias, stop stripping Windows suffixes, or discard the searched-directory list.
- `SiteAssistantWidget.confirmation.test.ts:a failed decision adds localized status and only a second click retries it` → drop the failure notice, use untranslated English, or wire the Allow button to a deny decision.
- `external-mcp-federation-runtime.test.ts:reset detaches both roster listeners and allows a fresh listener under the same key` → make the host reset a no-op or release only one listener.

## SKIPPED-ALREADY-COVERED by source inspection

These existing tests exercise the named behavior. This is not measured coverage. For entries with no uncovered line range, the dispatch did not identify individual missing branch/function offsets. Site-chat paths are relative to apps/site-chat/src and website paths to apps/website/src/assistant unless otherwise noted.

| Source | Existing test evidence |
| --- | --- |
| SiteAssistantHeader.tsx | SiteAssistantHeader.test.ts — public title, empty reset, two-step reset, Escape cleanup and injected close label. |
| remixicon-override.ts | remixicon-override.test.ts — marked stylesheet with the deployed URL, duplicate prevention and honoring a host marker. Lines 1–57 are commentary. |
| site-chat-comparison.ts | site-chat-comparison.test.ts — normal visitors get no bridge, framed navigation keeps the namespace, detached and cross-origin frames stay disabled. |
| vanilla-tool-confirmation.ts | vanilla-tool-confirmation.test.ts — strip clicks, failed sends and explicit retry, focus, expiry and DOM rerender cleanup. |
| a2ui-actions-route.ts | a2ui-actions-route.test.ts — “delivers a matching action to the held-open exchange, and never needs a toolId”; principal/malformed/refusal cases. |
| agent-session-preset.ts | agent-run-concurrency.unit.test.ts — waitForStoppingRuns awaits prior stop or respects timeout. agent-session-binding.unit.test.ts pins which agent may accept a host-minted id. |
| agents.ts | agents.test.ts — process-level rescan with injected probes, changed live/fallback models and the pending inventory. |
| ask-choice-tool.ts | ask-choice-tool.test.ts — full and flat choice flows, owned answer ticket, cancel/timeout/abort and malformed input. automatic-agent-plugins.integration.test.ts — plugin answers, receipts and fresh person checks. |
| ask-choice-ui-resource.ts | ask-choice-ui-resource.unit.test.ts — “a valid rendered form becomes the standard UI tool result” and exact renderer refusal for invalid resources. |
| assistant-vault-compat.ts | credential-store.memory.unit.test.ts — keyed/keyless snapshots, unchanged/changed/absent envelope, hint dropping, clear and missing singleton. |
| assistant-vault.ts | assistant-vault.unit.test.ts — missing sealer for open and prepare; original plus non-Error failures; supplied snapshot, mismatched identity and keyed/keyless hint reads. |
| batch-tool-inputs.ts | batch-tool-inputs.test.ts — policy, batch selection, real installed caps, failing/ordered items and web screenshot refusal. |
| byok-credential.ts | byok-credential.test.ts — “falls back to the stored credential when the request omits apiKey” and scoped, unusable and unconfigured outcomes. |
| cli-permission-layer.ts | every-cli-default-settings.contract.test.ts — legacy/native MCP layering and retained site versus per-agent overrides. |
| component-catalog-query.ts | component-catalog-query.test.ts — compatibility search/describe, explicit live manifest provider, limit and missing-description projection. |
| content-target-inputs.ts | content-target-inputs.test.ts — authorization before lookup, selector priority, slug conflict, media/video and combined batch caps. |
| credential-chat-intake.ts | credential-chat-intake.unit.test.ts — redaction of current and cold-start content, malformed input and non-redacted text preservation. |
| credential-guidance.ts | credential-guidance.unit.test.ts — “daemon and BYOK pin the same credential-card policy”. |
| credential-store-fields.ts | small-contracts.unit.test.ts — first save/omitted key/CAS-bound row, plus credential view masks. |
| daemon-access.ts | daemon-access.unit.test.ts — run credential binds principal and run, allowlist refusal and delegated run id validation. |
| daemon-respawn-policy.ts | daemon-respawn-policy.test.ts — fast retry, backoff ladder, independent rolling and port caps and reset. Lines 1–10 are commentary. |
| demo-a2ui-tool.ts | demo-a2ui-tool.test.ts — “the call stays open across two turns, and both actions become the call's result” plus abandoned, unanswered, missing action and no-emitter outcomes. |
| desktop-mcp-runtime.ts | desktop-mcp-runtime.pin.unit.test.ts, desktop-mcp-runtime.process-env.unit.test.ts, and desktop-mcp-runtime.integration.test.ts — process secret capture, one endpoint owner, cold listener recovery and pinned bearer. |
| duplicate-resource-registry.ts | small-contracts.unit.test.ts — duplicate handlers register in order, replace by resource in place and reset. |
| durable-runs/accept.ts | durable-runs/__tests__/recover.unit.test.ts — “run acceptance removes pasted credentials before the durable store sees its envelope”. |
| execution-credential-store.ts | execution-credential-store.test.ts — metadata defaults, explicit null, invalid input, scoped reads, rotation/CAS, crypto failures and no partial writes. |
| external-mcp-call-confirmation.ts | mcp-federation.call-confirmation.test.ts — frozen call args, cancel/expiry, no duplicate approvals. mcp-federation.remembered-approvals.test.ts checks remembered scopes. Lines 1–29 are commentary. |
| external-mcp-connection-source.ts | external-mcp-connection-source.test.ts — whole-read failure clears prior failures. external-mcp-connection-source.operator-read-only.test.ts — actual fallback manifest lookup, plugin/ordinary roster distinction and Error/non-Error formatting. |
| external-mcp-tool-approval-adapters.ts | mcp-federation/__tests__/approval-adapters.unit.test.ts — workspace and conversation isolation, scoped upsert/list, optional identity lookup and deletion. |
| frontend-control-capabilities.ts | frontend-control-capabilities.test.ts — browser capability registration, no unserved confirmation transport, three read-only routes. Lines 1–95 are commentary. |
| installed-extension-tools.ts | installed-extension-tools.order.test.ts — federation boots after installed registration, injected connection reaches boot. byok-tool-surface.test.ts — installed refresh/capabilities and surface store forwarding. Lines 1–20 are commentary. |
| lost-frontend-binding.ts | lost-frontend-binding.test.ts — restart, unbound and detachment messaging. Lines 1–11 are commentary. |
| mcp-federation/bootstrap.ts | mcp-federation/__tests__/registrations.test.ts — default stdio/HTTP attach and injected env/preset resolution. mcp-federation.bootstrap.test.ts — injected resolver, failures and logger. |
| mcp-federation/registrations.ts | mcp-federation/__tests__/registrations.host-policy.unit.test.ts — deny before effects, gated approval and recheck, ordinary dispatch, invalid/empty args and liveness/auth-error forwarding. |
| mcp-ui.ts | mcp-ui.test.ts — exact model text/resource order, result metadata omitted or explicitly carried. |
| permanent-delete-settings.ts | owner-permanent-delete-policy.test.ts — “absent or malformed stored grants deny” including overlimit, duplicates and unknown ids; fresh scope and owner behavior. |
| persistence/agent-session-store.ts | agent-session-store.transports.test.ts — persists/reads a session id on both relabelled kernel transports. agent-session-store.test.ts exercises in-memory and SQLite factories. |
| persistence/conversation-tool-approval-store.ts | conversation-tool-approval-store.dialects.test.ts — exact fingerprint, cross-chat identity, revocation, owner-key isolation and rollback. |
| persistence/run-ledger.ts | run-ledger.dialects.test.ts — “a committed settlement retains its result after redacted attribution failure” covers lines 24–25. |
| persistence/tenant-scope.ts | tenant-scope.test.ts — user and hashed guest scopes, separate owners on one connection. |
| public-assistant-availability.ts | site-credential-store.test.ts — unsupported provider, missing model, blank key, decrypt failure callback, key-free output and read-once behavior. |
| read-only-tool-constraint.ts | read-only-tool-constraint.composition.test.ts — dispatch fails closed and cannot perform nested writes; ordinary authorized reads and unconstrained recovery work. |
| rewrap-page-navigate-error.ts | rewrap-page-navigate-error.test.ts — real navigate refusal reaches caller as CMS guidance. |
| run-active-context.ts | run-active-context.test.ts — “MCP: get_active_context against the daemon route returns the run's screen instead of a 404”. |
| run-page-context.ts | picked-folders.unit.test.ts — the decoded runtime input quotes picked paths; run-page-context.unit.test.ts exercises the no-folders case. |
| run-start-context.ts | parse-run-start-context-ref.unit.test.ts — permitted context and routine marker survive, wrong shapes refuse, attachments are filtered. |
| runtime-preferences.ts | runtime-preferences.unit.test.ts — default/stored/faulted reply preferences and definition-ready sequencing. |
| server-federation-diagnosis.ts | federated-refusal-diagnosis.test.ts — native and unrelated errors pass through, refusal/startup states get distinct readable errors. |
| site-credential-store.memory.ts | credential-store.memory.unit.test.ts — upsert/find, missing singleton, envelope/hint replacement and idempotent clear. |
| site-credential-store.ts | site-credential-store.test.ts — “a non-string baseUrl or model is also rejected before any write — not just provider”. |
| site-guide-pointer.ts | small-contracts.unit.test.ts — direct/delegated route and save/render/handback clauses. |
| site/capability-card.ts | public-site-guide.test.ts — “visitor guidance hides internal tool names and ids, including unavailable actions”. |
| site/capability-registry.ts | site/__tests__/capability-registry.test.ts — default, allow/deny and unknown caller. visitor-tools.integration.test.ts — optional policy and guide. |
| site/history.ts | site/__tests__/history.test.ts — malformed entry filtering and both default and explicit bounds. |
| site/mode.ts | site/__tests__/mode.test.ts — defaults, explicit BYOK, CLI refusal and normalized unknown modes. |

## EXCEPTION candidates

- apps/site-chat/src/jini-surfaces.ts:1–6 — comments only. Provider wiring is executable in the existing widget/comparison tests.
- apps/website/src/assistant/agent-daemon-port.ts:1–19, index.ts:1–29,31–36, mcp-services.ts:1 — barrel/comment-only lines.
- apps/website/src/assistant/external-mcp-tool-approval-ports.ts, host-contracts.ts and host-ports.ts — erased interface/type files.
- apps/website/src/assistant/content-read-tool.ts:275–276,498–499,527–528 — invariant guards over a local map and closed built-in card declarations. The real catalog test checks all 32 projected cards. No supported input can produce the inconsistent states.

## Residual work and verification

- No production fixes or coverage policy changes. No known red regression identified by static review.
- Await the cloud runner's complete eight-shard coverage and branch/function offsets before declaring 100%. The widget navigation-persistence callbacks and visitor page-control refusal/timing combinations have more paths than these cases cover. Where missing branch or function offsets were not supplied, the table identifies existing test evidence without representing it as full coverage.
