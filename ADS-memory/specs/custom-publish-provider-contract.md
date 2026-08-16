# Custom Publish Provider Contract — S3-compatible, first slice

Status: design spec, not implemented. Author: Software Architect dispatch, 2026-08-15.
Scope: the fifth "Custom" tab in the Static Site deployment UI, S3-compatible protocol only.

Every claim about existing code below is grounded in a file read during this dispatch, cited by
path. Where I depart from the dispatching brief's assumptions, I say so and why.

---

## 1. Recon: is there an S3/SigV4 client available? (the fact that gates everything else)

**No.** Verified by direct search, not inference:

- `grep -rliE 'aws-sdk|@aws-sdk'` across `package.json`, `node_modules`, and `src/` (excluding
  `node_modules` for the src pass): zero hits anywhere in this repo.
- `@jini-ai/devops` (`node_modules/@jini-ai/devops/package.json`, v0.1.2) — the package
  `static-publish/adapter.ts` already wraps for GitHub Pages/Vercel/Netlify/Cloudflare Pages — lists
  exactly one runtime dependency: `undici`. Its `./deploy` subpath
  (`node_modules/@jini-ai/devops/dist/deploy/index.d.ts`) exports `vercel`, `cloudflare-pages`,
  `netlify`, `github-pages`, `naming`, `reachability`, `redirect-guard`, `tokens`, `tool` — no S3
  target, no SigV4 helper anywhere in the package.

So there is nothing to "wrap" the way `adapter.ts`'s own header describes its philosophy
("wrap it, do not reimplement" — `static-publish/adapter.ts:26`). An S3-compatible target needs new
signing code, one way or another. I checked the two real options against the npm registry directly
rather than from memory:

| | `@aws-sdk/client-s3` 3.1111.0 | `aws4fetch` 1.0.20 |
|---|---|---|
| Direct deps | 11 (`@smithy/*`, `@aws-sdk/credential-provider-node`, `@aws-sdk/middleware-sdk-s3`, …) | 0 |
| Unpacked size | 3.3 MB (this package alone; transitive tree is larger) | 65 KB |
| Files | — | 9 |
| Signs requests for non-AWS S3-compatible hosts? | Encodes AWS-hosted conventions (region→endpoint resolution, credential-provider chain, virtual-hosted-style bucket addressing) that do not reliably hold for R2/B2/Spaces/Wasabi/MinIO | Purpose-built as a minimal fetch-based SigV4 signer; used for exactly this class of problem |

SigV4 itself needs only HMAC-SHA256 and SHA-256 — both native to Node's `crypto` module. There is no
crypto-primitive gap either way; the choice is between a full vendor SDK and a thin signer.

**Recommendation (needs owner sign-off — flagged, not decided unilaterally): do not add
`@aws-sdk/client-s3`.** Given [[project_tovu_deployment_model]] (Docker-first, one container) and
[[reference_tovu_docker_build_traps]] (22 `file:` deps, 3 native modules, the image has never
successfully built), a 3.3 MB package with 11 further dependency trees is a real cost for a feature
whose actual required surface — per `@jini-ai/devops/deploy`'s own `DeployTarget` interface
(`node_modules/@jini-ai/devops/dist/deploy/types.d.ts`) — is exactly two operations: `publish()` (a
batch of `PUT`s) and `checkReachability(url)` (one `HEAD`/`GET`). A ~65 KB zero-dependency signer
(`aws4fetch`) or a hand-rolled SigV4 signer using `node:crypto` closes that gap without the size or
the AWS-hosted-assumption risk. This is still a new dependency, even at 65 KB — say so to the owner
explicitly rather than silently adding it.

**This settles the size of the whole feature: small.** No new heavy dependency, no vendor SDK
integration surface, no credential-provider chain to reason about. The work is one new file
implementing a narrow interface, plus the credential/UI/tool plumbing every existing provider already
has a precedent for.

---

## 2. Where the S3-compatible target lives

`DeployTarget` (`node_modules/@jini-ai/devops/dist/deploy/types.d.ts`) is a plain structural
interface:

```ts
interface DeployTarget {
  readonly id: string;
  publish(input: DeployPublishInput): Promise<DeployPublishResult>;
  checkReachability(url: string): Promise<DeploymentUrlCheck>;
}
```

Nothing requires an implementation to live inside `@jini-ai/devops`. `static-publish/adapter.ts`'s
`buildJiniTarget` (`adapter.ts:158-188`) already switches on `config.target` and constructs whichever
concrete class matches; it can grow a fifth branch that constructs a **Tovu-local** class instead of
an imported one, importing only `DeployFile`/`DeployTarget`/`DeployError`/`DeployPublishResult` as
*types* from `@jini-ai/devops/deploy` (an existing dependency already).

**Decision: implement `S3CompatibleDeployTarget` in Tovu, not in Jini.**
`AI-Dev-Shop/skills/architecture-decisions/SKILL.md`'s extraction guidance (loaded per this agent's
base skills) only extracts to a shared package when a **named second consumer** exists — there is
none here. Landing it in `src/features/deployments/static-publish/s3-compatible-target.ts` keeps the
change inside Tovu's own review/test loop and costs nothing to upstream into `@jini-ai/devops/deploy`
later if a second Jini consumer ever wants it (the interface is already the right shape for that).

`publish()` responsibilities: PUT each `DeployFile` to `{endpoint}/{bucket}/{file}` (or
virtual-hosted-style, provider-dependent — implementation detail, not architecture), SigV4-signed,
`Content-Type` set from `DeployFile.contentType` (falls back to a sane default when absent, the same
gap `toDeployFile` in `adapter.ts:140-146` already tolerates for the other four targets).
`checkReachability(url)` is a plain unauthenticated `HEAD`/`GET` against the credential's `publicUrl`
(§4) — no S3 API call needed, identical in kind to what a browser does.

No base path: `computeBasePath` (`adapter.ts:117-119`) returns `undefined` for `"s3-compatible"`,
the same as Vercel/Netlify/Cloudflare Pages — a bucket serves from its own root, and per-run path
scoping is explicitly deferred (§7).

---

## 3. Provider identity: one id now, room for siblings later

