# Build briefs: 2026-10-21 index

Code basis: `tovu-int` @ `integration/2026-10-20` (e0c935bb5), `jini-int` @ b3c4144b. Each job runs as an Opus
coordinator with ≤3 subagents and a 4h cap, runs unit/integration tests only, and leaves visual checks to a local Chrome pass.

| # | Feature (brief) | Lots | Repo(s) | Cloud-buildable | Local Chrome look | Size | Order / wave |
|---|---|---|---|---|---|---|---|
| 4 | Theme preview switcher admin (`theme-switcher-admin.md`) | 2 (L1 rules+port, L2 card+mount) | Tovu | Y | Y (card + real banner at 375px) | S | Wave 1 |
| 1 | Import & Export panel (`import-export.md`) | 3 (L1 backup routes, L2 shell+reuse, L3 Git-backup tab) | Tovu | Y | Y | M | Wave 1 |
| 3 | Cookie Consent admin (`cookie-consent-admin.md`) | 3 + 1 gated (C1 port, C2 Jini fields+preview, C3 page; C4 custom categories after owner Q2) | Tovu + Jini (`admin/consent`; C4 also `cms/consent`) | Y (C1–C3); C4 after owner answer | Y (preview fidelity, mobile, a11y) | M (L with C4) | Wave 1 |
| 6 | Google Picker, system browser (`google-picker-system-browser.md`) | 2 (hosted path via system-browser flow + tests; host/desktop link+inbox tests) | Tovu (`content/agent-plugins/google-workspace`), maybe Jini `agent-plugins/admin-surfaces`, desktop | Partly (mechanism + fakes; real Google = local) | Y | S–M | Wave 1, **or** Wave 2 if it touches Jini agent-plugins |
| 2 | Plugin lifecycle + Marketplace (`plugin-lifecycle-marketplace.md`) | 6. Phase A: J1 compat/requires, J3 update, T1 wire+origin. Phase B: J2 catalog port, T2 marketplace backend, T3 tab UI | Jini `agent-plugins` + Tovu | Y | Y (Marketplace tab, rows) | L | Wave 2 (A), then Wave 3 (B) |
| 5 | Comments as plugin (`comments-plugin-DESIGN.md`) | none: design only | Jini `capability-providers/comments` (new, visitor-auth pattern) + `cms/comments` + Tovu | N (owner answers first) | (later) | L (when built) | After owner answers 3 Qs |

## Parallel safety (who touches what)
- **Wave 1 (3 jobs at once)**: theme-switcher, import-export and consent.
  - Theme-switcher touches only `apps/admin/src/features/themes/*`.
  - Import-export touches `apps/admin/src/features/import-export/*`, `features/sites/index.ts`, `apps/website/src/features/site-backup/*`, `routes/system/site-backups.ts` and the route registration in `composition/app.ts`.
  - Consent touches `apps/admin/src/features/consent/*` and Jini `packages/admin/src/consent/*`.
  - **Shared file:** `apps/admin/src/panels.tsx` is edited by both import-export (its existing entry ~1017) and consent (a new Marketing entry ~1114+). The hunks sit in different regions, so the merge is trivial, but merge one at a time.
- Google Picker can join Wave 1 only if it stays inside `content/agent-plugins/google-workspace/` and desktop. If it needs Jini `agent-plugins/admin-surfaces`, run it after plugin Phase A. Both lots would otherwise edit and rebuild the same Jini package.
- Plugin lifecycle goes alone in Wave 2/3. It owns Jini `packages/agent-plugins/src/lifecycle/*`, Tovu `features/agent-plugins/*`, `routes/agent-plugins/*` and admin `features/plugins/*`.
- Jini package rebuilds (`@jini-ai/admin` for consent, `@jini-ai/agent-plugins` for plugins) happen only after review (memory: the runner auto-rebuild ships unreviewed code).
- Live tree: **no job writes to `/Users/la/Programming/Tovu`.** The consent conflict note is in `cookie-consent-admin.md`.

## Surprises found while mapping
1. **Import & Export is mostly built already.** Whole-site `.tovu.zip` export and import have working screens under Sites → Export Site / Import Site (owner, 2026-10-18), and static HTML export lives under Deployment. The only genuinely missing UI is **Git backup**: tools exist, but there is no HTTP route or screen.
2. **Cookie consent backend is complete in the clone.** Revisions, publish, preview, readiness and tools all exist, and Jini already ships a `ConsentSettingsPanel`. However, the Tovu admin hook (`features/consent/settings.hooks.ts`) targets the *legacy ledger* rather than the revisions API, and **nothing renders it**.
3. **The live tree's uncommitted consent files** (`public-http/middleware/site-consent.ts` and the `composition/app.ts` mount) are an **older copy** of what the clone already committed (`d2126748f`). They will conflict on merge; owner OK is needed to discard them.
4. **Comments are never shown on the public site.** Submission and moderation exist, but no theme renders a thread or form (`listThreadForEntry` has no Tovu caller). The engine is already designed as "the Comments bundled plugin (ADR-031)" with plugin-owned `p_comments__*` tables, so moving to a plugin needs **no data migration**.
5. **Plugin activate/deactivate, settings screens (sandboxed admin surfaces), install and uninstall are all done.** What's missing is update-while-enabled, compatibility/`requires`, `origin` on the wire and the Marketplace. `installAgentPluginFromUrl` has no production caller.
6. **Google Picker system-browser mode is already coded** for desktop. The open problem is the *hosted* in-frame Picker breaking under the sandbox. Proving either path requires the owner's Google keys locally.
7. The theme preview switcher's server side validates writes made through the generic settings API, so the admin card needs no server change.

## Owner questions collected (answer before or with dispatch)
- Import/Export: should the Sites Export/Import tabs stay, or become links? Is scheduled git backup wanted?
- Plugins: who hosts the first catalog index? Should missing `requires` only warn?
- Consent: Marketing or Administration? Does "custom categories" mean new categories or editable built-ins? Discard the stale live-tree consent files?
- Theme switcher: approve the a26/thetayway demo-file removal (manual, local, after a visual check).
- Comments: agent plugin or site plugin? One provider per site? Build the public thread + form in this move?
