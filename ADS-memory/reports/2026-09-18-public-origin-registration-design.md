# Public origin registration — design note

- Date: 2026-09-18
- Task slug: `public-origin-registration`
- Author: Software Architect (Direct), dispatched session
- Governing ADR: **ADR-040** (`ADS-memory/reports/architecture/ADR-040-core-origin-registry-v0.md`), extended by ADR-046 Phase 1 (durable SQLite adapter)
- Predecessor commit: `d21d6e7ac` — "fix(seo): never let a dev-capability localhost origin reach a public SEO URL in production"

---

## 0. Relayed-claim verification

Every background claim in the dispatch was checked against the tree, not accepted.

| Relayed claim | Verdict | Evidence |
|---|---|---|
| `d21d6e7ac` fixed a live prod bug where `sitemap.xml` emitted `http://localhost:3000/` | **TRUE** | `git merge-base --is-ancestor d21d6e7ac HEAD` → ancestor. Commit message + `apps/website/src/features/seo/__tests__/sitemap.test.ts:105` regression pin. |
| `seedDevCapabilityOrigin` writes a hardcoded `localhost:3000` origin on every boot, including Fly's | **TRUE with one correction** — the **host** and **port** are hardcoded (`host: "localhost"`, `port: 3000` at `apps/website/src/server/runtime/composition/deps.ts:1018-1030`), but the **scheme is derived**, not hardcoded: `deriveDevScheme(resolveDevTls(...).active)` (same file, line 1017). That derivation was a 2026-09-05 audit fix and it matters to this design (see §5). |
| The seed is idempotent find-or-create, so Fly's first boot wrote the row permanently | **TRUE** | `origin-repo.sqlite.ts:85-86` — early-return on any existing row for the workspace. |
| `d21d6e7ac` degrades that origin to "unverified" in production, so SEO now emits relative paths | **TRUE** | `absolute-url.ts:109` — `if (origin.source === "dev-capability" && mode() === "production") return undefined;`, and `toAbsoluteUrl` returns `path` unchanged when `origin` is undefined (`absolute-url.ts:71`). |
| There is no mechanism anywhere to register Tovu's actual public origin | **TRUE** | `origin_settings` has exactly one writer in the whole tree (`seedDevCapabilityOrigin`); `OriginSettingRepoPort` declares no write method (`features/origin/ports.ts`); no admin route writes it. |
| `TOVU_PUBLIC_URL` exists but is wired only to oauth / external-mcp, **not** to the origin registry | **TRUE** | Three production consumers, all outside the registry: `assistant/admin-screen-link-tool.ts:201`, `assistant/external-mcp-oauth.ts:1001`, `server/inbound/public-http/routes/oauth/public-origin.ts:77`. Plus one test-harness use (`development/playwright.connectors.config.ts:70`). Zero references from `features/origin/**`, `platform/db/sqlite/origin-repo.sqlite.ts`, or `server/runtime/composition/deps.ts`. **Setting it as a Fly secret today does nothing for the sitemap.** |
| `fly.toml` already sets `TOVU_RUNTIME_MODE=production` | **TRUE** | `fly.toml` `[env]`. It does **not** set `TOVU_PUBLIC_URL` — no `[env]` entry, and it is not in the secrets list the file documents. |

**One additional fact the dispatch did not mention, and it is the most security-relevant thing in the area:** `routes/oauth/public-origin.ts`'s `resolvePublicOrigin(req)` prefers `TOVU_PUBLIC_URL` but **falls back to `req.get("host")` plus `X-Forwarded-Proto`** (lines 85, 37-45). That is a request-derived origin, and its own doc acknowledges `Host` is caller-controlled. It is used only for OAuth callback URLs. It must never become an input to the origin registry — see §6.

---

## 1. Verified current state