The owner's words distinguish the **tab** (one grouping, "Custom") from the **protocol** (an
independent thing with its own fields). The existing codebase's pattern for "independent field sets
that must never silently drift into each other" is `PublishProviderId`'s closed discriminated union
(`publish-credentials/types.ts:44,85` — `PublishConnectionInput` is deliberately closed, "so a caller
can never construct a connection with the wrong provider's companion fields... and have it silently
ignored," per that file's own header). Reuse that pattern rather than inventing a new "custom" wrapper
type:

```ts
export type PublishProviderId = "github-pages" | "vercel" | "netlify" | "cloudflare-pages" | "s3-compatible";
```

`s3-compatible` is a real provider id, not a nested sub-selector under a generic `"custom"` entry. A
future second Custom-tab protocol (generic contract, webhook passthrough — both explicitly deferred
per the dispatching brief) becomes its own sibling id (`"generic-contract"`, `"webhook"`, …) with its
own `*ConnectionInput` variant, the same way `cloudflare-pages` sits beside `netlify` today. The
**admin UI's "Custom" tab** is the only place "custom" exists as a grouping concept — it renders one
section per implemented protocol id, exactly matching the owner's "separate sections with their own
fields that work independently."

This is a **one-line, additive, non-breaking change** to an existing closed union — every existing
`switch`/`if`-chain over `PublishProviderId` (`buildJiniTarget`, `StaticPublishTargetFields`,
`validateStaticPublishConfig`, `PUBLISH_CREDENTIAL_PROVIDERS`) already has an exhaustiveness guard
(`const exhaustive: never = target` in `StaticSiteTab.tsx:871`, and equivalent patterns elsewhere) —
adding the fifth id is a compile error at every call site that hasn't been given an explicit case,
not a silent gap. That guard is why this extension is safe to make additively rather than needing a
parallel "custom provider" type hierarchy.

---

## 4. Credential shape

### 4a. The brief's 5 fields are not enough — 6 are required, with evidence

The dispatching brief expected "endpoint + access key id + secret access key + bucket + region."
I traced this against two **existing, required** contracts and found a gap:

- `DeployPublishResult.url` (`@jini-ai/devops` `types.d.ts`): `readonly url: string` — **required**,
  no `?`.
- `StaticPublishOutcome`'s success branch (`static-publish/types.ts:92-103`): `readonly url: string`
  — **required**, no `?`.
- `PublishRunResult` in the admin UI (`StaticSiteTab.tsx:1013-1028`) unconditionally renders
  `<a href={run.result.url}>` on success.

An S3 `PUT` response carries no public URL — unlike Vercel/Netlify/GitHub Pages/Cloudflare Pages,
whose provider APIs return one. Nothing in an access-key/secret-key/bucket/region/endpoint tuple can
derive a reliable public URL: AWS S3 has a predictable virtual-hosted-style URL, but R2 has none by
default (needs a `.r2.dev` subdomain or a custom domain the user configures separately), a
self-hosted MinIO instance often has no public DNS at all, and DigitalOcean Spaces/Wasabi vary by
region format. Guessing wrong produces a "Published" success state pointing at a URL that 404s —
worse than asking.

**Decision: add a sixth, required field, `publicUrl`.** Widening `url` to optional on
`StaticPublishOutcome`/`DeployPublishResult` was the alternative — rejected because it is a
higher-blast-radius change (touches every existing provider's success path and the UI's assumption)
to avoid one extra text field on a form that already has five. `publicUrl` follows the same
"lives on the credential, not the publish config" placement as `bucket`/`region`/`endpoint` — see
§4b for why.

### 4b. Placement: all six fields on the credential, not the publish config

`static-publish/types.ts`'s own precedent (Cloudflare Pages' `accountId`, documented at
`types.ts:70-79`) draws the line as: a field lives on the **credential** when it identifies *which
scoped resource this secret is for* (inseparable from the secret itself), and on the **publish
config** when it's a genuine per-run choice independent of which secret is used (GitHub's
`owner`/`repo`, Vercel's `teamId`). An access-key/secret-key pair for S3-compatible storage is
provisioned *for one specific bucket* in practice (that's how every provider's own IAM/key-creation
flow works) — endpoint, region, bucket, and the resulting public URL are properties of *that secret's
scope*, not a choice made fresh each publish. All six therefore go on the credential:

```ts
export interface S3CompatibleConnectionInput {
  readonly providerId: "s3-compatible";
  readonly endpoint?: string;       // optional — blank means plain AWS S3, region-derived
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string; // SECRET — never echoed back, never logged
  readonly publicUrl: string;
}
```

`S3CompatiblePublishConfig` (in `static-publish/types.ts`) carries **no target-specific field at
all**, the same empty shape as `NetlifyPublishConfig`/`CloudflarePagesPublishConfig`
(`types.ts:61-68,84-86`). Per-run path-prefix scoping (publishing to a subdirectory of the bucket) is
explicitly deferred — §7.

