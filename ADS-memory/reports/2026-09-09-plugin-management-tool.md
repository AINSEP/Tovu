# Plugin management tool + OAuth redirect gate — 2026-09-09

Branch `restructure/apps-website-phased`. Two commits:

- `a1abe2bb` — feat(plugins): one `plugins_set_enabled` for both plugin families, gated on a human confirmation
- `28efcf80` — fix(external-mcp): stop an unset `TOVU_PUBLIC_URL` from blocking every OAuth grant

---

## JOB 1 — the tool's final shape, and why this split

**One tool, not a new one.** `plugins_set_enabled` now covers BOTH plugin systems, selected by a
required `family` argument:

| `family` | System | Writer |
|---|---|---|
| `"site-runtime"` | `.tovu-plugin` site/runtime plugins (`features/plugin-runtime/`) | unchanged — the same `executeCommand` composition as before |
| `"agent-plugin"` | Agent Plugins (`features/agent-plugins/`) | `features/agent-plugins/set-enabled.ts` (new, shared with the admin route) |

### Why I extended the existing id rather than adding a fourth tool

The dispatch invited an argument for a different split; this is it. Adding
`agent_plugins_set_enabled` alongside `plugins_set_enabled` would have left the model choosing
between two near-identically-named enable tools — the exact confusion the owner's "don't make me
create five tools" complaint is about. The operator asking to "turn on the Higgsfield plugin" does
not know which of Tovu's two plugin systems that word means either. Keeping the id also preserves
its existing `tool-search-keywords.ts` entry and its rank.

Cost, stated plainly: **`family` is now required, so a call shape that used to work now fails.** It
fails loudly (a `ToolInputError` naming both valid values and which list/search tool to call first),
not silently. Making it optional with a `"site-runtime"` default would have been backward-compatible
and wrong — the dispatch is explicit that the tool must take the family explicitly, and conflating
the two systems has already produced real work in the wrong directory.

### What is deliberately NOT folded in

Install and uninstall stay separate tools, for the reason the dispatch gives rather than a style
preference: `DERIVED_RISK_BY_TOOL_ID` is keyed per tool id, so one tool gets exactly one risk band.
Enabling flips a flag; installing runs third-party code; uninstalling deletes bytes. Target shape is
therefore three tools where five would have been: this one, plus the existing separate install and
uninstall paths.

`features/agent-plugins/uninstall.ts`'s bundled-package refusal (`AgentPluginNotUninstallableError`,
`origin === "bundled"`) is **untouched** — verified: neither commit contains that file.

### One writer, not a third

`AGENT_PLUGIN_SET_ENABLED` (`34640b70`) had its "verify the id is installed here, then write the
activation record" pair inline in the route handler. That pair moved to
`apps/website/src/features/agent-plugins/set-enabled.ts` (`setAgentPluginEnabled`) and both the route
and the tool call it. The route keeps what is genuinely its own — its read-model response projection
and its HTTP status mapping — and gained a 404 for a package removed between its pre-check and the
write.

`set-enabled.ts` takes its installed-check from `listInstalledPlugins` (the primitive), not from
`agent-plugins/tool-registrations.ts`'s search read model, so the tool branch introduces no
`plugin-runtime -> agent-plugins/tool-registrations` edge.

---

## How confirmation is enforced

The existing mechanism, found rather than invented: **ADR-055 Decision 2's held-open surface
exchange** — the same transport `content_post_delete`, `deployment_execute_static_publish` and
`source_control_execute_commit` use. Not `pending-confirmations.ts` (its own header says no wired
tool uses it), and not `descriptor.requiresConfirmation` (which, with no `ExecutionDelegate` wired,
is a hang rather than a gate).

Flow, in `features/plugin-runtime/tool-registrations.ts`:

1. parse → `requireToolPermission("admin.plugins.enable")` → confirm → write.
2. On `enabled: true`, the handler opens a `SurfaceExchangeStore` exchange, emits
   `set-enabled-confirmation-ui.ts`'s dialog through `ctx.emitSurface`, and **parks**. The only thing
   that can resolve it is a browser POST to `mcp-ui-tool-calls-route.ts` — a channel the model cannot
   reach.
3. **Fails closed**: an execution context with no `emitSurface` cannot enable at all.
4. `plugins_set_enabled` added to `MCP_UI_REDEEMABLE_TOOL_IDS`. Without that the human's click is
   refused at the endpoint and the call parks until it expires — asserted, not assumed.

**Disabling raises no dialog.** That asymmetry is the point: disabling only ever removes capability,
and a confirmation in front of the off switch is one people learn to click through.

The authorization check sits ahead of the dialog deliberately — a principal with no
`admin.plugins.enable` grant must not be able to make a prompt appear in a human's chat. That is a
second evaluation of the same permission by the same evaluator for the site-runtime branch (whose
`executeCommand` still checks it), not a divergent policy; documented in the handler.

