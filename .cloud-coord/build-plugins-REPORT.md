# build-plugins REPORT — agent-plugin lifecycle Phase A (cloud, 2026-10-21)
Branch `cloud/build-plugins-2026-10-21` in Tovu and Jini, based on `cloud/wip-build1-2026-10-21`
(Tovu 0d65c375, Jini c2cd303c). Ran 16:39Z–20:40Z. The T1 builder was paused by a usage limit from 17:1xZ to 19:55Z,
and the owner extended the hard stop to 23:00Z. Agents used: 8 (all Opus), at most 3 at once.

## Lots
| Lot | Status | Jini commits | Tovu commits |
|---|---|---|---|
| J1 compat + requires | DONE | d61908b7, 98500b71 (review fixes) | – |
| J3 update transaction | DONE | 4242b710, 6918e4eb (review fixes) | – |
| T1 wiring + update route/tool/button | DONE | – | 848bcd6b (wip), 7bbbac9a (final + review fixes) |
Progress/report commits (Tovu): ee0203ea, 7274a132, edcf27de, b2d6186c, bcab1897, d8afd466+. Each lot got a separate review subagent; all blocking and should-fix findings were fixed.

## Kept from the WIP vs changed
- J1, kept: compatibility API (`AGENT_PLUGIN_CONTRACT_VERSION` 1.0.0, `PLUGIN_HOST_INCOMPATIBLE`, describe/check/dependent warnings) and update-plan.
- J1, changed:
  - The reader moved to `compatibility-metadata.ts`, because the WIP created a manifest<->compatibility import cycle that failed the type-cycles tests.
  - Dense functions were split to keep complexity at 10 or less.
  - A blank `||` alternative is now rejected. semver reads `'>=99 ||'` as `*`, which would have silently allowed any host.
  - Enable checks every installed digest of the id.
  - Warnings are deduplicated and `requires` ids are trimmed.
- J3, kept: the guard-inside-install design, journal, `rollback/<digest>` area, reuse of stageForRemoval, and the refusals.
- J3, fixed:
  - Boot reconcile crashed on reserved dirs (`staging`, `packages`, …).
  - The audit was only filed on the next boot; it is now filed to update-history at commit or rollback.
  - A stale rollback copy collided with the new one.
  - The `result!` fall-through could return undefined.
  - `published` was set in memory before it was on disk.
  - Review B1–B3:
    - Boot no longer bricks: if MCP fails after the bytes are restored, the plugin is left OFF and rolled back, with an event.
    - MCP is now provisioned before the plugin is re-enabled.
    - Uninstall and set-enabled now refuse `PLUGIN_UPDATE_PENDING`.
  - Symlink-safe rollback paths (`PLUGIN_UPDATE_PATH_UNSAFE`).
  - A plugin that could not be recovered is switched off at boot.
- T1, kept: route/tool shape, row fields, update-effects and the boot step.
- T1, fixed:
  - The settings snapshot was never wired, so every update failed with UPDATE_SETTINGS_OWNER_UNBOUND. It is now `plugin-state.describe()`: keys and revisions only, never values, because the journal is plaintext on disk.
  - The boot step is now optional instead of critical, so one bad plugin cannot stop the server.
  - Errors are mapped to coded 409s, including the new PLUGIN_MCP_PROVISION_FAILED.
  - Unknown 409s are translated in the admin instead of showing the server's English.
  - The update control is props-only and sits in the expanded row, so it fits at 375px.
  - The plugins_set_enabled tool refuses an incompatible plugin before showing the confirmation card.
  - Downgrades are refused at preview too.
  - `updateAvailable` is dropped, per override 4.

