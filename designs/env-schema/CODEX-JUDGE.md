Software Architect / Security (Review): **Verdict: needs rework.**

Reviewed the three design files and sampled **25 `VARS.tsv` rows** against Tovu `80b00f5b` and Jini `02edbb68`, using the specified Git refs. No files were edited. No builds or tests were run; compilation and runtime conclusions below are based on source inspection.

Paths prefixed **T** refer to Tovu; **J** to Jini. **D** refers to `designs/env-schema/` on the design ref.

1. **Blocker — Deleting the legacy deny switches can enable previously forbidden CLI capabilities.**

   **Evidence:** D `DESIGN.md:422–423,536` proposes deleting `TOVU_AGENT_NATIVE_FALLBACKS` and `TOVU_AGENT_FORBID_BASH`, describing the behavior changes as slight. T `apps/website/src/contracts/core/assistant-native-fallbacks.ts:44–65` implements both as security vetoes. Local owner access defaults on when the setting is absent; either legacy switch can currently deny it. `TOVU_AGENT_FORBID_BASH` also controls prompt selection in T `apps/website/src/server/inbound/assistant/assistant-system-overlay.ts:138–147`.

   An existing installation using `TOVU_AGENT_NATIVE_FALLBACKS=false` can therefore gain CLI access after the deletion. A tombstone warning does not preserve the restriction.

   **Fix:** Make retirement a separate, explicit security migration. With aliases forbidden, require conversion of the old restrictions into the retained setting before upgrading, and test that an unchanged old installation cannot silently gain capabilities.

2. **Blocker — The proposed entry-point snapshot does not account for import-time credential consumption or asynchronous startup delivery.**

   **Evidence:** D `DESIGN.md:200–205` loads config at the entry point; §2.7 similarly proposes making the desktop load the first statement. But T `apps/website/src/index.ts:14` statically imports the readiness gate, which imports `bootLocalOwnerSignIn` at `server/runtime/boot/boot-readiness-gate.ts:9`. That policy is constructed during module evaluation at `server/runtime/boot/local-owner-signin.ts:111`, deleting the desktop capability and parent PID at lines 104–105.

   Separately, startup IPC completes asynchronously in `server/runtime/boot/startup-secrets.ts:24–31`; the real entry awaits it and then mints tokens at `index.ts:153–159`. A snapshot taken earlier misses those credentials. Moving a statement above other statements does not move it ahead of static dependency evaluation.

   Jini has another import-time dependency: `packages/ui-kit/src/react/context.ts:14–20` calls `isDevelopment()` while constructing the exported context. J5’s proposed injected flag needs an initialization plan too.

   **Fix:** Specify the actual bootstrap sequence, credential owners, and handoffs before reader migration. Include subprocess tests covering real module evaluation, startup IPC, token creation, scrubbing, and child inheritance. Plain-map characterization tests cannot catch this ordering failure.

3. **Major — “No external users” contradicts the Picker source; the rename plan lacks an installation migration.**

   **Evidence:** D `DESIGN.md:539` recommends the plugin renames because there are “no external users.” J `packages/agent-plugins/google-workspace/lib/picker-flow.mjs:29–31` explicitly states that sites already set these names and that renaming would unconfigure them. Lines 43–46 read those settings through the public-config port.

   The names also appear in J `packages/agent-plugins/google-workspace/tovu-admin-surfaces.json:30,49`. T’s implementation accepts only the `TOVU_…` public-name pattern at `apps/website/src/features/agent-plugins/admin-surfaces/public-config.ts:15–27`. Supplying a differently prefixed replacement name will be refused unless that boundary changes with it.

   Likewise, changing repository setters and readers does not update deployed `JINI_AGENT_DAEMON_PORT` or URL settings.

   **Fix:** Define an upgrade procedure for operator-owned env files, dashboards, plugin declarations, and deployed workers, including rollout and rollback order. Without aliases, use a pre-upgrade migration or an explicitly coordinated breaking cutover. I could not verify how many installations currently use these settings.