### Who writes origins
Exactly one writer, repo-wide: `seedDevCapabilityOrigin` (`apps/website/src/platform/db/sqlite/origin-repo.sqlite.ts:77`), called unconditionally from the composition root (`apps/website/src/server/runtime/composition/deps.ts:1018`) on every boot in every environment. Contract: find-or-create by `workspaceId`, never overwrite. It writes `{ scheme: deriveDevScheme(...), host: "localhost", port: 3000, source: "dev-capability", egressAllowlist: ["example.com"] }`.

`OriginSettingRepoPort` deliberately declares **no** write method; the in-memory adapter seeds through its constructor, the SQLite adapter through this standalone function. That asymmetry is disclosed in the contract suite's own file header (`features/origin/__tests__/repo.contract.test.ts:13-23`).

### Storage
`origin_settings` (`apps/website/src/platform/db/schema.ts:1324`): `workspace_id` PRIMARY KEY, `scheme`, `host`, `port` (nullable), `base_path` (nullable), `verified_at`, `source`, `redirect_allowlist_json`, `egress_allowlist_json`. One row per workspace.

### "verified" vs "unverified"
There is no boolean. The registry's vocabulary is:
- **A row exists** → `canonicalOrigin()` returns it. That *is* "verified".
- **No row** → `canonicalOrigin()` throws `OriginNotVerifiedError` (`features/origin/origin.ts:218-220`). ADR-040 §2's fail-closed precondition.
- `source` distinguishes **`"workspace-setting"`** (a real, operator-registered public origin; must be `https` — enforced by `createVerifiedOrigin`, `features/origin/types.ts:76`) from **`"dev-capability"`** (localhost/preview; the only source for which `scheme: "http"` is legal).
- `verifiedAt` is a timestamp stamp only. **Nothing in the tree performs any reachability or ownership check.** ADR-040's own "Open" section still lists the verification mechanism as a v0.1 item.

### Every consumer of the origin
Read through `OriginRegistryPort.canonicalOrigin` / `isAllowedRedirectTarget` / `isAllowedEgressTarget`:

| Consumer | File | What breaks on a wrong origin |
|---|---|---|
| **SEO — sitemap** | `features/seo/sitemap.ts:171` (via `resolveWorkspaceOrigin`) | `<loc>` absolute URLs |
| **SEO — canonical / og:url / og:image / twitter:image** | `features/seo/seo.ts:286` | crawler + social link previews |
| **SEO — home/page canonical** | `server/inbound/public-http/routes/site/pages.ts:111` | `buildExtraHead` canonical |
| **SEO — robots.txt `Sitemap:` line** | same `resolveWorkspaceOrigin` seam (per `absolute-url.ts` header) | sitemap discovery |
| **Redirects — write gate** | `features/redirects/redirects.ts:258` | open-redirect oracle / same-origin verdict |
| **Redirects — read path** | `features/redirects/phase-handler.ts:94,176` | live `Location:` decisions |
| **Members — magic links** | `features/members/write-service.ts:137` | sign-in links |
| **Newsletter — confirmation** | `features/newsletter/confirmation.ts:86` | double-opt-in links |
| **Newsletter — unsubscribe** | `features/newsletter/unsubscribe.ts:69` | unsubscribe links (CAN-SPAM-relevant) |
| **Newsletter — launch gate** | `features/newsletter/launch-gate.ts:75` | **blocks real-recipient sends if `canonicalOrigin` throws** |
| **Site evidence** | `features/site-evidence/collect-page-evidence.ts:174` | self-fetch base URL |
| **Egress policy (integrations)** | `OriginRegistry.isAllowedEgressTarget` | third-party egress allowlist |

Not a consumer, but relevant: `platform/routing/routing.ts:125` and `platform/routing/types.ts:100` still carry the original unwired `TODO(ADR-040)` for composing `canonicalUrl` from the registry. `features/seo/absolute-url.ts` is the narrow wiring that was done instead.

**So the scope of "the origin is wrong" is far wider than the sitemap.** In production today the registered origin is `http://localhost:3000`, which means newsletter confirmation/unsubscribe links, magic links, and redirect same-origin verdicts are all resolving against localhost. `d21d6e7ac` fixed only the SEO seam. This is a pre-existing condition, not introduced here, but it is the reason the fix belongs at the *registry*, not at each consumer.

