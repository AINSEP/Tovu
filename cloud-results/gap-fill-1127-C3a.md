PARTIAL run C3a | IN PROGRESS (01:05 UTC) | rounds landed: 9 r1, 11 r1, 12A r1, 12B r1+r2 | started 00:01 UTC | subagents so far 8

# Gap fill round 3, run C3a — interim notes (final report replaces this)

# Job 9, run C3a round 1 (commits 6d31593a, 05966900, 5da5cc5d; head 5da5cc5d)

Done:
- agent-daemon-run-start.ts: extended run-start-branches tests. Remaining sides 415 and 424 are EXCEPTIONS; 420 null-prefix side is executed but unobservable.
- themes/explore.ts: fully covered except import lines 1-3.
- routes/system/site-key.ts: 567, 570, 583, 586, 594, 596, 610 covered. Left: 461 (EXCEPTION, `default: return undefined as never`), 473 (production generate with no key-file path).
- agent-daemon-scope-tools.ts: 83-84 and 98-99 covered (new agent-daemon-scope-tools.frontend-bind.integration.test.ts). Branch sides 29 and 80 untaken in its own run; not checked against other importers.
- SKIPPED-ALREADY-COVERED: tool-access-lowering-route.ts, chat-attachment-directory.ts, byok-message-attachments.ts (100/100/100), assistant-filesystem-notices.ts (lines 3-5 doc comment).
- EXCEPTIONS: run-start.ts:1, 415, 424; site-key.ts:461; assistant-tool-access.ts:44; explore.ts:1-3; assistant-filesystem-notices.ts:3-5.
- Pre-existing reds (not ours): automatic-agent-plugins.integration.test.ts:520,:563; agent-daemon-server.session-resume-wiring.unit.test.ts:101; agent-daemon-server.tool-restriction-wiring.unit.test.ts:33; theme-page-preview.errors.unit.test.ts:7.

LEFT: site-key.ts:473; branch sides scope-tools 29/80 (check merged); and every brief FILES row not yet measured by C, C2 or C3a-r1.

# Job 9 round 1 tests (14), test -> mutation that turns it red
- run-start-branches "a full/metadata AI trace sink…" -> capture === "full" to !==
- run-start-branches "a context decoder that throws a non-Error value…" -> String(error) to "unknown"
- run-start-branches "a standalone run reports its start and each end event…" -> if (event.kind === "end") to true; outcome spread unconditional
- run-start-branches "the pinned prefix leads the prompt, every variant keeps it…" -> argv check forced to preflight; pluginRefIds union dropped; pluginVariants = offer ? to false ?
- run-start-branches "an offer whose pinned prefix could not be loaded refuses the run" -> argv check forced to preflight (first version survived; strengthened)
- run-start-branches "a run cancelled during the agent inventory read fails at the tool-access stage…" -> if (!toolAccessRun) throw removed; console.error removed; stage hard-coded
- run-start-branches "a staged attachment cleanup that rejects at terminal is logged…" -> catch log removed; stagedAttachmentCleanupByRunId.delete removed
- agent-daemon-scope-tools.frontend-bind.integration (new) "a bind token the daemon does not know is reported…" -> onBindError console.error removed; noteBindError removed
- agent-daemon-scope-tools.frontend-bind.integration "a contextRef that is not JSON binds no tab…" -> catch { return undefined } to rethrow
- site-key.tw4.pins "a storage secret locked with the old key refuses both preview and confirm…" -> locked refusal removed; preview/confirm isRouteResult guards removed
- site-key.tw4.pins "an unusable key in the environment refuses start fresh…" -> env/undefined-hex check to false
- site-key.tw4.pins "the preview counts what the working key cannot open…" -> metadataOnly ?? 0 dropped; removes to sealed; removes === 0 to < 0
- site-key.tw4.pins "the confirm sentence names one credential in the singular…" -> noun always plural (a `length < 2` webhook mutation survives: test uses two webhooks)
- explore-pure-helpers "renameThemeFileIfChanged: renaming a file to the name it already has is a no-op…" -> same-name short-circuit removed

