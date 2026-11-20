# Commit plan

Execution only: no tests, builds, installs, type checks or linters run; .git is read-only. Tests reviewed statically; runtime verification belongs to the combine owner.

## J-HW1 — done
- Files: Sidebar.tsx; scripts/hardwiring-debt.json; scripts/log-safety-debt.json. SidebarIcon.tsx untouched.
- Removed H4/H5 by exact rule/file/fingerprint; L43 stays value 1 with KEEP reason.
- Existing witnesses: AdminShell.markup.test.tsx safe-shapes and parsererror cases. Mutation: remove path from SidebarIcon allowlist. Admin nav icon visual check pending combine.
- Sidebar.tsx started at 598 lines and is now 494 after the named deletion. No changeset.
- Diff review deletions: only the named duplicate inline icon block and unused React imports; no incidental edits.

## J-HW2 — done
- Files: ui observability stuck-run.ts and its test deleted; observability/index.ts, install.ts, docs/spec/api.spec.md; hardwiring-debt.json; .changeset/ui-remove-stuck-run.md.
- H94 removed by exact identity. Targeted trackRun search found only named files. No new tests requested.
- OPUS-CLOUD must run pnpm api:update; api-baseline/ untouched.
- Diff review deletions: only named watchdog source/test, exports, documentation and debt row; no incidental edits.

## RT-J1 — done
- Files: agent-plugins/src/lifecycle/automatic-use.ts and __tests__/unit/automatic-use.unit.test.ts; .changeset/agent-plugins-enabled-catalog.md.
- Tests first, statically reviewed: 50 enabled rows with load calls and no resolution (rank returns no matches); inactive/Ask-rejected/delivered rows absent; saved-state unrelated query catalog; existing query strings refreshed. Red reason: old note uses ranked matches and a 600-byte cutoff. Mutation: rank-only rows.
- No debt or API baseline edits. Test file exceeds 500 lines. No additional test import repoints; REFRESH.md not needed.
- Diff review deletions: old relevantPluginNote and its obsolete test budget comment; removed an out-of-sheet assertion that incorrectly excluded saved prior delivery from catalog rows (the cull excludes current ctx.delivered only). Refreshed the existing no-formatter assertion to the concrete discovery call.

## RT-J2 — done
- Files: agent-plugins/src/lifecycle/{automatic-use.ts,search.ts,host-tools/search-tool.ts,__tests__/unit/automatic-use.unit.test.ts}; .changeset/agent-plugins-required-guidance.md.
- Tests first, statically reviewed: top plus unranked provider (auto/ask, one question), shared 20+5 KiB overflow, three providers limited to two, 24576/24577/61309 boundary. Red reasons: providers absent from rank; only one primary; old 16 KiB per-primary budget. Mutations: drop withRequiredProviders; per-block budget. Existing argv test unchanged.
- OPUS-CLOUD runs pnpm api:update; api-baseline/ untouched. No debt changes. Test file exceeds 500 lines.
- Diff review deletions: replaced one-primary comments and policy only; no excerpts, dedup changes, or incidental edits. No REFRESH.md entries.

## RD-J1 — done
- Files: chat/src/core/user-text-redaction.ts and __tests__/user-text-redaction{,.gaps,.path-boundaries}.test.ts; .changeset/chat-recognisable-secrets.md.
- Tests first, statically reviewed: avif filename and unlabelled 40-character keep cases, opaque/alphabetic values moved from shapes to ordinary per coordinator amendment; glued known key boundary cases retained. Red reason: entropy candidate pass masks the new ordinary values. No shared diagnostics rule matches those unlabeled keep values by inspection.
- Deleted only the named guesser-only tests/functions/location pass, updated named doc and Slack comment; shared diagnostics import, CHAT_RULES, secretField, marker protection and exports unchanged. No debt/API changes, no REFRESH.md entries.
- Diff review: no incidental deletions. RD-J2 left to its other branch.

