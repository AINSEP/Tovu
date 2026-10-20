# G15 review, Tovu half (read-only)

Personas loaded: AI-Dev-Shop/agents/{code-inspection,security,red-team}/skills.md.
Scope: `git diff origin/cloud/forms-multidest...cloud/google-workspace -- . ':!.cloud-coord'` at ba86fe476
(241 files), plus G14c (`admin-surfaces/delivery-bindings.ts`, destination panel saving real bindings).
I read all of the production code in full. I read tests only where a finding needed them. I made no edits,
no commits and ran no suites. Jini findings F1, F2, F4, F5, F6, F7, F8, F10 and F11 are left out on purpose.

Vendor neutrality: PASS. I grepped every changed non-test file under apps/ and packages/ for
`google|googleapis|gsheets|spreadsheet|drive\.file|picker`. The only hits are older comments that have nothing
to do with this build ("template-picker", "runtime picker").

---

## MEDIUM

### T1. After an account switch, every Sheets destination stops for good. Nothing asks which bindings to move, and the panel text says the opposite of what happens
- Where:
  - `content/agent-plugins/google-workspace/ui/connection-panel.handler.mjs:188-191`: `confirm-switch` only
    confirms the switch.
  - `ui/connection-view.mjs:20` (`SWITCH_NOTE`) has two false statements:
    - "This panel cannot see which form bindings use this sign-in". Since G14c it can:
      `panelView` reads `deliveryBindings`, and the connection surface declares `deliveryAdapters`.
    - Destinations "act as the new account". They do not.
  - `references/connection.md:50-54` says the same, plus "Jobs that were already queued keep the account
    they were created with".
  - `references/form-delivery.md:38` gives the wrong fix for `authorization-required` ("Reconnect … with
    the same account").
  - Actual behaviour:
    - `apps/website/src/features/api-connections/form-delivery-connection.ts:110` passes the binding's
      frozen `config.accountId` as `expectedAccountId`.
    - Jini then throws `account-changed`, which `:45,54` maps to `authorization-required`,
      `retryable: false`.
    - The forms retry policy makes a non-retryable error terminal at once (`contracts/core/events/outbox-retry-policies.ts:11-13`).
- Failure scenario: an admin confirms a switch from a@ to b@.
  - Every submission to every form is refused until the admin re-saves each destination in the Form
    destinations tab. That includes submissions planned after the switch, because the binding still names a@.
  - Each refused job goes terminal and is never written to the sheet, even after the destinations are fixed.
  - The person was told the opposite: deliveries "act as the new account", and old jobs "keep the account".
  - The owner decision "ask which bindings to reassign" is not met.
- Smallest fix:
  1. While a switch is staged, `status` already lists the destinations. Add a `reassign` choice to
     `confirm-switch`: per binding, re-verify the spreadsheet under the new account and re-save it with the
     new `accountId`, or leave it "paused, needs re-pick".
  2. Correct `SWITCH_NOTE`, connection.md and the form-delivery.md row: "deliveries to destinations chosen
     with the old account stop until you re-pick them; queued ones are not sent".
  3. Optionally give an account mismatch its own code (`account-changed` is folded into
     `authorization-required` today), so the ledger can tell "re-pick" apart from "reconnect".
- OD? yes: which bindings to reassign by default.
- Failing-test idea:
  - plugin `__tests__`: stage a switch, call `confirm-switch` with a `reassign` payload, and assert that
    the binding's `config.accountId` equals the new account.
  - doc-pin test: `SWITCH_NOTE` contains no "cannot see which form bindings".
  - website: `createOAuthFormDeliveryConnectionPort` after a switch returns
    `authorization-required` (already pinned). Add one asserting that the panel reports the binding as
    "needs re-pick".

### T2. A "paused" delivery and a "never dropped on quota" delivery both go terminal after about a day, and an authorization failure goes terminal at once
- Where:
  - `content/agent-plugins/google-workspace/form-destinations/sheets.mjs:163-165` ("turning Sheets off
    pauses deliveries, it does not fail them") together with `delivery-result.mjs:39,43`
    (`rate-limited` and `adapter-unavailable` are retryable).
  - The site's single form-delivery policy is `maxAttempts: MAX_DELIVERY_ATTEMPTS`, 8 attempts over about
    a day (`contracts/core/events/outbox-retry-policies.ts:17-20`). After that the job goes terminal.
  - `delivery-result.mjs:35-36` and `form-delivery-connection.ts:45` make every authorization problem
    (`reconnect-required`, `invalid_grant`, `revocation-pending`) non-retryable, so it is terminal on the
    first attempt.
- Failure scenario:
  1. Sheets is turned off over a weekend, or a form flood keeps the 45/min budget saturated. Every
     submission older than the retry window ends `failed` and never reaches the sheet. That breaks the
     owner rule "never drop a submission on quota", and `product-state.mjs:13-14` promises "pauses".
  2. A refresh token expires (`invalid_grant`). The admin reconnects an hour later. Every submission in
     that hour is already terminal, so "undelivered jobs kept" means kept as failed rows only.
- Smallest fix: one of these.
  - A product-off or quota refusal does not spend an attempt: it returns a long `retryAfterMs` and the
    policy does not count it.
  - Or a separate `paused` outcome in the ledger, resumed by `set-product` and by a successful reconnect.
  - At minimum, document the window in form-delivery.md and change "pauses" to "retries for about a day".
- OD? yes. Does "undelivered jobs kept" mean they are re-sent after reconnect? (Red-team ambiguity: two
  readings, and the code took the weaker one.)
- Failing-test idea: an outbox drain with a fake adapter that always returns `adapter-unavailable`, run
  for 9 attempts. Assert the job is still pending, not failed. Today it fails at attempt 8.

---

## LOW

### T3. Saving or removing a delivery binding is an unguarded read-modify-write of the whole list
- Where:
  - `apps/website/src/features/agent-plugins/admin-surfaces/delivery-bindings.ts:141-153` reads all
    bindings.
  - `:171-185` writes `[...all with one change]`.
  - `features/settings/form-delivery-write.ts:20-27` takes no expected revision.
  - The header (`:15-16`) says "ownership is re-read here inside the write itself (another writer may
    have changed the setting in between)". That narrows the window but does not close it.
- Scenario: two admins, or two tabs, save destinations for two forms at the same moment. Or the
  generic settings route saves a custom-credential binding while the panel saves. One write silently
  drops the other's binding, including bindings of other adapters. Forms then stop delivering with no error.
- Fix: thread the settings `revisionSeq` through `FormDeliveryBindingsStore.read`/`write` (CAS) and
  retry once on conflict. Or reword the header so it does not claim atomicity.
- Test idea: a fake store whose `write` asserts an expected revision. Run two concurrent `save` calls
  against one read and assert that one is refused (or retried) and that both bindings end up stored.

### T4. A sign-in attempt's vault row id is the raw OAuth `state`
- Where: `apps/website/src/features/api-connections/vault-stores.ts:30`
  (`attemptId = (state) => \`attempt:${state}\``), written at `:144`.
- The header says the state "is kept out of anything listed" (`:34-36`, which is why the label holds a
  digest). But row ids are plaintext columns, `vault.list` returns them (`:117`), and backups or DB
  readers see them.
- Impact: low. Redeeming still needs the provider's code and the PKCE verifier, which is sealed. It
  contradicts its own stated rule.
- Fix: `attempt:${sha256(state)}` for both put and read. This needs no migration, because attempts live
  at most minutes.
- Test idea: after `putAttempt`, no `vault.list` row id contains the state.

### T5. A plugin can name any `TOVU_*_CLIENT_SECRET`, not only its own
- Where: `features/api-connections/contribution.ts:25` (`CLIENT_ENV_PATTERN`). The header (`:18-19`)
  claims "a plugin can point at its own …_CLIENT_ID / …_CLIENT_SECRET and never at another secret".
- Scenario: a reviewed but malicious or buggy bundled plugin declares
  `clientSecretEnv: "TOVU_GOOGLE_WORKSPACE_OAUTH_WEB_CLIENT_SECRET"` with its own `tokenEndpoint`. The host sends
  Google's web client secret there with `client_secret_post`.
- Fix: require the env name to start with `TOVU_<PLUGIN_ID_UPPER_SNAKE>_`. Or keep the pattern and
  correct the comment.
- Test idea: an acme fixture naming `TOVU_OTHER_OAUTH_WEB_CLIENT_SECRET` is refused at load.

### T6. The public surface-files route is anonymous and unthrottled, and costs a full contribution load per hit
- Where: `server/inbound/public-http/routes/agent-plugin-surfaces/files.ts:182-186` →
  `findAdminSurface` → `loadPluginContributions` (directory scan and JSON parse of every active plugin) per GET.
- Scenario: anyone can loop over random `/api/agent-plugin-surfaces/v1/x/y/z` URLs and keep the disk and
  CPU busy.
- Fix: a per-IP limiter like the callback's, or cache the admitted surface list per activation revision.
- Test idea: route test with a counting fake source: N requests produce at most 1 load within a TTL, or
  a 429 after the limit.

### T7. The CSRF gate compares `Origin` to the `Host` header
- Where: `features/agent-plugins/admin-surfaces/same-origin.ts:162-170`, used at `admin-surfaces.ts:73`.
- Behind a reverse proxy that rewrites `Host` (nginx `proxy_pass` without `proxy_set_header Host`), the
  browser's `Origin` is the public origin and `Host` is internal. Every bootstrap and action then gets 403,
  so the whole Google Workspace panel is dead on such a deployment. The gate still fails closed, so this
  is a functional problem, not a security one.
- Fix: also accept `Origin === TOVU_PUBLIC_URL` origin, and treat `Sec-Fetch-Site: same-origin` as the
  primary signal.
- Test idea: `isSameOriginAdminWrite({ origin: 'https://site.example', host: '127.0.0.1:3000', fetchSite: 'same-origin' }, …)`
  with a configured public origin returns true.

### T8. One 401 from Google is reported as "Reconnect required", and as a non-retryable delivery failure
- Where:
  - `lib/request-policy.mjs:78` maps `401 → reconnect-required`.
  - `form-destinations/delivery-result.mjs:35` maps that to `authorization-required, false`.
  - The host record stays `connected`, so the panel says "Connected" while every call says "reconnect".
- Scenario: the access token expires between the host's freshness check and Google's check (clock skew).
  A form delivery goes terminal on the first attempt.
- Fix: on 401, retry once inline with a freshly read token. Map a 401 that persists to
  `reconnect-required`, and let the host move the record when its refresh then fails.
- Test idea: a fake that answers 401 then 200. Assert the request succeeds with two token reads.

### T9. Trims and doc drift
- `README.md:86-88` still says form delivery "is charged once per delivery until it reads a token per
  request (G14b)". G14b is done (`form-delivery-connection.ts:69-77`).
- `products.json:8` `toolPrefix` is still unused (prior L4). Use it or remove it.
- `sheets_basic_filter` is declared `write`, so its `get` action asks for confirmation for a read. That
  adds friction but bypasses nothing. Split `get` into a read tool, or accept it.
- "Disconnect and revoke" runs on one click (`ui/connection-panel.mjs:54`). The frame cannot use
  `confirm()` (no `allow-modals`), so add an in-panel second step. The action is irreversible at Google.
- The hosted Picker session is keyed per surface, not per mount or admin (`lib/picker-flow.mjs:91,135-136`).
  A second tab's bootstrap silently invalidates the first tab's pick (`picker-expired`). Acceptable; say
  so in troubleshooting.md.

### Still open from earlier reviews (not re-rated)
- Prior L7: the host page posts the bootstrap and answers with target `'*'`, so a navigating frame can
  catch them before `onLoad`.
- Known: BYO secret reachable by the credentialed-request tool toward the token origin; plugins run
  in-process; per-process budgets and callback inbox; the hosted Picker in an opaque-origin sandbox is
  unverified (no `setOrigin`, and the CSP lists only `apis.google.com`/`docs.google.com`, so gapi
  sub-loads may be blocked). That last one needs a local Chrome check.

---

## Red-team paths tried (no new finding beyond those above)
- **Malicious plugin within its tier**:
  - Tool HTTP is limited to its declared origins, and hooks to their own origins plus the token endpoint.
  - A token it returns in output is withheld (shared issued-token memory).
  - It cannot see another plugin's bindings: ownership is by contributed adapter and declared connection.
  - It can declare `read` on a mutating tool (prior L7, still trusted) and can name foreign client
    secrets (T5).
- **Malicious sheet editor**:
  - Tab and spreadsheet titles reach the panels through `textContent` only (`ui/dom.mjs`).
  - Header text is written as `stringValue`; values are RAW.
  - Tab titles are quoted (`tabRange`).
  - CSV export prefixes formula triggers.
  - They can force `mapping-invalid` or `destination-limit` (>50k rows), or break binding saves with a
    tab named like `Bearer x` (the binding owner's secret-value check). That is a DoS on their own sheet
    only.
- **Malicious form visitor**: answers are RAW and limited to frozen-form fields, and the IP is excluded.
  A flood can saturate the 45/min budget, which with T2 can turn into dropped rows.
- **CSRF from another origin**:
  - Surface POSTs need Origin = Host, Sec-Fetch-Site same-origin and a session credential.
  - The callback is cookie-less and state-bound.
  - Settings writes are re-authorized for the admin (`settings.workspace.write`).
- **Second workspace**: host, plugin-state, delivery-bindings and tool connections each refuse a foreign
  `workspaceId`.
- **Stale tab**: the Picker session has a 15-minute TTL and the same-account check; host sign-in links
  expire; a navigated frame is unmounted.
- **Replayed callback**: the attempt is consumed by a revision-checked delete, a replay gets
  `state_expired`, and the loopback listener closes after its first callback.
- **Bearer forwarding on redirects**: plugin fetch uses `redirect: 'error'` and HTTPS only.
- **Confirmation bypass**:
  - Write and destructive effects map to the publish/delete families.
  - The account is frozen per call by signal.
  - MCP-UI only answers parked `p_…__…` calls.
  - The CSV export checks `artifacts` before any read.

## Verified fixed (prior Phase-B High/Medium)
- **H1**: `connectionRef` is returned by `agent_plugin_connect` (`api-connections/connect.ts:31,221-223`).
- **H2**: products are OFF by default. Checked:
  - per request in `sheetsClientFor` (`lib/sheets-client.mjs:108-117`);
  - in panels (`sheetsUnavailableReason`);
  - in delivery (`sheets.mjs:165`, host passes `pluginState`).
- **H3**: Picker, connection and destination panels plus their handlers are shipped. A browser check is
  still owed.
- **H4**: `apiOrigins` and `scopeSets` are declared; the callback origins come from
  `TOVU_API_CONNECTION_CALLBACK_ORIGINS` and fail closed (`host.ts:230-243`).
- **M1**: declared-origin HTTP is enforced for tools and surfaces (`host-capabilities.ts:105-111`) and
  for hooks (`hook-http.ts`).
- **M2**: CSV formula prefix (`lib/sheets-admin-csv.mjs:51-63`).
- **M3**: `export-unavailable` is raised before any read (`tools/sheets-admin/export-csv.mjs:58`).
- **M4**:
  - the frozen `accountId` is enforced (`form-delivery-connection.ts:63-67,110`);
  - one token read per request (`:69-77`, `sheets.mjs:170`).
- **M5**: partly fixed.
  - Column developer-metadata markers keep a renamed field in its column.
  - Duplicate submission ids return `ok: true` with a "review" note in `reference`, not a review code.
    Acceptable only if the person ever sees `reference`.
- **M6**: the plugin limiter and `QUOTA_BUDGETS` are removed; host budgets are the only mechanism.
- **M7**: `sortSpecs` is dropped from `sheets_basic_filter`.
- **L7 (fields mask)**: `*` and `data` masks are refused without `includeGridData` and `ranges`
  (`sheets-client.mjs:120-136`).
