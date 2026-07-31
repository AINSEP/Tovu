# Recon: Open Design `SettingsDialog` → Tovu Port Trace

- Date: 2026-07-31
- Author: Coordinator (Claude Opus 5, 1M context) — Review Mode, single-agent (subagent support unverified on this host)
- Status: TRACE COMPLETE — awaiting spec/plan go-ahead
- Scope decision: "Trace first, then decide" (user, this session)

Evidence basis: direct reads of the three repos named below at the SHAs/paths cited. Every
claim in this document is grounded in an inspected file. Two explicit uncertainties are
marked **[UNVERIFIED]**.

---

## 0. Decisions locked this session

Recorded verbatim because they constrain everything downstream.

| # | Decision | Answer |
|---|---|---|
| D1 | How far this pass goes | **Trace first, then decide.** Deliverable is this inventory; build follows a separate go-ahead. |
| D2 | UI shape in Tovu | **Both screens side by side.** New curated tabbed surface ships as its own thing; existing SPEC-007 ledger browser (`apps/admin/src/sections/Settings.tsx`) stays untouched at its current route. |
| D2b | Modal *and* page | **Both.** Must render as a modal dialog *and* as a settings page, host's choice. (Added mid-session.) |
| D3 | Nav consolidation | Fold **Appearance**, **Integrations & API**, **Workspace** in as tabs — **but make it reversible.** User is exploring, not committing: "make this undoable as I don't know what I want to do yet but want to see how it looks." |
| D4 | Code reuse | **Import from `@jini-ai/ui`.** Maximize what gets reused *for* Jini — push gaps upstream rather than forking into Tovu. |
| D4b | Styling | **Default to Open Design's styles, overridable.** "Open Design styles are really good though." |
| D5 | Tab set | **Everything except Design Jury, Design Systems, Pets.** (Added mid-session.) |
| D6 | Composability | Host picks and chooses which tabs mount. |

---

## 1. The three layers

### Layer 1 — Open Design (source)
`/Users/la/Programming/OSS-Repos/open-design`, branch `main` @ `958cc8871`, package version `0.15.1`.

`apps/web/src/components/SettingsDialog.tsx` — **8,539 lines**. `SettingsSection` union at
line 195 declares 19 tokens. The rendered sidebar nav (lines 3904–4075) mounts **16** of
them; `orbit` and `routines` are deep-link-only (no nav button); `library` is a dead letter
routed elsewhere and carries its own reconcile TODO in the source.

