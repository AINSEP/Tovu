# Custom Publish Provider Contract — S3-compatible, first slice

Status: design spec, not implemented. Author: Software Architect dispatch, 2026-08-15.
Amended twice same day with owner decisions. Pass 1: the `aws4fetch`/AWS-CLI-rejected ruling (§1,
§1a), the bucket-vs-hosting choice reopened as a presented decision rather than resolved silently
(§3a), and the honest AWS-vs-Vercel framing requirement (§3b, §4c). Pass 2: masked input DECIDED
blocking with the exact upstream `@jini-ai/ui` diff spec (§8/§8a), the other-four-providers backfill
DECIDED deferred (§7), the label/multi-connection UX DECIDED no (§9, and its consequences threaded
back into §4c/§6d), and the `publicUrl` field + `buildFormSurface` design both DECIDED approved as
specified (§4a, §6c). **Only §3a remains open** — every other question this spec raised is resolved.
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

**DECIDED (owner, 2026-08-15 — recorded here so it is not re-litigated): use `aws4fetch`. Do not add
`@aws-sdk/client-s3`.** Full reasoning, as given:

- The AWS SDK's AWS-hosted conventions (region-to-endpoint resolution, credential provider chain,
  virtual-hosted-style bucket addressing) are a **correctness** risk for R2/B2/Spaces/Wasabi/MinIO,
  not merely a size cost — partly wrong for the exact use case S3-compatible was chosen to serve.
- 3.3 MB + 11 direct deps + tens transitive, into a Docker image that has never successfully built
  ([[reference_tovu_docker_build_traps]] — 22 `file:` deps, 3 native modules already) and the
  Docker-first, one-container model ([[project_tovu_deployment_model]]).
- **Hand-rolled SigV4 was considered and rejected.** It needs only HMAC-SHA256/SHA-256 from
  `node:crypto`, but it is easy to get almost right and subtly wrong (canonical request construction,
  payload hashing, URI encoding), and signing bugs surface as opaque 403s that are expensive to
  debug. 65 KB with zero transitive deps is close enough to free that owning that risk is not worth
  it.
- `aws4fetch` being 9 files is itself part of the rationale, not incidental: it handles the user's
  secret access key, so hand-auditability matters.

`aws4fetch` is still a new dependency — recorded as a deliberate addition, not a default.

**This settles the size of the whole feature: small.** One new small dependency (`aws4fetch`, 65 KB,
zero transitive deps), no vendor SDK integration surface, no credential-provider chain to reason
about. The work is one new file implementing a narrow interface, plus the credential/UI/tool plumbing
every existing provider already has a precedent for.

### 1a. AWS CLI — considered and rejected, do not revisit

Confirmed by the owner directly: the AWS CLI is **not** an option for any part of this feature, at
any point — noted here explicitly so it is not re-proposed later as a "simpler" alternative to
hand-rolled signing.

- It reintroduces `child_process.spawn` — the exact thing that already blocks Tovu itself from
  Vercel/Cloudflare as *hosting targets* ([[project_tovu_deployment_model]]).
- Containers are ephemeral and often read-only; a runtime-downloaded CLI binary would need to
  re-download on every restart.
- An unsigned binary fetched at runtime and executed by an agent process is an unacceptable attack
  surface on its own, independent of the other two points.
- `execution-mode.ts`'s own header (`publish-credentials/execution-mode.ts:8-12`) already rejects
  PATH-sniffing for a CLI binary as a way to detect capability, on the reasoning that "a container
  with a binary baked into its image but no interactive shell would falsely read as self-hosted-
  capable." A runtime-downloaded CLI makes the identical mistake one step later — presence of the
  binary still would not mean anything can actually use it safely or repeatably.
