# Handoff — 2026-09-09 session worklist

Branch `restructure/apps-website-phased`. Written for a second concurrent session.

## FIRST: the task this handoff was written for

Spawn a **web design agent** to redesign `https://localhost:5173/admin/agent-plugins`
(`apps/admin/src/features/plugins/AgentPlugins.tsx`).

Owner's words: **"We gotta make that look better. It looks like shit right now."**

Full brief, collected across the session:

1. **Take the plugins OUT of the card layout.** Today each plugin is a big bordered card with
   stacked label/value rows (VERSION / STATUS / KEYWORDS / PORTABLE COMPONENTS). It reads like a
   database dump. The two real plugins — `site-compliance` and `tovu-deploy-fly` — are the
   things to make look good; go look at them rendered before designing.
2. **Icons on the tab headers** (Installed / Marketplace).
3. **Icons per plugin**, so rows are scannable rather than walls of text.
4. **An enable/disable toggle per plugin**, styled to show applied state. The data is already
   there (`enabled` on each item) and enabling genuinely changes behaviour — an enabled
   plugin's SKILL.md is injected into the assistant's run prompt, a disabled one refuses the
   run. So the toggle is real, not decorative. **A write endpoint does not exist yet** — only
   `GET .../agent-plugins`. Either add the PATCH/POST route or ship the toggle read-only and
   say so; do not fake it.
5. **An eye icon opening a details modal.** `AgentPluginDetailsModal.tsx` already exists and is
   already wired — currently behind an "Inspect package files" button. Reuse it; do not build a
   second modal. Note it degrades honestly to "No source files are catalogued for this package"
   for both real plugins, because its file-tree inspector only knows the vendored `ui-ux-design`
   bytes. That is now true rather than broken, but it means the modal is thin — worth deciding
   whether it should show the manifest/skill content instead of a file tree.
6. **Marketplace tab**: its copy ("does not fetch, install, or list marketplace packages yet")
   is currently TRUE — no install-from-url route exists. Design the empty/disabled state
   honestly rather than mocking a store.

**Prerequisite is already met** — `wire-plugins-page` landed (`842c53b8`, `791c8144`), so the
page reads real data and the static catalog is gone. Design against what renders now.

Repo constraints the design agent must respect:
- Component logic belongs in **hooks**, not `.tsx`.
- A copy string in this admin **is its own i18n key** — changing text changes the key.
- Admin tests run from `apps/admin` with `env -u TOVU_ADMIN_PASSWORD` (must be UNSET;
  empty does not work). `npx tsc --noEmit` there is currently 0 — keep it.
- Complexity ceiling 9.

---

## Landed this session (all verified independently, not taken on report)

| Commit | What |
|---|---|
| `9f223ea7` | **Chat amnesia fixed.** Turn 1 now carries a conversationId, so its agent session persists and turn 2 resumes it. Confirmed live: both turns of a real chat shared CLI session `55e267c2`. |
| `f507fd07` / `9b13baf5` | `content_post_*` kind/status validation returns **400 with the reason**, not a redacted 500. |
| `2a073142` … `a02c8477` | **`pages_write_region`** — edit one `data-agent-element` region instead of rewriting 42KB. Discovery proven against the real 171-tool catalog: ranks #1 for five natural phrasings, and does NOT cannibalise `pages_write_html` for whole-page requests. |
| `43b797b3` | **`tovu-deploy-fly` agent plugin** — `content/agent-plugins/tovu-deploy-fly/`, skill + `fly.toml` / `fly-deploy.yml` templates. Seeds and loads. Never exercised. |
| `00d7edb1` | Adversarial RED tests for two `pages_write_region` bugs (below). Tests only — no production fix. |

Root typecheck `npx tsc -p tsconfig.json --noEmit` was exit 0 at last check.

## Open — needs a decision or a fix

1. **Fragment can duplicate an unrelated handle** (real, contract-violating). Writing region
   `hero` with a fragment containing `<div data-agent-element="cta">` — where `cta` is another
   region already on the page — returns `written: true` and leaves `cta` on two elements.
   `locateRegion` then reports it `ambiguous`. The tool's description promises duplicates are
   "REJECTED rather than guessed at," but the check only runs against the *targeted* handle,
   never against what the fragment introduces. Shared root cause with `pages_write_html`
   (`assertTopLevelSectionsAreTagged` checks "has some handle", never global uniqueness).
   RED test committed. **Unfixed.**