No schema/migration work: `PublishCredentialSetRecord.sealed` (`publish-credentials/types.ts:87-96`)
is one opaque `SealedSecret` blob per row — the whole `PublishConnectionInput` variant is serialized
to JSON and sealed as a unit ("never per-field columns," per that file's own header). A fifth union
variant adds zero database migration work.

**Required changes to existing code**, all additive:
- `PublishProviderId` union (+1 member) — `publish-credentials/types.ts:44`.
- `PublishConnectionInput` union (+1 variant) — `publish-credentials/types.ts:85`.
- `PROVIDER_IDS` set in `store.ts:37` (+1 member) — this is a `Set` literal, not derived from the
  type, so it needs its own edit or it silently rejects the new provider at `validateConnection`.
- `validateConnection` in `store.ts` (not fully read this pass — locate and add the s3-compatible
  branch: `region`/`bucket`/`accessKeyId`/`secretAccessKey`/`publicUrl` non-blank, `endpoint` optional
  but if present must be a plausible URL).
- `StaticPublishConfig` union (+1 variant, empty shape) — `static-publish/types.ts:88`.
- `buildJiniTarget` (+1 branch, constructing the new Tovu-local target) — `adapter.ts:158-188`.
- `computeBasePath` (+1 branch, returns `undefined`) — `adapter.ts:117-119`.
- `PROVIDER_IDS` array in `publish-agent-tools.ts:137` — this one *is* sourced from
  `StaticPublishTargetId`'s union with a comment noting exactly this ("a fifth target added there
  cannot silently go unreported here without a compile error") — confirms this file needs no
  independent edit beyond the type widening upstream.
- Admin-side mirrors: `AdminPublishCredentialProviderId` (`apps/admin/src/lib/api.ts:237`),
  `PUBLISH_CREDENTIAL_PROVIDERS` (`apps/admin/src/features/deployment/rules.ts:263-294`) — see §5 for
  why this one should NOT simply get a fifth hardcoded entry the way the other four are.

---

## 5. Agent-guidance design: where the prose lives, and how it stays in sync

**Current state, verified (this is the drift risk the brief warned about, confirmed real):** the
four existing providers' novice-facing guidance already lives in **two disconnected places** with
zero sharing:
- `PUBLISH_CREDENTIAL_PROVIDERS` (`apps/admin/src/features/deployment/rules.ts:263-294`) — a
  hardcoded array in the **browser bundle**, `tokenPageUrl`/`scopeGuidanceKey`/`requiredFields` per
  provider, rendered in `PublishCredentialRow` (`StaticSiteTab.tsx:686-786`).
- Tool descriptions in `publish-agent-tools.ts` (e.g. `deployment_get_static_publish_capabilities`'s
  `description`, `publish-agent-tools.ts:211`) — separate prose, in the **server**, read only by the
  model.

`apps/admin` is a genuinely separate workspace (own `package.json`, `file:` deps on sibling `Jini`
packages) — it does **not** import from Tovu's `src/` at all; verified by grep (`AdminPublishCredentialProviderId` in `apps/admin/src/lib/api.ts:237` is hand-declared, not imported).
So "one shared TS module" is not available as a fix; the boundary between server and admin browser
code is HTTP, same as everywhere else in this app.

**Decision: one canonical per-field guidance table, server-side, fetched by the admin UI over HTTP
instead of hardcoded.**

```ts
// src/features/deployments/publish-credentials/s3-compatible-field-guidance.ts
export interface FieldGuidance {
  readonly name: "endpoint" | "region" | "bucket" | "accessKeyId" | "secretAccessKey" | "publicUrl";
  readonly label: string;
  readonly hint: string;       // human-facing, shown under the input — §6 has the actual copy
  readonly required: boolean;
  readonly secret: boolean;    // drives masked rendering — see §8's blocking gap
}
export const S3_COMPATIBLE_FIELD_GUIDANCE: readonly FieldGuidance[] = [ /* 6 entries, §6 */ ];
```

Three consumers read this one table — none re-author the prose:
1. **The MCP-UI form** (`publish-agent-tools.ts`'s new tool handler, §6) maps it 1:1 into
   `SurfaceField[]` for `buildFormSurface`.
2. **The admin's "Custom" tab** fetches it over HTTP (extend the existing
   `GET .../system/publish/credentials` route, or add a sibling
   `GET .../system/publish/credentials/field-guidance`) instead of `rules.ts` hardcoding a fifth
   `PUBLISH_CREDENTIAL_PROVIDERS` entry. This is the one place the existing 4-provider pattern is
   NOT extended as-is — extending it would perpetuate the exact drift risk this section exists to
   close, for the one provider where it's cheapest to do right from day one.
3. **The propose-credential tool's own `inputSchema`** (§6) derives its *non-secret* field
   descriptions from the same table, so the model's own read of "what is a bucket" matches what the
   human sees in the form.

Scope discipline: I am **not** proposing migrating the other four providers' `rules.ts` entries off
client-hardcoding in this pass — that's pre-existing debt, not something this feature makes worse.
Flagging it so it isn't mistaken for solved: **[NEEDS CLARIFICATION — recommended, not blocking]**
whether to fold GitHub Pages/Vercel/Netlify/Cloudflare Pages into the same server-fetched guidance
table later, so the whole tab has one consistency story instead of two.

---

## 6. The settings-write boundary — the single most important question, resolved

### 6a. Verifying the exclusion actually holds, and exactly what it covers

I read `src/assistant/__tests__/tool-registrations.settings.test.ts` directly rather than trust the
brief's framing. The exclusion is real but **narrower** than "no settings-write is agent-reachable":

- Four **generic** settings-write tools (`settings_set`, `settings_clear`, `settings_reset`,
  `settings_register_definitions`) are declared in the catalog but structurally refused at wiring
  time — `assertRiskMetadataIsWirable` throws `"has no entry in DERIVED_RISK_BY_TOOL_ID"` for each
  (test at line 131-137), and a repo-wide test (line 139-145) asserts none of the four is reachable
  through the *whole* assistant tool set, not just the settings domain.
- A **curated** write, `settings_set_ui_preference`, IS wired and model-callable directly — no
  confirmation gate at all — because its blast radius is closed by construction:
  `AGENT_WRITABLE_PREFERENCE_IDS` is a fixed allowlist of specific, non-secret keys (the test file's
  own header: "its whole safety argument is that its blast radius is structural rather than
  behavioral").

So the actual rule is: **a broad, model-directed write of an arbitrary value to an arbitrary key is
excluded; a narrow, safe, non-secret write can be direct; anything in between (narrow scope, but a
real secret, real consequence) needs a gate, not exclusion.** Publish credentials are the third
category — narrow in scope (one row, one provider) but carrying a real secret with real external
consequence. That's not the shape either existing settings pattern covers; it's the shape
`content_post_delete` and `deployment_execute_static_publish` already cover.

### 6b. The MCP-UI held-open surface exchange fits — verified against a working, non-confirmation
precedent

`assistant/mcp-ui-tool-calls.ts` confirms the ADR-055 mechanism and its allowlist
(`MCP_UI_REDEEMABLE_TOOL_IDS`, currently `content_post_delete`, `deployment_execute_static_publish`,
`content_post_search`, and a demo-only entry). Both real entries hold up the same shape: the handler
opens a `SurfaceExchangeStore` exchange, emits a UI resource through `ctx.emitSurface`, and **parks**
(`askOnce`) until a human answers through `POST /api/admin/v1/mcp-ui/tool-calls` — verified end to
end in `publish-agent-tools.ts:484-580`.

But both of those are **confirmation** dialogs (`buildConfirmationSurface`,
`node_modules/@jini-ai/ui/dist/features/mcp-ui/surfaces/confirmation.d.ts`) — a fixed
title/description/detail-list plus confirm/cancel buttons. They display facts the *tool call already
decided*; they collect no new input. A credential needs the opposite: an editable form the human
fills in, not a fact the human agrees to.

**That primitive exists too, already shipped, and already exercised end-to-end — just not yet used
by a real feature.** `@jini-ai/ui/mcp-ui/surfaces`'s `form.ts`
(`node_modules/@jini-ai/ui/dist/features/mcp-ui/surfaces/form.d.ts`) renders "the same shell, details,
status region and action row `confirmation.ts` uses, wrapped in a real `<form>`." Its `FormSurfaceSpec`
takes `fields: SurfaceField[]` — `string`/`number`/`boolean`/`enum`/`multi-enum`, each with an
optional pre-filled `value` and a `hint`. `src/assistant/demo-choices-tool.ts` is a **real,
non-mocked exercise of this exact path**: its own header states the daemon's `splitToolResultSurfaces`
withholds the resource from the model, `McpUiSurfaceCard` mounts it client-side, and the human's
submit travels back through the same `/api/admin/v1/mcp-ui/tool-calls` route — "nothing about that
path is stubbed here." It uses the identical one-call-blocks-then-resumes pattern
(`askOnce`/`ctx.emitSurface`) `deployment_execute_static_publish` uses for confirmation.

### 6c. The resolution

**Yes — the MCP-UI form-surface mechanism is the right shape, with one design rule that makes it
safe: the tool handler must never echo a submitted secret value back into its return value.**

The critical property, verified by tracing where the model can and cannot see data in this pipeline:
- The rendered form's HTML/iframe content is withheld from the model entirely (§ above, verified
  claim in `demo-choices-tool.ts`'s own header).
- `answer.params` — the human's actual typed field values, including the secret — lands **inside the
  Node.js tool handler**, server-side. It never enters a prompt or a completion.
- The model only ever sees whatever object the handler's own code chooses to `return`.

This is the exact discipline `deployment_execute_static_publish` already follows for the *existing*
credential (never echoes `token`/`accountId`, only `{published, url, status}` — see
`publish-agent-tools.ts:558-576`'s comment on why). Apply the identical rule to the new tool: after a
confirmed submit, call the credential store's write function directly with the real values, then
return only `{saved: true, providerId, label, connected: true}` — no field value, no partial value,
no masked-tail hint.

**Why this does not violate the settings-write exclusion (§6a):** the model never supplies, decides,
or even observes the secret value at any point. It may supply *non-secret* pre-fill hints (a bucket
name mentioned earlier in the conversation), which appear in the form as an editable starting point,
not a commitment — the human can change or clear them before submitting. The actual write is
triggered by a human's own button click inside their own authenticated browser session, carried over
the same session-authenticated route every other admin-UI write already uses. The model's role is
"propose structure," not "supply the value" — closer to `settings_set_ui_preference`'s "narrow,
bounded, non-secret" category than to the excluded generic-write category, except here the boundedness
comes from "the model structurally cannot touch the value" rather than "the value is a safe key."

### 6d. The new tool

```
deployment_propose_custom_provider_credential
  input: { protocol: "s3-compatible", label?: string, endpoint?: string, region?: string,
           bucket?: string, publicUrl?: string }   // all optional, all non-secret, model-supplied
                                                      // pre-fill hints only — NO accessKeyId/
                                                      // secretAccessKey field exists in this schema,
                                                      // the same structural guarantee
                                                      // EXECUTE_STATIC_PUBLISH_SCHEMA gives the
                                                      // existing token (publish-agent-tools.ts:174-178)
  sideEffects: "mutates-durable-state"   // a confirmed submit does write a row
  authorization: { permission: "deployments.credentials.write" }   // NEW permission — narrower than
                                                                     // deployments.publish; proposing
                                                                     // a credential and executing a
                                                                     // publish are different
                                                                     // capabilities, same granularity
                                                                     // discipline as read vs. publish
                                                                     // already in this file
  no actorClassRule   // same ADR-055 reasoning as deployment_execute_static_publish — this uses the
                        // MCP-UI held-open exchange, not the ExecutionDelegate confirmation
                        // transport, so declaring the rule would fail the build for a transport this
                        // tool doesn't use (publish-agent-tools.ts:52-56's own reasoning, reused)
```

Handler shape (mirrors `deployment_execute_static_publish`'s structure, `publish-agent-tools.ts:484-580`):
1. Validate `protocol` (only `"s3-compatible"` accepted today — an unknown protocol is a schema
   validation error, not a silently-ignored field).
2. Fail closed if `ctx.emitSurface` is unavailable — identical message shape to the existing tool's
   own guard (`publish-agent-tools.ts:501-506`).
3. Open the exchange, build the form via `buildFormSurface` with `S3_COMPATIBLE_FIELD_GUIDANCE`
   (§5) mapped to `SurfaceField[]`, model-supplied args pre-filling `endpoint`/`region`/`bucket`/
   `publicUrl`/`label` where given, `accessKeyId`/`secretAccessKey` always starting blank.
4. Park via `askOnce`.
5. On a non-`"received"` answer (expired/abandoned) or a cancel: return the same
   `{saved: false, cancelled, reason}` shape family `deployment_execute_static_publish` already uses.
6. On submit: re-validate required fields server-side (never trust the client-side `required`
   attribute — `form.ts`'s own header notes it ships `novalidate` precisely because the browser's
   bubble UI is unusable in the surface's small iframe, so this handler is the actual enforcement
   point), call `createPublishCredential`/`updatePublishCredential`
   (`publish-credentials/store.ts` — already exists, already does validate-then-seal-then-write),
   return `{saved: true, providerId: "s3-compatible", label, connected: true}` only.

Add `"deployment_propose_custom_provider_credential"` to `MCP_UI_REDEEMABLE_TOOL_IDS`
(`mcp-ui-tool-calls.ts:37-74`), with a comment following the same "holds up the SAME shape" pattern
already used for the two real entries there.

### 6e. Navigation — resolved as "not needed," verified rather than assumed

The brief asked whether an existing mechanism gets the user to the tab. I searched for a navigation/
deep-link agent tool (`grep -rn "navigate\|deep.?link\|openTab"` across `src/assistant`) and found
hits only in `src/assistant/site/*` — client-directives/capability-registry for the **public site's**
own on-page navigation, unrelated to admin-tab routing. **No admin-tab-navigation mechanism exists,
and none needs to be built**: the MCP-UI surface renders inline inside the chat pane itself
(`McpUiSurfaceCard`, per `demo-choices-tool.ts`'s own trace of the real pipeline) — the assistant
does not need to send the user anywhere. The form *is* "taking them to the tab and opening it," just
rendered as a chat-embedded card rather than a browser navigation. Separately, a human who wants to
browse the Custom tab directly without going through chat gets it via the same `TabBar`/`if`-chain
`Deployment.tsx:55-59,74` already uses for the other four tabs — a fifth entry, no new mechanism.

---

## 7. Explicitly deferred (not designed in depth, per the brief)

- **Generic contract** (Tovu POSTs to a documented endpoint shape the custom host implements) — a
  plausible second protocol under the same "Custom" tab, sharing `PublishProviderId`'s pattern with
  its own `*ConnectionInput` variant. Not designed here.
- **Webhook passthrough** — noted only, "probably never" per the brief.
- **Per-run path-prefix scoping** (publishing to a subdirectory of the bucket) — `bucket`/`publicUrl`
  are whole-bucket in v1; a future `keyPrefix` would live on `S3CompatiblePublishConfig` (a genuine
  per-run choice) rather than the credential, following the `owner`/`repo`/`teamId` precedent.
- **Bucket static-website auto-configuration** (e.g., calling a provider's `PutBucketWebsite`-shaped
  API, or a bucket-policy/CORS setup pass) — v1 assumes the user has already made the bucket
  reachable at `publicUrl` themselves, the same "bring your own configured target" assumption GitHub
  Pages/Vercel/Netlify/Cloudflare Pages all make (Tovu never creates the GitHub repo or Vercel project
  either).
- **Migrating the other four providers' guidance off client-hardcoded `rules.ts`** — recommended in
  §5, not required for this feature.
- **Object cleanup / delete-on-republish** — the four existing targets' own semantics around
  overwrite-vs-clean were not re-examined here; assume S3-compatible overwrites matching keys and
  leaves orphaned old keys in place for v1 (matches "no delete" being the safer default when nothing
  in the brief asked for sync semantics).

---

## 8. Blocking pre-requisite: masked input does not exist in the MCP-UI form primitive

`SurfaceField`/`StringField` (`node_modules/@jini-ai/ui/dist/features/mcp-ui/surfaces/fields.d.ts`)
has no `secret`/masked option, and `TextInputProps.inputType`
(`.../surfaces/text-input.d.ts`) is `'text' | 'number'` only — verified by reading both files in
full. Rendering `secretAccessKey` through this primitive today means it appears as **plain visible
text** while the human types it.

That's a real regression against this product's own existing bar: `PublishCredentialRow`
(`StaticSiteTab.tsx:723`) already renders the equivalent field as `type="password"` for the four
built-in providers. Reaching the identical class of secret through a different entry point (chat vs.
the tab directly) should not weaken how it's displayed.

**Recommendation: this is a required upstream addition, not deferred polish** — add
`secret?: boolean` to `StringField`, rendered as `type="password"` in `renderTextInput`. This is a
small, additive change to `@jini-ai/ui`'s surfaces module, not a redesign. I'm flagging it as
blocking rather than deciding to ship it unmasked, because the owner may weigh the iframe's
same-origin/private-session context differently than I do — **[NEEDS CLARIFICATION]** whether to (a)
treat this as a hard blocker and land the `@jini-ai/ui` change first, or (b) accept unmasked entry for
v1 with a follow-up filed.

---

## 9. Other `[NEEDS CLARIFICATION]` items

- **§5**: fold the other four providers' guidance into the same server-fetched table now, or leave
  as recommended-but-deferred debt? (Not blocking — my recommendation is defer.)
- **§8**: masked-field gap — blocking or deferred with a follow-up? (My recommendation: blocking.)
- **`aws4fetch` vs. hand-rolled SigV4 vs. some other minimal signer** — I did not evaluate every
  minimal-signer package on npm, only the two the brief's framing and my own knowledge suggested were
  the real candidates. If the owner has a preference (or a reason to avoid adding *any* new package,
  preferring hand-rolled `node:crypto` SigV4 entirely), that changes one file's implementation, not
  this spec's contract.
- **Label field**: the existing 4-provider credential rows carry no user-facing label at all (the
  2026-08-15 flatten redesign removed it — [[project_tovu_deployment_model]] handoff, "why is there a
  label there? that's completely useless"). S3-compatible is different: unlike the 4 built-ins, a
  workspace could plausibly want *more than one* S3-compatible connection (R2 for one project, B2 for
  another) — the existing `is_default`-per-provider mechanism
  (`publish-credentials/types.ts:96-100`) already supports multiple named rows per provider, it's
  just unused by the flat 4-row UI. Does the Custom tab need the OLD add/edit/list-with-labels UX
  the other four deliberately moved away from, specifically for this one provider? I lean yes (S3
  genuinely has this multi-connection use case the other four don't), but this is an owner call, not
  an architecture call.

---

## 10. Summary for implementation dispatch

**Small feature, additive throughout, no schema migration, no heavy dependency.** Touches, in order:

1. `publish-credentials/types.ts` — `PublishProviderId` +1, `S3CompatibleConnectionInput`, +1 to
   `PublishConnectionInput` union.
2. `publish-credentials/store.ts` — `PROVIDER_IDS` +1, `validateConnection` +1 branch.
3. `static-publish/types.ts` — `S3CompatiblePublishConfig` (empty), +1 to `StaticPublishConfig`.
4. `static-publish/s3-compatible-target.ts` (NEW) — `S3CompatibleDeployTarget implements DeployTarget`,
   SigV4 PUT + reachability check, no new heavy dependency (§1).
5. `static-publish/adapter.ts` — `buildJiniTarget` +1 branch, `computeBasePath` +1 branch (undefined).
6. `publish-credentials/s3-compatible-field-guidance.ts` (NEW) — the single guidance table (§5, §6).
7. `publish-agent-tools.ts` — new `deployment_propose_custom_provider_credential` tool + handler
   (§6d); `PROVIDER_IDS` array needs no edit (already type-sourced, per its own comment).
8. `mcp-ui-tool-calls.ts` — allowlist the new tool id.
9. Admin: `AdminPublishCredentialProviderId` +1, a new `CustomProviderTab.tsx` (mirrors
   `StaticSiteTab.tsx`'s `PublishCredentialRow` pattern but fetches guidance over HTTP per §5 rather
   than hardcoding it), `Deployment.tsx` +1 tab entry.
10. **Prerequisite or parallel track**: `@jini-ai/ui`'s `StringField`/`renderTextInput` masked-input
    support (§8) — needed before `secretAccessKey` can render safely through the form surface.

Parallel delivery: (1)-(5) [server domain types + target] can proceed independently of (6)-(8)
[agent-guidance + tool wiring] once the `PublishProviderId` union lands, since everything downstream
switches on that type and the compiler enforces completeness. (9) [admin UI] can start in parallel
against the type contract alone, stubbing the HTTP guidance fetch. (10) is a dependency of (7)'s form
build, not of anything else — it can run fully in parallel and land whenever ready, blocking only the
final wiring of the secret fields.
