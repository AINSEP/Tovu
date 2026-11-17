Software Architect(Direct): Keep the domain packages. Remove their implicit composition. Put shared data contracts in `core/contracts/*`. Pass runtime collaborators from the host. The evidence supports one package merge: `ui-kit` into `ui`.

**Scope and measured result**

`J` means Jini at `origin/cloud/integ-1110`, SHA `85377c74ea48fa8652d500b9d7b5a4de35b2451b`.

The supplied Tovu clone has **no `origin/cloud/integ-1110` ref**. `T` below means its available HEAD, `3d0748bb20bc2da4d73a3f70162960b0040688f1`. Tovu findings therefore need confirmation against the intended integration revision.

I read git objects and parsed source with the existing TypeScript parser. I did not edit, install, build, or run tests. No graph MCP tools were available. The tracked knowledge graph records a July analysis, so it cannot establish November imports. Evidence: `J:.understand-anything/meta.json:2`.

| Measured scope | Production source occurrences | Test/fixture occurrences | Dependencies | Peers | Dev dependencies |
|---|---:|---:|---:|---:|---:|
| Literal `packages/*/src`, plus top-level manifests | 683 | 514 | 34 | 35 | 85 |
| Nested `packages/cms/forms` supplement | 6 | 7 | 1 | 0 | 0 |
| **All package source roots** | **689** | **521** | **35** | **35** | **85** |

There are **95 distinct package pairs**:

- **75** have production source imports.
- **78** have production imports or dependency/peer declarations.
- **17** occur only in tests or dev declarations within this scope.
- The 689 production occurrences span **453 files**. Test occurrences span **372 files**.
- There are no forbidden `optionalDependencies` entries.
- Same-package imports and imports targeting `core` are excluded.
- One production-counted occurrence is a build/typecheck fixture: `J:packages/server/src/create-local-node-daemon.typecheck.ts:1`.

An occurrence means one import/export declaration or module-reference expression. A multi-symbol import counts once. Separate type imports, re-exports, dynamic imports, and `import("…")` type expressions count separately. Comments and documentation examples do not count.

**The 78/80 reconciliation**

| Revision inspected | Production pairs | Production-or-manifest pairs | Production occurrences |
|---|---:|---:|---:|
| `extract-s10`, `ebc1e0c5e` | 75 | 78 | 689 |
| `extract-integ`, `d9fa89a284` | 76 | 79 | 690 |
| `combine`, `e1b1bdbd63` | 77 | 79 | 705 |
| Requested integration, `85377c74ea` | 75 | 78 | 689 |

Thus **78 is reproducible as a pair count**, including manifests and the nested forms package. It is not an import-occurrence count.

Two production pairs present at combine are absent from current production source:

- `commerce → cms`.
- `integrations → oauth`.

The latter still has an OAuth peer declaration, so removing its source imports does not remove its manifest pair. Current evidence: `J:packages/commerce/package.json:128`, `J:packages/integrations/package.json:149`.

The extraction integration ref also had `user-management → oauth`; the requested tip does not.

I **cannot reproduce the reported 80** at the available combine ref. The same measurement gives 79. The original counting command and immutable checkpoint were not supplied. One historical pair remains unreconciled; I would not silently substitute 79 for the reported 80.

**Complete pair inventory**

Codes:

- **A**: shared contract belongs in core.
- **B**: small, pure helper belongs in a core value subpath, or warrants a small local copy.
- **C**: separate domains; require a host-wired port.
- **D**: same domain, misplaced module, or obsolete forwarding package.
- **E**: test/dev-only within the measured scope.

`S/T` means production/test occurrences. `d/p/v` means dependency/peer/dev manifest entries. Every entry is counted once per section.

Source locators below expand to `J:packages/<from>/src/<locator>`. `pNN` means `J:packages/<from>/package.json:NN`. For `cms-forms`, the root is `packages/cms/forms`.

