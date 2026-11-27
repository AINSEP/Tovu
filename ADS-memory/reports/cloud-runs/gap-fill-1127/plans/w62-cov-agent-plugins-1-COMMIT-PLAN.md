# Agent plugins coverage gap fill

This is the uncommitted mutation ledger for the cloud handoff. Each entry names
a source change that should make the named test fail. No tests or mutations were run.

- google-client.unit.test.mjs:revocation transport failure and retry → remove the catch's unreachable classification, or change the form key from token.
- google-client.unit.test.mjs:revocation HTTP 403 / 503 (each) → recognize invalid_token on every status, or invert the 5xx classification.
- google-client.unit.test.mjs:sign-in hooks identify the Google account → discard the supplied fresh bearer when constructing the client.
- products-catalog.unit.test.mjs:Sheets sign-in deduplicates scopes → remove the Set.
- products-catalog.unit.test.mjs:sign-in rejects an unknown scope set → silently discard unknown product ids.
- plugin-state.unit.test.ts:scopes settings and exposes sorted revisions → omit the plugin prefix from row ids, reverse the key sort, omit copying JSON, or delete using revision 1.
- plugin-state.unit.test.ts:refuses foreign workspace / malformed plugin scope (each) → remove that isolated scope guard.
- plugin-state.unit.test.ts:rejects malformed keys and oversized UTF-8 JSON → drop the key validation or measure text.length instead of bytes.
- plugin-state.unit.test.ts:at the key limit replaces existing and refuses a new one → change >= to >, count rows of other plugins, or reject all writes at the cap.
- plugin-state.unit.test.ts:concurrent save conflict and conflicting delete → rethrow the raw write conflict or rethrow the delete conflict.
- plugin-state.unit.test.ts:non-conflict persistence failures → swallow an ordinary put/delete error instead of propagating it.
- connections.unit.test.ts:projects complete scope sets and drops staging at expiry → replace every with some, replace > with >=, or keep the staged label on missing records.
- connections.unit.test.ts:uses shared account status and unbinds without revoke → read the local record for shared status, omit the shared destination, allow a shared switch, or use disconnect instead of stopUsing.
- connections.unit.test.ts:pins account and requires an actor → drop the token options, actor guard, or workspace check.
- connections.unit.test.ts:returns action result and rereads staging → use the stale action view's switch label or report remote revocation as confirmed.
- connections.unit.test.ts:issued start and consumable desktop callback → omit deposit, use a wrong attempt key, or leave a previous failed attempt after success.
- provider-contract.test.mjs:query classifies each HTTP/transport scenario → replace the named classification with the generic provider error, reflect vendor text, treat non-JSON as success, or remove the tested Retry-After/timeout handling.
- provider-contract.test.mjs:query rejects each malformed text/limit/cursor input → remove the one clause that rejects it.
- provider-contract.test.mjs:query tenant filters, paging and offsets → remove tenant/deleted filter or extra row, omit grammar escaping, or measure highlight offsets before HTML stripping.
- provider-contract.test.mjs:query empty/missing/malformed/terminal → send IN [], treat any 404 as missing, use some instead of every for hits, or use estimatedTotalHits for pagination.
- provider-contract.test.mjs:upsert revision precedence and replacement → change >= to > or stop tracking highest revision within the batch.
- provider-contract.test.mjs:remove content-free tombstone → omit deleted or preserve old fields on the tombstone.
- provider-contract.test.mjs:write validation → skip finite/safe/non-negative revision validation, skip primary-key length validation, or change max batch comparison to >=.
- provider-contract.test.mjs:write reports each queue/response refusal → proceed past the failing queue, malformed revision result or missing task id.
- provider-contract.test.mjs:revisionOf deduplication and ordering → remove Set for the fetch or turn absence into revision zero.
- provider-contract.test.mjs:ensureIndex preexisting settings → reject existing index, drop a required setting, or return before confirming the settings task.
- provider-contract.test.mjs:dropIndex absence vs failure → remove the tolerated absent-index code or treat cancelled tasks as success.
- provider-contract.test.mjs:awaitTask states and encoding → stop encoding task ids or treat unrecognised states as pending.
- provider-contract.test.mjs:deadline blocks following write → treat a still-pending earlier task as settled.
- commit-site.test.mjs:TimeoutError / AbortError (each) → stop classifying that error name as a timeout.
- commit-site.test.mjs:repository lookup hidden / non-JSON success / non-JSON refusal / blank refusal / null refusal (each) → replace the 404 result with generic provider-error, swallow the parse failure, or use an invalid provider message instead of the status fallback. Null refusal is a regression test expected red on HEAD: guard body.json before reading its message.
- commit-site.test.mjs:manifest absent content / invalid encoded JSON / unrecognized version / out-of-folder ownership (each) → accept the isolated bad manifest as no ownership and continue writing.
- commit-site.test.mjs:invalid and reserved paths → move validation after the repository lookup or allow a generated file to overwrite the ownership manifest.
- commit-site.test.mjs:legacy manifest → discard legacy ownership or delete a path without its expected SHA.
- commit-site.test.mjs:unchanged tree → remove the identical-tree guard.
- commit-site.test.mjs:ref PATCH 422 / 403 (each) → retry with a forced PATCH or incorrectly classify the refused status.
- connection-status.unit.test.ts:combined badges → treat static tokens as disconnected, prefer pending over reauth, give local rows badges, or overwrite an existing connected badge from its OAuth card.
- connection-status.unit.test.ts:optional hosts absent → require an API host unconditionally or report disconnected OAuth as connected.
- connection-status.unit.test.ts:one-input catalog and risk → permit an extra input or mark the tool read-only.
- connection-status.unit.test.ts:stored sign-in (four cases) → require OAuth for static tokens, accept pending OAuth, or count sealedEnv as the access token.
- access-grants.unit.test.ts:sign-in enables, writes and reloads once → reload before the write or overwrite an already attributed grant.
- access-grants.unit.test.ts:late operator stop → ignore false from enablePlugin.
- access-grants.unit.test.ts:expected adoption and approving actor → retain null provenance from the preview or replace the approver with the system actor.
- access-grants.unit.test.ts:approval refusal (seven rows) → bypass the corresponding required key, source existence, owner, grant, URL, prior revision or new-source check.
- access-grants.unit.test.ts:record declined proposal → omit the attributed-source guard, grant the proposal instead of preserving current access, or use another actor.
- access-grants.unit.test.ts:enable preview refusal → accept a URL mismatch or silently drop a skipped transport.
- access-grants.unit.test.ts:boot replays only eligible connections → treat an explicit off as on, ignore prior attribution, or grant a pending OAuth row.
- access-grants.unit.test.ts:explicit enable failure → log and swallow a failure after approval.
- apply-tool-renames.unit.test.ts:rename grants once → drop de-duplication, add a name not already granted, or omit write attribution.
- apply-tool-renames.unit.test.ts:unchanged grants (four rows) → bypass owner, URL, JSON or string-only validation for the named row.
- executable-capabilities.unit.test.ts:disclosure binds displayed account → fail to freeze the account or allow an unapproved ref to reach token access.
- executable-capabilities.unit.test.ts:missing accounts → omit the refusal or skip binding the empty set on a permitted sign-in action.
- executable-capabilities.unit.test.ts:withdrawn tool → return empty disclosure instead of refusing.
- executable-capabilities.unit.test.ts:HTTP policy and cancellation → allow undeclared origin, follow redirects, omit bounds or combine only one signal.
- executable-capabilities.unit.test.ts:bodyless/truncated replies → construct a body for 204, forward truncated data or drop the lone signal.
- executable-capabilities.unit.test.ts:scoped budget/state/artifacts → drop either scope component from an injected effect or expose absent capabilities.
- host-deps.test.ts:redirect resolution (five cases) → skip configured-origin preference, accept a non-http URL, ignore fallback, or append the raw server id.
- host-deps.test.ts:lazy route overrides and MCP projection → read the getter eagerly, apply defaults despite overrides or recreate the projection each read.
- host-deps.test.ts:workspace defaults → pass a bare workspace id to the layout or the instance root to the activation owner.
- host-deps.test.ts:missing install and invalid optional metadata → read a nonexistent plugin or return no server config on a card parse failure.
- host-tool-inputs.unit.test.ts:routes each credential kind and saved result → forward the untranslated target, switch the responsible owner or skip savedResult.
- host-tool-inputs.unit.test.ts:rejects each mismatched/unavailable credential input → remove that case's specific routing guard.
- host-tool-inputs.unit.test.ts:card destination (six cases) → skip authorization, ignore saveTarget, invoke the original adapters, or fail to retain the default API route.
- host-tool-inputs.unit.test.ts:no credential declarations before authorization → remove the missing authorization guard.
- render-deploy-workflow.test.mjs:executable writes and checks drift → discard CLI exit status, omit the real file writer, or write even in check mode.
- federation-behavior.unit.test.ts:plan admits representable servers only → admit one unsupported entry, change the connection-id normalization, or require OAuth for all sources.
- federation-behavior.unit.test.ts:stale replacement, adoption, collision → replace an edited/signed-in row, drop existing grants on adoption, rebind another plugin's endpoint, or provision a new connection with authority.
- token-boundary.unit.test.ts:declaration refusals → remove the exact absent, no-token, ambiguous or invalid-id guard.
- token-boundary.unit.test.ts:refuses three unusable endpoint forms → bypass host equality or accept URL parsing failure.
- token-boundary.unit.test.ts:missing row / abort after row read → try to save or throw a generic runtime error instead of the specific refusal.
- token-boundary.unit.test.ts:preserves current decisions on save → write to declared URL instead of current URL or discard saved labels/grants.
- token-boundary.unit.test.ts:probe validation and refusal → send the invalid token or convert an HTTP refusal into success.
- token-boundary.unit.test.ts:explicit import existing credential → overwrite it or omit the switch retry.
- token-boundary.unit.test.ts:pinned URL import → accept a same-host path mismatch.
- token-boundary.unit.test.ts:bundled boot import → admit unbundled or pending explicit plugins, retain token whitespace or include retired env values in logs.
- token-boundary.unit.test.ts:operator-off and safe error copy → report an off connection as on, or log the thrown error.
- action-tools.unit.test.ts:signal and declared connections → discard the signal, resolve another tool's connection list, or omit the injected host ref mapping.
- action-tools.unit.test.ts:oversized schema-valid payload → remove the size check.
- connect-cards.unit.test.ts:stable identity and display copy → stop escaping id, vary card URI by state or ignore declared permissions.
- connect-cards.unit.test.ts:masked token form and outcome → remove the secret flag, prefill the field, or discard the host app/copy.
- connect-cards.unit.test.ts:current destination exchange → send the wrong tool, channel or principal; drop the shared option or correlation id.
- connect-cards.unit.test.ts:expiry/dismissal (each) → attempt to interpret the ended or dismissed answer as a choice.
- connect-cards.unit.test.ts:malformed destination (each) → allow an unknown choice or allow extra selection parameters.
- connect-cards.unit.test.ts:destination default and missing emitter → default to shared or open an exchange without a human transport.
- connect-cards.unit.test.ts:aborted destination → omit the abort handler closing the live exchange.
- connect-cards.unit.test.ts:sign-in waiter → omit credential display copy while waiting, carry it into the connected state or drop execution options/results.
- connect-tool.unit.test.ts:off plugin key-card guidance → provision despite disabled plugin or discard declared card copy.
- connect-tool.unit.test.ts:absent installation, declaration or OAuth composition → continue into persistence after a precondition failed.
- connect-tool.unit.test.ts:token-only card outcome → drop the injected card, options, or its specific refusal; report refusal as connected.
- connect-tool.unit.test.ts:owner’s shared API destination → send site instead of shared or discard poll/wait arguments.
- connect-tool.unit.test.ts:non-owner and cancellation → disclose shared option to non-owner or start API sign-in after cancellation.
- connect-tool.unit.test.ts:declined retained credential → widen access or erase saved credential despite the decline, or open another token card.
- executable-register.unit.test.ts:projection, confirmation and withdrawal → classify a destructive tool as read, bypass disclosure, or keep a stale tool in the live registry.
- executable-register.unit.test.ts:reload failure and disposed registration → retain the rejected queue tail or let a post-dispose refresh republish tools.
- github-pages/public-url.test.mjs:new owner Pages site → always append the repo path on a 404.
- netlify/public-url.test.mjs:site missing a public URL → accept a missing URL as a usable site.
- write-files.test.mjs:JSON null refusal → remove null-safe access to provider error message.
- github-actions-module.test.mjs:untrusted run URL and partial jobs → forward any URL, drop incomplete jobs indicator or lose the running status.
- railway-module.test.mjs:no latest deployment logs → issue a log request anyway or invent a line.
- railway-module.test.mjs:optional log metadata → coerce/reveal omitted or raw provider fields rather than omit them.
- railway-module.test.mjs:aggregate discovery cap → allow a complete page set with 501 services.
- render-module.test.mjs:queued explicit commit → omit the requested SHA for 202 responses.
- render-module.test.mjs:truncated logs without usable level → discard transport truncation or expose a malformed level.
- forms-edges.test.mjs:portable form constraints → drop zero minimum, checkbox value, or blank option filtering before publication.
- forms-publish.test.mjs:no retained database → provision D1 or attach an invalid receiver for an empty manifest.
- token-boundary.unit.test.ts:modeled token and missing id → allow secret input in a tool call or continue when plugin id is blank.
- token-boundary.unit.test.ts:human token save and safe outcome → skip probe, store untrimmed token, unmask field or expose token in outcome.
- token-boundary.unit.test.ts:probe refusal/unavailable (each) → persist despite rejected probe or return the wrong user action.
- token-boundary.unit.test.ts:validator refusal → probe the malformed value or lose its locale/rule mapping.
- token-boundary.unit.test.ts:five secret-card terminal outcomes → lose a cancellation/expiry distinction, expose unexpected faults or allow blank as saved.
- forms-receiver-edges.test.mjs:pending answers in an envelope without evidence → expose the envelope array, emit null evidence, or surface a historical IP.
- object-store.test.mjs:both incomplete staged host configurations → advertise a streaming writer when only the signer or only the transport is present.
- target-edges.test.mjs:share verification checks each response header → skip size, cache policy or attachment validation, or sign the public HEAD.
- credential-cards.unit.test.ts:declared card data in canonical and legacy namespaces (each) → ignore the selected identity namespace, import executable code rather than read data or drop loader-supplied ownership.
- credential-cards.unit.test.ts:mail precedence and API label ownership → prefer the duplicate manifest target, refuse same-owner aliases, or apply API label conflicts to OAuth.
- provider-contract.test.mjs:overlapping writes → drop the write lane or read revisions without waiting for the previous vendor task.
- google-client.unit.test.mjs:sign-in hook scope translation → ignore or silently accept unknown scope-set ids, or reach the provider for a local catalog decision.
- connections.unit.test.ts:empty shared connection status → fall back to the local record or show an account instead of disconnected.
- connections.unit.test.ts:skipped desktop completion and unpinned token read → clear the prior attempt, deposit empty callback fields, or pin a default account.
- apply-tool-renames.unit.test.ts:read-only renames preserve write attribution → update the write list or actor when only the read list changed.
- destination-panel.frame.test.mjs:existing spreadsheet when Picker unavailable → gate the entire editor on Picker availability or save without verifying and preserving the selected tab.
- connect-tool.unit.test.ts:MCP hosted sign-in success → expose the provider/tunnel URL or report failure after the callback sets the row connected.
- connect-tool.unit.test.ts:bounded MCP wait → claim connected when the deadline lapses without credentials.
- connect-tool.unit.test.ts:MCP refusal vs unexpected fault → open the card on refusal or replace an unclassified error.
- federate-mcp-layout-args.unit.test.ts:bundled digest and exact endpoint → trust a superseded package, unbundled package, or changed URL.
- federate-mcp-layout-args.unit.test.ts:boot declaration digest listing → read duplicate plugin ids or mark all installed packages as bundled.

