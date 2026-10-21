# build-comments REPORT — comments as a provider plugin, step 1 (built-in provider end to end)

Cloud run 2026-10-21, 16:39Z → see last commit. Branch `cloud/build-comments-2026-10-21` in BOTH repos
(Tovu from `0d65c375`, Jini from `c2cd303c`). Plugin-lifecycle parts of the WIP were not touched.

## Lots / commits
| repo | sha | lot |
|---|---|---|
| Jini | `0e2957b2` | cms/comments WIP compiles: typed `CommentSubmitResult` for host-dispatched providers; marker test in vitest style |
| Tovu | `1685ddb8` | WIP runs against linked Jini: lockfile entry for `@jini-ai/capability-providers`, tests import the package (no `../jini-int` resolve hooks), `await renderSite` before the marker pass, stray `site-backups` import/call removed from `app.ts` (module absent on this branch) |
| Tovu | `65882a7e` | comment targets (entry → legacy post), CSRF gate, proxy rate-limit test, `:target` notices, `comments` theme marker + Starter template/CSS |
| Tovu | `a5617c26` | boot guard (unregistered stored provider → built-in), malformed-row fallback, `req.query?` fix, reviewed tool baseline |
| Tovu | `d2a4e564` | replies after parents, stale-cursor fallback + "First comments", `comments_get_provider` notes |
| Tovu | `67b100be` | real-HTTP no-JS round-trip test |
REVIEW_LOT_PLACEHOLDER

## Kept from the Codex WIP (reviewed, sound)
- Jini `capability-providers/comments`: frozen definitions + `implementation` honesty flag, registry with site-scoped
  `resolve`, readiness (`undefined` = not ready, metadata-only never executes, kind-mismatch refused), CAS `select`,
  split ports (renderer / moderation / submission), 5 tokens (registry, 3 ports, selection store). 100% covered.
- cms: `entryId` filter on `listModerationQueue` (memory + SQL), `formRedirect` 303 option, `comments` theme-owned marker.
- Tovu: `builtin-provider.ts` adapter (in Tovu, not cms), settings-ledger selection store (`core.comments.provider`,
  default `built-in`, CAS inside `set()`'s own transaction), gated `writeService`, 2 new tools with confirmation card,
  urlencoded parser + safe `returnTo`, Origin check, `no-store` for pages carrying comments.

## Changed / added and why
- **Posts vs entries (blocker found):** public pages render legacy `posts`, ingress validated only `entries`, so every
  themed-post submission was `entry-not-found`. `comment-targets.ts`: entry first, then post. Posts have no publish time,
  so `closeAfterDays` cannot close a post thread (draft gate still holds).
- **Origin check:** honors `X-Forwarded-Proto` (as OAuth origin does); a JSON POST without Origin is allowed (cross-site
  pages cannot send JSON without a preflight; bots are bounded by honeypot/spam/limits), a form POST must carry Origin.
- **Rate-limit key:** verified, not changed: with `trust proxy` = 1 on Fly (`trust-proxy.ts`) two visitors behind one
  proxy hop hash to two buckets; test pins both the trusted and untrusted behaviour. cms ingress `?? "unknown"` only
  applies when no hash exists (never on the HTTP path) and is deliberately pinned by an existing cms test.
- Notices hidden unless the URL fragment targets them; thread order (DFS, cycle/orphan safe); bogus `?commentCursor`
  no longer fails the page; boot guard; `get_provider` notes; Starter `posts-default.html` marker + token CSS.

## Tests (only touched packages; node:test `--test-concurrency=1`, vitest `--maxWorkers=2`)
- Jini cms comments + widgets resolver: 216/216. capability-providers comments: 4/4.
- Tovu comments features + submit route + new route/template tests: 106/106 (+ e2e/async-guards/pages.route green).
- Wide Tovu sweep (assistant tool tests, theme, public site routes, admin comments, contracts): 2930 run; remaining
  failures are NOT comments: `domain-no-direct-tool-registration` (agent-plugins `update-effects.ts` imports
  `src/assistant/`) and `tool-metadata` baseline missing `agent_plugins_update` — both plugin-lifecycle WIP.
- `tsc` (website): 10 errors, none in comments code (Kysely `ContentKernel`, `cookie.serialize`, `consentAudit`,
  `import-site.ts`, `backstop-service.ts`, `permanent-delete-deps.ts`) — Tovu/Jini HEAD drift, pre-existing.
- `pnpm guard` (Jini): self-test fails on an agent-runtime fixture, unrelated to comments.

## Per-file coverage (lines / branches / functions)
- Jini: `comments/definitions.ts, registry.ts, tokens.ts, index.ts` 100/100/100 (`ports.ts` types only);
  `cms/comments/express/submit-handler.ts` 100/100/100; `widgets/resolver-service.ts` 100/100/100;
  `repo.memory.ts` / `sql/repo.ts` touched lines covered (untouched save()/conflict lines are covered by other suites).
- Tovu: `builtin-provider.ts`, `comment-targets.ts`, `public-markers.ts`, `tool-registrations.ts`, `agent-tools.ts`,
  `theme/validation/markup.ts` 100/100/100; `provider-selection.ts` 100/98/100 (one optional-chain sub-branch);
  `comments-submit.ts` 100/97/100 (the missed branch is reported on the file-header comment line by tsx source maps,
  present on the unmodified WIP file too). `pages.ts` touched lines exercised by the template + route tests.

## Deviations
- Did not delete the orphan WIP test `admin-http/routes/system/__tests__/site-backups.integration.test.ts` (imports a
  missing module; the sandbox refused the delete). It fails if run; owner: drop it or land the backups module.
- No new bundled `comments` plugin seeded (per brief). Composition stays in core; admin moderation panel unchanged.
- Strings are English only (`locale: 'en'`); the form has no reply control (replies stay API/tool-only).

## LOOK at locally in Chrome
1. Activate Tovu Starter, open a published blog post: thread + form under the article; light, dark, 375px width.
2. Submit without JS: lands on `#comment-pending` notice; comment absent until approved.
3. Admin → People → Comments: approve it; reload the post (it appears; page is `no-store`).
4. Agent: `comments_get_provider`, then `comments_set_provider {providerId:null}` → confirmation card shows pending
   count; post page shows no thread; queue still readable; set back to `built-in`.
5. 200+ approved comments: "More comments" / "First comments" links.

## LOCAL-RUN NEEDED
- Postgres comments repo contract (`cms repo.contract.test.ts` pg adapter) for the new `entryId` filter.
- Playwright: themes visual pins for Tovu Starter (`npm run test:visual`), admin comments journey.

## Owner questions
1. Static export bakes approved comments at export time but also bakes the form, which has no endpoint on a static
   host. Strip the form (or swap in "comments are read-only here") during export?
2. Should legacy posts get a real publish timestamp so `closeAfterDays` can apply to them?
3. Add a reply control to the public form (parentId), or keep replies admin/agent-only in v1?

## Where the vendor-provider step starts
- Register vendor definitions + `resolve` into `createCommentsCapability`'s registry (`features/comments/provider-selection.ts`);
  `kind: 'embedded'` adapters need only `renderer` + `dashboardUrl` (port already defined).
- Widen `comments_set_provider`'s enum/validation (`tool-registrations.ts`, `agent-tools.ts`) from `built-in|null` to registry ids.
- Consent gate + CSP merge from `definition.csp`/`consentCategory` (metadata already carried); Giscus maps to `entry.id`.
- Boot guard already falls back to built-in when a vendor's plugin disappears.
