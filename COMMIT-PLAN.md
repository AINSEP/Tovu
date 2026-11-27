# Tovu wave 3 architecture continuation

Coordinator commits only; leave this file uncommitted. `.git` remains read-only.
Base: `codex/tv-w3-arch2`, `f43ed22c368f4deb837c799eec357dda21b161da`.
The previous run's referenced plan was missing. Its committed diff and final transcript
show sheets 8–11 implemented before termination; sheet 12 had no edits.
No tests, mutations, builds, installs, type checks or linters are run in this job.

## Ordered design commits

1. **R01.TABLE.T — host table selector witnesses** (inherited at HEAD; reviewed).
   Files: `apps/admin/src/components/AssistantDock/__tests__/RoutedA2uiSurfaceCard.contract.unit.test.tsx`,
   `apps/admin/src/components/AssistantDock/__tests__/interactive-ui-styles.unit.test.ts`.
   Test: `the table keeps its provider marker when moved into and out of the target`,
   for native and shadcn, retaining the real providers and public stylesheet import assertions.
   Mutation: `M-host-queries-retired-table-class` leaves a retired selector on a portal
   transition; its provider-marker/text assertion must fail.

2. **R02.CONSENT.T — host refusal copy** (inherited at HEAD; reviewed).
   Files: `apps/website/src/features/consent/{host-bindings.ts,__tests__/service.test.ts,__tests__/tools.test.ts}`,
   `apps/website/src/server/inbound/public-http/middleware/site-consent.ts`.
   Tests: rejected banner mode uses Tovu copy without saving a draft, through the service
   and held tool preparation; the latter opens no approval surface.
   Mutation: `M-drop-tovu-banner-copy-port` removes only the tool-host field; held
   preparation then emits the neutral fallback and fails the exact-copy assertion.

3. **R03.MCP-ALIASES.T — lifecycle descriptor and intentional standalone fixture bindings**
   (inherited at HEAD; reviewed).
   Files under `apps/website/src/`: `features/agent-plugins/{mcp-host-bindings.ts,lifecycle.ts}`,
   `features/agent-plugins/__tests__/{manifest.default-tools-read.test.ts,unit/lifecycle-capability-binding.unit.test.ts,unit/manifest.unit.test.ts,unit/portable-readers.unit.test.ts,unit/tw2-L224-characterization.unit.test.ts}`,
   `assistant/__tests__/external-mcp-connection-source.operator-read-only.test.ts`.
   Tests: installed MCP owner normalizes legacy OAuth metadata and emits the exact
   `[agent-plugins]` compatibility warning; unbound standalone reader ignores host aliases.
   Mutation: `M-unbind-tovu-mcp-aliases` removes only the lifecycle descriptor; the
   installed OAuth output/warning witness must fail.

4. **R03.SHARE-KEY.T — exact host share-object rule** (inherited at HEAD; reviewed).
   Files under `apps/website/src/`: `features/site-backup/{share-registry.ts,share-service.ts}`,
   `server/runtime/composition/site-deps/site-sharing.ts`,
   `server/runtime/composition/__tests__/site-share-wiring.integration.test.ts`.
   Test: provider verifies/revokes the exact old object through the share-only kit,
   rejects alternate suffix, malformed token, overlong slug and static archive without I/O.
   Mutation: `M-share-kit-uses-archive-file-policy` accepts static archive filenames
   using the wider SHARE_FILE policy; the static archive artifact rejection must fail.
   Share-password, expiry and ciphertext fixtures remain untouched for independent Opus execution.

5. **P10-H2.MIGRATE.T — trusted admin and assistant attribution** (continuation; implemented).
   Tests written/fixtures updated before production changes, left unrun:
   `admin migrate-forward records the authenticated user in the ledger detail` extends
   the existing authenticated HTTP success case;
   `human confirmation does not turn an assistant migration into a user write` drives
   the real tool confirmation and the admin route triple with the same principal,
   compares persisted actor kinds, and pins confirmer/requester IDs.
   Mutations: `M-migrate-assistant-as-confirmer` stamps user attribution from the human
   confirmation channel (agent ledger assertion fails); `M-migrate-admin-as-agent`
   swaps only the admin origin (user ledger assertion fails).
   Files under `apps/website/src/`:
   `server/__tests__/routes/database-migrate-forward-routes.test.ts`,
   `assistant/__tests__/tool-registrations.database-recovery.test.ts`,
   `features/database/__tests__/unit/{migrate-forward-hooks.unit.test.ts,tool-registrations.input-validation-status.unit.test.ts}`,
   `features/database/tool-registrations.ts`,
   `server/runtime/composition/modules/database-migrate-forward.ts`,
   `server/runtime/composition/tool-catalog-manifest.ts`.
   Use the approved third-argument recipe; keep DatabaseToolDeps and the contributor
   intersection unchanged, with no getter flattening. Keep gated-hooks.ts unchanged:
   its existing spread already forwards actor to Jini.

## Prerequisites and remaining work

Jini report and read-only branch `codex/w3-archj` confirm R01.TABLE.J, R02.CONSENT.J,
R03.MCP-ALIASES.J, R03.SHARE-KEY.J and P10-H2.MIGRATE.J source changes exist.
K03.BRIDGE.J is also reported built. No Jini edits belong to this Tovu-only dispatch.
G06.RUN.J remains NEEDS-OPUS and is not built here. No Tovu sheet depends on it.
Paired package verification, named mutation runs and all test/gate execution remain Opus work.

## Scope review

No extra helpers, files, production comments, namespace migration or package changes.
No prior implementation deletions were needed. Test review removed two draft assertions
for a principalKind field that the authorization port does not receive.
Final source/diff inspection completed. `git diff --check` passed. The narrow
database caller search under `apps/website/src` found only the named production
and fixture callers, all updated; the policy adapter remains unchanged. Selector,
consent, MCP alias and artifact-store closeout searches matched their sheet scopes.
Installed legacy MCP fixtures still use the composed lifecycle, retaining old keys.
No source-anchor mismatch stopped a Tovu sheet. No Tovu sheets remain unimplemented.

Static architecture review: no new boundary violations found. The existing Jini
writer owns persistence; Tovu supplies trusted origins. The contributor closes over
only mutationActor and retains the original deps object and deferred field reads.
Confirmation still uses confirmer.id; execution authorization still uses ctx.principal.id.
Existing why-comments, schemas, headers, key derivation and expiry behavior are preserved.
This is source review only; runtime and mutation correctness remain unverified by instruction.

Continuation changes seven existing source/test files and creates only this plan.
The inherited commit changed eighteen files; the full job spans twenty-five existing files.
HEAD remains f43ed22c368f4deb837c799eec357dda21b161da; no commit or push was attempted.