2. **In-memory store check-then-act race.** `InMemoryPagesHtmlDocumentStore.write()`
   (`html-document-store.memory.ts:100`) does `load()` → version check → `save()`, non-atomically.
   Two overlapping writes both pass CAS; the later silently clobbers the earlier. RED test
   committed, reproduced 6/6. **Scope correction:** the real server uses the SQLite store
   (`composition/deps.ts:1194`), whose `write()` is one atomic `UPDATE ... WHERE version = ?`
   and does not have this window. Only the hermetic test/dev root (`app.ts:508`) uses the
   in-memory one. So this is **not production data loss** — it is a test double that does not
   model the real store, which means the write-region suite's own concurrency guarantee is
   unproven. Fix the double or stop claiming CIC-1 parity in its header.

3. **`pages_write_region` has never been exercised in the live chat.** Unit + discovery green;
   no real turn has used it. The check: ask the assistant to change the headline on
   "Landing sample — xai 3" and confirm it reaches for the region tool, not a 42KB rewrite.

4. **19 tool ids + 2 whole tool classes still 500-redact validation errors.** Enumerated (not
   grep-guessed) during the `content_post` fix: `database_query_timeline`,
   `backup_create_restore_point`, `comments_update_settings`, `recovery_resolve_deep_link`,
   `source_control_execute_commit`, `taxonomy_assign_terms`, `external_mcp_save`,
   `SITE_EVIDENCE_TOOL_ID`, `plugins_set_enabled`, `widgets_set_region_placements`,
   `widgets_reorder_embeds`, `deployment_trigger_export`, `deployment_set_dockerfile`,
   `deployment_preview_static_publish`, `deployment_execute_static_publish`,
   `deployment_propose_custom_provider_credential`,
   `deployment_generate_bucket_hosting_setup`, `admin_screen_link`,
   `external_mcp_reauth_prompt`, plus forms (`forms_list_submissions`,
   `forms_set_definition_status`, `forms_update_definition`) — and every Agent Plugin tool and
   every federated external-MCP tool. Same fix shape: bare `Error` → `ToolInputError`. ~14 files.

5. **Media upload pending.** `/Users/la/Downloads/ai-website-hero.mp4` (watermark removed,
   1280×720, 10s, 2.0MB) is meant to be the landing-page hero background. Not yet in the
   media library, not yet placed.

6. **RED test in the tree right now — ours, and trivial.**
   `apps/website/src/features/agent-plugins/__tests__/integration/bundled-inactive-gating.integration.test.ts`,
   case "re-seeding is idempotent": `actual: 2, expected: 1`. It counts bundled digests
   GLOBALLY, so adding `tovu-deploy-fly` as a second bundled plugin broke it. Product is fine;
   the assertion should scope the count to the plugin under test. Reproduced directly (5 pass,
   1 fail).

7. **Update `tovu-deploy-fly`'s SKILL.md.** It documents the `TOVU_INTEGRATIONS_ROOT_KEY` gap
   as unfixed ("Not boot-blocking... undecryptable"). `ddfa5e07` fixed it, so that prose is now
   stale and will mislead an agent that loads the plugin.

## All first-session agents are now DONE

- `fix-root-key` → `ddfa5e07`. **Correction to the original framing:** the four credential
  tables were already fail-closed (`siteAssistantSecretKeyring` is built with
  `allowFileFallback: false`, `deps.ts:1134`). The real silent-rekey surface was only
  `newsletterKeyring`. Now boot-blocking in production.
  **Operational consequence:** if `TOVU_INTEGRATIONS_ROOT_KEY` is not set in fly secrets, the
  next deploy REFUSES TO BOOT (`PRODUCTION_BOOT_UNSAFE_DEFAULT`). Set it first:
  `fly secrets set TOVU_INTEGRATIONS_ROOT_KEY=$(openssl rand -hex 32) -a tovu`