---

## 2. What ADR-040 actually constrains (quoted)

> **§2.** "**Source of truth = a verified workspace setting**, never the request host. The configured origin is verified (e.g. reachability / ownership check) and stamped `verifiedAt`; an unverified/absent origin fails closed (no canonical, no real-recipient send — consumers must treat a missing verified origin as a hard precondition…)"

> **§4.** "**Dev/preview** origins (localhost, preview hosts) come only via `source: "dev-capability"` — a named capability, never consumer code"

> **Amendment 7 (BLOCKER fix).** "Reading the inbound request `Host`/`:authority` for any canonical/link/allowlist/redirect decision **outside `lib/origin/` is forbidden and enforced by an import-boundary CI canary**… The raw request host is available to `lib/origin/` verification code only."

> **Round-3 fold, amendment 1.** "`VerifiedOrigin.scheme` is `"https" | "http"`, constrained: `"http"` is legal **only** when `source: "dev-capability"` — any workspace-setting-sourced origin must be `"https"` (fail-closed otherwise…)"

> **§6.** "**Freeze the port shape now** (ADR-005); iterate `VerifiedOrigin` contents later."

> **Open.** "Origin **verification** mechanism (reachability vs DNS/ownership proof) — v0.1."

Binding consequences for this design:
1. The registered value may not come from the request (§2, amendment 7).
2. A `workspace-setting` origin must be `https` (Round-3 amendment 1) — already enforced in code by `createVerifiedOrigin`, which **throws** `InsecureOriginSourceError`. Any new writer must therefore never hand it an `http` workspace-setting origin, or it crashes boot.
3. Absent origin must fail closed, i.e. "no row" is a legal, specified state — not something to paper over with a fabricated default (§2).
4. `OriginRegistryPort`'s shape is frozen (§6). This design adds no port method.
5. ADR-040 leaves the *verification mechanism* explicitly open. So "trusted because the operator declared it in the process environment" is filling a designated hole, not contradicting a decision.

---

## 3. Recommended mechanism

**Reuse `TOVU_PUBLIC_URL` as the value source; register it as a `workspace-setting` origin at boot, but only when the value is provably a public https origin; otherwise leave the registry alone.**

Three pieces.

### 3a. `features/origin/configured-origin.ts` — a pure resolver (new file)

```ts
resolveConfiguredOrigin(required: { now: ISODateTime }, optional?: { env }): VerifiedOrigin | undefined
```

Reads `env.TOVU_PUBLIC_URL` (defaulting to `process.env`) and returns a `workspace-setting` `VerifiedOrigin`, or `undefined`. It **never throws**. Rejection pipeline, in order — each rejection returns `undefined` and logs one `console.warn` naming the reason and the offending value:

1. unset, or blank after trim
2. contains a forbidden raw character — reuses `origin.ts`'s exported `hasForbiddenRawUrlCharacter` (backslash / whitespace / C0-DEL), the same predicate ADR-040 amendment 8 requires of the redirect oracle. Not a new rule, the existing one.
3. `new URL()` throws
4. `protocol !== "https:"` → refused. ADR-040 Round-3 amendment 1 makes `http` illegal for a `workspace-setting` origin, and `createVerifiedOrigin` would throw on it. **Refusing here is what keeps that throw off the boot path.**
5. non-empty `username`/`password` (userinfo) → refused, mirroring `normalizeOriginCandidate`
6. non-empty `search` or `hash` → refused (a canonical origin cannot carry a query or fragment; tolerating one would silently drop it)
7. **host is a loopback identity** → refused: `localhost`, any `*.localhost`, any address in `127.0.0.0/8`, `::1`, `0.0.0.0`, `[::]`. A loopback host provably means "this machine" and can never be a public canonical origin. This rule is what makes reuse of `TOVU_PUBLIC_URL` safe (see §4).
8. empty host after lower-casing and stripping one trailing dot → refused

