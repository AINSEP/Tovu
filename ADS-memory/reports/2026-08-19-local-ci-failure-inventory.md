
### src/server/http/site/__tests__/render-handlebars.test.ts  (9)
  - [|-] renderSite renders the live themes/handlebars/ledger home page: header/footer components, entry rows, escaped titles, no leftover Handlebars syntax
  - [|-] renderSite renders the live ledger entry (post) page: content injected raw, title escaped in body and in the shell
  - [|-] renderSite escapes a hostile post title rather than emitting it as markup (autoescaping is on, mirroring Liquid's outputEscape)
  - [|-] renderSite falls back to the minimal built-in body (never 500s) when a handlebars theme's source is hostile at render time
  - [|-] renderSite falls back rather than throwing when a handlebars template is a syntax error
  - [|-] renderSite falls back when a handlebars theme has no template for the requested route (partial theme never 500s)
  - [|-] renderSite (Handlebars tier): {{render_block region="footer"}} resolves the same widget list over the same seam the Liquid tier uses (ADR-047 §2a)
  - [|-] renderSite (Handlebars tier): an unknown component id degrades to a comment, not a crash
  - [|-] both logic tiers see the identical render-data contract — the same fields resolve in Liquid and in Handlebars

### src/server/http/site/__tests__/render.test.ts  (9)
  - [|-] renderDocNode: an image node no longer vanishes — it degrades to the media placeholder using alt text as the label, and never emits src/title (D7)
  - [|-] renderDocNode: an image node with no/non-string alt falls back to a generic 'Image' label, never crashes
  - [|-] renderDocNode: a legacy src-only node still degrades to the placeholder even when mediaTransformVersions is non-empty — the ref path only activates on assetId+transformName, never on src
  - [|-] renderSite (Slice 2): a data-embed-type="widget" embed substitutes to its resolved widget IR; an id with no matching entry in the resolved map degrades to the REQ-28 placeholder
  - [|-] renderSite (Slice 2): an html Page's embed placeholders degrade safely when pageHtmlEmbeds is omitted entirely — never leaks the raw data-embed-type markup
  - [|-] renderSite (Slice 2): an unknown embed type degrades to the REQ-28 placeholder exactly like a known-type resolution failure — render.ts never distinguishes the two externally
  - [|-] renderSite (Slice 2, media): a resolved data-embed-type="media" embed renders a real <img> through the same /m/ URL contract the TipTap ref-image case uses
  - [expected exactly one <img> tag in the rendered page] renderSite (Slice 2, media): width/height/class are each omitted independently when null, never a zeroed/empty attribute
  - [|-] renderSite (Slice 2, media): a malformed media-image IR (missing assetId — should never happen from this codebase's own resolver, defense-in-depth only) degrades to the ordinary widget placeholder rather than a malformed <img>

### src/core/embeds/__tests__/marker.canary.test.ts  (7)
  - ["ENOENT: no such file or directory, open '/Users/la/Programming/Tovu/src/themes/static/basic/pages/index.html'"] canary: every marker in every migrated theme file parses, with zero rejections
  - ["ENOENT: no such file or directory, open '/Users/la/Programming/Tovu/src/themes/static/basic/pages/index.html'"] canary: no theme still carries an attribute from the retired vocabularies
  - ["ENOENT: no such file or directory, open '/Users/la/Programming/Tovu/src/themes/static/basic/pages/index.html'"] canary: the nav partial marker carries type, id, and its current-page key
  - ["ENOENT: no such file or directory, open '/Users/la/Programming/Tovu/src/themes/static/basic/pages/signin.html'"] canary: the footer variant survived as a config key, not a lost attribute
  - ["ENOENT: no such file or directory, open '/Users/la/Programming/Tovu/src/themes/static/basic/pages/blog-sidebar-template.html'"] canary: the docs sidebar keeps its tree variant AND its authored fallback content
  - ["ENOENT: no such file or directory, open '/Users/la/Programming/Tovu/src/themes/static/basic/pages/blog-post.html'"] canary: the real theme's content-slot marker carries no id, and a real id can be added without breaking the JSON
  - ["ENOENT: no such file or directory, open '/Users/la/Programming/Tovu/src/themes/static/basic/pages/blog-sidebar-template.html'"] canary: other authored attributes on a marker element are preserved verbatim

### src/server/__tests__/assistant-byok-routes.test.ts  (7)
  - [expected a tool_use event on the wire] /api/admin/v1/assistant/byok-turn runs a REAL admin tool through a BYOK provider turn and streams a real result back
  - [expected a tool_result event] /api/admin/v1/assistant/byok-turn (openai protocol): a FAILED tool call folds isError into the content string, not a discarded field
  - [expected a tool_result event] /api/admin/v1/assistant/byok-turn (azure protocol): a real tool round-trips through the OpenAI-compatible chat/completions wire shape
  - [expected a tool_result event] /api/admin/v1/assistant/byok-turn (google protocol): a real tool round-trips through Gemini's streamGenerateContent wire shape
  - [the stream ended before raising a confirmation dialog — the tool did not park] /api/admin/v1/assistant/byok-turn: content_post_delete PARKS via a real emitSurface, and redeeming the confirmation through the LOCAL (non-daemon) delivery path actually deletes the post
  - ["Cannot read properties of undefined (reading 'payload')"] /api/admin/v1/assistant/byok-turn: cancelling the same confirmation dialog leaves the post untouched
  - [expected the confirmation dialog to be raised — proves parking happened, not a fail-closed short-circuit] /api/admin/v1/assistant/byok-turn: an UNREDEEMED confirmation resolves via its own bounded TTL — it does not hang the request for anywhere near the production 5.5-minute ceiling

### src/assistant/__tests__/tool-registrations.database-recovery.test.ts  (6)
  - [|-] the confirmation-transport guard itself also independently refuses both excluded tools, given a (hypothetical) matching risk classification
  - ["principal 'principal-under-test' is not authorized for 'database.read' (INSTANCE_AUTHORIZATION_NOT_CONFIGURED)"] database_plan_migrate_forward: calls authorize() with its catalog's declared permission and the run's principal
  - ["principal 'principal-under-test' is not authorized for 'backup.read' (INSTANCE_AUTHORIZATION_NOT_CONFIGURED)"] backup_plan_restore: calls authorize() with its catalog's declared permission and the run's principal
  - ["principal 'principal-under-test' is not authorized for 'backup.read' (INSTANCE_AUTHORIZATION_NOT_CONFIGURED)"] backup_plan_restore: authorize() is checked twice — once defensively by this tool ahead of planRestore's own cost-class short-circuit, once again inside the gateway's plan() — both agree
  - ["principal 'principal-under-test' is not authorized for 'database.read' (INSTANCE_AUTHORIZATION_NOT_CONFIGURED)"] workflow (Database only): database_plan_migrate_forward's reported cost class feeds backup_create_restore_point's costAck, then database_list_restore_points confirms the new point
  - ["principal 'principal-under-test' is not authorized for 'backup.read' (INSTANCE_AUTHORIZATION_NOT_CONFIGURED)"] workflow (Database create -> Recovery list -> Recovery plan): a restore point minted via Database is visible and previewable through Recovery, using the exact id each step handed to the next

### src/server/__tests__/routes/post-template-site-serving.test.ts  (6)
  - ["must render through the theme's first postTemplate"] REGRESSION: a post whose templateChoice was never set renders its real content, not the diagnostic page
  - [explicit opt-out is designed product behavior] a post explicitly opted out of templates still gets the diagnostic page
  - [|-] null and "" produce different pages for otherwise identical posts
  - [false == true] an explicit templateChoice renders through that template, not the first one
  - [|-] overridesThemePage true composes with the templateChoice fallback rather than bypassing it
  - [|-] ROUND TRIP: saving "No template chosen" through the admin API persists "" and diagnoses on the site

### src/server/__tests__/site-assistant-routes.test.ts  (5)
  - [|-] POST /api/site-assistant/chat: the 11th request from one IP within the window is rejected with 429 before touching the provider
  - [|-] POST /api/site-assistant/chat accepts a well-formed history alongside message
  - [|-] POST /api/site-assistant/chat degrades a hostile/malformed history to no context, never a 4xx or 500
  - [|-] POST /api/site-assistant/chat writes a well-formed client_directive SSE frame when a page-action tool resolves (SPEC-046 REQ-4)
  - [|-] POST /api/site-assistant/chat never emits a client_directive for a trashed-but-published, unpublished, or nonexistent slug (SPEC-046 Task 2 AC5)

### src/assistant/__tests__/byok-provider-turn.test.ts  (3)
  - [expected the mocked fetch to have been called] runByokProviderTurn(google): the outbound Gemini request has additionalProperties/$schema stripped, top-level and nested
  - [expected the mocked fetch to have been called] runByokProviderTurn(anthropic): the SAME tool schema reaches the outbound request untouched — additionalProperties/$schema preserved
  - [expected the tool executor to have been called with an input object] runByokProviderTurn(google): a numeric-enum tool (redirects_create) round-trips end to end — Gemini sends back statusCode as a STRING, and the tool executor still receives a NUMBER

### src/cli/__tests__/integration/export-command.integration.test.ts  (3)
  - [|-] tovu export <dir> --out <out>: exits 0, prints an honest route/asset summary, and writes a real static file tree
  - [|-] tovu export: a non-empty --out is refused (EXPORT_OUTPUT_NOT_EMPTY, exit 3) unless --clean is passed
  - [|-] tovu export --base-path <path>: rewrites root-relative links and prints the disclosed-limit warning

### src/server/__tests__/identity-crud-routes.test.ts  (3)
  - ["Cannot read properties of undefined (reading 'principalId')"] AC-27: ENABLE_PRINCIPAL route re-activates a disabled user
  - ["Cannot read properties of undefined (reading 'principalId')"] AC-28: UPDATE_USER route sets email, ignores username/password fields in the body
  - ["Cannot read properties of undefined (reading 'principalId')"] AC-29: RESET_USER_PASSWORD route returns 204 and the new password authenticates a fresh login

### src/server/__tests__/routes/publish-site-route.test.ts  (3)
  - [|-] publish-site preview: netlify and cloudflare-pages are accepted targets (2026-08-15, all four Jini targets) — never 400 for a bare target with no other fields
  - [|-] publish-site: trigger starts a real run (202), and — with no GITHUB_TOKEN configured — the poll settles quickly to an honest errored/NO_CREDENTIALS_CONFIGURED result, never touching a real GitHub/Vercel API
  - [|-] publish-site preview: github-pages reports the derived base path and, with no GITHUB_TOKEN configured, credentialsConfigured false — never starting a run

### src/assistant/__tests__/tool-registrations.menus.test.ts  (2)
  - [|-] a tool result is an explicit model-facing view: workspaceId/updatedAt dropped, id kept for the next call's menuId
  - [|-] workflow: create a menu, add items to it, then assign it to a location — reads reflect the whole chain under the SAME id

### src/cli/__tests__/integration/introspect-command.integration.test.ts  (2)
  - [|-] tovu introspect: exits 0 and prints valid JSON describing init/serve/export — matches the live CLI, not a hand-maintained doc
  - [|-] tovu introspect --format mcp: exits 0 and prints valid MCP tool definitions

### src/db/__tests__/migration-manifest.test.ts  (1)
  - [|-] boolean-flag classification matches exactly the SQLiteBoolean columns in schema.ts, not the many plain-integer 0/1 flags

### src/db/sqlite/__tests__/origin-repo.sqlite.import-boundary.test.ts  (1)
  - [`createVerifiedOrigin must be imported through origin's public door ("../../origin" or "../../origin/index"), got "../../origin/index.js"`] origin-repo.sqlite.ts imports the createVerifiedOrigin VALUE through origin's public door (index.ts), not the internal types.ts module directly

### src/export/__tests__/site-exporter.test.ts  (1)
  - [a template shell is neither a rendered route nor a crawled asset — must be named, not silently absent] exportSite: reports theme files present on disk but never rendered or crawled, without flagging real ones

### src/features/plugins/store/__tests__/store-plugin.test.ts  (1)
  - ["core snapshotted before creating the store's table"] store: activation declares p_store__products (via the never-brick seam) and seeds it

### src/server/__tests__/admin-menus-routes.test.ts  (1)
  - [|-] admin menus routes: ADR-PIPE-012 D-1/D-2/D-9 — a principal with no grants is denied 403 on every route with the new per-action permission named, and a grant restores access

### src/server/__tests__/packet-one-routes.test.ts  (1)
  - [|-] packet-one admin and content routes expose the seeded post loop

### src/server/__tests__/routes/media-site-serving.test.ts  (1)
  - [|-] ADR-027 §4: a published post with a legacy src-only image node still renders the placeholder on a real GET /:slug — no backward-compat regression through the real HTTP path

### src/server/__tests__/routes/seo-site-serving.test.ts  (1)
  - [|-] T045: the real home-page render includes SEO's folded <title> tag, not just the raw shell default

### src/server/http/site/__tests__/liquid-sandbox.test.ts  (1)
  - [|-] a memory-blowup template (range within the lint cap, accumulating retained allocations) is force-terminated by the worker's memory guards

### src/site-dir/__tests__/unit/read-template.unit.test.ts  (1)
  - [|-] REQ-02/AC-02: readTemplate('starter').seed is byte-equivalent to server/seed.ts's current live output

=== 75 failing tests across 23 files ===