| From → to | S/T | d/p/v | Cause and destination | Evidence |
|---|---:|---:|---|---|
| admin → agentic | 33/5 | 0/1/1 | B: common handle builders to core | `comments/react/components/QueueSection.tsx:7`; p467 |
| admin → ui | 50/40 | 0/1/1 | A/C: local presentation and query ports | `comments/react/components/QueueSection.tsx:8`; p468 |
| admin → ui-kit | 29/9 | 0/1/1 | C/D: UI kit moves to UI; admin receives it | `agent-plugins/react/components/AgentPluginFileContent.tsx:2`; p469 |
| admin → agent-plugins | 1/0 | 0/1/1 | A: installed-plugin view contracts | `agent-plugins/models.ts:1`; p470 |
| admin → cms | 14/5 | 0/1/1 | A/C: form contracts; field/marker operations and repositories supplied | `comments/adapters/memory.ts:1`; p471 |
| agent-plugins → platform | 6/5 | 0/1/1 | A/C: file-lock, boot-identity and atomic-write ports | `lifecycle/activation.ts:46`; p371 |
| agent-plugins → commerce | 0/0 | 0/1/0 | D: remove commerce forwarding export | p374; additional runtime evidence below |
| agent-runtime → oauth | 2/0 | 1/0/0 | C/D: OAuth bridge belongs in OAuth; inject remaining operations | `providers/pkce.ts:28`; p134 |
| agent-runtime → protocol | 5/1 | 1/0/0 | A/B: wire contracts and delegated-result helpers | `claude-stream.ts:41`; p135 |
| agent-runtime → integrations | 3/1 | 1/0/1 | A/C: require provider endpoint lookup/data | `model-discovery-adapters.ts:309`; p136 |
| agent-runtime → platform | 8/2 | 1/0/1 | B/C: endpoint literals in core; command, filesystem, proxy and fetch ports | `claude-code-models.ts:43`; p137 |
| agentic → protocol | 1/3 | 0/1/1 | A: run-event contracts | `core/gen-ui/encoder.ts:19`; p99 |
| analytics → agent-runtime | 1/2 | 0/1/1 | A: AI trace contracts | `product/ai-generations.ts:1`; p56 |
| capability-providers → platform | 2/2 | 0/1/1 | A/C: blob contract and storage-error classification | `adapters/blob-storage/index.ts:18`; p113 |
| chat → agentic | 15/10 | 1/0/1 | A/B/C: capability contracts, common handles, page/interpreter ports | `core/agentic/chat-capabilities.ts:14`; p227 |
| chat → db | 15/15 | 1/0/1 | A/B/C: SQL handle contracts; kernel and helper ports | `store/legacy/sqlite/conversations.ts:6`; p228 |
| chat → diagnostics | 1/0 | 1/0/1 | C: required user-text redactor | `core/user-text-redaction.ts:2`; p229 |
| chat → agent-runtime | 6/1 | 0/1/1 | A/C: model-selection, policy and failure-formatting ports | `react/features/chat-pane/components/AgentRuntimePicker.tsx:1`; p245 |
| chat → protocol | 0/0 | 0/1/1 | A/E: manifest-only; remove after declaration audit | p246 |
| chat → ui | 18/15 | 0/1/1 | A/C: presentation, surface-renderer and interaction ports | `react/components/McpUiSurfaceCard.tsx:67`; p247 |
| cli → platform | 1/0 | 1/0/1 | B: literal loopback helper to core | `daemon-url.ts:1`; p69 |
| cli → sidecar | 1/3 | 1/0/1 | C/D: discovery wrapper moves to sidecar; CLI already accepts callback | `local-daemon-discovery.ts:20`; p70 |
| cms → db | 6/12 | 0/1/1 | A/B/C: local SQL ports, conversions and column inspection | `forms/sql/submission-ip-retention-repo.ts:2`; p465 |
| cms → http-kit | 13/28 | 0/1/1 | A/C: verified-origin contracts and origin-policy operations | `redirects/redirects.ts:26`; p466 |
| cms → platform | 2/1 | 0/1/1 | A/C: mail-sender contract, validator and error factory | `forms/email-sender.ts:3`; p467 |
| commerce → db | 16/19 | 0/1/1 | A/C: SQL and migration contracts; host runs histories | `payments/ledger/migrations/index.ts:1`; p128 |
| commerce → agentic | 1/0 | 0/1/1 | B: common handles to core | `react/Payments.tsx:2`; p132 |
| commerce → ui | 1/0 | 0/1/1 | B/C: supply translator; keep dictionary local | `react/commerce-i18n.ts:1`; p133 |
| daemon → protocol | 44/26 | 1/0/1 | A/B: run/event/error contracts and small wire helpers | `run-lifecycle.ts:21`; p179 |
| daemon → agent-runtime | 27/38 | 1/0/1 | A/C: explicit runtime-driver, trace, model and OAuth operations | `agent-executor/contracts.ts:18`; p181 |
| daemon → db | 8/17 | 1/0/1 | A/C: SQL handles and explicit opener/kernel | `store/event-log/sqlite.ts:25`; p182 |
| daemon → http-kit | 69/14 | 1/0/1 | A/C: HTTP mounting, response, auth and SSE ports | `http/active-context.ts:24`; p183 |
| daemon → platform | 11/6 | 1/0/1 | A/C: process, command, filesystem and terminal ports | `agent-executor/launch.ts:58`; p184 |
| db → platform | 1/5 | 0/1/1 | D: vault repository moves to platform/secrets | `secrets-vault/repo.sql.ts:2`; p236 |
| devops → platform | 1/0 | 0/1/1 | C: guarded URL/DNS port | `deploy/node.ts:4`; p173 |
| http-kit → protocol | 7/3 | 1/0/1 | A/B: API errors and envelope helpers to core | `adapter.ts:10`; p91 |
| http-kit → platform | 2/1 | 1/0/1 | B: literal loopback helper to core | `local-daemon-request.ts:14`; p93 |
| infra → db | 4/0 | 0/1/1 | D: remove deprecated database forwarding subpaths | `db/driver/index.ts:2`; p88 |
| integrations → db | 3/0 | 0/1/1 | A: SQLite opener contract | `media-providers/sqlite-task-store.ts:42`; p146 |
| integrations → platform | 11/44 | 0/1/1 | A/B/C: HTTP transport/DNS ports; shared literal policy | `media-providers/dispatch/node.ts:3`; p148 |
| integrations → oauth | 0/10 | 0/1/1 | E in source; remove runtime peer after declaration audit | `api-connections/__tests__/access-token.unit.test.ts:8`; p149 |
| mcp → protocol | 2/0 | 1/0/0 | A/B: relay contracts and delegated-result marker | `server/message-relay.ts:2`; p99 |
| mcp → platform | 7/1 | 1/0/1 | A/B/C: atomic installation and capped-response-reader ports | `federation/adapter.http.ts:513`; p102 |
| plugins → platform | 1/0 | 0/1/1 | A/C: file-lock port and error classifier | `host/node/source-drafts.ts:8`; p95 |
| plugins → db | 2/1 | 0/1/1 | A/B: SQL port and small boolean conversion | `host/sql/repo.rows.ts:9`; p98 |
| provider-plugins → agent-runtime | 1/1 | 0/0/1 | A/D: trace contracts; Langfuse adapter moves to trace owner | `ai-trace-langfuse/langfuse.ts:22`; p90 |
| provider-plugins → analytics | 3/1 | 0/0/1 | A/D: PostHog adapter moves to analytics | `analytics-posthog/posthog.ts:23`; p91 |
| provider-plugins → cms | 2/0 | 0/0/1 | A/D: form adapters move to CMS/forms | `formspree/provider.ts:1`; p93 |
| provider-plugins → commerce | 6/8 | 0/0/1 | A/D: Stripe adapter moves to commerce/payments | `payments-stripe/provider.ts:1`; p94 |
| provider-plugins → cookie-consent | 3/5 | 0/0/1 | A/C: consent contracts; purge operation supplied | `analytics-posthog/consent-adapter.ts:5`; p95 |
| provider-plugins → diagnostics | 5/14 | 0/0/1 | A/D: OTel/Sentry adapters move to diagnostics | `observability-opentelemetry/opentelemetry.ts:38`; p96 |
| provider-plugins → plugins | 8/13 | 0/0/1 | A/C: SDK contract; registration assembly becomes consumer wiring | `observability-opentelemetry/index.ts:2`; p97 |
| provider-plugins → ui | 7/11 | 0/0/1 | A/D: chart contracts and adapters move to UI/charts | `charts-echarts/mount.ts:6`; p98 |
| registry → protocol | 6/4 | 1/0/1 | A/C: registry contracts; wire-schema parsing supplied | `static-backend.ts:11`; p87 |
| registry → platform | 1/2 | 1/0/1 | B: local timeout constant; no platform runtime required | `github-client.ts:27`; p89 |
| registry → db | 3/0 | 0/1/1 | A: synchronous SQLite contract | `ports.ts:1`; p93 |
| search → agent-plugins | 2/1 | 0/1/1 | A/C: contribution contract and required loader operations | `contribution.ts:22`; p74 |
| server → agent-runtime | 3/6 | 1/0/1 | C/D: move preset assembly to host example | `kernel-base.ts:18`; p98 |
| server → daemon | 10/8 | 1/0/1 | C/D: host assembly; remove forwarding exports | `builtin-features.ts:24`; p99 |
| server → db | 11/9 | 1/0/1 | A/C/D/E: explicit storage; relocate vault/legacy-chat modules | `owner-store/legacy.ts:3`; p100 |
| server → http-kit | 3/3 | 1/0/1 | A/C/D: host mounts HTTP; server takes listener contract | `compose-jini-kernel.ts:46`; p101 |
| server → registry | 1/0 | 1/0/1 | C/D: host supplies catalog operations | `builtin-features.ts:34`; p102 |
| server → sidecar | 1/2 | 1/0/1 | C/D: host writes/removes discovery record | `create-local-node-daemon.ts:46`; p103 |
| server → chat | 1/2 | 0/1/1 | D: host runs selected chat schema bootstrap | `storage/legacy/sqlite.ts:5`; p108 |
| server → platform | 6/5 | 0/1/1 | D: owner-vault reader/backup belongs with secrets | `owner-store/legacy.ts:7`; p109 |
| sidecar → platform | 4/0 | 1/0/1 | C: atomic-write, invocation and process-control ports | `supervision/supervisor-node.ts:6`; p77 |
| sqlite → chat | 3/0 | 1/0/0 | D: retire forwarding package; use chat storage exports | `index.ts:14`; p51 |
| sqlite → daemon | 3/0 | 1/0/0 | D: use daemon storage exports | `index.ts:8`; p52 |
| sqlite → db | 4/0 | 1/0/0 | D: use DB exports | `index.ts:10`; p53 |
| sqlite → registry | 2/0 | 1/0/0 | D: use registry catalog exports | `index.ts:16`; p54 |
| ui → ui-kit | 7/2 | 1/0/0 | D: merge UI kit implementation into UI | `react/components/SecretInput.tsx:2`; p305 |
| ui → agentic | 56/7 | 1/0/1 | A/B/C: handles in core; interpreter and message operations supplied | `features/mcp-ui/protocol.ts:25`; p307 |
| ui → platform | 1/1 | 1/0/1 | B: browser-safe literal endpoint policy to core | `utils/endpoint-policy.ts:38`; p308 |
| user-management → admin | 18/9 | 0/1/1 | A/C: admin contracts; module builders and row/dialog views supplied | `admin/auth.module.ts:1`; p110 |
| user-management → agentic | 4/0 | 0/1/1 | B: common handles to core | `react/members/Members.tsx:3`; p111 |
| user-management → ui | 23/7 | 0/1/1 | A/C: identity presentation/query ports | `react/auth/Login.tsx:2`; p112 |
| user-management → ui-kit | 24/11 | 0/1/1 | C/D: required presentation supplied from merged UI owner | `admin/react/components/MemberRow.tsx:1`; p113 |
| cms-forms → cms | 6/7 | 1/0/0 | D: retire duplicate compatibility package | `write-service.ts:3`; p45 |