---

## The restart question — answered, not assumed

**Partially required, and the tool now says so.** Two mechanisms, two answers:

- **Immediate.** `activations.json` is re-read on every run: `resolveAgentPluginRefs` refuses a run
  pinning a disabled plugin, and the dynamic loader filters through the same record. The GATE moves
  with no restart. That is what `34640b70`'s commit message meant, and it is correct as far as it goes.
- **Restart required.** `registerInstalledAgentPluginTools(registry, …)` runs once, at
  `agent-daemon-server.ts:1177`, inside `start()` — and `buildToolCatalogQuery` snapshots
  `registry.list()` into a one-shot FTS index immediately after. So a plugin enabled *now* has no
  `agent_plugin_<id>` tool in the daemon that is running, and `search_tools` cannot see it either.
  The same holds for the site-runtime family's capability tools
  (`capability-tool-registrations.ts`, registered in the same boot block).

So enabling from the admin *looked* like it needed a restart because for the thing an operator
actually wanted — the plugin's tool becoming callable — it does.

The tool returns `restartRequired: true` on enable with a `note` telling the model to relay that
rather than implying the tool is usable now; `restartRequired: false` on disable. There is no in-app
daemon-restart affordance for the tool to call (I looked), so reporting is the honest maximum.

---

## Proof the tool is actually registered

`tool-registrations.plugins-set-enabled-families.test.ts` asserts the id is in the output of
`buildAssistantToolRegistrations(createRouteDeps-shaped deps)` after `contributePluginsTools()` — the
BUILT list, not the file compiling — plus `pluginsDerivedRisk.get("plugins_set_enabled") ===
"mutates-durable-state"` (the wiring gate fails closed without an entry) and membership in
`MCP_UI_REDEEMABLE_TOOL_IDS`.

**Naming checked against the real ranker**, not guessed: driven through
`buildToolCatalogQuery(registry)` over the real **173-tool** catalog built the way both boot paths
build it (`installFirstPartyToolContributors()` + `buildAssistantToolRegistrations(createRouteDeps())`).
`plugins_set_enabled` ranks **#1 on all 7 phrasings**:

```
enable the higgsfield plugin                                #1
turn on a plugin                                            #1
turn on the image generation plugin                         #1
activate a plugin                                           #1
disable a plugin                                            #1
the plugin is installed but not active, switch it on        #1
I want to use the higgsfield agent plugin                   #1
```

`tool-search-keywords.ts`'s entry was widened with the Agent Plugin half's vocabulary — before, those
words only ranked `search_agent_plugin_local`, which can *find* a plugin but cannot turn one on, so
the journey dead-ended one step short of working.

---

## JOB 2 — the OAuth gate, and why the fix is safe

Two defects, both real:

1. **`device_code` was gated on a redirect URI it never uses.** RFC 8628 has the human type a code at
   the provider; nothing redirects back. `beginConnect`'s `redirectUri` is now optional and the GRANT
   decides — the only place that knows. `selfConfigureConnection` threads it as `string | undefined`;
   dynamic client registration sends `redirect_uris: []` for a device-only client (RFC 7591 requires
   the member only for a redirect-based grant, and `registrationGrantTypes` registers none for
   `device_code`) rather than pinning the minted client to a callback nothing serves.
2. **The refusal never reached the model.** It was a bare `Error`, and `@jini-ai/daemon` redacts
   those into opaque failures — so the carefully-worded message naming `TOVU_PUBLIC_URL` was, in
   practice, a silent refusal. `ExternalMcpValidationError` out of `beginConnect` is now
   re-classified to `ToolInputError` at the tool boundary.

`authorization_code` **still requires** a redirect URI and still refuses without one — now with a
message naming `TOVU_PUBLIC_URL`, an example value, and Settings → External MCP as the alternative.

**I did not derive a dev localhost origin**, and this is the load-bearing judgement call. A redirect
URI must match what the provider was registered with, so a guessed one fails *at the vendor* with an
error about the client — strictly harder to act on than a refusal naming the variable. And it would
not have helped: `features/external-mcp/deps.ts`'s own "cross-process caveat" records that an
`authorization_code` connect started from the spawned agent-daemon mints a `pending` record the
public callback route's process cannot see, so **that grant cannot complete from a chat tool call
regardless of the origin used**. Higgsfield is `auth_mode=oauth` + `authorization_code`/PKCE, so for
Higgsfield specifically the honest chat answer is still "connect it from Settings" — but the device
grant, which some other servers use, now works from chat where before it was blocked for no reason.

**Nothing is weakened.** PKCE untouched; no redirect target is ever accepted from tool input; the
origin still comes only from operator configuration. The change is which grants have to wait for it.

