# Terra job: lost-update pattern — apply at every listed site

STATUS: READY (2026-11-13). Jini lines re-verified on Jini main (clone branch `w3-db-main`).

HARD RULE: stop before ~300k tokens of context. If you get close, commit what you have, list the sites not done, and stop.

You apply ONE pattern at the sites listed below. You do not decide what the fix is: each site already has its variant. Read `development/refactor-patterns/lost-update.md` in the Tovu clone FIRST and follow its decision table exactly (V1–V5), including the exact before→after code shapes.

Workspace: Tovu clone `/Users/la/Programming/tovu-terra-w3-db` (branch `w3-db`), Jini clone `/Users/la/Programming/jini-terra-w3-db` on branch `w3-db-main` ONLY (Jini main 0.7.1 + the mechanism commit 64619ab41). The clone's branch `w3-db` is a stale 2026-10-20 base: never switch to it, never cherry-pick from it. Check first: `git -C /Users/la/Programming/jini-terra-w3-db branch --show-current` must print `w3-db-main`. Never touch `/Users/la/Programming/Tovu` or `/Users/la/Programming/Jini`. Never push. Commit per site group by explicit paths only: `git add -- <paths> && git commit -F <msgfile> -- <paths>`; never `git add -A`, stash, checkout, reset.

Order: Batch J (Jini) first, then Batch T (Tovu). Within Batch T, do T-sites whose record type lives in Jini only after the matching Jini type gained `version` in Batch J (the prompt row says so in "note"). V2 note: the settings compare-and-set is already in the installed `@jini-ai/core/settings` (Jini main `write-service.ts:312`/`:383`); every V2 site only passes `{ expectedRevisionSeq }` and bridges `SettingsRevisionConflictError` with `fromSettingsRevisionConflict` (lost-update.md V2). Never add a second compare.

Pilot: do the external MCP server row group (repo + PUT route + admin files) first, commit, and STOP for review before the rest.

For each site (or group of rows sharing one storage — e.g. a repo + its PUT route + its tool + its admin files):
1. Write the regression test FIRST (template: `apps/website/src/features/members/__tests__/tier-repo.lost-update.test.ts`; Jini: vitest file beside the code). Run ONLY that file and confirm it FAILS for the right reason (missing rejection / missing 409). Paste the failing line into your notes.
2. Apply the variant's after-shape. Also: the record's read/GET/tool view returns `version`; the service sets `version: existing.version + 1`.
3. Run the same single file: GREEN.
4. Mutation: delete the `.where("version", "=", expectedVersion)` line (or the `{ expectedRevisionSeq }` argument / the 409 branch) → run → RED → restore → GREEN.
5. Commit: `fix(<area>): <record> saves refuse stale versions (lost-update pattern)`, trailer `Co-Authored-By: <your model> <noreply@…>`.

Test commands (one file at a time, never a suite, leave nothing running). The Tovu command needs the resolver shim (the two new `@jini-ai/core` subpaths are not published yet). If `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/00b5f4e6-0f35-4a46-95f6-8be5669efc47/scratchpad/w3db/jini-clone-register.mjs` is missing, recreate both files exactly:

`jini-clone-register.mjs`:
```js
import { register } from "node:module";
register("./jini-clone-hooks.mjs", import.meta.url);
```
`jini-clone-hooks.mjs` (same folder):
```js
// Test-only resolver: maps the two NEW @jini-ai/core subpaths (not yet published to the Tovu
// node_modules) to the Jini clone's source on branch w3-db-main (= Jini main 0.7.1 + the patterns
// commit). Remove once Jini is published and Tovu bumps @jini-ai/core.
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CLONE = "/Users/la/Programming/jini-terra-w3-db";
const SRC = `file://${CLONE}/packages/core/src/`;
const MAP = {
  "@jini-ai/core/optimistic-concurrency": `${SRC}optimistic-concurrency.ts`,
  "@jini-ai/core/list-page": `${SRC}list-page.ts`,
};
// Why: the stale branch `w3-db` (2026-10-20 base) has the same files; testing against it proves nothing.
const head = readFileSync(`${CLONE}/.git/HEAD`, "utf8").trim();
if (head !== "ref: refs/heads/w3-db-main") {
  throw new Error(`jini-clone shim: ${CLONE} must be on branch w3-db-main (it is on '${head}'). Run: git -C ${CLONE} switch w3-db-main`);
}
// Why: the two shimmed files import core siblings (ToolInputError, settings errors) relatively. Loading
// those from the clone would make a second class identity, so Tovu's `instanceof ToolInputError` (from
// the installed package) would miss. Siblings the installed package already has come from its dist.
// realpath: node_modules here is a symlink to the main tree; a symlinked URL would load a second copy.
const DIST = `${realpathSync("/Users/la/Programming/tovu-terra-w3-db/node_modules/@jini-ai/core/dist")}/`;
const SHIMMED = new Set(Object.values(MAP));