## Handoff inventory

Counts below are added test cases, including table and loop cases. Connector
suites that exercise an entry barrel and its behavior-bearing implementation
are counted once.

| Source under packages/agent-plugins | Cases | Test file |
| --- | ---: | --- |
| cloudflare/lib/forms.mjs | 1 | forms-edges.test.mjs |
| cloudflare/lib/target.mjs | 1 | forms-publish.test.mjs |
| cloudflare/worker/forms-receiver.mjs | 1 | forms-receiver-edges.test.mjs |
| fly/scripts/render-deploy-workflow.mjs | 1 | render-deploy-workflow.test.mjs |
| github-pages/targets/github-pages.mjs | 1 | github-pages/__tests__/public-url.test.mjs |
| github/deploy-ops/github-actions.mjs | 1 | github-actions-module.test.mjs |
| github/source-control/commit-site.mjs | 16 | commit-site.test.mjs |
| github/source-control/write-files.mjs | 1 | write-files.test.mjs |
| google-workspace/lib/auth.mjs | 5 | google-client.unit.test.mjs |
| google-workspace/lib/product-state.mjs | 2 | products-catalog.unit.test.mjs |
| google-workspace/ui/destination-panel.mjs | 1 | destination-panel.frame.test.mjs |
| meilisearch/providers/meilisearch.mjs | 39 | provider-contract.test.mjs |
| netlify/targets/netlify.mjs | 1 | netlify/__tests__/public-url.test.mjs |
| railway/deploy-ops/railway.mjs | 3 | railway-module.test.mjs |
| render/deploy-ops/render.mjs | 2 | render-module.test.mjs |
| s3-compatible/object-stores/s3-compatible.mjs | 1 | object-store.test.mjs |
| s3-compatible/targets/s3-compatible.mjs | 1 | s3-compatible/__tests__/target-edges.test.mjs |
| src/admin-surfaces/action-tools.ts | 2 | action-tools.unit.test.ts |
| src/admin-surfaces/connections/connections.ts and index.ts | 7 | connections.unit.test.ts |
| src/admin-surfaces/plugin-state.ts | 7 | plugin-state.unit.test.ts |
| src/connect/access-token-tool.ts | 17 | token-boundary.unit.test.ts |
| src/connect/apply-connect-defaults.ts | 11 | access-grants.unit.test.ts |
| src/connect/apply-tool-renames.ts | 6 | apply-tool-renames.unit.test.ts |
| src/connect/catalog.ts and index.ts | 5 | connection-status.unit.test.ts |
| src/connect/connect-card-ui.ts | 2 | connect-cards.unit.test.ts |
| src/connect/connect-destination.ts | 7 | connect-cards.unit.test.ts |
| src/connect/connect-sign-in-wait.ts | 1 | connect-cards.unit.test.ts |
| src/connect/connect-tool.ts | 9 | connect-tool.unit.test.ts |
| src/connect/connection-status.ts | 2 | connection-status.unit.test.ts |
| src/connect/credential-cards.ts | 3 | credential-cards.unit.test.ts |
| src/connect/credential-save-tool.ts | 22 | host-tool-inputs.unit.test.ts |
| src/connect/enable-access.ts | 1 | access-grants.unit.test.ts |
| src/connect/executable/approval.ts | 3 | executable-capabilities.unit.test.ts |
| src/connect/executable/host-capabilities.ts | 3 | executable-capabilities.unit.test.ts |
| src/connect/executable/register.ts and index.ts | 2 | executable-register.unit.test.ts |
| src/connect/federate-mcp.ts | 3 | federation-behavior.unit.test.ts, federate-mcp-layout-args.unit.test.ts |
| src/connect/grant-signed-in-defaults.ts | 2 | access-grants.unit.test.ts |
| src/connect/host-deps.ts | 7 | host-deps.test.ts |
| src/connect/import-access-token.ts | 5 | token-boundary.unit.test.ts, federate-mcp-layout-args.unit.test.ts |
| src/connect/installed-plugin.ts | 1 | host-deps.test.ts |

