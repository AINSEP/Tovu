# Admin ports slice + composio fold — findings

Date: 2026-08-02
Branch: `refactor/jini-admin-extraction` (both repos)
Agents: Coordinator (Opus 5) + 2 Sonnet subagents (`ports-agent`, `composio-agent`)

Durable findings only. Session narrative lives in the session record.

---

## 1. The recurring defect class: docs describing an adjacent code path

Three independent instances found today, in three different artifacts. All three would have
survived any amount of test-passing, because none of them are code.

| Where | The claim | The truth |
|---|---|---|
| `redirects/types.ts` doc comment | `matchType: "regex"` is feature-gated | `matcher.ts` rejects it **unconditionally**, 100% of the time in v1 (REQ-22) |
| `AdminMenuItem.label` doc comment | falls back to the target's title when absent | Copied from Tovu's `NavItemNode`. The fallback exists only in `ResolvedNavItem`, a render-time model this API never returns. `toAdminMenuItemDto` passes `label` straight through |
| `packages/composio/CHANGELOG.md` 0.2.1 | "Verified against a real external consumer (Tovu...)" | Batch-applied boilerplate — the same sentence is verbatim in **23 other packages'** CHANGELOGs. Not composio-specific evidence |

**Rule that follows:** when writing a port contract, verify against the handler source, never
against a doc comment on the type — including a doc comment in the same file. The comment may be
describing a sibling model.

## 2. Named principle: silent vs. loud rejection

Discovered while writing the forms and redirects ports; now stated in `forms.ts`'s header with the
other three files pointing at it.

- **A silently-ignored input is removed from the contract.** No error, no effect — keeping it makes
  the type lie about having an effect it does not have. (`updateFormDefinition`'s `slug`: the write
  service ignores it outright. Dropped from the patch type.)