---

## Exact test commands and counts

All from the repo root. `env -u TOVU_ADMIN_PASSWORD` is required for the HTTP-server suites or
`loginAsOwner` 401s.

```bash
# Job 1 — new suite
node --import tsx --test --test-timeout=30000 \
  apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts
#   16 tests, 16 pass, 0 fail   (RED first: 13 of 16 failed before the implementation)

# Job 1 — the two pre-existing suites this change updated
node --import tsx --test --test-timeout=30000 \
  apps/website/src/assistant/__tests__/tool-registrations.plugins.test.ts \
  apps/website/src/assistant/__tests__/tool-registrations.plugins-uninstall.test.ts
#   31 tests, 31 pass, 0 fail

# Job 1 — the admin route whose composition moved
env -u TOVU_ADMIN_PASSWORD node --import tsx --test --test-timeout=60000 \
  apps/website/src/server/inbound/admin-http/routes/agent-plugins/__tests__/integration/agent-plugin-set-enabled.integration.test.ts
#   7 tests, 7 pass, 0 fail   (unchanged in expectation)

# Job 2
node --import tsx --test --test-timeout=30000 \
  apps/website/src/assistant/__tests__/tool-registrations.external-mcp.test.ts \
  apps/website/src/assistant/__tests__/external-mcp-oauth.test.ts \
  apps/website/src/assistant/__tests__/external-mcp-dcr.test.ts \
  apps/website/src/assistant/__tests__/external-mcp-reauth-tool.test.ts
#   89 tests, 89 pass, 0 fail   (RED first: 3 of the 5 new/rewritten cases failed before the fix;
#                                the 2 device-grant ones passed immediately, which is itself the
#                                evidence that device_code needs no redirect URI)

env -u TOVU_ADMIN_PASSWORD node --import tsx --test --test-timeout=60000 \
  apps/website/src/server/__tests__/admin-external-mcp-probe-routes.test.ts
#   11 tests, 11 pass, 0 fail

npx tsc -p tsconfig.json --noEmit          # exit 0, 0 errors
npx eslint <the 9 changed source files>    # 0 errors, 4 sonarjs/no-duplicate-string warnings
```

Every reported count is the runner's own `ℹ tests / pass / fail` line, checked against the paths
passed — a nonexistent test path is silently skipped and still exits 0, and I hit exactly that once
(the route integration test is under `__tests__/integration/`, not `__tests__/`).

---

## Things worth someone else's attention

- **`response_types` for a device-grant client.** `dynamic-registration.ts` defaults it to `["code"]`
  regardless of grant, so a device-only client registers `grant_types: [device_code, refresh_token]`
  with `response_types: ["code"]`. A strict authorization server could object. Pre-existing and out of
  this dispatch's scope — but until this change the device path could not reach registration at all,
  so it has never been exercised.
- **`plugins_uninstall` still raises no confirmation.** `plugin-runtime/agent-tools.ts`'s header
  justified that by claiming "there is no existing human-confirmation transport this tool could reuse
  without inventing one" — already false when written (the held-open exchange had been serving
  `content_post_delete` since 2026-08-04), and now visibly so. I corrected the false comment rather
  than the tool; gating uninstall was not part of this pass.
- **Disabling a site-runtime plugin leaves its already-registered tools listed** in the running daemon
  until restart. Reported in the disable note; not otherwise addressed.

## Files touched

New:
- `apps/website/src/features/agent-plugins/set-enabled.ts`
- `apps/website/src/features/plugin-runtime/set-enabled-confirmation-ui.ts`
- `apps/website/src/assistant/__tests__/tool-registrations.plugins-set-enabled-families.test.ts`

Modified:
- `apps/website/src/features/plugin-runtime/{agent-tools,tool-registrations}.ts`
- `apps/website/src/server/inbound/admin-http/routes/agent-plugins/set-enabled.ts`
- `apps/website/src/assistant/{mcp-ui-tool-calls,tool-search-keywords,external-mcp-oauth}.ts`
- `apps/website/src/features/external-mcp/tool-registrations.ts`
- `apps/website/src/assistant/__tests__/{tool-registrations.plugins,tool-registrations.plugins-uninstall,tool-registrations.external-mcp,external-mcp-oauth}.test.ts`

No file on the dispatch's do-not-touch list was modified: `apps/admin/**`,
`features/pages/**`, `features/webhooks/keyring.env.ts`,
`server/runtime/composition/{app,tool-catalog-manifest}.ts`, `assistant/ask-choice-tool.ts` and
`mcp-federation/bootstrap.ts` are all untouched. The composition root needed no edit because
`contributePluginsTools()` is already registered there and `ToolContributor.build` already receives
the surface deps.