The manifest-only commerce pair has a real runtime forwarding export **outside `src`**: `J:packages/agent-plugins/core/commerce-server.mjs:2`. Removing only the peer would leave that violation.

The provider rows are **production dependencies expressed through bundled source**. They are not test-only just because they use `devDependencies`. Their manifest builds these implementations into shipped plugin artifacts. Evidence: `J:packages/provider-plugins/package.json:61`, `:79`, `:89`.

The remaining 17 pairs are classified E within the requested source/manifest scope:

| From → to | S/T | d/p/v | Evidence |
|---|---:|---:|---|
| agent-plugins → cms | 0/0 | 0/0/1 | `J:packages/agent-plugins/package.json:359` |
| agent-plugins → plugins | 0/5 | 0/0/1 | `admin-surfaces/__tests__/action-tools.unit.test.ts:11`; p360 |
| agent-plugins → oauth | 0/0 | 0/0/1 | p363 |
| chat → ui-kit | 0/1 | 0/0/1 | `react/features/chat-pane/__tests__/components/AgentRuntimePicker.agent-handles.test.tsx:5`; p250 |
| commerce → cms | 0/2 | 0/0/1 | `catalog/__tests__/unit/status-tool.unit.test.ts:4`; p153 |
| daemon → chat | 0/6 | 0/0/1 | `__tests__/delegated-tool-bridge.test.ts:8`; p170 |
| devops → daemon | 0/1 | 0/0/1 | `deploy/__tests__/tool.test.ts:1`; p161 |
| diagnostics → analytics | 0/2 | 0/0/1 | `observability/__tests__/telemetry-test.unit.test.ts:5`; p89 |
| mcp → daemon | 0/5 | 0/0/1 | `bin/__tests__/serve.test.ts:10`; p107 |
| oauth → platform | 0/0 | 0/0/1 | p74 |
| plugin-fixture-provider → cookie-consent | 0/0 | 0/0/1 | p33 |
| plugin-fixture-provider → plugins | 0/0 | 0/0/1 | p34 |
| provider-plugins → capability-providers | 0/0 | 0/0/1 | p92 |
| ui → agent-runtime | 0/1 | 0/0/1 | `__tests__/utils/endpoint-policy.parity.test.ts:6`; p267 |
| ui → integrations | 0/5 | 0/0/1 | `features/execution/__tests__/api-key-format-warning.test.ts:1`; p268 |
| user-management → cms | 0/8 | 0/0/1 | `server/__tests__/cms-content-types-authorization.integration.test.ts:13`; p121 |
| vibecoding → platform | 0/1 | 0/0/1 | `node/__tests__/filesystem.ts:2`; p100 |