## ACP-1 — done
- Files: agent-runtime/src/agent-protocol/acp/{rpc.ts,session.ts,__tests__/session.test.ts}; .changeset/acp-method-not-found.md.
- Tests first, reviewed before source: unknown agent requests / replies method-not-found and still completes the prompt; does not answer an unknown notification. Red reason: old routeResultById drops the incoming request without a response.
- No debt/REFRESH.md changes. session.test.ts exceeds 500 lines. No additional casts or incidental deletions.

## ACP-2 — done
- Files: agent-runtime/src/agent-protocol/acp/{constants.ts,session-results.ts,__tests__/session.test.ts}; .changeset/acp-auth-required.md.
- Test first, reviewed before source: RPC error handling / asks a signed-out agent user to sign in. Red reason: generic failure path does not emit AUTH_REQUIRED, sign_in details or the requested message. Other -32000 cases unchanged.
- No debt/REFRESH.md changes. session.test.ts exceeds 500 lines. No incidental deletions.

## ACP-3 — STOPPED (hard function limit)
- No sheet edits or changeset. Required createAcpHarness in daemon/src/agent-executor/__tests__/agent-executor.test.ts spans original lines 1657–1741 (85 lines), exceeding 50 before the mandatory option-recording/durable-id edits. The sheet names no split; reformatting or an unlisted helper is forbidden. Stopped before test/source edits.
- Intended tests: resume flow / unsupported loadSession; durable-id fallback; daemon gap 5 / resumeSessionId forwarding and durable sessionRef gating. Red reason: no loadSession capability check, durable fallback, or daemon resume wiring. These tests were not authored because the hard stop was established first.
- session.test.ts, session.handlers.unit.test.ts, agent-executor.test.ts and launch.ts exceed 500 lines (not the stop reason). No debt/REFRESH.md changes or deletions.

## ACP-4 — STOPPED (hard function limit and prerequisite)
- No sheet edits or changeset. Required createAcpHarness edits exceed the same 50-line limit; named acpRepairOptions is absent because ACP-3 stopped. No authorized extraction. Stopped before test/source edits.
- Intended tests: model rejection copy/details, null-id error, effort offered/missing/after model switch, daemon effort forwarding. Red reasons: generic errors, null request-id match, absent effort path. Tests not authored after prerequisite stop.
- No debt/REFRESH.md changes or deletions.

## ACP-5 — STOPPED (hard function limit and prerequisite)
- No sheet edits or changeset. Required createAcpHarness change to reject listProcessSnapshots exceeds the same 50-line limit; named acpRepairOptions is absent after ACP-3 stop. Stopped before test/source edits.
- Intended tests: beforeRelease / pending clean and failure release, rejection still releases; daemon descendant stop and acp-release failure reporting. Red reasons: immediate release and no pre-release snapshot. Tests not authored after prerequisite stop.
- No debt/REFRESH.md changes or deletions.

## ACP-6 — done
- Files: agent-runtime/src/agent-protocol/acp/{session-run.ts,__tests__/session.test.ts}; .changeset/acp-cancel-notification.md.
- Test first, reviewed before source: sends session/cancel and closes stdin when a session is already established / cancel frame has no id. Red reason: sendRpc includes state.nextId.
- Deleted only the specified state.nextId increment; no debt/REFRESH.md changes. session-run.ts and session.test.ts exceed 500 lines.

## ACP-7 — done (pilot OFF)
- Files: agent-runtime/src/defs/{opencode-acp.ts,index.ts,__tests__/opencode-acp.test.ts}, agent-runtime/src/{env.ts,executables.ts}; daemon/src/agent-executor/{launch.ts,__tests__/http-mcp-launch.integration.test.ts}; .changeset/opencode-acp-pilot.md.
- Tests first, reviewed before source: native ACP args/transport/MCP/resume metadata; pilot absent from BASE_AGENT_DEFS; project config disabled; HTTP endpoint in OPENCODE_CONFIG_CONTENT using existing opencode launch fixture. Red reasons: missing definition/export, missing housekeeping case and HTTP adapter row. Registry assertion pins OFF and is already true.
- launch.ts exceeds 500 lines. No debt/REFRESH.md changes, casts or incidental deletions. OPUS-CLOUD runs pnpm api:update; api-baseline/ untouched. ACP-8 remains HELD; registry.ts unchanged.