export async function resolve(specifier, context, next) {
  if (MAP[specifier]) return { url: MAP[specifier], shortCircuit: true };
  if (context.parentURL && SHIMMED.has(context.parentURL) && specifier.startsWith("./")) {
    const dist = `${DIST}${specifier.slice(2)}`;
    if (existsSync(dist)) return { url: pathToFileURL(dist).href, shortCircuit: true };
  }
  return next(specifier, context);
}
```

- Tovu: `cd /Users/la/Programming/tovu-terra-w3-db && TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --import /Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/00b5f4e6-0f35-4a46-95f6-8be5669efc47/scratchpad/w3db/jini-clone-register.mjs --test --test-concurrency=1 <file>`
- Jini: `cd /Users/la/Programming/jini-terra-w3-db/packages/<pkg> && npx vitest run --maxWorkers=2 --minWorkers=1 <file>`; then `npx tsc -p tsconfig.json --noEmit` for that package.
- Tovu `tsc` cannot resolve the two new subpaths until Jini is published and Tovu bumps; do not run a Tovu type-check and do not work around it.
- Admin (React) files: `npx vitest run --maxWorkers=2 --minWorkers=1 <file>` from the Tovu clone.

Never: `as any`, `!` non-null shortcuts, `eslint-disable`, casts to add `version`, new migrations, deleting "why" comments (move them), automatic retry on conflict, generic error text. Arguments are `(required, optional = {})`. If a site does not match its listed variant's before-shape, do NOT improvise: skip it and list it under "Needs a decision" with one line saying what you saw.

Report: per site — commit hash, test file, red/green/mutation lines; then "Needs a decision" list; then sites not reached.

## Jini type prerequisites (add `version: number` + row mapping in Jini BEFORE the Tovu row)
- `@jini-ai/user-management` `UserRecord`, `RoleRecord`, `PolicyRecord` (`packages/user-management/src/core/types.ts:59`, `:90`, `:104`; none has `version`) -> Tovu `features/identity/repo.ts` rows (identity_users, roles, policies).
- `@jini-ai/integrations` `WebhookSubscriptionRecord` (`packages/integrations/src/webhooks/types.ts:20`; no `version`) -> Tovu webhook rows (`webhook-repo.ts` gets it through `#src/features/webhooks/index`).
- `@jini-ai/cms` `WorkspaceRecord` (`packages/cms/src/workspace/create.ts:26`; no `version`; port `WorkspaceRepoPort` same file) -> the `workspaces` table (J3).
- External MCP (`apps/website/src/features/external-mcp/contracts.ts`) is Tovu-local: no Jini prerequisite.
The DB columns already exist for all of these (migration 0042).

## Deferred: do NOT do in this job
- `apps/website/src/features/newsletter/repo.ts:250` (`p_newsletter__lists`, plugin-owned table without `version`; needs a plugin migration, owner decision).
- Commerce catalog rows in `packages/commerce/src/catalog/repo.ts`: no live writer yet; fix when commerce editing ships.

## Sites

### Batch J — Jini clone /Users/la/Programming/jini-terra-w3-db (do FIRST)