**The shell is separable.** 8 of the 17 real tabs are *already* separate files the dialog
merely mounts. The god-component mass concentrates in the tabs never split out
(`execution`, `orbit`, `media`, `composio`'s own key UI, `integrations`, `about`) plus
shared shell state (agent scan, AMR polling, autosave).

### Layer 2 — Jini (the head start — larger than "most of it" in one dimension, smaller in another)
`/Users/la/Programming/Jini`, `packages/ui` = `@jini-ai/ui` v0.1.2.

`packages/ui/src/features/settings-dialog/` ships the extracted **shell**
(`SettingsDialogShell` + `useSettingsDialogShell`) plus **6 tabs** — appearance,
notifications, language, instructions, privacy, integrations — ~3,885 lines including
tests, all exported from the barrel (`packages/ui/src/index.ts:25–31`).

Prior analysis worth not repeating: `foundry/docs/jini-port/recon/r6-god-component-internals.md`
§1.3 (the 18-tab classification) and
`foundry/automation/project-runner/cloud-routine-prompts/settingsdialog-extraction.md`
(the extraction brief that produced the 6 tabs).

Adjacent Jini features that cover *more* OD settings tabs but were extracted under separate
briefs: `features/memory/`, `features/source-config-list/`, `features/connectors/`.

### Layer 3 — Tovu (target)
`/Users/la/Programming/Tovu`, branch `feat/ai-chat-persistence`.

**The substrate is mature; the product surface is missing.** Tovu has a full settings
backend — ADR-028 layered ledger + SPEC-007: `setting_definitions` schemas-as-data registry,
`user ?? workspace ?? global ?? default` resolver, single write chokepoint, append-only
revisions, the `settings.*` permission catalog, 5 admin routes
(`src/server/routes/admin/settings/`), and agent tools.

What it does *not* have is a curated settings UI. `apps/admin/src/sections/Settings.tsx`
(909 lines) is a **raw namespace/key ledger inspector** — its own header documents that the
operator must *type a namespace* because no listing endpoint shipped. That is precisely the
gap this port fills, which makes the port additive rather than duplicative.

`apps/admin` **already depends on `@jini-ai/ui`** (`file:` link) and already consumes
`@jini-ai/ui/chat` in `App.tsx`, `AssistantDock.tsx`, and `lib/assistant-transport.ts`. D4's
import path is a proven one, not a new integration.

---

## 2. Tab inventory — authoritative

Order is the rendered sidebar order from `SettingsDialog.tsx:3904–4075`. "Want" reflects D5.

| # | Nav label | Section token | Want | Jini status | Tovu backing today |
|---|---|---|---|---|---|
| 1 | Execution mode | `execution` | ✅ | **Not extracted.** MIXED: AMR/Vela wallet + local-CLI agent chrome wrapping already-extracted `byok/*` components | None. No provider/model/BYOK config found in `src/assistant/` |
| 2 | Instructions / Rules | `instructions` | ✅ | **Extracted** (`tabs/instructions/`) — plain textarea → `string \| undefined` | None; trivially a ledger-backed `core.*` string |
| 3 | Memory | `memory` | ✅ | **Adjacent** — `features/memory/` (extracted under a separate brief) | Partial: `src/assistant/persistence` (chat history), not a memory-settings surface |
| 4 | Media providers | `media` | ✅ | **Not extracted.** OD-specific data, generic-ish shape; a second unshared re-implementation of the byok pattern | None |
| 5 | Skills | *(see §3)* | ✅ | **Not extracted** | None |
| 6 | External MCP | `mcpClient` | ✅ | **Adjacent** — `features/source-config-list/` | **Real analog**: `src/assistant/mcp-federation/`, `mcp-injection.ts` |
| 7 | Connectors | `composio` | ✅ | **Adjacent** — `features/connectors/` (Composio key mgmt itself is vendor-specific) | None |
| 8 | MCP server | `integrations` | ✅ | **Extracted** (`tabs/integrations/`) — multi-client install-snippet generator, `serverName` parameterized, purity-verified | **Real analog**: `src/assistant/agent-daemon-server.ts`, `daemon-auth.ts` |
| 9 | Language | `language` | ✅ | **Extracted** (`tabs/language/`) — host supplies `LocaleOption[]`; OD's 19-locale table deliberately not ported | **None.** No i18n/locale module in `src/features` or `src/` |
| 10 | Appearance | `appearance` | ✅ | **Extracted** (`tabs/appearance/`) — theme `system\|light\|dark` + accent picker | **Different concept** — see §4 collision |
| 11 | Design Jury | `critiqueTheater` | ❌ excluded | n/a | n/a |
| 12 | Notifications | `notifications` | ✅ | **Extracted** (`tabs/notifications/`) — sound toggle/picker + browser Notification permission; browser-API only | None |
| 13 | Pets | `pet` | ❌ excluded | n/a | n/a |
| 14 | Design Systems | `designSystems` | ❌ excluded | n/a | n/a |
| 15 | Project locations | `projectLocations` | ✅ | **Not extracted** (own file) | None; concept may not map to a CMS — see §7 OQ-2 |
| 16 | Privacy | `privacy` | ✅ | **Extracted** (`tabs/privacy/`) — telemetry consent + installation-id rotate. r6 flagged it unverified; the extraction brief verified it generic | None |
| 17 | About | `about` | ✅ | **Not extracted.** OD/Electron-specific: version/updater/diagnostics | None |
| — | *(deep-link only)* | `orbit` | — | Not extracted (~800 lines, OD autonomous agent runs) | n/a |
| — | *(deep-link only)* | `routines` | — | Not extracted (own file) | n/a |
| — | *(dead letter)* | `library` | — | n/a — routed elsewhere, not a dialog tab | n/a |

**Tally against D5: 14 tabs wanted. 6 already extracted in Jini. 3 have adjacent Jini
features under different briefs. 5 are unextracted.**

---

## 3. The Skills discrepancy — flagged, not papered over

Your screenshot shows **Skills** as a Settings tab between *Media providers* and *External
MCP*. **It is not in this checkout's Settings nav.** In `main` @ `958cc8871`,
`SkillsSection.tsx` (994 lines) is imported and mounted by `IntegrationsView.tsx:14,172` —
not by `SettingsDialog.tsx`. There is no `'skills'` token in the `SettingsSection` union.

Your running build therefore differs from the local checkout. **[UNVERIFIED]** which
direction — whether Skills was moved *out* of Settings after your build, or is being moved
*in* on a branch not checked out here.

This does not block the port: `SkillsSection.tsx` is a standalone component that a settings
shell can mount like any other panel. It only changes provenance — Skills comes from
`IntegrationsView`, not from the dialog. **Worth confirming your OD version before we
spec Skills**, since a 994-line component that just moved houses may be mid-refactor upstream.

---

## 4. Two label collisions in Tovu's nav (D3 is not a clean fold)

Both existing Tovu sections share a *name* with an OD tab but not a *capability*. Folding
them in as-is would put unrelated things under one label.

**Appearance.** Tovu's `apps/admin/src/sections/Appearance.tsx` (70 lines) activates
**server-side site themes** (`tovu-official`, `column`, `signal`) via
`api.getPresentation()`/`api.setActiveTheme()`. OD's appearance tab is a **client chrome
preference** (light/dark/system + accent color). These are different settings that happen to
share a word. ADR-028 already anticipates the Tovu side: theme presets become `theme.{id}`
settings and `PresentationSettingsRepoPort` retires into `core.presentation.activeThemeId`.

**Integrations & API.** Tovu's `apps/admin/src/sections/Integrations.tsx` (157 lines) manages
**outbound webhook subscriptions**. OD's `integrations` tab is an **"install me as an MCP
server" snippet generator** — the opposite direction. Note the ordering trap: OD's tab is
labeled *"MCP server"* in the nav, and OD's *"Connectors"* label maps to the `composio`
token. Matching on labels rather than tokens will wire the wrong panels.

**Workspace** has no OD counterpart; folding it in is purely a Tovu IA call, and it resolves
SPEC-044 OQ-04 which `apps/admin/src/nav.ts:189` records as explicitly open.

Given D3's "make this undoable," the fold should land behind a single tab-registry constant
so reverting is a one-line edit, not a refactor. See §6.

---

## 5. Styling — how OD's look actually travels

This is the trace's least obvious finding and it directly governs D4b.

**OD styles the dialog with global CSS classnames, not CSS modules.** There is no
`SettingsDialog.module.css`. The component emits `modal-backdrop`, `settings-chrome`,
`settings-nav-item`, `field`, `hint`, etc.

**The dialog chrome CSS lives in exactly one file** — despite OD's 74,761 total CSS lines
spread across 42 stylesheets, every core selector (`.settings-dialog`, `.settings-chrome`,
`.settings-nav`, `.settings-sidebar`, `.settings-content`) is defined in
`apps/web/src/styles/workspace/mention-home.css` (2,567 lines; the settings block runs
roughly lines 281–1630). The filename is misleading; the containment is real and it is good
news for the port.

It depends on two shared stylesheets: `styles/tokens.css` (203 lines of CSS custom
properties — `--bg`, `--bg-panel`, `--border`, `--text`, `--accent: #c96442`, semantic
status tints) and `styles/primitives.css` (340 lines — `.field`, `.hint`, buttons).

**Jini's extracted shell ships zero CSS and renamed every class.** No `.css` file exists
under `features/settings-dialog/`. The shell emits `jini-settings-dialog-backdrop`,
`jini-settings-dialog-chrome`, `jini-settings-dialog-nav-item`, `jini-settings-dialog-sidebar`,
`jini-settings-dialog-content`, etc. `@jini-ai/ui` ships only two stylesheets overall
(`react/chat/styles/reference.css`, the remixicon font). **So the extracted components are
structurally faithful and visually naked.**

**Consequence:** "default to OD styles, overridable" is achievable and has one clean shape —
a theme stylesheet that (a) lifts the ~1,350-line settings block from `mention-home.css`,
(b) rewrites its selectors onto the `jini-settings-dialog-*` names, and (c) keeps
`tokens.css`'s custom properties as the top-level override seam. Redefining a handful of
`--` tokens in Tovu then restyles the whole dialog without forking a single rule. That is
the override mechanism, and it is the reason to lift tokens rather than inline hex values.

**One judgment call to make before shipping it upstream (D4).** Jini's `scripts/guard.ts`
enforces product neutrality on `packages/@jini` — no OD names, imports, or string identities.
Class names would be `jini-*` (neutral) and spacing/layout rules carry no identity. But
`--accent: #c96442` is literally OD's brand color. Shipping it as `@jini-ai/ui`'s *default*
theme is defensible if the stylesheet is opt-in and neutrally named; it is still a call the
guard's owner should make deliberately rather than discover in review.

---

## 6. D2b and D6 are already satisfied by the extracted shell

Confirmed by reading `SettingsDialogShell.tsx`'s prop contract — no new work needed:

- **Modal *and* page (D2b).** `onClose` is optional, documented: *"Omit to render the shell
  without a close affordance — e.g. embedded inline rather than as a modal overlay."*
  Same component, both surfaces.
- **Composability (D6).** The shell is generic over `tabs: readonly T[]`, each
  `{ id, label, icon?, panel: ReactNode, ... }`. It *"carries no opinion about what any tab
  contains"* — a host supplies any mix of this package's own `tabs/*` components and fully
  product-specific ones. Pick-and-choose is the designed-in behavior.
- **Reversible nav fold (D3).** Falls out of the same design: the tab array is a host-owned
  constant in Tovu. Adding or removing Appearance/Integrations/Workspace is editing one
  array plus the corresponding `nav.ts` entries — genuinely undoable.

Also available and relevant: controlled/uncontrolled `activeTabId`, `welcome` hero variant,
sidebar collapse, fullscreen toggle, `chromeExtra` slot (OD uses this shape for its autosave
indicator), and `dialogAriaLabelledBy`.

---

## 7. Gap analysis — what the build actually costs

**Free (import and wire):** Instructions, Language, Appearance, Notifications, Privacy, MCP
server. 6 of 14. Each needs Tovu-side plumbing to the settings ledger, not component work.

**Cheap-ish (adjacent Jini feature exists, needs mounting + a port impl):** Memory, External
MCP, Connectors. 3 of 14.

**Real extraction work (unextracted in Jini):** Execution mode, Media providers, Skills,
Project locations, About. 5 of 14. Per D4 these should be extracted *in Jini first* and
consumed — which is the right long-term call and the slower one per tab. Execution mode is
the hardest: r6 classifies it MIXED, and its AMR/Vela wallet chrome is genuinely OD-bound
and must be left behind.

**Backend work Tovu does not have at all.** Tovu has **no i18n/locale module**, **no
notifications subsystem**, **no telemetry/privacy consent**, **no media-provider registry**,
and **no BYOK/provider config**. Verified by grep across `src/` and `apps/admin/src/`.

> **CORRECTION (2026-07-31, same session).** The paragraph above is true about *Tovu* but
> framed the lift wrong, because I had not yet checked whether **Jini** has these. It mostly
> does — see §7a. The job is **not** "build five subsystems from scratch"; it is "Tovu has no
> client of these existing Jini packages yet." That is a wiring-and-adapter job, not a
> greenfield design job, and it is a materially smaller and better-shaped program.

### 7a. Where each subsystem already lives in Jini (answers "where do we put it")

Verified by reading `packages/*/package.json` descriptions and `packages/*/src` listings.

| Subsystem | Jini home | Evidence | Verdict |
|---|---|---|---|
| Media-provider registry | `@jini-ai/media` | `capability-registry.ts`, `providers.ts`, `policy.ts`, `dispatch/`, `task-store.ts` — "multi-provider image/video/audio generation gateway" | **Exists.** Media providers tab has a real backend. |
| Memory | `@jini-ai/memory` | `note-store.ts`, `extract-facts.ts`, `entry-frontmatter.ts` | **Exists.** |
| External MCP + MCP server | `@jini-ai/mcp` | `client/`, `server/`, `agent-install/` | **Exists**, and covers both directions (the two tabs are mirror images). |
| Connectors | `@jini-ai/composio` | `catalog.ts`, `service.ts`, `composio-config.ts` | **Exists.** |
| Execution mode — Local CLI | `@jini-ai/agent-runtime` | `detection.ts`, `auth.ts`, `capabilities.ts`, `amr-profile-resolver.ts` | **Exists.** |
| Execution mode — BYOK | `@jini-ai/agent-runtime/src/providers/*` + `@jini-ai/http-kit/src/model-proxy.ts` | `anthropic-messages.ts`, `aihubmix.ts` | **Exists.** |
| Telemetry | `@jini-ai/agent-runtime/src/telemetry-sink.ts` | sink only | **Partial** — a sink exists; consent state//rotation is the Privacy tab's own `PrivacyConsentState`, already extracted. |
| i18n / locale | `@jini-ai/ui/src/features/i18n` | `context.tsx`, `locale.ts`, `types.ts`; plus `utils/localized-url.ts` | **Exists (UI-side).** `I18nProvider`/`useT` is what the extracted tabs already bind to. |
| Notifications | `@jini-ai/ui/src/utils/notifications.ts` | the `SoundId` type the extracted Notifications tab already imports | **Exists (browser-side).** |
| Project locations | `@jini-ai/platform` | `fs.ts` (containment), `home-expansion.ts` (`~/` expansion), `resource-paths.ts` | **Exists.** Purpose-built for OS paths. |
| About / diagnostics | `@jini-ai/diagnostics` | `manifest.ts`, `redaction.ts`, `zip.ts`, `agent-logs.ts` | **Exists** (shell-only for now per D-OQ3). |

**Net:** every wanted tab has a Jini backend home already. What's missing is (a) UI extraction
for 5 tabs, (b) Tovu-side adapters implementing each feature's port, (c) ledger definitions.

**Where every ported setting should land:** as `setting_definitions` rows in namespace
`core.*` / `site.*`, written through the existing chokepoint, so the curated tabs and the
raw ledger browser (D2) are two views of one store rather than two stores.

---

## 8. Open questions — ALL RESOLVED (user, 2026-07-31)

- **OQ-1 — Skills provenance.** **RESOLVED:** extract Skills and put it in Jini regardless of
  which direction it moved in OD. Source is `apps/web/src/components/SkillsSection.tsx` (994
  lines), currently mounted by `IntegrationsView.tsx`.
- **OQ-2 — Project locations.** **RESOLVED:** yes, it is the OS filesystem path (mac/Windows)
  where a project lives — confirmed by the user, corroborated by `@jini-ai/platform`'s
  `home-expansion.ts` / `fs.ts` / `resource-paths.ts`. **Tovu has a real analog**, contrary to
  my earlier "possibly nothing": Tovu is local-first with configurable roots —
  `TOVU_CONTENT_DB` (`src/cli/commands/serve.ts:58`, `src/index.ts:22`), `TOVU_THEMES_DIR`
  (`src/server/routes/types.ts:139`), `TOVU_MEDIA_UPLOADS_DIR` (`src/server/deps.ts:111`),
  plus `themesDir` (`src/server/app.ts:337`). The tab becomes: content-DB path, uploads root,
  themes dir.
- **OQ-3 — About.** **RESOLVED:** ship a dummy shell now, fill in later.
- **OQ-4 — Inert settings.** **RESOLVED:** ship inert, delete later if unused.
- **OQ-5 — Theme neutrality.** **RESOLVED:** use OD's theme as the default and keep it
  overridable, but do not invest in override machinery yet — default only for now.

---

## 9. Execution plan

Ordered so each phase lands something usable and nothing blocks on a later phase. Phases 1–3
write to the **Jini** repo (own branch, Jini's guard/purity/i18n discipline); phases 4–5 write
to **Tovu**.

| Phase | Work | Repo | Depends on |
|---|---|---|---|
| **1. Theme** | Lift the settings block of `mention-home.css` (~lines 281–1630) + `tokens.css` custom properties onto the `jini-settings-dialog-*` selectors; ship as an opt-in stylesheet export. Default = OD's look; override seam is the token layer, which falls out for free. | Jini | — |
| **2. Skills** | Extract `SkillsSection.tsx` (994 lines) into `features/settings-dialog/tabs/skills/` following the `settingsdialog-extraction.md` brief pattern (new layout, `useT()` i18n, ports, purity grep). | Jini | — |
| **3. Remaining 4 tabs** | Extract Execution mode, Media providers, Project locations, About (dummy shell). Execution mode is the hard one — r6 classifies it MIXED; leave the AMR/Vela wallet chrome behind. | Jini | 2 (pattern) |
| **4. Tovu shell** | Mount `SettingsDialogShell` in `apps/admin` as **both** modal and page over one host-owned tab array. Ledger-backed via the existing chokepoint; new curated surface ships beside the untouched SPEC-007 browser (D2). | Tovu | 1 |
| **5. Tovu adapters** | Per-tab port implementations + `core.*`/`site.*` `setting_definitions`. Inert where no runtime consumes them (D-OQ4). Reversible nav fold of Appearance / Integrations / Workspace behind one constant (D3). | Tovu | 4, 3 |

Phase 4 is the proof point: it exercises shell → tab → ledger → both render modes → OD theme
end to end, after which every remaining tab is additive against a working seam.