4. **Major — The inventory omits finite production credential and ambient-name sets.**

   **Evidence:** J `packages/integrations/src/media-providers/providers.ts:233–253` enumerates credential names including `OPENAI_API_KEY`, `ARK_API_KEY`, `FAL_KEY`, and `REPLICATE_API_TOKEN`. The production resolver reads them at `media-providers/dispatch/credentials.ts:16–21`. None of those four names appears anywhere in `VARS.tsv`.

   Other production reads are misclassified or absent:

   - `LANG` is test-only; `LC_ALL` and `LC_CTYPE` are absent, although `packages/daemon/src/agent-executor/agent-env.ts:7–18,30–32` reads them from `hostEnv`.
   - `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY` are test-only, although `packages/platform/src/proxy-env.ts:24–31,102–110,133–138` processes them in production.
   - Production child-env assignments at `packages/db/src/transfer/postgres-target.ts:71` include `PGHOST`, `PGPORT`, `PGDATABASE`, and `PGUSER`; the first, second, and fourth are test-only, while `PGDATABASE` is absent.

   F6 acknowledges credential declarations, but those are finite, inspectable names—not an unknowable open set. The claimed complete inventory and 12-name Jini secret count are consequently incomplete.

   **Fix:** Reconcile declaration arrays, maps, computed reads, and child-env producers into the inventory before freezing counts or schemas. Separate actual readers, writers, and documentation mentions.

5. **Major — Schema-name redaction cannot provide the promised diagnostic coverage.**

   **Evidence:** D `DESIGN.md:243–248` makes schema secret classification the source for env-map diagnostics and says existing redaction mechanisms will consume secret field names.

   However, T `apps/website/src/platform/site-dir/site-key-dependent-data.ts:78–82` reads a connection string under a site-selected name. That name need not exist in the static schema. The omitted provider credentials in finding 4 create the same problem.

   The cited existing owners also do different jobs: T `packages/contracts/src/secret-redaction.ts:15–20,34–40,58–59` extends secret-shape redaction; J `scripts/check-log-safety.mjs:11–38` checks unsafe logging syntax. Neither is an env-name list that can simply be replaced. J `packages/cli/src/daemon-url.ts:91–114` additionally protects credentials embedded in otherwise non-secret URL settings.

   The proposed `EnvIssue.received` and error carrying all issues also need a guarantee that raw secret values never enter the diagnostic object—not merely that one formatter hides them.

   **Fix:** Retain existing shape and URL redaction. Define redaction for resolved dynamic declarations and unknown values, and construct diagnostic-safe issues at the boundary. Test arbitrary connection-string names, credential-bearing URLs, and non-vendor-shaped secrets through logging and serialization.

6. **Major — The refusal list is incomplete, and validation needs activation conditions and precedence.**

   **Evidence:** D `DESIGN.md:223–238` claims an exhaustive list of existing boot refusals. It omits invalid `TOVU_HOST`: T `apps/website/src/server/runtime/boot/bind-host.ts:66–80` throws `ValidationError`. Its absence fallback differs between the CLI and container entry, as documented at lines 59–60. Replacing an invalid restriction with the container fallback can broaden listener exposure.

   Per-variable coercion is also insufficient:

   - J `packages/server/src/storage/backend-config.ts:104–110` validates Postgres fields only when Postgres is selected. Invalid unused `JINI_PG_SSL_MODE` must not newly refuse SQLite startup.
   - T `apps/website/src/server/runtime/lifecycle/local-site-host.ts:17–20` transforms the site limit in warm mode before the supervisor validates it. The same raw value can therefore have different accepted behavior by context.

   The spec sketch has no conditional-required or activation contract.

   **Fix:** Complete the refusal census and specify conditional validation, precedence, and normalization. Preserve existing validators as owners where appropriate. Add cases with invalid inactive settings, CLI overrides, and warm-mode limit transformations.

7. **Major — The CI gate cannot reach the promised end state with its stated exceptions and scan inputs.**

   **Evidence:** D `DESIGN.md:339–344` explicitly permits environment-as-data operations and domain allow-lists. But `HW11-env-dynamic` at line 362 permits computed reads only in family-reader files. The six families do not cover J `packages/daemon/src/agent-executor/agent-env.ts:30–32` or `packages/platform/src/child-environment.ts:84–86`. These permitted operations would retain debt indefinitely or require undocumented exemptions.

   Coverage is also incomplete. J `scripts/check-hardwiring.ts:22–25` scans package `src` trees using `scripts/lib/package-sources.ts:48–60`. That does not include plugin payloads such as `packages/agent-plugins/cloudflare/worker/forms-receiver.mjs`, nor the examples included in the design census.

   **Fix:** Define separate rules for configuration access and environment-as-data transformations. Add the declared allow-list owners and explicit payload/example scan inputs. Fixtures should prove both legitimate transformations and forbidden accesses are classified correctly.

