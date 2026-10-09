# Plugin install tests

Plugin journeys run on a fresh seeded SQLite site, API, Vite admin and daemon per test. It reuses
`isolated-journey-site.ts`, journeys login and `admin-chat-driver.ts`. External admin URLs are
rejected; existing servers and the owner's site are never reused. Offline browser cases run by default; chat cases are tagged `@real-service` and excluded unless
`TOVU_E2E_REAL_SERVICES=1`. The old plugin-specific config is retired.

From the repository root:

```sh
npm run e2e:journeys:real -- plugins.pins.journey.ts
```

Prerequisites: the normal repository dependencies and Playwright Chromium must already be
installed. The chat cases need the Local CLI `claude` installed and signed in on this machine;
they run real assistant calls and may incur model charges. No owner password or BYOK key is used.
The command starts/stops its own servers. The legacy suite passed 8/8 on 2026-10-06. The migration is typechecked but its browser execution is pending.

Coverage (test names):

- `UI drop ZIP → Preview → Install appears switched off`
- `UI Choose a folder uploads directory input files then previews and installs`
- `WebMCP fills plugins-install-folder then previews and confirms via document.modelContext`
- `Downloaded rows wrap at container width with a 380px chat dock`
- `chat attaches site plugin ZIP and installs with attachmentRef`
- `chat attaches agent plugin ZIP and installs with attachmentRef`
- `agent plugin ZIP installs off and Replace upgrades 1.0.0 → 1.0.1`
- `cleanup uninstalls every QA fixture installed by the suite`

Source fixtures under `fixtures/plugins/qa-fake-hello/{1.0.0,1.0.1}` are tier-1 site packages
with no code, and integrity covering exactly README.md. `qa-fake-agent/{1.0.0,1.0.1}` contains
plugin.json and one harmless skill. Each case copies its sources into a temporary directory,
assigns unique QA IDs and makes ZIPs with the existing `buildZipFixture` helper (yazl).
The directory-picker case uses `setInputFiles(directory)` on the real `webkitdirectory` input.

Stock Chromium lacks a native WebMCP host. The WebMCP case exposes a registration host on
`document.modelContext`, captures the app's real tool registrations and invokes their execution
methods. It stubs `window.confirm` in-page, expands Advanced, fills the server fixture path through
`page.fill`, then calls `page.click` for Preview and Install. File bytes are never supplied through
WebMCP.

Chat does not probe the catalog (`/api/tools` needs the daemon token, which the browser lacks).
A missing `plugins_install` or `agent_plugins_install` fails the tool_use assertion by name. Zip attachment interception, a missing attachmentRef,
an unsuccessful tool result/run, or a mounted list that stays stale all fail. The suite observes
the Local CLI run request, checks the domain tool's own event and correlated successful result,
and requires source.kind=zip with an opaque attachmentRef and no path. The assistant must leave
the package off. No page reload hides refresh defects.

The agent upgrade case keeps the same ID across 1.0.0 and 1.0.1 and explicitly checks Replace
existing version. Its checkbox, transport and server replacement path must all work; this case
is active, never fixme, and does not substitute a fresh ID for the upgrade.

Cleanup is a per-case fixture finalizer, including when assertions fail. Site packages go through
the authenticated uninstall route (retained in the isolated site's Trash). Agent packages use the
same domain uninstall as `plugins_uninstall`, with an explicit isolated layout because there is
currently no HTTP/UI uninstall. It verifies both lists afterward, attempts both families even if
one fails, removes temp ZIPs and reports cleanup errors. The final case checks for remaining QA
packages. Every new run uses a new site and IDs; failed cleanup can never touch the owner's site.
The shared cleanup reporter verifies removal of the whole isolated site; failure logs are attached
to each test as `pin-server.log`.

Unit regressions and admin types (coordinator execution):

```sh
npm --prefix apps/admin test -- plugin-install-size plugin-list-refresh AgentPlugins --maxWorkers=1 --no-file-parallelism
npm --prefix apps/admin run typecheck
```

Unit regression names:

- `shows %i bytes as %s on both add tabs` (0 B, 83 B, 12 KB, just under 1 MiB, 1 MiB)
- `opens the URL add tab and follows subsequent URL tab changes`
- `guards invalid URL tab %s with Installed`
- `re-reads installs and uninstalls on the existing assistant refresh bridge without remounting`
- `an older Agent Plugins read cannot resurrect a plugin removed by a newer assistant write`
- `an older Agent Plugins refresh cannot hide a just-installed UI row`
- `requires explicit Replace for an upgrade and clears it for the next archive`
- `choosing a different archive revokes the previous Replace choice`
- `sends explicit replace=%s with the archive digest`

These regression contracts cover the pre-fix behavior; no RED or GREEN execution evidence was
produced under the dispatch's no-tests rule. The layout regression is the browser case above,
because jsdom cannot measure container layout.

Files in this UI/E2E change (including the retained interrupted-run edits):

- `apps/admin/src/features/plugins/`: `AgentPlugins.tsx`, `AddAgentPluginPanel.tsx`, `rules.ts`.
- Its `hooks/`: `use-agent-plugin-tab.hooks.ts`, `use-plugins.hooks.ts`,
  `use-agent-plugins.hooks.ts`, `use-plugin-install.hooks.ts`,
  `use-agent-plugin-install.hooks.ts`, `agent-plugin-install-port.hooks.ts`,
  `agent-plugin-install-dependencies.hooks.ts`.
- Its `__tests__/`: `AgentPlugins.unit.test.tsx`, `AgentPluginsAddTab.unit.test.tsx`,
  `plugin-install-size.unit.test.ts`, `plugin-list-refresh.unit.test.ts`.
- `apps/admin/src/components/InstallTabCard/install-archive-size.ts`,
  `apps/admin/src/panels.tsx`, `apps/admin/src/styles.css`.
- `development/e2e/journeys/plugins.pins.journey.ts`, `development/e2e/support/plugin-install-fixtures.ts`,
  `development/playwright.journeys.config.ts`, this runbook.
- `development/e2e/fixtures/plugins/qa-fake-hello/{1.0.0,1.0.1}/{tovu.plugin.json,README.md}`.
- `development/e2e/fixtures/plugins/qa-fake-agent/{1.0.0,1.0.1}/plugin.json` and each version's
  `skills/qa-fake-agent/SKILL.md`.

The upload-size formatter is temporarily in Tovu because this dispatch forbids package builds
and installs. Its Jini extraction candidate is already recorded in
`ADS-memory/.local-artifacts/tovu-to-jini-extract/SURVEY.md`; no shared platform module or new
archive dependency was added.

To run browser install/layout cases without live chat charges:

```sh
npm run e2e:journeys -- plugins.pins.journey.ts
```