Move cross-domain integration tests to a host-level test project. Keep domain unit tests local. Remove sibling dev dependencies after those moves. Build-only entries need their build recipes checked before deletion.

**What XP1–XP5 actually enforce**

The root command pins `--base 35c4961af`. Evidence: `J:package.json:33`.

| Rule | Current behavior | Consequence |
|---|---|---|
| XP1 | Added/renamed production files cannot name forbidden packages | Moving a file exposes its old imports immediately |
| XP2 | Modified files compare **specifier sets** with the pinned source | Existing specifiers remain allowed; duplicate occurrences of an existing specifier are not new set members |
| XP3 | Changed sources’ emitted declarations are checked; modified declarations compare with a pinned snapshot | Existing declaration edges may remain; missing mappings/snapshots fail |
| XP4 | All core contract files permit only types/interfaces and type imports/exports within core; emitted JS must be empty | Runtime values, external types and Node types cannot simply move into contracts |
| XP5 | Dependencies, peers and optional dependencies are compared with the base manifest | Existing entries remain allowed; dev dependencies are not checked |

Evidence: `J:scripts/check-no-cross-package.ts:24`, `:42`, `:81`, `:163`, `:173`, `:186`, `:199`, `:219`, `:237`, `:248`.

The checker skips tests and fixtures and scans only changed source files. It is an incremental restriction, **not proof of zero existing edges**. Its package discovery includes nested packages. Evidence: `J:scripts/check-no-cross-package.ts:253`, `J:scripts/lib/package-sources.ts:26`.

Keep XP1–XP5. Add an exhaustive inventory gate. During migration, let its fixed debt inventory shrink only. At completion, require zero production source, emitted declaration and runtime-manifest crossings. Also check relative sibling imports and packaged `.mjs` assets.

**Target package map**

All rows below are proposed. They are not claims of completed implementation.

| Package(s) | Target |
|---|---|
| core | Shared contracts and a few isolated pure primitives. No domain engines or cross-domain assembly |
| protocol | Wire schemas and codecs. Shared DTOs re-export from core. Consumers receive schema/codec operations when needed |
| db | Drivers, kernel, migration runner, recovery and data-module engine. Domain repositories live with their domains |
| platform | Native effects, guarded networking, filesystem/process capabilities, secrets and mail |
| daemon | Run lifecycle, tool execution, event storage and orchestration. Required runtime/HTTP/native collaborators |
| agent-runtime | Agent definitions, launch planning, transports, parsers and provider turns. Explicit environment/native/catalog ports |
| oauth | OAuth protocol and fixed-issuer compatibility bridge |
| chat | Chat state, storage, recovery and chat views. Required renderer/runtime/presentation ports |
| ui + ui-kit | **Merge implementation into ui.** Add `ui/kit`, `ui/kit/react` and corresponding native/testing subpaths |
| admin | Admin module model, shell and domain screens. Required presentation and domain-data ports |
| user-management | Identity, authorization, members and their SQL/HTTP/UI adapters |
| cms | Existing CMS domains, plus themes, posts and publishing. Each subpath retains explicit contracts |
| commerce | Catalog, payments, schemas and payment adapters |
| integrations | Connection, media-provider and saved-request workflows. Required transport/storage/auth ports |
| plugins; agent-plugins | Keep separate. Their formats and lifecycles differ. Exchange contracts and host-provided services |
| diagnostics; analytics | Keep separate. Observability and product analytics have different purposes |
| provider-plugins | Keep artifact addresses/catalogs. Move reusable adapter implementations to their domain owners. No sibling imports in package source or shipped artifacts |
| server | Listener/shutdown lifecycle helpers against a supplied server contract. Remove built-in cross-domain preset assembly |
| sidecar; cli | Keep separate. Sidecar owns discovery records/supervision. CLI receives a discovery callback |
| infra | Keep outbox/event infrastructure. Remove obsolete `db/*` forwarding exports |
| sqlite | **Retire forwarding package** |
| cms-forms | **Retire duplicate compatibility package** |
| registry; search | Keep separate. Required validation/storage/contribution ports |
| artifacts, capability-providers, cookie-consent, desktop-host, memory, sandbox, vibecoding | Keep. Change only evidenced crossings |
| plugin-catalog; plugin-fixture-provider | Metadata and conformance artifacts. Keep runtime composition outside engine packages |