On acceptance it returns `createVerifiedOrigin({ scheme: "https", host: <lowercased, trailing-dot-stripped>, port?: <only when explicit>, basePath?: <pathname when not "/">, verifiedAt: now, source: "workspace-setting" })`.

Pure, no I/O, no DB, no `Request` type in scope — directly unit-testable, one assertion per rejection reason.

### 3b. `registerConfiguredOrigin` — a second writer in `origin-repo.sqlite.ts` (new export)

```ts
registerConfiguredOrigin(required: { db, workspaceId, origin: VerifiedOrigin }, _optional = {}): "inserted" | "updated" | "unchanged"
```

- no row → **INSERT** (allowlists `[]`)
- row present, origin columns already equal → **no write**, returns `"unchanged"` (so a steady-state boot does not churn `verified_at`)
- row present and different → **UPDATE of the origin columns only** (`scheme`, `host`, `port`, `base_path`, `verified_at`, `source`). `redirect_allowlist_json` and `egress_allowlist_json` are **left untouched.**

Two deliberate properties:

- **It is a different function from `seedDevCapabilityOrigin`, not a change to it.** The certified idempotency test exercises `seedDevCapabilityOrigin` only; its contract and its assertions are untouched. (§7.)
- **Preserving the allowlists on update is not incidental.** Production's existing row carries `egress_allowlist_json: ["example.com"]` from the poisoned first boot. A blind full-row overwrite would silently empty it and fail-close every integration egress check — a silent behavior change with no relationship to the bug being fixed. A narrow origin-columns-only UPDATE cannot do that.

Why a standalone function rather than a `write` method on `OriginSettingRepoPort`: ADR-006 rule-of-two says don't abstract before the second case exists. There is still exactly one durable adapter and no admin write flow; promoting a write method now would force the in-memory double to implement it and would widen a port ADR-040 §6 froze. The existing `seedDevCapabilityOrigin` set this precedent for the same reason. **Recorded as the re-evaluation trigger:** when the admin verification flow lands, both writers move behind a real port method at that point.

### 3c. Composition root (`server/runtime/composition/deps.ts`) — the call site

Replaces the current unconditional `seedDevCapabilityOrigin(...)` with:

```
configured = resolveConfiguredOrigin({ now: clock.nowIso() })
if (configured)                       -> registerConfiguredOrigin({ db, workspaceId, origin: configured })
else if (mode() !== "production")     -> seedDevCapabilityOrigin({ ...exactly as today, incl. deriveDevScheme and egressAllowlist: ["example.com"] })
else                                  -> write nothing; console.warn naming TOVU_PUBLIC_URL
```

### Where the value comes from, and how it is trusted

`TOVU_PUBLIC_URL`, the process environment. **The trust root is "who can set this deployment's environment"** — on Fly, whoever can run `fly secrets set` / edit `fly.toml`, which is strictly more privileged than an admin-UI login. It is *not* a reachability or DNS-ownership proof, and this design does not claim one: ADR-040's "Open" section still owns that as a v0.1 item. `verifiedAt` therefore means "declared and accepted at this boot", which is exactly what it already means for the dev-capability seed. Stating this plainly is part of the design; anything stronger would be a false claim.

### Boot with no configured origin

| Runtime mode | `TOVU_PUBLIC_URL` | Result |
|---|---|---|
| local | unset / loopback / invalid | dev-capability localhost seed, **unchanged from today** (including `deriveDevScheme`) |
| local | valid public https | that origin registers. Intentional: it is how an operator tests prod-shaped absolute URLs locally. |
| production | valid public https | that origin registers; a pre-existing dev-capability row is **corrected in place** (prod self-heals on next deploy) |
| production | unset / loopback / invalid | **no row written.** Fresh DB → `OriginNotVerifiedError` → relative paths, fail-closed per ADR-040 §2. Existing poisoned prod DB → the row stays, and `d21d6e7ac`'s read-side guard is what keeps it out of SEO documents. |