- `build-plugin-search` → `2d36e3bc`. `search_agent_plugin_local`, ranks #1 for 5/6 phrasings
  against the real ~172-tool catalog. Note: Agent Plugins live in `features/agent-plugins/`,
  NOT `features/plugin-runtime/` — those are two different plugin systems and a dispatch
  conflated them. Root `tsc` re-verified post-commit: exit 0.
- `wire-plugins-page` → agent-plugins page now reads real installed state via a new
  `GET /api/admin/v1/workspaces/:workspaceId/agent-plugins`, reusing
  `loadAgentPluginSearchCandidates` rather than writing a second reader. Static
  `agent-plugin-catalog.ts` deleted. Verified in-browser: both real plugins render with real
  version/status/keywords. Admin scoped tests 11 files / 77 pass; admin tsc 0; root tsc 0.
  Committed as `842c53b8` (server route + composition wiring) and `791c8144` (admin client).
  Working tree verified clean afterwards.

## Designed, not built

- **`deployment_trigger_full_site_deploy`** — MVP deploy from chat: fire `workflow_dispatch`
  on the existing `fly-deploy.yml` using the saved GitHub credential, poll, report URL.
  Wraps a pipeline that already works. Not the self-hoster answer.
- **`search_agent_plugin_marketplace`** — deliberately a separate tool from the local one:
  different trust boundary (installs third-party code) and `DERIVED_RISK_BY_TOOL_ID` is keyed
  per tool id, so merging forces one risk band onto both.
- **Region editing for posts** — posts have the same whole-object-replace problem
  (`content_post_update` requires the full `bodyJson`), but a Tiptap doc is already a node
  tree; it needs node-path addressing, not HTML attributes. Share the contract
  (`X_write_region(id, handle, content, expectedVersion)`), not the mechanism.

## Pre-existing test failures — NOT caused by today's work

I reproduced these myself just now (3 files, 53 tests, 44 pass / **9 fail**). They predate
this session and are unowned. Command:

```
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --test \
  --experimental-test-module-mocks \
  "apps/website/src/assistant/__tests__/byok-google-catalog.test.ts" \
  "apps/website/src/assistant/__tests__/tool-registrations.authorization.test.ts" \
  "apps/website/src/assistant/__tests__/tool-registrations.contracts.test.ts"
```

- **1 × `byok-google-catalog.test.ts`** — "EVERY wired tool's outbound Gemini schema is
  structurally valid". Reported upstream as a `seo_set_entry_overrides` enum problem in the
  Gemini schema translation. (The agent that first found it said 2 failures here; I observed 1.
  Treat the count as unconfirmed, the failure as real.)
- **5 × `tool-registrations.authorization.test.ts`** — every `collections_content_type_*` tool
  (`define`, `update_fields`, `deprecate`, `reactivate`, `tombstone`) fails
  "calls authorize() with its catalog's declared permission". Reported as an `entityType`
  mismatch in the content-types domain. **This one is authorization behaviour — worth looking
  at first**, since a permission that doesn't match its declared catalog entry is a security-
  relevant divergence, not a cosmetic test drift.
- **3 × `tool-registrations.contracts.test.ts`** — `content_read.backup_restore_point` is
  missing from `CATALOGS_BY_DOMAIN` (recovery/database domain). Two agents independently hit
  this and both declined to fix it blind.

A separate agent opportunistically fixed neighbouring gaps in these same files (missing
`content-duplication`, `external-mcp`, `media-import`, `sites` entries in
`tool-contribution-registry.test.ts` and `CATALOGS_BY_DOMAIN`) — those are in `2d36e3bc`. The
nine above were deliberately left alone.

## Traps confirmed this session

- **`fly.toml`'s header is stale.** It claims this checkout's only remote is the private
  `Tovu-AI-CMS`. `origin` is now `github.com/leonaburime-ucla/Tovu`, the mirror that deploys.
  The workflow's own setup comments still say `-a tovu-ai-cms` while `fly.toml` says `app = "tovu"`.
- **Deploying ships code, not content.** `sites/*/content.db` is gitignored (`.gitignore:57`).
- **The fly volume shadows the image's entire `sites/` tree** at `/workspace/Tovu/sites`.
- **A vitest path that does not exist is silently skipped and still exits 0.** Always check the
  reported file count against what you passed. This bit once already this session.