### Exceptions and follow-up

- BUG github/source-control/commit-site.mjs:114. A JSON null API refusal reaches
  an unguarded property access and throws a TypeError rather than returning a
  provider-error result. Read the message null-safely (or validate a JSON object
  before accessing its properties). The new regression is expected to be red.
- EXCEPTION scripts/build-cloudflare.mjs:1–15. Top-level esbuild wiring, not
  independently callable behavior. The existing build-cloudflare.test.mjs
  checks the packaged targets and boots the generated receiver outside the host.
- EXCEPTION cloudflare/worker/forms-receiver.mjs:317. The default acknowledge()
  clock callback is never called because acknowledgment deletes rows immediately.
- EXCEPTION google-workspace/ui/destination-panel.mjs:112. The missing
  spreadsheet fallback is unreachable for a contract-valid host response after
  missingForSave() returns null. The current suite checks omission at save time.
- EXCEPTION src/connect/credential-save-tool.ts:99–101. The internal switch
  default is unreachable after the public KINDS gate.
- The three index.ts files are pure re-exports. Runtime exports are exercised
  through the barrel where applicable. No import-only tests or coverage exclusions.
- SKIPPED-ALREADY-COVERED (individual cases): default worker acknowledgment
  and success notices in forms-receiver.test.mjs; Google invalid_token
  confirmation and malformed revocation response in google-client.unit.test.mjs;
  zero-tab fallback in destination-panel.frame.test.mjs; boot reporting in
  boot-log-safety.unit.test.ts; and forbidden lazy MCP access in host-deps.test.ts.
- Branch-only inputs had no per-branch identifiers in the dispatch. The Opus
  cloud run still needs to verify collection and report any remaining gaps.