**Disclosed behavior change** (owner rule: no silent behavior changes). On a *fresh* production DB with no `TOVU_PUBLIC_URL`, no origin row is written where today one would be. Consequences: newsletter's launch gate blocks real-recipient sends; redirect cross-origin verdicts fail closed; site-evidence self-fetch has no base. That is ADR-040 §2's specified posture, and the behavior it replaces was "send `http://localhost:3000` unsubscribe links to real subscribers" — broken, not working. Production's *current* DB already has a row, so this changes nothing for the live deployment today.

**Operator action, which is the actual fix for the live site:** add `TOVU_PUBLIC_URL = "https://tovu.fly.dev"` to `fly.toml`'s `[env]` block. It is a public URL, not a secret, so `[env]` is the right home (the file's own comment reserves secrets for `fly secrets set`). Without this, the code change gives production a *mechanism* but not a *value*, and the sitemap stays relative.

---

## 4. Alternatives rejected

**(a) A new dedicated env var (`TOVU_CANONICAL_ORIGIN`).** Rejected. ADR-040's own Context names the fracture it exists to close: "Duplicated settings drift." Two env vars naming the same concept — "the public origin this deployment is reached at" — is precisely that duplication, and it guarantees a future incident where OAuth callbacks and canonical URLs disagree. The one real argument for a separate var was that local `.env` already sets `TOVU_PUBLIC_URL=https://localhost:3000` (verified), so reuse would silently flip local dev from `dev-capability` to `workspace-setting` and override `deriveDevScheme`'s TLS derivation — re-opening the exact 2026-09-05 audit bug where a hardcoded `https` shipped broken links on a plain-HTTP dev server. **The loopback rejection rule (§3a step 7) removes that argument entirely:** `https://localhost:3000` is refused as a public origin, local dev falls through to the unchanged dev seed, and the drift risk is avoided too. Reuse wins on both axes once loopback is refused.

**(b) Derive the origin from the request (`Host` / `X-Forwarded-Host` / `X-Forwarded-Proto`), cached into the registry on first request.** Rejected outright — it is the single thing ADR-040 exists to forbid. §2: "never the request host." Amendment 7 makes reading the request host outside the origin library a BLOCKER-grade violation with a CI canary. And it inverts the threat model: one request carrying a forged `Host` during a cold boot would durably poison the canonical origin for every subsequent sitemap, magic link, unsubscribe link, and redirect verdict — a persistent host-header injection with a much larger blast radius than the OAuth-callback case `public-origin.ts` reasons about. Attractive because it is zero-config; that convenience is exactly the trap.

**(c) An admin-UI setting written through a new `OriginSettingRepoPort.write` method.** Rejected *for now*, and it is the right long-term home. Three blockers today: it cannot bootstrap — a fresh deploy whose admin UI is reachable only at an origin the registry does not yet know is a chicken-and-egg problem, and production's already-poisoned row needs to self-correct on deploy, without a human; it needs the reachability/ownership verification flow ADR-040 explicitly defers to v0.1, and shipping an unverified admin-writable origin would put a lower-privilege surface (admin login) in charge of a security-critical value; and it widens a port ADR-040 §6 froze, with no second consumer yet (ADR-006). Env config is the bootstrap primitive; the admin flow layers on top later. Recorded as a re-evaluation trigger, including the precedence question (my recommendation when it lands: env config wins and the UI shows the value as operator-managed and read-only, because environment access is the higher privilege).

**(d) Hardcode `https://tovu.fly.dev` behind a production check.** Rejected. It is not a mechanism — it is the same class of defect as the hardcoded `localhost:3000` that caused this bug, pointed at a different string, and it makes the codebase unusable for any second deployment. It also cannot be tested prod-shaped without editing source.