The UI merge is supported by direct reuse of the same overlay and secret-input implementations. Evidence: `J:packages/ui/src/react/components/SecretInput.tsx:2`, `J:packages/ui/src/index.ts:154`.

The two plugin systems should remain separate. Activation’s own ownership notes distinguish their persisted formats and lifecycle. Evidence: `J:packages/agent-plugins/src/lifecycle/activation.ts:17`.

The compatibility retirements already have supporting intent:

- `cms-forms` directs users to `cms/forms`: `J:packages/cms/forms/package.json:57`.
- `infra` describes its database exports as compatibility shims: `J:packages/infra/package.json:4`.
- `sqlite` forwards four domain owners: `J:packages/sqlite/src/index.ts:8`.

No evidence justifies merging daemon, agent-runtime, HTTP, chat and storage into one domain.

**Contracts and runtime seams**

| Crossing family | Shared contract location | Required runtime input |
|---|---|---|
| Run/event/error/relay DTOs | `core/contracts/run`, `/events`, `/api-errors`, `/registry` | Registry schema parsers/codecs where required |
| Agent definitions/model policy/tracing | `core/contracts/agent-runtime`, `/ai-trace` | Runtime operations, model policy and failure formatting |
| Agent markup | `core/contracts/agent-ui` | Pure builders in `core/agent-handles` |
| Storage | `core/contracts/storage` for portable metadata and synchronous handle shapes | Domain-local SQL kernel ports; supplied kernel/opener/migration runner |
| HTTP and origins | `core/contracts/http`, `/origins` | Route mounting, response writing, auth, SSE and verified-origin operations |
| Forms/plugin views | `core/contracts/forms`, `/agent-plugins` | Field registry, marker parser and repository implementation |
| Mail | Extend existing `core/contracts/mail` with sender contracts | Sender-template validation and original error factory |
| Blob storage | `core/contracts/blob-storage` | Storage implementation and error classifier |
| Plugin contributions | `core/contracts/plugin-contributions` | Contribution-definition/load/register operations |
| Provider adapters | `/ai-trace`, `/analytics`, `/observability`, `/payments`, `/consent`, `/charts` | Domain adapters and consent-purge callback |
| Cards/OAuth/vault | Reuse existing contract subpaths | Existing host-bound services and original error factories |

Existing precedents already say runtime pieces come from the host. Evidence: `J:packages/core/src/contracts/oauth.ts:1`, `J:packages/core/src/contracts/mail.ts:1`.

Apply these constraints:

- Required collaborators go in the first object. Optional policy and tuning go in the second.
- Remove fallback imports of sibling packages. An optional peer or dynamic import is still a crossing.
- Keep narrow consumer ports local unless two packages must share the exact shape.
- Keep error construction and classification explicit when identity matters.
- Supply stable React components/hooks once when creating the integration. Do not recreate component types during rendering.
- Do not introduce a universal host bag, service locator or dependency container.

The runtime catalog lookup currently defaults to importing integrations. Require endpoint data or lookup instead. Evidence: `J:packages/agent-runtime/src/model-discovery-adapters.ts:309`.

The capped MCP response path currently imports platform dynamically. Require its response reader when those options are enabled. Evidence: `J:packages/mcp/src/federation/adapter.http.ts:513`.

Three details need deliberate treatment:

1. **Storage types cannot move unchanged.** `StorageKernel` names Kysely/RawBuilder and declares a unique-symbol schema witness. XP4 rejects that closure. Keep third-party SQL typing in domain-local adapter ports. Move portable storage metadata and driver-neutral handle contracts to core. Prove structural assignment, wrong-schema rejection and transaction semantics before converting every repository. Evidence: `J:packages/db/src/kernel/port.ts:1`, `:64`, `:66`.

2. **Move vault SQL ownership without reversing the edge.** Move `db/secrets-vault/repo.sql.ts` to `platform/secrets/credential-sets/sql`. It then uses same-domain vault validation/errors. Supply its SQL kernel through a local port. Small conversions can remain local; driver-specific SQL operations must be supplied. Evidence: `J:packages/db/src/secrets-vault/repo.sql.ts:2`, `:63`.

3. **Do not inject the whole HTTP package.** Give each route family a typed port containing the operations it actually uses. Keep handlers with their owning domain. Shared wire result types go to core. Evidence: `J:packages/daemon/src/http/active-context.ts:23`.

Pure helper moves should be limited:

- Agent attribute names, grammar and handle builders are framework-free data operations. Evidence: `J:packages/agentic/src/core/handle.ts:4`, `J:packages/agentic/src/core/list-handles.ts:9`.
- API error-envelope construction and terminal-state checks are small shared wire operations. Evidence: `J:packages/protocol/src/errors.ts:66`, `J:packages/protocol/src/run.ts:14`.
- Browser-safe literal endpoint policy can move intact to a core value subpath. DNS resolution and pinned transport stay in platform. Evidence: `J:packages/platform/src/net/endpoint-policy.ts:1`.

Do not put runtime helpers inside `core/contracts`.

**Specific module moves**