8. **Major — Cloudflare object bindings are being treated as string environment configuration.**

   **Evidence:** `VARS.tsv:421` classifies `TOVU_FORMS` as config. J `packages/agent-plugins/cloudflare/worker/forms-receiver.mjs:80,298,322` uses it as a database object with `prepare()`, not a string. The producer explicitly emits a native `d1` binding and a separate `secret_text` binding at `cloudflare/lib/forms.mjs:275–284`.

   D’s parser accepts `Record<string, string | undefined>` and only string-derived value types. It cannot represent that database binding. Excluding `ASSETS` as a non-env binding while including `TOVU_FORMS` in the string schema is inconsistent.

   **Fix:** Separate native platform bindings from OS env specs. Inject a typed database port at the worker boundary; coordinate any binding rename with its deployment metadata. Do not send database objects through the env parser.

9. **Major — The J3 target contract still exposes Express and drops required diagnostic provenance.**

   **Evidence:** D `DESIGN.md:331` proposes `requireToolExecutionCaller(...): RequestHandler`, contrary to the required framework-neutral Jini target. The current Express dependency is explicit in J `packages/daemon/src/http/tool-execution-routes.ts:25`.

   The proposed getter returns only the token. Current refusals include the host-supplied variable name at lines 69–76. The target signature has no source label, despite the design promising unchanged error texts.

   **Fix:** Specify a framework-neutral authorization contract using the existing server vocabulary, with Express binding in the host. Pass diagnostic provenance separately from the token value/getter and retain exact refusal tests.

10. **Major — The stated green checks do not compile or build all affected applications.**

    **Evidence:** D `DESIGN.md:399,456–458` specifies root `npm run typecheck`, area tests, and the hardwiring check. T `tsconfig.json:11–24` includes only website source and excludes tests.

    Desktop has its own four-part typecheck at `apps/desktop/package.json:17`; admin and site-chat have separate typechecks at their `package.json:15` and `:13`. Site-chat builds three bundle variants at `apps/site-chat/package.json:9`. These matter because T7 changes compile-time substitutions, including the deliberately fixed browser production define at `apps/site-chat/vite.config.ts:49–71`.

    **Fix:** Give each step an application-specific compile/build matrix. Include browser bundle checks, all site-chat variants, and desktop main/preload/renderer validation where affected. Root typecheck plus transpiling tests does not establish “each intermediate commit compiles.”

11. **Minor — Several sampled classifications and build claims are factually wrong.**

    **Evidence:** `VARS.tsv:14` treats `JINI_CORE_VERSION` as an env name with unverified injection. T `apps/admin/src/vite-env.d.ts:8–10`, `vite.config.ts:129`, and `jini-core-version.ts:12–15` show a global build constant sourced from the installed package manifest.

    D `DESIGN.md:314` counts seven executable `DEV` reads; two are comments at `apps/admin/src/lib/site-url.ts:14` and `admin-dev-origin.ts:4`. There are five executable production `DEV` reads, so the stated browser total is eight, not ten.

    Other corrections appear in the sample below. The supposedly unknown EOF launcher is directly visible at T `apps/desktop/src/tovu-server.ts:907–912`.

    **Fix:** Correct these rows and recompute derived counts. Keep unresolved classifications out of authoritative totals.

12. **Minor — The summarized execution order contradicts the dependency table.**

    **Evidence:** D `DESIGN.md:408` requires T3 before T5, but lines 465–466 and `INDEX.md` schedule T5 alongside work following T1. J0 also enables a hard unknown-name rule whose inputs are described as schema-derived, while schemas arrive in J1.

    **Fix:** Publish one consistent dependency graph. State how J0 obtains its complete known-name input before enforcement, without introducing another independently maintained list.

The 25-row sample checked readers, phase, secret classification, and disposition:

| VARS line | Repo / variable | Source check |
|---:|---|---|
| 5 | T `DEV` | Build/public/keep; five executable reads, not seven. `use-queries-tab.hooks.ts:39`; comment false positives above. |
| 10 | T `JINI_AGENT_DAEMON_PORT` | Boot and later reads/public/rename. `agent-daemon-server.ts:207`; `agent-daemon-port.ts:63`. |
| 11 | T `JINI_AGENT_DAEMON_URL` | Scope construction and live resolution/public/rename. `agent-daemon-scope.ts:174`; `agent-daemon-port.ts:60`. |
| 14 | T `JINI_CORE_VERSION` | Not an env variable; build define from package metadata. `vite.config.ts:129`. |
| 19 | T `JINI_STOP_ON_STDIN_EOF` | Import-time/public/keep. `agent-daemon-server.ts:67–70`. |
| 22 | T `MODE` | Build/public/keep. `browser-telemetry.ts:48`; `server-reconnect.ts:165`. |
| 47 | T `TOVU_AGENT_FORBID_BASH` | Call-time/public/delete; deletion removes an actual denial. `assistant-native-fallbacks.ts:51`. |
| 48 | T `TOVU_AGENT_FULL_CLI_ACCESS` | Actual computed call-time read, not merely named. `assistant-native-fallbacks.ts:52–53`. |
| 49 | T `TOVU_AGENT_NATIVE_FALLBACKS` | Actual computed call-time read; deleting loses its veto. Same lines. |
| 54 | T `TOVU_ALLOWED_ORIGINS` | Inert name with `env: {}`; public/delete supported. `visitor-frontend-control.ts:67–68`. |
| 63 | T `TOVU_CONSENT_INGRESS` | Construction-time/public/keep. `site-cookie-consent.ts:23`. |
| 64 | T `TOVU_CONSENT_REGION_HEADER` | Construction-time/public/delete changes trusted-header behavior. `site-cookie-consent.ts:24`; `deps.ts:3093`. |
| 78 | T `TOVU_DESKTOP_SELFTEST` | Import-time/public/keep. `main/index.ts:302`. |
| 104 | T `TOVU_LOCAL_SITE_LIMIT` | Read during supervisor construction; warm-mode transformation matters. `local-site-host.ts:17–20`. |
| 153 | T `TOVU_STOP_ON_STDIN_EOF` | Boot/public/rename; Windows setter identified. `tovu-server.ts:911`; `serve.ts:490`. |
| 160 | T `TOVU_TRUST_PROXY` | Applied at app construction, not per request. `app.ts:1962`; `trust-proxy.ts:39–52`. |
| 165 | T `VITE_TOVU_SITE_URL` | Browser build input/public/keep; website “reader” is deletion. `site-url.ts:29`; `local-admin-bundle.ts:144`. |
| 360 | J `JINI_JSON_IPC_TRACE` | Live call-time/public/keep; exact `1`, `true`, `yes`. `json-ipc.ts:41–43,82–84`. |
| 367 | J `JINI_PG_SSL_MODE` | Call-time/public/keep, conditional on Postgres. `backend-config.ts:44–47,105–106`. |
| 381 | J `JINI_SQLITE_BACKEND` | Actual alias read, not merely named. `backend-config.ts:103–104`. |
| 407 | J `PGPASSWORD` | Secret/keep; produced for a child, not read as host config. `postgres-target.ts:71–75`. |
| 421 | J `TOVU_FORMS` | Native database object/public/rename; wrong string-config classification. `forms-receiver.mjs:80,298`. |
| 422 | J `TOVU_FORMS_SECRET` | Request-time secret/rename; also authorizes pull requests. `forms-receiver.mjs:275–280`. |
| 423 | J `TOVU_GOOGLE_PICKER_APP_ID` | Public config read through a port; existing-install compatibility documented. `picker-flow.mjs:29–45`. |
| 424 | J `TOVU_GOOGLE_PICKER_BROWSER_KEY` | Same port, public classification supported; rename requires migration. Same lines. |

## Recurring mistake classes

- Treat env names as an installation compatibility surface. A no-alias policy still requires a deployment-state migration.
- Distinguish OS string environments from native binding namespaces; an object named `env` does not establish its value types.
- Model confidentiality independently from transport and configuration role, including dynamically selected names and credentials embedded in URLs.
- Specify when validation applies and which override wins. A variable’s type and accepted words alone do not define its behavior.