**(e) Delete or rewrite the poisoned production row (a migration or boot-time repair).** Rejected as out of scope and needlessly destructive. `registerConfiguredOrigin`'s update path already corrects that row as a side effect of configuring the real origin, with no migration, and `d21d6e7ac`'s read-side guard already neutralizes it for SEO in the meantime. A destructive DB repair for a row that two other mechanisms already handle is not justified, and would be an escalation to the owner if it were.

---

## 5. Should the dev seed keep existing, and is env-sniffing good enough?

**Keep it, with its call site narrowed.** It earns its place: a fresh local dev server with no configured origin needs *some* origin or `canonicalOrigin` fails closed and every absolute-URL code path goes dark locally — which is exactly what ADR-040 §4 sanctions `source: "dev-capability"` for ("Dev/preview origins… come only via `source: "dev-capability"` — a named capability"). It also carries the `egressAllowlist: ["example.com"]` entry every integrations fixture depends on, and its `deriveDevScheme` derivation is a real audit fix that must not be lost.

What changes is **where it is allowed to run**, not what it does:
- it no longer runs at all when a configured public origin is present (config supersedes the dev default), and
- it no longer runs in production mode, ever.

**Is environment-sniffing good enough as the guard?** It is adequate here, and I'll say precisely why rather than wave at it.

- `resolveRuntimeMode` reads exactly one variable, `TOVU_RUNTIME_MODE`, and never `NODE_ENV` in either direction. It defaults to `"local"` on any missing or unrecognized value — the safe-in-both-directions default its own file header argues for. So the failure mode of the sniff is "a production deploy that forgot `TOVU_RUNTIME_MODE` is treated as local and writes the dev seed" — i.e. exactly today's bug, not a new one. `fly.toml` does set it.
- The weakness is real but bounded, and it is **not the primary guard in this design.** Two independent mechanisms sit in front of it: (1) whenever `TOVU_PUBLIC_URL` names a real public origin, the dev seed is skipped regardless of runtime mode, and the real origin takes the row; (2) the loopback rule means the dev seed's `localhost` value can never be produced by the configured path. The runtime-mode check is the third layer, covering only "production, no configured origin, mode correctly set."
- The genuinely stronger alternative — make the dev seed refuse to write whenever the DB file is not a local dev path — was considered and rejected: it substitutes filesystem-path sniffing (fragile across Docker, Fly volumes, tests, and the desktop app) for env sniffing, with no gain in the case that matters.

I am **not** proposing to delete `d21d6e7ac`'s read-side degradation in `absolute-url.ts`. It stays as defense in depth, and it is load-bearing for one case this design cannot reach: production's already-written poisoned row when `TOVU_PUBLIC_URL` is still unset.

---

## 6. Security analysis

**Can a request-derived or attacker-influenced value ever become the registered origin under this design? No.**

- The only input is `process.env.TOVU_PUBLIC_URL`, read in the composition root at boot, before any request is served. `resolveConfiguredOrigin` takes an `env` record and an ISO timestamp; Express's `Request` type is not in its import graph. There is no code path from a header to a write.
- `routes/oauth/public-origin.ts`'s `resolvePublicOrigin(req)` — the one function in the tree that *does* fall back to `req.get("host")` and honor `X-Forwarded-Proto` without a `trust proxy` config — is **deliberately not reused**, not imported, and not refactored into this path. Its request fallback is scoped to OAuth callback URLs, where its own doc reasons the blast radius down to a self-inflicted broken redirect. Pulling it into the registry would convert that into a durable, cross-consumer host-header injection. This is worth a line in the implementation's file header so a future reader does not "helpfully" deduplicate the two.
- ADR-040 amendment 7's import-boundary rule is respected: nothing added here reads the inbound host.