# Job 11 round 1 (50cf5baa, 36c8dde6, 9bbf1b8d, 235e4c7a, b9786b11, eaa286cd); typecheck 0; 58/58
Coverage: bootstrap.ts L99.75/B96.43/F90.70 -> L99.75/B100/F100 (419 = export line); agent-daemon-core-rpc.ts B 95.95 -> 97.33 (151 covered); mount-admin-system.ts branch sides 224, 231 + fn 117 covered; commerce.ts (4 importers) L98.14/B91.23/F93.14 -> L98.60/B93.01/F95.10; deps.ts untouched.
Tests added (10):
- bootstrap-reporting "non-Error throws from the activations read, face sync and Soon lock are logged by their string form" -> instanceof Error ternary at 54/69/196 replaced
- bootstrap-reporting "face sync reads each provider switch from the activation repo and its ports resolve this workspace's plugin root" -> `=== true` to `!== false` (51); other workspaceId (50)
- bootstrap-reporting "tool renames and declared-tool grants each get a roster notifier…" -> notifier 362/375 no-op
- agent-daemon-core-rpc.integration "a daemon settings read naming another workspace is refused…" -> 151 guard false
- site-update-status.wire "before the composition binds the update runtime the status is unavailable…" -> 224 returns ports
- site-update-status.wire "a bound runtime's last-attempt journal reaches the status reply…" -> 231 returns undefined
- status-route-guards "server-logs: an invalid filter is a 400…; a log-source fault is not mistaken for one" -> 117 instanceof Error / returns undefined
- commerce-attention "an active shop with payment storage but no payment configuration offers no origin, receiver, catalog or checkout" -> mutations at 183, 422, 436, 302
- commerce-attention "a per-request checkout pays the order it created…" -> 425 createOrder instead of pay
- commerce-attention "an aged unknown payment whose merchant configuration was removed stays unknown and alerts once with a restore hint" -> 262 message changed
EXCEPTIONS (proposed): bootstrap.ts:419, mount-admin-system.ts:321 (export lines, bodies covered); agent-daemon-core-rpc.ts 102,120 (zod), :1; commerce.ts:67 (evict throw unreachable), :1; commerce.ts:264 grants.mint/redeem (no registered tool issues grants); mount-admin-system.ts:318 (status type 503|507 only); mount-admin-system.ts:96 toolGapsNeverAuthorizes (deny-by-default, never called).
Owner question: configured aged-payment variant still raised "restore configuration" alert, with and without activation — check whether resolve() returns null on worker cycles even when configuration exists (possible bug, unconfirmed; not committed).

# Job 12 slice A, round 1 (ddfc6312, b7ad1539, 2a707a10, 8efa15c6, 9fb1c65e); typecheck 0
Now 100/100/100: revision-thinning-routes.ts (was B 88.89), screenshot-storage.ts (was B 95.12). SKIPPED: routine-recovery-admission.ts.
Tests added (11):
- assistant-run-acceptance.unit "the production owner-chat acceptance captures the run's own principal and dispatches each queued run through the daemon client" -> userId `run.principalId ?? ""` to ""; launch closure returns Promise.resolve()
- assistant-routines.integration "update, run-now and delete reach the owner command gate; a missing routine answers the factory's own 404" -> delete `!== null` to `=== null`; getLatestRun returns null
- assistant-routines.integration "turning the assistant off drains, disarms every timer and releases the lease…" -> service.stop removed
- assistant-routines.integration "a failing beacon write is logged and never fails boot or a command" -> safeBeacon catch silent
- assistant-routines.integration "the refusal host and a closed host expose inert boot, wake and approval ports" -> refusal isLeaseOwner true; `!closed &&` dropped
- assistant-routines.integration "a signed-in non-owner is refused FORBIDDEN…, a non-object create body reaches the factory's 400, and a repeated toggle is a no-op" -> 403 to 409; isObject guard removed; `next === enabled` dropped
- assistant-chats.boot-repair.unit "the routine lease owner's interruption is awaited before repair…; a passive window never waits" -> .catch removed; boot?.isLeaseOwner() to boot; no wait
- revision-thinning-composition.unit "thinning engine errors map to the panel's refusals…" -> String(error) for non-Error; "Confirm the revision" arm removed
- screenshot-storage.unit "screenshot cleanup maps the confirm wording to a 400…" -> "Confirm the screenshot" arm removed; String(error)
Surviving mutants (redundant lines): `if (error instanceof RouteRefusalError) throw error` in both refusal mappers (no RouteRefusalError message matches the mapped wordings); assistant-routines reconcile-after-close `!closed`.
Proposed EXCEPTIONS: assistant-run-acceptance.ts 144 and 212 `if (!client.launch) throw` (createHttpRunDaemonClient always provides launch, run-daemon-http-client.ts:143); assistant.ts 160-161 `!isPlainObject(parsed)` (parseAdminRunEnvelope already rejects non-objects; caught at 156); assistant-ag-ui.ts 3-46 doc comment.
Pre-existing reds: media-route-failures.unit "omitted provider map clears the whole set" (409 vs 200); member-adapter.test 3 "gapb member … survives Trash" (60-day backstop tied to real clock); members-auth/OIDC "challenge CAS rejection is 401 but database outage surfaces as 500"; "a session-repo failure surfaces as a 500 internal error".