## Tests
- Jini agent-plugins: 84 files, 1265 pass, 2 skipped, 0 fail. Baseline was 1193 tests with 7 failing, all from the WIP.
- Tovu website, run file by file: 59 files, 630 tests at the T1 report and 0 fail; the review fixes then took the touched set from 188 to 194, all passing.
- Tovu admin plugins: 39 files, 476 pass.
- Acceptance tests that pass:
  - `hostRange ">=99"` lists hostOk=false, and enabling returns 409 PLUGIN_HOST_INCOMPATIBLE.
  - `requires ["x:y"]` enables with the warning "Needs x:y".
  - Updating an enabled v1 to v2 keeps it enabled at v2, keeps memory, and leaves one digest.
  - A forced activation or MCP failure leaves v1 live with its original state.
  - Bundled plugins are refused for update and never show Update.

## Coverage of touched files (lines/branches/functions %)
- Jini, all 100/100/100: compatibility, compatibility-metadata, update-plan, set-enabled, installed-package-index, manifest, update, update-store, uninstall.
- Tovu website:
  - update-effects 100/100/100, routes install.ts 100/100/100, install-response 100/100/100.
  - install-upload 100/95.8, plugin-state 100/91.5 (the missed branches map to interface lines).
  - set-enabled route 100/95.2, list 100/83.3 (old `?? null` fallbacks).
  - plugin-runtime tool-registrations 98.7/95.7, install-tool 98.7/88.0, uninstall-tool 94.6/88.2. Some of the misses fall on comment lines (tsx source-map offset), but this is not fully 100%, and this report does not claim it is.
  - bootstrap 94.4: the new step is fully covered; the gaps are old code.
- Tovu admin: UpdateControl 100, rules 99.2, use-agent-plugins 100/96.2, install hook 98.5/87.5. The remaining misses are in older code.
- **Deviation:** the 100% target is not met on the large pre-existing Tovu files. Their changed lines are covered.

## Complexity
eslint complexity and cognitive complexity of 10 or less: 0 errors on the new or changed functions in Jini. The Tovu builders report 10 or less on every new or changed function.

## Deviations
1. semver is an optional peer + dev dependency of @jini-ai/agent-plugins, not a plain dependency. `pnpm guard`'s SI rule rejects the plain form; @jini-ai/plugins declares it the same way. The reason given is "same library as site plugins", and Tovu already depends on semver.
2. The boot recovery step is `optional`, not `critical`.
3. Boot recovery provisions MCP as `system:agent-plugin-update-recovery`.
4. Rollback bytes are deleted at the next boot. A stale same-digest rollback copy is removed in-process only when the rename needs it.
5. The admin update UI is inside the expanded row details.

## Needs a LOCAL Chrome look
On the Installed tab:
- the "Not for this Tovu version" and "Needs …" lines (1-line clamp)
- the Update button and upload panel in the expanded details, and its warnings block
- the disable dialog's "X needs Y" lines and its origin-aware copy
- bundled rows show no Update
Check each in dark theme and at 375px.

## LOCAL-RUN NEEDED
- Full Tovu website suite in ONE process. Two blockers, neither from this job:
  - WIP `composition/app.ts` imports `routes/system/site-backups`, which does not exist on this branch (the comments/backups job owns it). Tests that import app.ts only loaded here through a scratchpad resolver stub.
  - The single-process run also ended silently around test 600.
- Full Tovu typecheck: 12 errors existed before this work (site-backups, ContentKernel, consentAudit, …), none in files this job touched.
- No Postgres or Playwright tests were run (owner rule).

## Open owner questions
1. Should uninstall be allowed while an update journal is pending? Today it is refused with PLUGIN_UPDATE_PENDING.
2. update-history grows without bound. What retention policy should it have?
3. Downgrades are refused everywhere, so there is no operator path back to an older version that keeps memory. Is that intended?
4. `planAgentPluginUpdate` treats an absent `enabled` as false. All callers pass a resolved value today. Should the field be made required?
5. The engine manifest still defaults the namespace to "tovu". This was already there and the lint rule flags it.
6. The disable dialog title is still untranslated, as it was before.
7. The root package.json adds `@jini-ai/capability-providers` (comments job) but it is not in package-lock, so `npm ci` fails on this branch. I installed with the pre-WIP package.json and left the file untouched.