**Residual risks, stated rather than buried:**
1. **Whoever can set the process environment can set the canonical origin.** That is the design's trust root and it is the strongest one available without the reachability proof ADR-040 defers to v0.1. On Fly that is `fly secrets set` / `fly.toml` — a higher bar than admin login. Someone with that access can already deploy arbitrary code, so it grants nothing new.
2. **No reachability/ownership verification is performed.** A typo'd `TOVU_PUBLIC_URL` produces a confidently-wrong absolute origin everywhere, with no error. Mitigated only by the validation pipeline (https-only, no userinfo, no loopback, no query/fragment, no control characters) and by the value being a single deploy-time string a human writes once. Honest limitation; ADR-040's open item.
3. **`basePath` is accepted from the URL's pathname.** ADR-040's Open section flags basePath as possibly v0.1, but the column and the `VerifiedOrigin` field already exist and `originBaseUrl` already renders it, so accepting it is consistent with what ships, not a widening.
4. **Rejected values are logged.** The warning includes the offending `TOVU_PUBLIC_URL` value. That variable is a public URL by definition, never a credential, so this is not a secret-in-logs finding — but the log line must print only that variable's value and never the surrounding environment.

---

## 7. Does the certified idempotency test survive unchanged?

**YES — explicitly, and by construction.**

The certified test is `features/origin/__tests__/repo.contract.test.ts:78`, `"[sqlite] seedDevCapabilityOrigin is idempotent — a second call never overwrites an existing row"`. It calls `seedDevCapabilityOrigin` twice and asserts the first seed's host survives.

Under this design:
- `seedDevCapabilityOrigin`'s body, signature, and find-or-create contract are **not modified**. Only its call site in `deps.ts` is guarded.
- The new write path is a **separate exported function**, `registerConfiguredOrigin`, which the certified test never calls.
- No assertion in that test — or anywhere in `repo.contract.test.ts` — is weakened, deleted, inverted, or re-scoped.

The security property that test protects ("a re-run of the boot seed can never clobber a real registered origin") is not merely preserved, it is *strengthened*: after this change a `workspace-setting` row registered from config also blocks the dev seed at the call site, so the dev seed never even reaches its own guard in production.

**The escalation tripwire in the dispatch is therefore not crossed.** New tests are added alongside the certified one; nothing existing is touched. Phase 2 proceeds.

---

## 8. Implementation plan (Phase 2)

RED-first, in this order. Exact assertion text, not loose matches.

1. **RED** — `features/origin/__tests__/configured-origin.test.ts` (new): accepts a valid public https URL and yields the exact `VerifiedOrigin`; refuses each of the eight rejection reasons individually; `https://localhost:3000` (the real local `.env` value) refuses; never throws on any input.
2. **RED** — `features/origin/__tests__/repo.contract.test.ts` **additions only**: `registerConfiguredOrigin` inserts into an empty DB; corrects an existing `dev-capability` localhost row to the configured `workspace-setting` origin; **preserves both allowlist columns across that update** (the assertion that pins §3b's narrow-UPDATE decision); is a no-op when the stored origin already matches.
3. **RED** — `features/seo/__tests__/sitemap.test.ts` additions: prod-shaped end-to-end pair — with the configured origin registered, `loc` is exactly `https://tovu.example/published-visible`; with nothing configured in production mode, `loc` is exactly `/published-visible` and contains neither `localhost` nor `://`.
4. Implement 3a, 3b, 3c. Confirm GREEN.
5. `fly.toml` — add `TOVU_PUBLIC_URL = "https://tovu.fly.dev"` to `[env]`, with a comment naming this note.
6. `npx tsc -p tsconfig.json --noEmit` from the repo root before committing. Scoped test runs only, from the repo root.
7. Update the stale disclosures that this change falsifies: `origin-repo.sqlite.ts`'s file header ("the only writer is `seedDevCapabilityOrigin`"), `schema.ts:1321`'s equivalent sentence, and `capability-inventory.ts:300`'s `sourceOfTruth` string. Leaving them would create exactly the false-comment register this repo has been bitten by.

Out of scope, flagged not fixed: `platform/routing`'s unwired `TODO(ADR-040)`; promoting the two writers behind a port method; the reachability-verification flow (ADR-040 v0.1); the admin-UI origin setting.