# Job 12 slice B, round 1 (local branch codex/tv-w62-cov-web-12-b: bd202d89, a5eeae92, 8eb7ba3a, 96e5ea38)
typecheck:tests: the 2 errors it saw were job 9's in-progress file, since fixed (5da5cc5d). Not ours.
Tests added (10):
- storage-routes.unit.test.ts "cleanup refuses an array body and class lists that are not words…" -> drop Array.isArray(body) / drop classes.some(non-string)
- storage-routes.unit.test.ts "a cleanup body read with no body at all is a dry run…" -> `body ?? {}` -> `body`; grant dropped from return
- move-site-storage.l058a.test.ts "a lock that names no process yet…process unknown" -> `?? "unknown"` changed
- move-site-storage.l058a.test.ts "a lock failure that is not a running site propagates as itself" -> throw err -> ValidationError
- serving-routines-owner-access.unit.test.ts (new, real in-memory identity stack): owner may run/other principal may not -> wrong principalId; other-workspace actor refused without lookup -> workspace guard removed; failing lookup denies -> try/catch removed
- site-assistant.body-errors.unit.test.ts (new): malformed JSON 400 VALIDATION -> entity.parse.failed comparison changed; other body-parser failure redacted 500 -> fallback code VALIDATION; turn throws before stream -> JSON 500 -> status 502
SKIPPED-ALREADY-COVERED: serving-routines writeRoutineBeaconAtomically (serving-routines.integration.test.ts).
EXCEPTIONS: site-assistant.ts 113-118 + site-assistant-preflight.ts 261-269 (dead cli branches: resolveSiteAssistantMode only returns byok); storage-routes.ts 157 unboundRunOnce (bind always replaces runOnce); move-site-storage.ts 112-130 (live Postgres only; covered by move-site-storage.postgres.test.ts where a server exists); mutation-actor.ts, types.ts (as in C).
Pre-existing reds: site-backups.integration.test.ts:65 (push answer inProgress undefined, expected true); peer-site-reads.test.ts "inSite: reads B's posts/media/forms…" (ToolInputError content_post_list can't read another site yet).

# Job 12 slice B round 2 (fc426328, e6f9dc97, 57f9cc01, d75907a3, cac3fa18, 02ce495c); typecheck 0
site-assistant-turn.ts now L100 B88.57 F100.
Tests added (20):
- site-assistant-turn.tool-outcomes.integration (new): "a tool whose store fails…" -> error case returns String(outcome.error); "site_guide call runs the public guide" -> siteGuide stubbed; "an audit sink that fails…" -> code visitor_tools_audit to _policy; "an unreadable visitor-tools policy…" -> reverse; "beginStream … HTTP/2 … without flushHeaders" -> httpVersionMajor < 3 / res.flushHeaders!(); "beginStream keeps keep-alive on HTTP/1.1" -> httpVersionMajor < 1
- other-site-keys.integration: "a key id without the saved-on-site prefix…" -> drop !source; "no vault table" -> empty=false; "sealed value was damaged" -> .catch(unlockHelp) removed; "label and site-qualified label are both taken" -> suffix ternary to withSite
- serving-routines-default-edges.unit (new): "routine store that cannot be opened is logged…" -> [routine] prefix; "with a parent IPC slot…" -> typeof process.send === "string"; "without a parent IPC slot…" -> parentChannel always process
- site-assistant-ag-ui-approval.unit: "a segment the visitor drops…" -> unconditional abort / no abort; "without an approval owner there is no Ask channel" -> owner guard disabled
- site-assistant-ag-ui.unit: "only an explicit, non-zero-quality agui=1…" -> q >= 0 / agui check removed; "AG-UI body is read…" -> forwarded = body / messages Array.isArray removed; "holds leading whitespace…" -> terminal latch removed / text = delta; "whitespace-only reply…" -> settle guard inverted / no-reply branch disabled; "optional AG-UI fields are absent…" -> parentMessageId: message.open / code: outcome.code
Dropped (mutant survived): no-args tool call (call.input ?? {}); pglite listing (other-site-keys:136).
Candidate EXCEPTIONS: other-site-keys @68 now/newId, @88 newId (defensive throws never called by get/put-with-id); other-site-keys:52 object-meta side (SQLite meta always string); site-search:167 (available values are strings by type).
Pre-existing reds: site-chat-stream.golden.test.ts:265 "page.navigate … ends the turn" (2 !== 1); tool-read-wording.integration.test.ts:94 (run-has-write-access.ts missing from list).