| # | site (file:line) | variant | storage | read tool | admin files (V5) | note |
|---|---|---|---|---|---|---|
| J1 | `packages/cms/src/forms/sql/repo.ts:111` | V1 | form_definitions | forms_list_definitions | apps/admin/src/integrations/jini-admin/forms-ports.ts | `update(record)` is an UPDATE (not an upsert): add `optional: { expectedVersion? }`, `.where("version", "=", expectedVersion)` and `version` to the SET when given. Its doc says "only the Trash's compare-and-set may move `version`": edits now move it too — rewrite that sentence, keep the `deleted_at IS NULL` why |
| J2 | `packages/cms/src/redirects/sql/repo.ts:172` (method `save` at :138, takes `{ record, revision }`) | V1 (port shape `save(required: { record; revision }, optional: { expectedVersion? } = {})`; the conditional UPDATE and the revision insert stay in the existing transaction) | redirects | redirects_get | apps/admin/src/integrations/jini-admin/redirects-ports.ts | updateRedirect merges patch onto unlocked read, bumps version without compare |
| J3 | `packages/cms/src/workspace/tool-registrations.ts:80` | V4 | workspaces | workspace_get | apps/admin/src/features/workspace/hooks/use-workspace.hooks.ts | name+slug replace on workspace row, no expected version |
| J7 | `packages/user-management/src/server/agent-tool-registrations.ts:516` (`identity_policy_update`) | V4 | policies | identity_policy_list | apps/admin/src/features/roles/hooks/use-roles.hooks.ts | name+description patch replaces policy row, no expected version |

### Batch T — Tovu clone /Users/la/Programming/tovu-terra-w3-db

