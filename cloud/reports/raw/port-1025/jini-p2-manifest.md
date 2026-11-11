# PORT-1025 Priority 2 (Jini) — test port manifest

Branch: `cloud/port-1025` (Jini). Source branches: `origin/cloud/fixwave-1025-F1/F2/F3/F5`, `origin/cloud/stryker-1025-jini`.

**Scope note.** All five branches share a common pre-history `1ccae4cc8..3e2fbae8e` (68 commits, incl. the "WIP for cloud check" commits). All 68 of those commit subjects are already on `origin/main` (rebased, e.g. merge `fe36ed162`), so that shared range was treated as landed and not re-ported. Each branch's own work is `3e2fbae8e..<branch>`; that is what this table covers. Deleted-test entries (`D`) in the 1ccae4cc8 diff all belong to the shared range.

Method: new files copied from branch tip; modified files 3-way merged (base `3e2fbae8e`, ours = current branch, theirs = branch tip). Where both sides appended cases at the same spot, both were kept.

| branch | file | verdict | note |
|---|---|---|---|
| fixwave-1025-F1 | `packages/platform/src/secrets/__tests__/exports.test.ts` | DROPPED | branch hunk only bumped the core dependency pin; main already carries a newer pin (5e48b4fb5 and later release bumps), main copy kept |
| fixwave-1025-F1 | `packages/platform/src/__tests__/aws-sigv4.f1.test.ts` | PORTED | already identical on main; nothing to change |
| fixwave-1025-F1 | `packages/daemon/src/http/__tests__/remote-run-events.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F1 | `packages/platform/src/http/guarded/__tests__/client-boundaries.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F1 | `packages/daemon/src/__tests__/close-status.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/__tests__/event-log.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/__tests__/run-credentials.f1-guards.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/__tests__/run-lifecycle.rehydrate.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/__tests__/session-coordination.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/__tests__/tokens-and-scheduler.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/__tests__/tool-result-diagnostics.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/routines/__tests__/schedule.f1-dst.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/routines/__tests__/scheduler.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/store/event-log/__tests__/sqlite.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/tool-recovery/__tests__/redaction.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/oauth/tests/authorization-code.f1-guards.test.ts` | UPDATED | 64-char unrecognised provider error code no longer kept as providerErrorCode: protocol-code allowlist (c5762c167, 12d3579e6) |
| fixwave-1025-F1 | `packages/oauth/tests/oidc.f1-config.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/oauth/tests/refresh.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/oauth/tests/token-endpoint.f1.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/platform/src/mail/__tests__/smtp.f1-classify.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/platform/src/net/__tests__/endpoint-policy.f1-expand.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/platform/src/secrets/__tests__/credential-token.f1-detect.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/platform/src/secrets/__tests__/passphrase-envelope.f1-kdf-error.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/platform/src/secrets/__tests__/passphrase-envelope.f1-parse.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/user-management/src/server/__tests__/agent-tools.f1-contract.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/user-management/src/server/__tests__/grant-service.f1-wildcard.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/user-management/src/server/__tests__/hasher.f1-defaults.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/user-management/src/server/__tests__/repo.memory.f1-isolation.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/__tests__/delegated-result-correlation.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/agent-executor/__tests__/host-env-ports.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/http/__tests__/message-relay.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/daemon/src/http/__tests__/run-credentials.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/oauth/tests/endpoint-safety.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/oauth/tests/loopback-receiver.security.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/platform/src/__tests__/sandbox-env.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/platform/src/fs/__tests__/guarded-reader.boundaries.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/platform/src/mail/__tests__/feedback.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/user-management/src/core/__tests__/permissions.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/user-management/src/server/__tests__/admin-crud-service.test.ts` | PORTED |  |
| fixwave-1025-F1 | `packages/user-management/src/server/__tests__/authorize.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/unit/source-drafts.unit.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F2 | `packages/sidecar/src/__tests__/index.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F2 | `packages/agentic/src/core/site-guide/__tests__/topic-schema.clauses.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/agentic/src/skills/install/__tests__/layout.grammar.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/agentic/src/skills/install/__tests__/validation.clauses.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/__tests__/actor-identity.boundary.test.ts` | UPDATED | delegator pairing check now runs first; mismatch message pinned with a full pair, pairing message pinned for the half pair (6cb5190b8) |
| fixwave-1025-F2 | `packages/core/src/__tests__/approval.resolve-abort.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/__tests__/gated-token.lifecycle.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/__tests__/origin-validation.boundaries.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/__tests__/registration-kit.input-readers.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/__tests__/sse.framing-edges.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/__tests__/tool-exposure.naming.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/__tests__/tool-registry.scope-guards.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/settings/__tests__/agent-write-policy.pins.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/settings/__tests__/purge-service.scope.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/settings/__tests__/repo.memory.contract.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/settings/__tests__/settings.definition-fence.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/core/src/settings/__tests__/write-service.scope-guards.f2.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/db/src/__tests__/kernel-core.foreign-join.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/db/src/__tests__/migrate/assert-valid-steps.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/db/src/__tests__/tools/database-catalog.contract.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/db/src/owner-store/__tests__/backup.malformed.test.ts` | DROPPED | export/restore API removed: owner store is now a read-only legacy reader in @jini-ai/server (13e1d183e; move ea8e9c64b) |
| fixwave-1025-F2 | `packages/db/src/owner-store/__tests__/open.key-race.test.ts` | DROPPED | open.ts removed (13e1d183e) |
| fixwave-1025-F2 | `packages/db/src/owner-store/__tests__/service.guards.test.ts` | DROPPED | service.ts removed (13e1d183e) |
| fixwave-1025-F2 | `packages/db/src/transfer/__tests__/postgres-target.psql-fake.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/db/src/transfer/__tests__/site-schema-name.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/db/src/transfer/__tests__/sqlite-source.header-virtual.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/db/src/transfer/__tests__/table-catalog.mapping.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/devops/src/checks/coverage/__tests__/floors-lcov.boundaries.test.ts` | UPDATED | mergeCoverage unions entries instead of keeping the higher image; case rewritten to pin pass-through, unmeasurable drop and the entry-less refusal (b6b7e9b7d) |
| fixwave-1025-F2 | `packages/devops/src/checks/coverage/__tests__/integrity.grammar.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/devops/src/dns/node/__tests__/wire.hardening.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/http-kit/src/__tests__/loopback-guards.negative.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/http-kit/src/__tests__/verified-origin.hostile.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/integration/browser-provider-approval-matrix.integration.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/integration/package-files-limits.integration.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/integration/package-snapshot-safety.integration.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/unit/claim-normalization.unit.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/unit/hook-registry-field-types.unit.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/unit/manifest.grammar.unit.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/unit/plugin-format.pins.unit.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/plugins/src/host/__tests__/unit/plugin-route-grammar.unit.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/protocol/src/__tests__/delegated-result.hostile.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/protocol/src/__tests__/registry.boundaries.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/protocol/src/__tests__/run-context.absent-keys.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/registry/src/__tests__/static-backend.verification-gate.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/registry/src/__tests__/trust-chain-walk.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/registry/src/__tests__/versioning.specifier-fields.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/sandbox/src/__tests__/node-worker.boundaries.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/server/src/__tests__/builtin-features.mounts.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/server/src/__tests__/host-bootstrap.legacy-server.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/sidecar/src/__tests__/daemon-registry.validation.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/sidecar/src/__tests__/json-ipc.contract.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/sidecar/src/__tests__/port.errors.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/sidecar/src/__tests__/supervisor.conditions.test.ts` | UPDATED | import path to src/supervision/ (6670f3bb7); a failed stop now clears deliberate so the later exit schedules recovery and reports exit 0/none (6cb5190b8) |
| fixwave-1025-F2 | `packages/devops/src/deploy/__tests__/reachability-lookup.mixed.test.ts` | PORTED | already ported earlier on this branch (skipped) |
| fixwave-1025-F2 | `packages/platform/src/__tests__/validating-lookup.hostile.test.ts` | PORTED | already ported earlier on this branch (skipped) |
| fixwave-1025-F2 | `packages/agentic/src/skills/install/__tests__/source-port.contract.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/db/src/__tests__/tools/transfer-tools.test.ts` | PORTED |  |
| fixwave-1025-F2 | `packages/sandbox/src/e2b/__tests__/mount-characterization.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/agent-runtime/src/defs/__tests__/claude-filesystem-policy.test.ts` | PORTED | both sides appended cases; combined |
| fixwave-1025-F3 | `packages/mcp/src/agent-install/__tests__/install.test.ts` | UPDATED | copilot row removed with the GitHub Copilot agent (5e48b4fb5); other rows kept |
| fixwave-1025-F3 | `packages/mcp/src/core/__tests__/config.test.ts` | PORTED | both sides appended cases; combined |
| fixwave-1025-F3 | `packages/agent-runtime/src/__tests__/auth.test.ts` | PORTED | exposed a real bug: empty DeepSeek key classified healthy; source fixed in b1944ef6e |
| fixwave-1025-F3 | `packages/chat/src/core/__tests__/accepted-input.projection.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/chat/src/core/__tests__/question-answer.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/chat/src/core/durable-runs/__tests__/continuation.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/chat/src/server/durable-runs/__tests__/recover-boundaries.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/mcp/src/bin/__tests__/serve.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/mcp/src/core/__tests__/tokens.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/mcp/src/federation/__tests__/mcp-federation.http-adapter.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/mcp/src/server/__tests__/message-relay.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/mcp/src/server/tools/__tests__/tool-catalog-tools.test.ts` | UPDATED | schema-less descriptors are no longer published; key-set check pinned on the published one (803039f49) |
| fixwave-1025-F3 | `packages/search/src/__tests__/indexer.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F3 | `packages/chat/src/core/durable-runs/__tests__/policies.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/core/__tests__/secret-defaults.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/federation/approvals/__tests__/scope-option.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/server/tools/__tests__/tool-descriptors.contract.test.ts` | UPDATED | search_tools schema gained max_results alias (209434d6e) |
| fixwave-1025-F3 | `packages/memory/src/__tests__/f3-parsing-boundaries.test.ts` | UPDATED | render keeps an existing trailing newline instead of adding one (6cb5190b8) |
| fixwave-1025-F3 | `packages/memory/src/__tests__/note-store.containment.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/memory/src/__tests__/verify.f3-boundaries.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/agent-runtime/src/__tests__/env.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/agent-runtime/src/__tests__/probe-invocation.unit.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/agent-runtime/src/__tests__/prompt-budget.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/agent-runtime/src/__tests__/role-marker-guard.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/chat/src/core/__tests__/agentic/chat-capabilities.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/chat/src/core/__tests__/persistence/title.edges.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/chat/src/core/__tests__/user-text-redaction.gaps.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/chat/src/core/__tests__/util/recover.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/chat/src/core/util/__tests__/pointer.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/chat/src/core/util/__tests__/validate.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/client/__tests__/client.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/federation/__tests__/mcp-federation.stdio-exit-reason.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/server/resources/__tests__/site-guide-resource.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/server/tools/__tests__/component-catalog-tools.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/server/tools/__tests__/run-tools.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/mcp/src/tools/ask-choice/__tests__/question.unit.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/search/src/__tests__/registry.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/search/src/__tests__/tools.test.ts` | PORTED |  |
| fixwave-1025-F3 | `packages/search/src/testkit/__tests__/conformance-failures.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/admin-surfaces/__tests__/surface-handlers.unit.test.ts` | PORTED | both sides appended cases; combined |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/seed-bundled-edges.unit.test.ts` | PORTED | both sides appended cases; combined |
| fixwave-1025-F5 | `packages/cms/src/widgets/__tests__/plugin-export.unit.test.ts` | PORTED | both sides appended cases; combined |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/automatic-use.unit.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/exports.unit.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/set-enabled-compatibility.unit.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/uninstall.unit.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/tools/__tests__/projection.unit.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F5 | `packages/analytics/src/__tests__/ingest.test.ts` | PORTED | branch hunks merged onto main's newer copy |
| fixwave-1025-F5 | `packages/agent-plugins/src/__tests__/folder-zip.boundaries.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/admin-surfaces/__tests__/capability-declarations.grammar.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/admin-surfaces/__tests__/host-validator.security.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/admin-surfaces/__tests__/settings-value.boundaries.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/admin-surfaces/__tests__/surface-capabilities.grammar.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/admin-surfaces/__tests__/surface-client.guard.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/bundled-digests.edges.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/bundled-source-archive.edges.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/capability-projection.mcp-read.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/error-codes-and-grammar.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/module-memoisation.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/node-sleep.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/package-paths.containment.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/persistent-state-ports.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/__tests__/unit/skill-file-reader.guards.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/agent-plugins/src/lifecycle/tools/__tests__/credential-scan.boundaries.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/analytics/src/__tests__/ingest.ip-buckets.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/artifacts/src/__tests__/manifest.boundaries.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/cli/src/__tests__/prompt.limits.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/diagnostics/src/__tests__/redaction.grammar.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/vibecoding/src/node/__tests__/store-symlink.security.test.ts` | UPDATED | imports via the filesystem-port test helper; store/paths now take a filesystem port (c0f301fed) |
| fixwave-1025-F5 | `packages/agent-plugins/src/admin-surfaces/__tests__/surface-client.unit.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/desktop-host/src/__tests__/render-service.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/diagnostics/src/__tests__/secrets-only.test.ts` | PORTED |  |
| fixwave-1025-F5 | `packages/diagnostics/src/web-evidence/__tests__/request-guard.test.ts` | PORTED |  |
| stryker-1025-jini | `packages/agent-plugins/src/lifecycle/__tests__/unit/exports.unit.test.ts` | PORTED | same additions as F5 commit dd36c8249; combined in one file |