| Current module | Proposed home or disposition | Reason |
|---|---|---|
| `db/secrets-vault` | `platform/secrets/credential-sets/sql` | Vault persistence implements vault invariants |
| `server/owner-store` | `platform/secrets/legacy-owner-store` | Read-only vault recovery/import behavior, with supplied storage |
| `server/store/projects/sqlite` | `chat/store/legacy/projects/sqlite` | This legacy projection joins projects, conversations and messages |
| `server` preset assembly | Explicit application composition under examples; Tovu keeps its own composition | Cross-domain assembly belongs to the consumer |
| `server/storage/legacy/sqlite` combined bootstrap | Host calls selected domain schema exports | It concatenates schemas from three owners |
| `agent-runtime/providers/pkce` compatibility bridge | OAuth compatibility subpath | OAuth protocol/DTO bridge |
| CLI’s sidecar discovery wrapper | Sidecar discovery subpath | CLI already accepts the resulting callback |
| Provider implementations | Owning domain provider subpaths | Same-domain implementation reuse |
| Provider plugin registration entries | Explicit distribution-consumer recipes outside engine packages | They bind domain factories to the plugin SDK |
| `agent-plugins/core/commerce-server.mjs` | Remove; consumer imports commerce directly | Pure cross-domain forwarding |

Evidence: `J:packages/server/src/owner-store/legacy.ts:11`, `J:packages/server/src/store/projects/sqlite.ts:1`, `J:packages/server/src/storage/legacy/sqlite.ts:4`, `J:packages/server/src/index.ts:4`, `J:packages/agent-runtime/src/providers/pkce.ts:22`, `J:packages/cli/src/local-daemon-discovery.ts:43`.

Provider distribution recipes may compose packages as consumers. Their emitted artifacts must contain no external sibling-Jini imports. This is not permission to move domain implementation into a build script. The reusable implementation stays in its domain package.

**Tovu wiring**

Use Tovu’s existing composition files. Do not add another composition framework.

Tovu already passes runtime definitions and launch resolution into its executor because nested runtime versions previously caused mismatches. Make that dependency explicit and complete. Evidence: `T:apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:519`.

Tovu also already has a 95-line plugin service binder and explicit provider composition. Extend those existing owners. Evidence: `T:apps/website/src/server/runtime/composition/agent-plugin-service-ports.ts:22`, `T:apps/website/src/server/runtime/composition/provider-plugins.ts:1`.

| Additional wiring | Estimated authored lines |
|---|---:|
| Runtime, process, filesystem and OAuth bindings | 110–180 |
| HTTP/auth/SSE operations | 80–140 |
| SQL, origin and mail operations | 60–100 |
| Admin, identity and chat presentation bindings | 120–220 |
| Provider/contribution bindings | 40–80 |
| Compatibility imports and owner-store bindings | 20–50 |
| **Current-edge cleanup total** | **430–770** |

These are estimates of added or substantially rewritten binding code. They exclude import-only edits and moved implementation. They are not additive to the earlier plan’s 430–680 estimate, which covered overlapping work.

Tovu does not appear to use the server preset in production at the inspected revision. Do not charge it for rewriting that preset. Its composition is already explicit. Evidence: `T:apps/website/src/server/inbound/assistant/agent-daemon-scope.ts:80`, `T:apps/website/src/server/runtime/composition/deps.ts:17`.

**Remaining extraction lanes**

The older recon is not a current absence list. For example, the data-module engine is already in Jini, and Tovu’s file is now a two-line shim. Reuse it. Evidence: `J:packages/db/src/data-modules/index.ts:9`, `T:apps/website/src/features/plugins/data-module.ts:1`.

| Lane | Target home | Boundary that prevents new crossings | Evidence |
|---|---|---|---|
| SQL repositories | Owning domain’s `/sql` | Supplied local SQL kernel port; shared portable contracts in core | `J:packages/cms/src/forms/sql/repo.ts:2` |
| Domain schemas/upgrades | Owning `/sql/schema` and `/sql/migrations` | Export histories; host invokes the DB runner | `J:packages/commerce/src/payments/ledger/migrations/index.ts:1` |
| CMS tool catalogs | Existing `cms/<domain>/tools` | Required authorization, cards, messages and service ports | `J:packages/cms/src/core/tools/args.ts:3` |
| Posts | `cms/post` | Required path, publication, search and external-domain ports | `T:apps/website/src/features/post/post.ts:2` |
| Theme engine/build/files/tools | `cms/themes/*` | Required roots, script policy, assets, workers and publication operations | `T:apps/website/src/features/theme/theme.ts:1` |
| Members | `user-management/members/*` | Required mail, entitlement and external identity ports | `T:apps/website/src/features/members/write-service.ts:14` |
| Publishing planner/apply/rollback/trust | `cms/publishing/*` | Host supplies contributor objects; publishing imports no domain services | `T:apps/website/src/features/publish-content/type-registry.ts:3` |
| Rendering leaves and workers | Owning CMS domain’s `/html`, `/render`, `/worker` | Supplied content projections, render functions and worker entry/runtime | `T:apps/website/src/server/inbound/public-http/http/site/render.ts:1` |
| Public page pipeline | `cms/presentation` and `cms/themes` adapters | Required content/menu/widget/member/head-contributor ports | `T:apps/website/src/server/inbound/public-http/routes/site/pages.ts:1` |
| Domain HTTP adapters | Owning domain’s `/express` or another explicit adapter | Host supplies app, principal, origin, session and telemetry contracts | Same page-route evidence; `J:packages/daemon/src/http/active-context.ts:22` |
| Backup engine | `devops/backup` | Required content-source, manifest, repository and credentialed-upload ports | `T:apps/website/src/features/site-backup/push-engine.ts:3` |
| Newsletter | `cms/newsletter`, if extracted | Required member-directory and mail ports | Earlier recon; current bodies not re-audited |
| Product paths, branding, cookies, permissions and migration adoption | Tovu | Remain explicit host policy | `T:apps/website/src/features/theme/theme.ts:19`, `T:apps/website/src/platform/db/migrations/index.ts:71` |