| # | site (file:line) | variant | storage | read tool | admin files (V5) | note |
|---|---|---|---|---|---|---|
| T1 | `apps/website/src/features/comments/tool-registrations.ts:300` | V2 | setting_values_workspace: site.comments.{enabled,require_moderation,max_depth,close_after_days,spam_auto_reject_score,max_per_ip_per_hour} | comments_get_settings | apps/admin/src/integrations/jini-admin/comments-ports.ts | patch -> one settings set() per changed site.comments.* key |
| T2 | `apps/website/src/features/external-mcp/external-mcp-repo.ts:174` | V1 | external_mcp_servers | external_mcp_list | apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts,apps/admin/src/lib/api.ts | whole MCP server config row from admin card; no version |
| T3 | `apps/website/src/features/forms/tool-registrations.ts:368` | V4 | form_definitions | forms_list_definitions | apps/admin/src/integrations/jini-admin/forms-ports.ts | field patch onto definition, no expectedVersion input |
| T4 | `apps/website/src/features/identity/repo.ts:177` | V1 | identity_users | identity_user_list | apps/admin/src/features/users/hooks/users-controller.hooks.ts,apps/admin/src/features/users/UsersPanel.tsx | whole user row (email/username/hash/lastLogin) from read; login write can clobber edits |
| T5 | `apps/website/src/features/identity/repo.ts:324` | V1 | roles | identity_role_list | apps/admin/src/features/roles/hooks/use-roles.hooks.ts | role edits replace whole row, no version |
| T6 | `apps/website/src/features/identity/repo.ts:397` | V1 | policies | identity_policy_list | apps/admin/src/features/roles/hooks/use-roles.hooks.ts | policy name/description edits replace whole row, no version |
| T8 | `apps/website/src/features/seo/tool-registrations.ts:162` | V4 | posts (SEO override columns) | seo_get_entry_meta | apps/admin/src/integrations/jini-admin/seo-ports.ts | PATCH merge with a server CAS-retry on a fresh read (Jini `packages/cms/src/seo/write-service.ts:320`, `MAX_MERGE_ATTEMPTS` :226) but no caller expectedVersion; add the caller basis as a check before the loop's first write, keep the loop for basis-less callers |
| T9 | `apps/website/src/features/seo/tool-registrations.ts:194` | V2 | setting_values_workspace: site.seo.* (8 keys) | seo_get_settings | apps/admin/src/integrations/jini-admin/seo-ports.ts | validates then one set() per changed site.seo.* key |
| T10+T11 | fix site: `apps/website/src/server/inbound/admin-http/routes/settings/set.ts` (`registerAdminSettingsSetRoute`; storage `features/settings/repo.ts:260` global, `:273` workspace) | V2 | setting_values_global / setting_values_workspace | settings_get_raw | apps/admin/src/lib/api.ts | Jini `set` already compares when given `expectedRevisionSeq`; this PUT route never accepts or passes it. Parse body `expectedRevisionSeq` with `parseExpectedVersion({ value }, { field: "expectedRevisionSeq" })`, pass `{ expectedRevisionSeq }`, answer `SettingsRevisionConflictError` with 409 `versionConflictBody({ error: fromSettingsRevisionConflict(...) })`. Same for `clear.ts`. Do not edit repo.ts |
| T12 | `apps/website/src/features/theme/preview-switcher-tools.ts:46` | V2 | setting_values_workspace: core.theme.previewSwitcher | theme_get_preview_switcher | - | replaces whole previewSwitcher value via settings set() |
| T13 | `apps/website/src/platform/db/repos/media-repo.ts:284` | V1 | media | media_list_assets | apps/admin/src/integrations/jini-admin/media-ports.ts | updateMediaMetadata saves whole row, no expectedVersion (Jini `packages/cms/src/media/media-service.ts:715`) |
| T14 | `apps/website/src/platform/db/repos/webhook-repo.ts:120` | V1 | webhook_subscriptions | webhooks_list_subscriptions | apps/admin/src/lib/api.ts,apps/admin/src/features/providers/Providers.tsx | updateSubscription replaces url/topics row; no version |
| T15 | `apps/website/src/server/inbound/admin-http/routes/assistant/put-settings.ts:19` | V2 | setting_values_workspace: site.assistant.public_enabled, site.assistant.widget | - | apps/admin/src/lib/api.ts,apps/admin/src/features/ai-assistant/hooks/use-ai-assistant.hooks.ts | patch -> settings set() for public_enabled and widget |
| T16 | `apps/website/src/server/inbound/admin-http/routes/assistant/put-site-credential.ts:59` | V3 | secrets_vault (site-assistant record: key+provider/baseUrl/model) | - | apps/admin/src/lib/api.ts,apps/admin/src/features/ai-assistant/hooks/use-visitor-credential-form.hooks.ts | partial patch; CAS only vs server's own read (site-credential-store.ts:133), not client revision |
| T17 | `apps/website/src/server/inbound/admin-http/routes/comments/put-settings.ts:15` | V2 | setting_values_workspace: site.comments.* | comments_get_settings | apps/admin/src/integrations/jini-admin/comments-ports.ts | same setCommentsSettings chokepoint as the tool |
| T18 | `apps/website/src/server/inbound/admin-http/routes/external-mcp/put.ts:134` | V3 | external_mcp_servers | external_mcp_list | apps/admin/src/features/settings/hooks/use-external-mcp.hooks.ts,apps/admin/src/lib/api.ts | replaces whole MCP server config from edit card |
| T19 | `apps/website/src/server/inbound/admin-http/routes/forms/authoring.ts:24` | V3 | form_definitions | forms_list_definitions | apps/admin/src/integrations/jini-admin/forms-ports.ts | authoring payload via updateFormDefinition, no expected version |
| T20 | `apps/website/src/server/inbound/admin-http/routes/forms/update.ts:73` | V3 | form_definitions | forms_list_definitions | apps/admin/src/integrations/jini-admin/forms-ports.ts | definition patch via updateFormDefinition, no expected version |
| T21 | `apps/website/src/server/inbound/admin-http/routes/media/put-providers.ts:30` | V3 | media_provider_credentials | - | apps/admin/src/features/media/media-providers-port.ts,apps/admin/src/lib/api.ts | replaces provider map; stale tab can overwrite/tombstone other edits |
| T22 | `apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts:157` | V3 | posts (html body) | pages_read_html | apps/admin/src/lib/api.ts | store CAS uses version read in same request, not client's loaded version |
| T23 | `apps/website/src/server/inbound/admin-http/routes/seo/put-entry.ts:46` | V3 | posts (SEO override columns) | seo_get_entry_meta | apps/admin/src/integrations/jini-admin/seo-ports.ts | server CAS-retry only (Jini cms/src/seo/write-service.ts:299); no client version |
| T24 | `apps/website/src/server/inbound/admin-http/routes/seo/put-settings.ts:9` | V2 | setting_values_workspace: site.seo.* | seo_get_settings | apps/admin/src/integrations/jini-admin/seo-ports.ts | same setSeoSettings chokepoint as the tool |

### Exempt — do NOT touch (code per the exemption rule)