- **A loudly-rejected input stays and is documented.** The caller learns the truth at runtime, and
  since these unions are open, another host may legitimately implement what Tovu refuses. That is a
  host-capability limit, not a contract lie. (`RedirectMatchType`'s `"regex"`.)

A sweep of all 26 methods found no third instance of either shape.

## 3. Union open/closed calls (and the house idiom)

New idiom, no prior precedent in this port set: **`T | (string & {})`**. Recorded in
`core/ports/README.md` so the next port author does not invent a second one.

- **Closed — web standards:** `SeoOpenGraphType`, `SeoTwitterCardKind`
- **Closed — complete standard set:** `RedirectStatusCode` (301/302/307/308 is the whole HTTP
  redirect universe, not Tovu's to extend)
- **Open — Tovu vocabularies:** `RedirectMatchType`, `RedirectSource`, `RedirectStatus`,
  `NavTargetKind`, `MenuStatus`, `FormFieldType`, `FormDefinitionStatus`, `SeoIssueSeverity`

## 4. `AdminMenuTarget` — deliberately deferred, with a trigger

`entryRef`/`termRef` carry `entryId`/`termId`/`taxonomy` — Tovu's content vocabulary in a generic
package. **Not abstracted, on purpose:** there is exactly one host implementation today, and
generalizing from one example is how a package acquires a permanently wrong abstraction.

Shipped shape: the 4 reference variants as typed members, plus a 5th `AdminMenuCustomTarget`
(`kind: string & {}` + opaque `data`) as the escape hatch.

**Trigger for revisiting:** a second host needing a target kind that is none of the four.

Note the cost, documented in the header: the custom member structurally overlaps every literal
kind, so `target.kind === "entryRef"` does not fully exclude it. A `switch` with the custom case as
`default` is the clean way to consume it.

**Widening the discriminant alias alone does nothing** — a host still cannot emit a variant the
union does not contain. This was a Coordinator instruction that `ports-agent` correctly overrode.

## 5. Three distinct deletion shapes now exist in this port set

Do not assume a fourth port's "delete" resembles any of these. Verify each one.

1. **Soft, permanent** — `deleteIntegrationSubscription`, `tombstoneRedirect`: sets a disabled
   status, returns the record, no undo method exists on the server
2. **Hard purge** — `deleteMedia`, `deleteFormSubmission`: genuinely destroys, 204
3. **Two-rung ladder, state-driven** — `deleteMenu(id, {force?})` → `{menu, purged}`: first call
   always trashes; second call (already trashed) attempts purge, 409-class rejection if still
   location-bound unless `force`
4. **Structurally absent** — form *definitions* have no delete at all. `FormDefinitionRepoPort` has
   no such method (INV-08). Only `active`⇄`disabled`. Mirrors `identity.ts`'s `disableUser`

## 6. Other verified behaviors that would mislead a panel author

- `putSeoEntry` returns the **fully resolved** `AdminSeoMeta`, not an echo of the patch — the route
  writes overrides then re-fetches. A panel assuming echo-back renders stale.
- `assignMenuLocation` can **displace another menu** (last-writer-wins) — surfaced as
  `displacedMenu` in the result.
- `updateFormDefinition`'s `fields` patch is whole-array replace, but the chokepoint **rejects
  omitting any existing field id** — add/edit only, no removal path.
- `importRedirects` is always partial-success (207-style) — check `.failed`.
- `RedirectSource: "auto_slug_change"` is read-only provenance, minted only by core's internal
  slug-change pipeline. Excluded from `AdminRedirectCreateInput` entirely.
- `regenerateSeoSitemap` is fire-and-accept (202, `{accepted:true}`) — no job id, no polling.

## 7. Composio's tests had never been type-checked

The single best justification for the fold, and worth generalizing.

`packages/composio/tsconfig.json` had `include: ["src"]` while its tests lived in a top-level
`tests/` directory. So `tsc` never looked at them, and `vitest` does not type-check. 20 type errors
under `exactOptionalPropertyTypes: true` — a setting that **predates composio entirely** — had been
latent since the package's creation.

Admin's convention co-locates tests under `src/**/__tests__/`, which `include: ["src"]` does cover.
The move exposed the debt; it did not create it. All 20 were test-literal shapes (missing required
fields, `key: undefined` where the property should be omitted, a `readonly` tuple where a mutable
array was expected) — zero production types changed.

**Generalizable check:** for any package, confirm its `tsconfig` `include` actually covers its test
directory. A green `typecheck` proves nothing about files outside `include`.

## 8. Green checks proved nothing about reachability

`ports-agent` wrote 603 lines of contracts, added them to `core/ports/index.ts`, and had clean
typecheck + 199 passing tests + clean guard — while **all four ports were unreachable from
`@jini-ai/admin/core`'s public surface.** `core/index.ts` re-exports every port's types by explicit
enumeration and had never been updated. Nothing inside the package imports its own barrel, so no
check could have caught it.

The agent found this by re-reading its own work; the Coordinator's disk verification had missed it
by checking the directory barrel (`ports/index.ts`) instead of the public one (`core/index.ts`).

**Verification that actually works** — compare exported names against the public barrel:

```bash
cd packages/admin/src/core
for f in seo redirects menus forms; do
  while read -r n; do grep -q "\b$n\b" index.ts || echo "UNREACHABLE: $n (ports/$f.ts)"; done \
    < <(grep -oE "^export (interface|type) [A-Za-z]+" ports/$f.ts | awk '{print $3}')
done
```

## 9. Package metadata: `admin` domain admitted

`jini.domain: "admin"` failed R8 — not in `PACKAGE_DOMAINS`. Resolved by **extending the
vocabulary**, not reclassifying: `admin` is a structural peer of `chat` (a product surface with a
framework-free core), and specifically not `ui`, whose two members are both browser-runtime React
libraries while admin's core is universal and imports neither React nor the DOM.

Also added the opt-in `jini.entries` map — admin is the same shape `entries` was introduced for
(`agentic`): universal root plus subpaths with different runtimes.
`{".": universal, "./core": universal, "./browser": browser, "./server": node}`.

## 10. Package boundary audit (read-only, no action taken)

Strict import-statement graph across all 25 Jini packages. **Zero importers ≠ dead** — three
distinct reasons a package is a leaf:

- **Entry points** (`mcp` has a bin, `desktop-host`, `server`, `cli`) — leaf-ness is correct
- **DI-registered via `core` tokens, never imported** (`artifacts`, `capability-providers`,
  `deploy`, `media` — all have `tokens.ts`)
- **Genuinely unreferenced** — `diagnostics` (1,377 LOC, no `tokens.ts`, no bin; the only three
  mentions of its name in the monorepo are its own package.json, barrel, and barrel test),
  `memory` (4,062 LOC), `registry` (4,098 LOC)

`diagnostics` is the closest match to composio's shape if consolidation continues.

**Counter-signal:** `@jini-ai/ui` is now **134,047 LOC** — larger than the next four packages
combined, and it just absorbed `ui-core`. Collapsing is right where a boundary buys nothing, but
`ui` is where that logic has already been spent.

## 11. Product neutrality: Tovu must not appear in Jini at all

**User directive, 2026-08-02.** Jini is a generic engine; Tovu is one product built on it. Product
identity does not belong in the engine. Asked explicitly how deep this goes, the user chose
**maximum separation**: remove the name, the repo paths that point into Tovu
(`apps/admin/src/lib/api.ts`, `src/server/routes/admin/...`), **and** the spec identifiers
(`SPEC-044`, `REQ-05`, `INV-03`, `REQ-22`, `INV-08`) — after being told this costs verifiability.
Also chose to scrub the 23 CHANGELOGs, accepting that repo and npm release history diverge.

Scope: 32 `.ts` files (admin 12, ui 10, capability-providers 5, sqlite 3, protocol 1, http-kit 1)
and 28 Markdown files (23 CHANGELOGs, 2 READMEs, 3+ `source-map.md`).

### Guard rule R5 could not see any of it — and why

R5 (`no product-identity strings in packages/@jini-ai/**`) checks **comment-stripped** content.
That is deliberate: it lets a module doc cite Open Design provenance ("the `OD_DATA_DIR` env var
name ... was removed") without tripping the rule. Adding `'Tovu'` to `PRODUCT_IDENTITY_STRINGS`
therefore reported **clean while 32 files still named the product**, because every leak was in a
doc comment.

Fixed with a second list, `PRODUCT_IDENTITY_STRINGS_IN_COMMENTS_TOO`, checked against **raw** file
text. The distinction is real and worth preserving:

- **Open Design** — a predecessor this engine was extracted from. Citable in comments. Stays on the
  comment-stripped list.
- **Tovu** — a live product built *on* the engine. Must not appear at all. Raw-text list.

**`listSourceFiles` only walks `.ts`/`.tsx`.** Markdown is invisible to the guard, so a clean
`pnpm run guard` is necessary but never sufficient for a neutrality sweep. Verify with:

```bash
grep -rn "Tovu" packages/ --include=*.md --include=*.ts --include=*.tsx \
  | grep -v node_modules | grep -v dist   # must be empty
```

### The failure mode to watch

Deleting a citation and letting the fact it supported go with it — `// Rejected at write time
(REQ-22)` degrading to `// May be rejected`. The standard is *identity out, substance intact*: the
sentence must still state what the citation proved. Worked example from this session —
"Tovu-Runner manages many site instances; a single shared base is the thing that would have to be
unpicked first" → "A fleet orchestrator managing many site instances in one process..." — product
gone, architectural reason preserved.

### Coordinator error worth not repeating

`ports-agent` performed this de-branding unprompted and did not report it. The Coordinator reverted
it as unreported, lossy, and half-done — correct on the facts, wrong on the policy, because the
agent's instinct matched a user rule the Coordinator did not know. The revert was itself then
reverted from git rather than redone. **When an agent's unreported change looks like it is applying
a coherent principle, ask before undoing it.**

## 12. Operational

**SendMessage silently failed three times**, returning `success` each time. `ports-agent` completed
an entire work item having received nothing, and stated so explicitly. Confirmed delivery only
after requiring a numbered ACK plus a paraphrase. Treat that tool's success response as meaningless
until an agent quotes the content back.

`core/ports/` is now a flat directory of 16 files and will pass 20 if widgets/content-types/
entries/taxonomy land. `@jini-ai/ui` groups by feature instead (`features/<x>/ports.ts`), keeping
each capability's types, rules, and contract together. Admin split on the layer axis. Worth
revisiting as its own mechanical move — deferred, not rejected.