- To be unambiguous about a term this spec does not otherwise need but that a reader might reach for:
  `"self-hosted-cli"` execution mode (`execution-mode.ts:2-4`) means **a human has a real terminal on
  that machine** — it does not mean, and has never meant, that Tovu's own server process shells out to
  a CLI. Nothing in this spec's S3-compatible design shells out to anything; `S3CompatibleDeployTarget`
  (§2) is a plain signed-HTTP client, identical in kind to how `adapter.ts` already talks to
  GitHub/Vercel/Netlify/Cloudflare Pages over their REST APIs.

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

## 3a. A bucket is not a website — presented as a choice, not resolved

The owner's own framing, stated directly and reproduced here because it names the failure mode this
section exists to design against: *"a novice whose site 403s after a 'successful' publish."*

Uploading objects to a bucket via `PUT` (§2's `S3CompatibleDeployTarget`) does not, by itself, make
them servable as a website. A plain S3-compatible bucket is private by default on every provider in
scope. Making it a served static site needs one more thing on top of the object API — and that
"more" is **not** part of what "S3-compatible" uniformly means across providers, which is the reason
this has to be a named decision rather than an implementation detail:

- **AWS S3**: a bucket-level "Static website hosting" property, plus a bucket policy granting public
  `s3:GetObject` (or CloudFront in front, with its own distribution + origin-access config) — a
  distinct API surface from the object `PUT`/`GET` operations `S3CompatibleDeployTarget` already
  implements.
- **Cloudflare R2**: no "website hosting" concept at all — public access is either R2's own
  `r2.dev` public-development-URL toggle or a custom domain binding, both R2-specific, neither
  S3-API-shaped.
- **DigitalOcean Spaces**: a CDN-endpoint toggle plus Spaces' own permission setting, again its own
  console/API surface, not the S3 object API.
- **Backblaze B2**: a "make bucket public" toggle in B2's *own* native API, separate from B2's S3-
  compatible object-API surface.

In other words: the reason S3-compatible was chosen as the first custom protocol is that the object
API (`PUT`/`GET`/list) is genuinely uniform across these providers — SigV4-sign a request, it works
everywhere. The public-hosting layer is **not** uniform; it is a per-provider integration each as
different from the others as GitHub Pages is from Vercel. Two real options, with real costs each:

**Option A — Tovu configures hosting/public-access too.** Closest to "it just works" for the human.
Cost: a per-provider special case for the hosting/CDN API on top of the uniform object API — for
AWS specifically, a bucket-policy write with real blast radius (a wrong policy can make a bucket
world-writable, not just world-readable, if implemented carelessly). This is real implementation
surface for each provider Tovu wants to support well, and it re-introduces per-provider branching
inside what was supposed to be one uniform adapter — some of the value of picking S3-compatible
first is that it *avoids* a per-provider adapter matrix the way the four REST-API providers already
have one each; auto-configuring hosting partially reintroduces that matrix one layer up.

**Option B — Tovu does not configure hosting; the guidance walks the user through enabling public
access at their provider first, and `publicUrl` (§4) is what they paste back once it's live.**
Cheaper to build and keeps `S3CompatibleDeployTarget` uniform across all five providers in scope
(§2's `publish()`/`checkReachability()` only). Cost: a real extra step for the human, and the
403-after-"success" failure mode the owner named is only avoided if `checkReachability(publicUrl)`
(§2) is actually run and surfaced honestly — a successful object upload with an unreachable
`publicUrl` must be reported as a **partial** success ("files uploaded, but `publicUrl` is not
serving them — check that public access/hosting is enabled"), never folded into the same
`{published: true}` shape a real success gets. `StaticPublishOutcome` (`static-publish/types.ts:92-
108`) does not currently have a partial-success shape — this is new surface, not a reuse of an
existing branch.

**My read, offered as a recommendation, not a resolution**: Option B, because it keeps the "one
adapter, many providers" value proposition intact and because Option A's AWS bucket-policy write is
exactly the kind of "irreversible, external, credential-scoped" action this codebase already treats
with extra weight elsewhere ([[project_tovu_deployment_model]] and this domain's own
`deployment_execute_static_publish` gating) — adding a *second* kind of external-account-mutating
action inside credential setup, before a single object is even published, is a meaningfully bigger
trust ask than what the four existing providers require (none of them configures anything on the
provider side beyond what the user's token already scopes). But this is explicitly the owner's call
per their own framing, not mine to close: **[NEEDS CLARIFICATION — blocking implementation of §6d's
tool and §4's field list]**.

### 3b. The guidance must say AWS is harder than Vercel — up front, not buried

Owner's framing, reproduced directly: *"The per-field help text must say so up front rather than
implying five [now six] fields is the whole job."* For a complete novice asking "I want to deploy to
AWS, how do I do that?", the honest answer is three real pieces of work, not one form:

1. Create a bucket (in the AWS console, or the equivalent for R2/B2/Spaces/Wasabi/MinIO).
2. Decide on and set up public hosting or a CDN in front of it — §3a's open question; whichever way
   that resolves, the human needs to know it's a real, separate step, not a checkbox on this form.
3. Create an access key scoped to just that bucket (not a root/account-wide key) — the IAM/API-token
   step every provider in scope calls something slightly different but that is conceptually the same
   "least-privilege key for this one job" step GitHub Pages/Vercel/Netlify/Cloudflare Pages already
   ask for.

This has two concrete effects on what ships, not just tone:
- The **tool description** for `deployment_propose_custom_provider_credential` (§6d) must say this
  up front, in language the model will actually relay in chat before or while opening the form — not
  bury it in a per-field hint the human only sees after the form is already open. A model that reads
  "publish to S3-compatible storage" and responds as if this is a five-field equivalent of Vercel is
  giving the novice a false sense of how much is left to do.
- The **form's own top-level `description`** (`FormSurfaceSpec.description`,
  `.../surfaces/form.d.ts:33`) carries the same three-piece framing, not just per-field hints — a
  human who opens the form without having read the chat message first (a real case: the form can be
  reopened, or a different chat message triggered it) still gets the honest framing before touching a
  single input.

§4c (field list, when finalized against §3a's resolution) must open with this framing rather than
leading with "here are six fields."

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

**APPROVED (owner): a sixth, required field, `publicUrl`.** Widening `url` to optional on
`StaticPublishOutcome`/`DeployPublishResult` was the alternative — rejected because it is a
higher-blast-radius change (touches every existing provider's success path and the UI's assumption)
to avoid one extra text field on a form that already has five. `publicUrl` follows the same
"lives on the credential, not the publish config" placement as `bucket`/`region`/`endpoint` — see
§4b for why.

The owner's own framing on review, recorded so a later reader does not re-treat "five fields is fine"
as a cap this spec should have respected: that line was **permission to exceed** a narrow shared
field shape when the case genuinely needs it, not a limit on how many fields this form may have. This
finding — a required contract the brief's own framing missed — is exactly the kind of pushback this
dispatch was asked to do.

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

### 4c. Field list and per-field guidance copy

The actual content of `S3_COMPATIBLE_FIELD_GUIDANCE` (§5's single-source table). Every earlier
forward-reference in this spec to "§6 has the actual copy" was a drafting error — this is that
content; fixed here rather than left dangling. Leads with §3b's three-piece honesty framing, per the
owner's explicit instruction that this must be up front, not buried in field 4 of 6.

**Form-level `description` (shown above every field, per §3b):** *"S3-compatible storage needs three
things, not just these fields: a bucket you've already created, public access or a CDN set up in
front of it [— outcome depends on §3a — either 'which Tovu will help you enable below' or 'which
you'll need to enable yourself first, in your provider's dashboard'], and an access key scoped to
just that bucket. If you haven't done the first two yet, do that in your provider's console before
filling this in."*

**No `label` field** — per §9's resolution, S3-compatible follows the same flat, single-connection
shape the other four providers already use, not a named-multi-connection UX. The save call sends the
same fixed constant the existing 4-provider save path already uses for this exact reason
(`use-publish-credentials.hooks.ts:182`'s `PUBLISH_CREDENTIAL_ROW_LABEL` — "the one fixed label this
whole `(workspace_id, provider_id, label)` UNIQUE constraint" needs "without ever asking an operator
to type one," per that file's own comment) — an operator never sees or types a label for
S3-compatible either. `PublishCredentialSetRecord.label` (`publish-credentials/types.ts:94`) still
exists as a required storage column (it is shared machinery across all five providers now, not
S3-compatible-specific), it is simply never a user-facing input.

| Field | Required | Secret | Hint copy (novice-facing) |
|---|---|---|---|
| `endpoint` | no | no | "Your storage service's API address — not your bucket's website address. Cloudflare R2: `https://<account-id>.r2.cloudflarestorage.com`. Backblaze B2: check your bucket's 'Endpoint' field in the B2 dashboard. DigitalOcean Spaces: `https://<region>.digitaloceanspaces.com`. Wasabi: `https://s3.<region>.wasabisys.com`. Plain AWS S3: leave this blank." |
| `region` | yes | no | "The region your bucket lives in — e.g. `us-east-1` for AWS, `auto` for Cloudflare R2, or your Space's region for DigitalOcean (e.g. `nyc3`). Needed to sign requests correctly even if your provider doesn't otherwise think in regions." |
| `bucket` | yes | no | "The exact name of the bucket (DigitalOcean calls it a 'Space') to publish into. Case-sensitive. Tovu does not create this for you — create it in your provider's dashboard first." |
| `accessKeyId` | yes | no (but sensitive — treat like a username, not a password) | "Created alongside your Secret Access Key when you make an API key pair. AWS: IAM → Security credentials → Access keys. Cloudflare R2: R2 → Manage API tokens. Backblaze B2: Application Keys. Use a key scoped to just this one bucket if your provider supports it — not an account-wide key." |
| `secretAccessKey` | yes | **yes** | "Shown only once, at the moment the key pair is created — copy it right away. If you lose it, your provider cannot show it to you again; you'll need to create a new key. Tovu stores this encrypted and never displays it again after you save." |
| `publicUrl` | yes | no | "The web address people will actually visit once this is live, e.g. `https://my-site.pages.dev`, a custom domain pointed at this bucket, or your provider's public bucket URL. [— outcome depends on §3a — either 'Tovu can help set this up for you below' or 'set this up in your provider's dashboard first, then paste the resulting address here'.] Tovu checks this address after every publish and will tell you plainly if it isn't reachable, rather than reporting success anyway." |

The bracketed `[— outcome depends on §3a —]` markers are not placeholder prose left unfinished — they
mark the two spots where §3a's still-open decision changes the actual wording. Both are one sentence
each; finalizing them is a five-minute edit once §3a resolves, not a redesign.

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
  readonly hint: string;       // human-facing, shown under the input — §4c has the actual copy
  readonly required: boolean;
  readonly secret: boolean;    // drives masked rendering — see §8's blocking gap
}
export const S3_COMPATIBLE_FIELD_GUIDANCE: readonly FieldGuidance[] = [ /* 6 entries, §4c */ ];
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

Scope discipline: this pass does **not** migrate the other four providers' `rules.ts` entries off
client-hardcoding — **DECIDED by the owner, §7/§9: deferred**, not folded into this feature. That's
pre-existing debt this feature does not make worse; backfilling it is real future work, sequenced
after S3-compatible ships.

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

**APPROVED (owner) as specified: `buildFormSurface` + no field for the secret anywhere in the tool's
input schema.**

**Yes — the MCP-UI form-surface mechanism is the right shape, with one design rule that makes it
safe: the tool handler must never echo a submitted secret value back into its return value.**

**This has to be read as structural, not conventional — say so plainly, because a convention is
exactly the kind of thing a later change "simplifies" away.** The property that makes this design
acceptable is not "the tool description asks the model not to handle the secret" (a convention,
which a distracted or adversarial model could ignore) — it is that `EXECUTE_STATIC_PUBLISH_SCHEMA`-
style input schemas (§6d) have **no parameter the secret could occupy at all**. There is no
`secretAccessKey`/`accessKeyId` key in `deployment_propose_custom_provider_credential`'s JSON Schema
for the model to fill in, correctly or otherwise — the model cannot supply, request, or leak the
secret through this tool's call surface **even in principle**, independent of whether the model
"means to." A future change that adds an *optional* secret-shaped parameter "for convenience, in case
the user already pasted it in chat" would silently delete this property while looking like a harmless
addition — that is the specific mistake this note exists to head off. If a real need to accept a
user-pasted secret from chat ever arises, that is a different, new design decision requiring its own
review, not an extension of this tool.

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
return only `{saved: true, providerId, connected: true}` — no field value, no partial value,
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

Its catalog `description` must open with §3b's three-piece honesty framing (bucket, hosting/CDN,
scoped key) — this is the text the model actually has available to relay in chat before opening the
form, so this is where "AWS is harder than Vercel" has to live for the model to be capable of saying
so unprompted, not only inside the form the human sees after the tool has already been called.

```
deployment_propose_custom_provider_credential
  input: { protocol: "s3-compatible", endpoint?: string, region?: string,
           bucket?: string, publicUrl?: string }   // all optional, all non-secret, model-supplied
                                                      // pre-fill hints only — NO accessKeyId/
                                                      // secretAccessKey field exists in this schema,
                                                      // the same structural guarantee
                                                      // EXECUTE_STATIC_PUBLISH_SCHEMA gives the
                                                      // existing token (publish-agent-tools.ts:174-178).
                                                      // No `label` either, per §9's resolution — the
                                                      // model never proposes a label because the human
                                                      // is never asked for one; see §4c.
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
   `publicUrl` where given, `accessKeyId`/`secretAccessKey` always starting blank. No label field is
   rendered at all (§9, §4c).
4. Park via `askOnce`.
5. On a non-`"received"` answer (expired/abandoned) or a cancel: return the same
   `{saved: false, cancelled, reason}` shape family `deployment_execute_static_publish` already uses.
6. On submit: re-validate required fields server-side (never trust the client-side `required`
   attribute — `form.ts`'s own header notes it ships `novalidate` precisely because the browser's
   bubble UI is unusable in the surface's small iframe, so this handler is the actual enforcement
   point), call `createPublishCredential`/`updatePublishCredential`
   (`publish-credentials/store.ts` — already exists, already does validate-then-seal-then-write) with
   `label: PUBLISH_CREDENTIAL_ROW_LABEL` (the same fixed constant `use-publish-credentials.hooks.ts:182`
   already sends for the other four providers, imported from `rules.ts` — never a value the model or
   the form supplied), return `{saved: true, providerId: "s3-compatible", connected: true}` only.

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
- ~~Bucket static-website auto-configuration~~ — **moved to §3a**, not deferred: the owner asked for
  this to be presented as a real choice rather than resolved silently one way, so it is no longer
  listed here as settled scope. See §3a for both options and their costs.
- **DECIDED (owner): migrating the other four providers' guidance off client-hardcoded `rules.ts`
  stays deferred, not folded into this pass.** §5's `S3_COMPATIBLE_FIELD_GUIDANCE` table is built for
  S3-compatible alone; `github-pages`/`vercel`/`netlify`/`cloudflare-pages` keep their existing
  `PUBLISH_CREDENTIAL_PROVIDERS` hardcoding untouched. Reasoning (owner's own): refactoring four
  *working* publish paths in service of one *unshipped* provider widens the blast radius of a design
  that has never run end to end — [[project_tovu_deployment_model]] and this domain's own handoff
  already name "the real publish has never run" as the feature's single biggest open risk; touching
  four proven paths to serve a fifth, brand-new one compounds that risk rather than reducing it. If
  the server-fetched-guidance pattern proves out in production for S3-compatible, backfilling the
  other four is explicitly in scope as a **separate, later** piece of work — recorded here as a
  deliberate sequencing choice, not an oversight this spec forgot to close.
- **Object cleanup / delete-on-republish** — the four existing targets' own semantics around
  overwrite-vs-clean were not re-examined here; assume S3-compatible overwrites matching keys and
  leaves orphaned old keys in place for v1 (matches "no delete" being the safer default when nothing
  in the brief asked for sync semantics).

---

## 8. Blocking pre-requisite: masked input, DECIDED — fix `@jini-ai/ui` first

**DECIDED (owner): blocking.** The S3-compatible credential flow (§6d) is gated on this landing
first — not shipped unmasked with a follow-up filed. Owner's reasoning, recorded so it is not
re-litigated:

- It is a straight regression against the existing admin credential row, which already renders
  `type="password"` for the equivalent field.
- The owner screenshots this UI constantly — 38 loose PNGs were cleared out of the repo root the same
  session this spec was written — so a plaintext secret field lands in screenshots and in any screen
  share, not just a hypothetical shoulder-surfing risk inside a private tab.
- `@jini-ai/ui` is the owner's own package (confirmed: `node_modules/@jini-ai/ui` is a symlink to
  `/Users/la/Programming/Jini/packages/ui`, verified via `readlink`) and the change is small, so the
  cost of doing it right first is low relative to the risk of shipping it wrong.

### 8a. The upstream change, specified against the real source (not the `.d.ts` alone)

Confirmed on disk (the Jini monorepo is checked out locally, not just installed as a built
dependency) — read directly, not inferred from the `dist/` shape:
`/Users/la/Programming/Jini/packages/ui/src/features/mcp-ui/surfaces/{fields.ts,text-input.ts}`.

**1. `TextInputProps` — `packages/ui/src/features/mcp-ui/surfaces/text-input.ts:11-31`**

Add one optional prop:

```ts
export interface TextInputProps {
  // ...existing fields unchanged...
  /** Renders as `<input type="password">` — the value is never visible on screen, and browser
   *  password managers may offer to remember it. Ignored when `inputType` is `'number'` (no such
   *  thing as a masked number) and forces `multiline` off (no `<textarea type="password">` exists) —
   *  same precedence `multiline`'s own doc comment already gives `inputType: 'number'`. */
  readonly secret?: boolean;
}
```

**2. `renderTextInput` — `text-input.ts:49-68`**

The control-building branch currently reads (`text-input.ts:58-66`):

```ts
const isNumber = props.inputType === 'number';
const control = props.multiline === true && !isNumber
  ? `<textarea ...>`
  : `<input class="mcpui-input" type="${isNumber ? 'number' : 'text'}"${common}` + ...
```

Change the `type` resolution to a small named helper rather than inlining a second ternary, and use
it in both the `<input type="...">` construction and the `multiline` guard:

```ts
function resolveInputType(props: Pick<TextInputProps, 'inputType' | 'secret'>): 'text' | 'number' | 'password' {
  if (props.inputType === 'number') return 'number';
  return props.secret === true ? 'password' : 'text';
}
```

`multiline` is currently allowed whenever `!isNumber` — that guard must also exclude `secret`, so
`props.multiline === true && resolveInputType(props) === 'text'` becomes the textarea condition
(a secret field always renders as `<input>`, never `<textarea>`, regardless of `multiline`).

Also recommended, not required for the core gate: emit `autocomplete="off"` (or `"new-password"`)
on the `<input>` when `secret` is true, mirroring what `PublishCredentialRow`'s own
`type="password"` input already sets (`StaticSiteTab.tsx:726`, `autoComplete="off"`) — otherwise a
browser's password manager may offer to save an S3 secret access key as a website login for this
`ui://` surface's origin, which is a different and arguably worse exposure than the plaintext
rendering this change fixes.

**3. `StringField` — `packages/ui/src/features/mcp-ui/surfaces/fields.ts:32-38`**

```ts
export interface StringField extends SurfaceFieldBase {
  readonly kind: 'string';
  readonly value?: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly rows?: number;
  readonly secret?: boolean;   // NEW
}
```

**4. `renderFieldControl`'s `'string'` case — `fields.ts:104-111`**

Forward it with the same optional-spread pattern every other prop already uses in this function:

```ts
case 'string':
  return renderTextInput({
    ...base(field),
    ...(field.value === undefined ? {} : { value: field.value }),
    ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
    ...(field.multiline === undefined ? {} : { multiline: field.multiline }),
    ...(field.rows === undefined ? {} : { rows: field.rows }),
    ...(field.secret === undefined ? {} : { secret: field.secret }),   // NEW
  });
```

**5. No change needed to `FieldReadSpec`/`toFieldReadSpecs` (`fields.ts:152-168`).** Masking is a
pure `type` attribute on the rendered `<input>` — the DOM's `form.elements[name].value` returns the
same plain string regardless of `type="text"` vs `type="password"`, so the value-reading/coercion
script `form.ts` generates from `FieldReadSpec` needs no awareness of `secret` at all. This is what
keeps the change small: **4 files touched, 1 new optional prop end to end, zero change to the
value-collection/submit path.**

### 8b. How `deployment_propose_custom_provider_credential` declares it

Once §8a lands, §6d's form build sets `secret: true` on exactly the two fields §4c marks secret:

```ts
fields: S3_COMPATIBLE_FIELD_GUIDANCE.map((f) => ({
  kind: "string",
  name: f.name,
  label: f.label,
  hint: f.hint,
  required: f.required,
  ...(f.secret ? { secret: true } : {}),
  ...(prefill[f.name] !== undefined ? { value: prefill[f.name] } : {}),
}))
```

`§5`'s `FieldGuidance.secret` (already specified with exactly this purpose — "drives masked
rendering") is the single source for which fields get it; no second place decides this.

---

## 9. `[NEEDS CLARIFICATION]` items — status

All three items this spec originally raised here are now **resolved by the owner**. One separate item
raised later (§3a) remains genuinely open. Recorded as decided, not proposed, per the owner's
instruction that resolved items should read as settled rather than re-litigable.

- ~~Fold the other four providers' guidance into the same server-fetched table now, or leave
  deferred?~~ — **RESOLVED, §7: DEFER.** S3-compatible only, for now. Owner's reasoning: refactoring
  four working publish paths to serve one unshipped provider widens the blast radius of a design that
  has never run end to end. Backfilling the other four is real, in-scope future work, not abandoned —
  just sequenced after S3-compatible ships and the pattern proves out.
- ~~Masked-field gap — blocking or deferred with a follow-up?~~ — **RESOLVED, §8: BLOCKING.** The
  `@jini-ai/ui` change (§8a) lands before the S3-compatible credential flow ships, not after. Full
  upstream-change spec (files, types, exact diffs) is in §8a.
- ~~`aws4fetch` vs. hand-rolled SigV4~~ — **RESOLVED, §1**: owner decided `aws4fetch`, hand-rolled
  rejected on correctness-risk grounds. Also resolved: **§1a**, the AWS CLI is rejected outright, not
  a live option.
- ~~Label field / multi-connection UX for S3-compatible~~ — **RESOLVED: NO.** Keep the flat
  one-row-per-provider shape (`PublishCredentialRow`'s existing pattern), no label field, no
  add/edit/list UX reintroduced for S3-compatible alone. Owner's reasoning: the label was killed
  explicitly on 2026-08-15 ("why is there a label there? that's completely useless") and the flat
  per-provider row (commit `9eaa935`) was a deliberate redesign, not an accident — introducing a
  second UX pattern in the same tab for one provider would undo that redesign's own point.
  **Consequence for §4c**: drop the `label` field from `S3CompatibleConnectionInput`/the form
  entirely — it was speculative, matching the OLD 4-provider pattern this decision just re-confirmed
  is dead. `is_default`-per-provider (`publish-credentials/types.ts:96-100`) still applies the same
  way it does for the other four (auto-defaulted, never surfaced as a user-facing choice), not as a
  named-multi-connection feature. If a real multi-bucket need appears later, the owner's framing is
  explicit: revisit it for **all** providers at once, not carve out S3-compatible alone.

**Still open — not resolved by this pass:**
- **§3a**: whether Tovu configures bucket public-access/website-hosting, or the guidance walks the
  user through it themselves. Presented as a choice per the owner's explicit instruction on this
  point; blocks finalizing §4c's field copy and §6d's tool description until closed.

---

## 10. Summary for implementation dispatch

**Small feature, additive throughout, no schema migration, one small decided dependency
(`aws4fetch`, §1).** Touches, in order:

1. `publish-credentials/types.ts` — `PublishProviderId` +1, `S3CompatibleConnectionInput`, +1 to
   `PublishConnectionInput` union.
2. `publish-credentials/store.ts` — `PROVIDER_IDS` +1, `validateConnection` +1 branch.
3. `static-publish/types.ts` — `S3CompatiblePublishConfig` (empty), +1 to `StaticPublishConfig`.
4. `static-publish/s3-compatible-target.ts` (NEW) — `S3CompatibleDeployTarget implements DeployTarget`,
   signed with `aws4fetch` (§1, decided), PUT + reachability check.
5. `static-publish/adapter.ts` — `buildJiniTarget` +1 branch, `computeBasePath` +1 branch (undefined).
6. `publish-credentials/s3-compatible-field-guidance.ts` (NEW) — the single guidance table (§5, §4c),
   including the up-front three-piece framing from §3b (bucket, hosting/CDN, scoped IAM key).
7. `publish-agent-tools.ts` — new `deployment_propose_custom_provider_credential` tool + handler
   (§6d); `PROVIDER_IDS` array needs no edit (already type-sourced, per its own comment).
8. `mcp-ui-tool-calls.ts` — allowlist the new tool id.
9. Admin: `AdminPublishCredentialProviderId` +1, a new `CustomProviderTab.tsx` (mirrors
   `StaticSiteTab.tsx`'s `PublishCredentialRow` pattern but fetches guidance over HTTP per §5 rather
   than hardcoding it), `Deployment.tsx` +1 tab entry.
10. **DECIDED hard prerequisite, not a parallel-and-optional track**: `@jini-ai/ui`'s
    `StringField`/`TextInputProps`/`renderTextInput` masked-input support (§8, full diff spec in
    §8a — 4 files in `/Users/la/Programming/Jini/packages/ui/src/features/mcp-ui/surfaces/`). Gates
    §6d's `secretAccessKey`/`accessKeyId` fields — do not wire the S3-compatible credential flow
    against the unmasked primitive "temporarily."
11. **The one remaining owner decision blocking final copy**: §3a's bucket-vs-website-hosting choice.
    Everything in (1)-(10) is unaffected by which way it resolves except the exact wording of §4c's
    two bracketed sentences and whether a "configure public access for me" step gets added to the
    propose-credential tool's flow — but §4c's copy and §6d's tool description cannot be finalized
    without it. This is now the single open item blocking a complete implementation dispatch; every
    other question this spec raised is resolved (§1, §1a, §4a, §6c, §7, §8, §9).

Parallel delivery: (1)-(5) [server domain types + target] can proceed independently of (6)-(8)
[agent-guidance + tool wiring] once the `PublishProviderId` union lands, since everything downstream
switches on that type and the compiler enforces completeness. (9) [admin UI] can start in parallel
against the type contract alone, stubbing the HTTP guidance fetch. (10) [the `@jini-ai/ui` change] can
run fully in parallel in the Jini repo and land whenever ready — it blocks only the final wiring of
(7)'s secret fields, nothing else in this list.