| site | code | why |
|---|---|---|
| jini:`packages/chat/src/store/legacy/sqlite/messages.ts:119` | E3 | desktop single-user local chat store; client rewrites its own conversation's message rows |
| jini:`packages/chat/src/store/runtime/durable-run-store.ts:387` | E1 | `writeAttemptMetadata` upsert: run-worker-owned attempt metadata (recovery, cancel, session capture) |
| jini:`packages/chat/src/store/runtime/durable-run-store.ts:503` | E1 | run worker resets recovery clock; no person or tool content |
| jini:`packages/chat/src/store/runtime/run-ledger.ts:151` | E1 | run ledger progress under run lock; server-only |
| jini:`packages/chat/src/store/runtime/run-ledger.ts:163` | E1 | run settlement under run lock, gated by run_id and not-terminal |
| jini:`packages/plugins/src/host/sql/repo.ts:48` | E2 | enable/disable flip; version from discovery, quarantine fields server-set |
| jini:`packages/user-management/src/server/agent-tool-registrations.ts:398` (`identity_user_update_email`) | E2 | sets only email (absent clears); repo upsert row classified separately |
| tovu:`apps/website/src/features/content-types/repo.ts:31` | E7 | every mutating path requires expectedVersion: Jini cms/src/content-types/lifecycle.ts:86 |
| tovu:`apps/website/src/features/email-templates/tool-registrations.ts:66` | E7 | expectedVersion check operations.ts:210 plus store CAS; expectedVersion optional in schema |
| tovu:`apps/website/src/features/entries/repo.ts:119` | E7 | update path passes expectedVersion to the save CAS: Jini `packages/cms/src/entries/write-service.ts:405`; CAS branch repo.ts:112 |
| tovu:`apps/website/src/features/forms/tool-registrations.ts:388` | E2 | status flip only |
| tovu:`apps/website/src/features/identity/mfa.repo.ts:31` | E3 | keyed by signed-in owner principal |
| tovu:`apps/website/src/features/identity/mfa.repo.ts:46` | E3 | keyed by signed-in owner principal + purpose |
| tovu:`apps/website/src/features/identity/repo.ts:107` | E2 | written on create and enable/disable status flips (admin-crud-service.ts:115,168) |
| tovu:`apps/website/src/features/identity/repo.ts:244` | E3 | person's own session row |
| tovu:`apps/website/src/features/identity/repo.ts:452` | E6 | join row inserted with new id on attach/seed; never edited |
| tovu:`apps/website/src/features/identity/repo.ts:516` | E6 | join row inserted with new id; never edited |
| tovu:`apps/website/src/features/identity/repo.ts:565` | E6 | assignment row inserted with new id; never edited |
| tovu:`apps/website/src/features/identity/repo.ts:620` | E6 | attachment row inserted with new id; never edited |
| tovu:`apps/website/src/features/identity/repo.ts:708` | E6 | key created once; upsert refuses revoked rows; no edit path |
| tovu:`apps/website/src/features/mail-status/provider-tool-registrations.ts:110` | E4 | handler writes nothing; key is re-entered whole via credential_save card |
| tovu:`apps/website/src/features/mail/retention.ts:22` | E1 | retention purge |
| tovu:`apps/website/src/features/mail/retention.ts:25` | E1 | retention purge |
| tovu:`apps/website/src/features/members/repo.ts:97` | E1 | provider link written by sign-in flow (member-login/link-service.ts:91) |
| tovu:`apps/website/src/features/members/repo.ts:337` | E2 | create comp or status flip (write-service.ts setSubscriptionStatus) |
| tovu:`apps/website/src/features/members/repo.ts:394` | E3 | member's own session row |
| tovu:`apps/website/src/features/members/repo.ts:467` | E1 | sign-in token lifecycle, server-only |
| tovu:`apps/website/src/features/members/repo.ts:560` | E2 | request/confirm/revoke status flips with version bump |
| tovu:`apps/website/src/features/newsletter/repo.ts:117` | E7 | campaign-write-service.ts:127 expectedVersion check (optional input) |
| tovu:`apps/website/src/features/newsletter/repo.ts:339` | E2 | subscribe/unsubscribe status flips |
| tovu:`apps/website/src/features/newsletter/repo.ts:496` | E1 | delivery state machine |
| tovu:`apps/website/src/features/post/repo.ts:156` | E7 | updatePost asserts expectedVersion post.ts:1950 then saveIfVersion (opt-in) |
| tovu:`apps/website/src/features/post/search-index.postgres.ts:67` | E1 | derived search index |
| tovu:`apps/website/src/features/post/search-index.ts:244` | E1 | index watermark written by reindex |
| tovu:`apps/website/src/features/settings/repo.ts:211` | E1 | definitions registered by plugin/boot code, not a person's value |
| tovu:`apps/website/src/features/settings/repo.ts:288` | E3 | keyed by signed-in principal |
| tovu:`apps/website/src/features/site-search/index-state-store.ts:96` | E1 | search index state |
| tovu:`apps/website/src/features/site-search/index-state-store.ts:150` | E1 | index watermark |
| tovu:`apps/website/src/features/site-search/index-state-store.ts:210` | E1 | index build flag |
| tovu:`apps/website/src/features/taxonomy/repo.ts:204` | E2 | renameTerm sets name only in a transaction; import guarded Jini `packages/cms/src/taxonomy/write-service.ts:388` |
| tovu:`apps/website/src/features/theme/page-publish-tool.ts:36` | E2 | single boolean published flag |
| tovu:`apps/website/src/features/trash/adapters/marker-sql.ts:85` | E7 | where version = expectedVersion at marker-sql.ts:90 |
| tovu:`apps/website/src/platform/db/repos/external-mcp-tool-approval-repo.ts:51` | E2 | single approval grant (fingerprint) per server tool |
| tovu:`apps/website/src/platform/db/repos/form-delivery-repo.ts:158` | E1 | outbox scrub after purge |
| tovu:`apps/website/src/platform/db/repos/form-delivery-repo.ts:254` | E1 | lease under lock |
| tovu:`apps/website/src/platform/db/repos/gated-mutation-token-repo.ts:66` | E1 | gated confirmation tokens |
| tovu:`apps/website/src/platform/db/repos/media-repo.ts:520` | E5 | keyed by content sha256 |
| tovu:`apps/website/src/platform/db/repos/media-repo.ts:640` | E5 | derived from source sha + transform version |
| tovu:`apps/website/src/platform/db/repos/oauth-pending-store.ts:89` | E1 | oauth pending |
| tovu:`apps/website/src/platform/db/repos/origin-repo.ts:229` | E1 | configured origin from boot config under lock |
| tovu:`apps/website/src/platform/db/repos/publish-content-baseline-repo.ts:68` | E1 | publish baselines |
| tovu:`apps/website/src/platform/db/repos/publish-content-run-repo.ts:70` | E1 | publish run progress |
| tovu:`apps/website/src/platform/db/repos/webhook-repo.ts:242` | E1 | delivery state machine |
| tovu:`apps/website/src/platform/db/repos/webhook-repo.ts:281` | E1 | delivery state machine |
| tovu:`apps/website/src/platform/db/repos/webhook-repo.ts:310` | E1 | delivery state machine |
| tovu:`apps/website/src/platform/db/sqlite/database-journal-repo.ts:274` | E1 | migration journal |
| tovu:`apps/website/src/platform/db/sqlite/publish-backstop-audit.sqlite.ts:11` | E1 | publish audit log |
| tovu:`apps/website/src/platform/db/vault-credential-recovery.ts:41` | E1 | vault recovery clears secret pointers only |
| tovu:`apps/website/src/server/inbound/admin-http/routes/assistant/put-execution-credential.ts:52` | E3 | scoped to signed-in admin's own row |
| tovu:`apps/website/src/server/inbound/admin-http/routes/plugins/provider-settings.ts:124` | E2 | single boolean use |
| tovu:`apps/website/src/server/inbound/admin-http/routes/publish-content/blob-put.ts:46` | E5 | sha-keyed create-only object |
| tovu:`apps/website/src/server/inbound/admin-http/routes/sites/sites-home.ts:46` | E2 | single folder path |
| tovu:`apps/website/src/server/runtime/composition/modules/assistant-chats.ts:233` | E3 | chat scoped to owner principal; client saves its own message |

### Gone (file no longer exists) — nothing to do

- jini:`packages/commerce/src/catalog/repo.price-refs.ts` (save)
- jini:`packages/commerce/src/payments/ledger/repo.sql.ts` (fn)