Themes belong in CMS. Members belong in user management. Requiring a server does not make either a `server` package responsibility.

Same-package placement does not justify hidden cross-domain assembly. Publishing must receive contributors even when several happen to come from other CMS subpaths.

Keep Tovu’s historical migration IDs, checksums, ledgers and adoption path unchanged. Fresh applications use the new domain schema exports. Do not run new baselines against existing Tovu tables. Evidence: `T:apps/website/src/platform/db/migrations/index.ts:71`.

A second application must prove persistent plugin installation, content creation/publication, themed rendering, a form submission, a card answer and restart. It must use packed exports and supplied wiring, without copied domain logic or handwritten domain DDL.

**Npm consumer impact**

| Change | Consumer impact |
|---|---|
| New core contract subpaths | Additive. Existing owner type paths may re-export from core |
| Pure helper moves to core | Existing packages may forward to core, which is permitted |
| New required ports | Breaking call signatures; missing dependencies must fail clearly |
| UI-kit merge | Replace `ui-kit/*` imports with corresponding `ui/kit/*` paths |
| Retired `sqlite` | Import chat, daemon, DB and registry storage exports directly |
| Retired `cms-forms` | Import `cms/forms` |
| Removed `infra/db/*` | Import DB directly |
| Server preset removal | Consumer owns composition; server retains lifecycle utilities |
| Owner-store move | Import platform’s legacy-owner-store subpath and supply storage |
| Removed cross-domain forwarding exports | Import the owning package directly |
| Provider implementation moves | Add owner subpaths; preserve artifact addresses where possible |

These require a coordinated **breaking release**. For the current `0.6.x` packages, use a documented `0.7.x` compatibility boundary. Stable `1.x` packages would require a major release. Do not publish required-port changes as patches.

Deprecate old package versions. Do not unpublish them. Do not preserve compatibility through new forbidden forwarding imports.

**Ordered build batches**

All sizes below are estimates. “Touched” means authored changes plus moved source counted once. Test moves and generated declarations are additional. Gates listed here are future proof requirements; none ran during this planning task.

Every batch must build and typecheck the affected packages, pass their package-local tests, pass XP1–XP5 against the unchanged pin, and reduce or preserve the exhaustive debt inventory. Public API batches also need declaration and packed-import checks.

1. **Add the exhaustive inventory and shrinking-debt gate.**  
   300–500 lines. Mechanical; low risk. Cover type imports, re-exports, dynamic/type imports, relative sibling paths, nested packages, manifests and packaged assets. Prove unchanged debt passes and added debt fails.

2. **Move wire, error and registry contracts to core.**  
   900–1,500 lines. Mixed; medium risk. Preserve old type exports. Prove property equality and two-way assignment. Do not move schema-derived runtime dependencies into contracts.

3. **Move small wire helpers to core value subpaths.**  
   400–700 lines. Mechanical; low risk. Preserve error envelopes, delegated markers and run-state behavior byte for byte.

4. **Move common agent-markup builders and contracts.**  
   600–1,000 lines. Mechanical after closure review; medium risk. Prove handle grammar, collision behavior and private-subtree semantics.

5. **Move literal endpoint policy.**  
   300–500 lines. Mechanical; medium risk. Preserve the existing literal-address corpus. Keep DNS and pinned transport separate.

6. **Define storage contracts and convert chat/daemon/registry adapters.**  
   1,200–2,000 lines. Judgment; high risk. Prove assignment from real kernels, rejection of wrong schemas, transaction sharing and connection ownership.

7. **Convert CMS/commerce/plugins/integrations storage edges.**  
   900–1,500 lines. Mostly mechanical after batch 6; medium risk. Exercise SQLite and Postgres/PGlite behavior where supported. Supply the migration runner explicitly.

8. **Move vault SQL implementation to its owner.**  
   500–900 lines. Judgment; high risk. Preserve error identity, CAS, default promotion, workspace locks and nested transactions.

9. **Inject file-lock and atomic-write operations into plugin/MCP consumers.**  
   800–1,300 lines. Mixed; high risk. Prove stale-lock refusal, lost ownership, concurrent writes and atomic publication.

10. **Inject native operations into runtime, sidecar and capability adapters.**  
    900–1,500 lines. Mixed; high risk. Prove process-tree cleanup, cancellation, proxy environment and guarded storage failures.

11. **Remove runtime OAuth/catalog imports.**  
    700–1,200 lines. Judgment; medium risk. Move the OAuth bridge, require endpoint lookup and preserve redirect/refresh behavior.

12. **Make daemon runtime dependencies required.**  
    1,200–2,000 lines. Judgment; high risk. Complete existing executor seams. Prove launch, streaming, cancellation, handoff, cleanup and shared runtime identity.

13. **Define HTTP and verified-origin contracts.**  
    700–1,200 lines. Judgment; medium risk. Preserve generic route input/output typing and origin-policy outcomes.

14. **Convert daemon control/run HTTP routes.**  
    900–1,500 lines. Mechanical after batch 13; high risk. Prove auth order, status/error envelopes, SSE replay and cancellation.

15. **Convert remaining daemon HTTP routes and provider turns.**  
    900–1,500 lines. Mixed; high risk. Prove terminal cleanup, model-proxy cancellation, OAuth callbacks and bounded reads.

16. **Convert CMS origin/mail dependencies.**  
    600–1,000 lines. Mixed; high risk. Prove redirect refusal, verified-origin requirements, sender authorization and original mail error identity.

17. **Merge UI kit implementation into UI.**  
    1,800–2,500 lines. Mechanical; medium risk. UI-kit contains 1,353 measured non-test TypeScript lines. Preserve provider/context identity, overlay placement, focus, confirmation and secret-reveal behavior.

18. **Convert admin presentation and CMS operations.**  
    1,200–2,000 lines. Judgment; medium risk. Bind stable components/hooks and required field/marker operations. Prove forms, dirty guards and query invalidation.

19. **Convert identity/admin presentation dependencies.**  
    900–1,500 lines. Mixed; medium risk. Prove login, roles, members, confirmation and shared provider identity.

20. **Convert chat presentation/runtime dependencies and commerce translation.**  
    1,200–2,000 lines. Judgment; high risk. Prove MCP/A2UI cards, secret input, page execution, model selection and recovery.

21. **Move provider contracts and first adapter group.**  
    1,000–1,600 lines. Mixed; medium risk. Move forms, payments and chart adapters to owners. Preserve provider outputs and registration contracts.

22. **Move remaining provider adapters and distribution assembly.**  
    1,200–1,800 lines. Judgment; high risk. Preserve OTel/Sentry/Langfuse/PostHog behavior, consent purge and disposal. Prove packed artifacts contain no sibling imports and load no unselected SDK.

23. **Remove search and CLI cross-domain convenience composition.**  
    400–700 lines. Mechanical; low risk. Host binds contribution operations and sidecar discovery. Preserve refusal strings and stale-record behavior.

24. **Relocate server vault and legacy chat storage.**  
    800–1,300 lines. Mixed; high risk. Prove owner-store read-only behavior, key/error identity and unchanged legacy queries.

25. **Remove server preset composition.**  
    1,800–2,700 lines. Judgment; high risk. Move explicit assembly to a runnable consumer example. Preserve startup failure cleanup, shutdown order and discovery removal. The current server source envelope is 3,572 measured non-test lines.

26. **Retire compatibility exports and manifests.**  
    700–1,200 lines. Mechanical; medium risk. Remove `sqlite`, `cms-forms`, `infra/db/*` and commerce forwarding. Update consumers and dependency metadata atomically.

27. **Relocate remaining cross-domain integration tests.**  
    700–1,200 authored lines, plus test-file moves. Mechanical; medium risk. Preserve test counts and assertions. Keep coverage measuring the same implementation behavior.

28. **Require zero debt and verify packed consumers.**  
    400–800 lines. Mechanical verification; high release risk. Require zero forbidden source/declaration/runtime-manifest edges. Run package isolation, neutrality and plugin artifact gates. Exercise boot, stream, reconnect, cancel and restart from tarballs.

Parallel work can start after the relevant contracts settle:

- Batches 4 and 5 are independent.
- Storage conversion, native ports and frontend ports can proceed independently after their contract batches.
- Admin, identity and chat conversion can run in parallel after the UI port shape is fixed.
- Provider adapters can proceed independently by owner after provider contracts settle.
- Serialize shared core exports, manifest/lockfile changes and final integration.

For the remaining extraction lanes, use these bounded follow-on batches. Repeat by named domain or complete workflow; do not put an entire directory-sized lane in one PR:

29. **Persistent second-app slice plus first domain schema:** 600–1,000 new lines; judgment; prove fresh boot and restart without copied DDL.

30. **One domain SQL/schema slice:** 800–1,500 lines per PR; mixed; prove dialect behavior, indexes, migration isolation and unchanged Tovu adoption.

31. **One CMS catalog/workflow slice:** 800–1,500 lines per PR; mixed; prove tool text, permissions, card output and mutation behavior.

32. **Theme leaves, then loader/build, then previews/tools:** 1,000–1,500 lines per PR; judgment first; prove worker packaging and theme-format compatibility.

33. **Post and member workflows:** separate 1,000–1,500-line PRs; judgment; prove publication, authorization, challenges and saved-state compatibility.

34. **Publishing planner/contributors/apply:** separate 1,000–1,500-line PRs; judgment; prove hashes, staged writes, compensation and rollback.

35. **Rendering leaves/workers, then page pipeline:** separate 1,000–1,500-line PRs; judgment; prove rendered output, worker closure and bounded expansion.

36. **One domain HTTP or backup workflow:** 800–1,500 lines per PR; mixed; prove auth/session/origin behavior or interrupted-upload recovery. Extend the second app as each capability lands.

**Risks and unverified points**

- **Tovu revision mismatch:** the requested ref is absent. Its wiring estimates use the explicitly identified fallback revision.
- **Historical count:** 80 remains unreproduced. Available combine gives 79 under the stated definition.
- **Declaration closure:** source inspection cannot prove the emitted `.d.ts` graph. XP3 and packed declarations must settle that.
- **SQL variance:** Kysely generics and the schema witness make storage the first contract prototype, not a mechanical global replacement.
- **Runtime identity:** locks, kernels, OAuth stores, error classes, React contexts and provider leases must retain shared instances.
- **Packaging:** provider bundles, workers and `.mjs` leaves require artifact checks. A source-only zero is insufficient.
- **Future-lane completeness:** the old recon was sampled. Data modules have already moved; other “remaining” items need a current inventory before dispatch.
- **Green baseline:** no execution occurred. “Independently green” is a delivery requirement, not a result claimed by this plan.
- **Release size:** required ports and removed forwarding APIs are breaking changes. Stage compatible contract additions first, then coordinate the consumer migration and breaking release.