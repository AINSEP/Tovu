# SPEC-047 mid-point findings — parser choice, preview scope, and OQ-1 resolved

**Date:** 2026-08-04
**Source:** Spec Agent (dispatched subagent, Sonnet 5), interim report before spec authoring
**Status:** interim findings, persisted on arrival. Superseded in detail by
`ADS-memory/specs/047-pages-vibecoding/spec.md` once written.

## (a) `HtmlRegionParser` → parse5, in a new `@jini-ai/vibecoding/html/node` entry (engine-side)

- **No HTML parser dependency exists anywhere in Tovu or Jini today** — verified by grepping
  `node_modules` and every `package.json` in both repos. Fully greenfield choice.
- **parse5** is spec-compliant (WHATWG parsing algorithm — the same engine jsdom uses), never throws
  on malformed input, and `sourceCodeLocationInfo: true` reports exact start/end offsets per element:
  precisely the `innerStart`/`innerEnd` contract `ParsedRegion` already needs. Its error-recovery
  behavior also matches `checkWellFormed?`'s doc ("omit if the parser can't distinguish malformed
  from recovered" — parse5 genuinely cannot always tell).
- **node-html-parser** is faster but lenient and non-spec. Offset accuracy on malformed markup is the
  one property this module cannot silently get wrong — `HtmlRegionParser`'s own doc comment says "an
  incorrect offset corrupts the document silently." Not worth the saved milliseconds.
- **`DOMParser`** is browser-only; the package is `runtime: "universal"` and the authoritative write
  path is server-side (editing a DB row), so it cannot be primary. Plausible *second* adapter later
  for client-side preview parsing — which would also satisfy constitution Article IV rule-of-two for
  this port.
- **Placement: Jini, not Tovu.** Nothing about it touches Tovu's DB, admin, or permissions. The
  package README already earmarks `./node` as "planned, deliberately not present yet"; a
  parse5-backed HTML adapter fits the same split. Tovu then supplies only `HtmlDocumentStore`, which
  is genuinely host-specific (reads/writes the Pages row).

## (b) D-4 preview → opaque-origin srcdoc for v1

- Reuse `@jini-ai/renderers-react`'s `SrcDocSandbox` as-is. It already ships the exact sandbox string
  with the absence of `allow-same-origin` pinned by a regression test. Zero new engine work, and an
  opaque origin blocks storage/cookie access regardless of URL-vs-srcdoc — which is the threat D-4
  was written against.
- What is lost — a shareable, navigable preview URL surviving a reload — is not a v1 need. Preview
  here is an authoring-time tool for an operator mid-edit, not a distributable artifact. Once a page
  ships, the published URL *is* the shareable link.
- **Consequence: D-4 stops being a sequencing prerequisite.** The decision log's step 1
  ("separate-origin preview, prerequisite for everything") is superseded — preview becomes cheap
  reuse, folded into the streaming-generation step rather than gating everything before it.

## (c) OQ-1 → RESOLVED. BYOK has no live tool-calling consumer at all.

Verified by grep across all of `src/` and `apps/`:

- `runAnthropicToolTurn` / `runOpenAiToolTurn` / `runAzureToolTurn` — **zero call sites anywhere in
  Tovu.**
- `runGoogleToolTurn` — exactly one call site, in the **public** site-assistant (SPEC-046), which
  hardcodes Google server-side and explicitly bypasses the BYOK/browser-key flow (its own header
  says so).
- The admin assistant's real chat execution (`agent-daemon-server.ts`) has **no branch on
  `core.execution.mode` / byok at all** — it always runs the local-CLI daemon path, regardless of
  what the Execution-mode tab is set to.

**So BYOK today is settings-and-probe scaffolding** (test-connection, list-models, detect-agents)
with no live consumer for any protocol.

At the type level the four engine provider files do converge on an identical
`{type:'tool_use', id, name, input}` shape (all four read). But that is four independently
hand-maintained files agreeing by convention, not one shared type — unverified by any cross-protocol
test. A real drift risk, same species as D-10's open-lovable finding.

**Resolution for the spec:** scope Pages generation to the same daemon/local-CLI path the admin
assistant already runs live, **not** a new N-protocol dispatcher. That unblocks D-10 for v1 without
solving BYOK-for-generation, which is recorded as a named pre-existing gap SPEC-047 does not own.

## Two decision-log citations that do not hold up

- **D-12's `media.upload_svg` "XSS-risk-gated capability" at `src/identity/seed.ts:132` does not
  exist** — neither the permission nor that path. Only a generic `media.upload` permission exists
  (`src/server/routes/admin/media/upload.ts`). The real load-bearing precedent for "authoring raw
  content is its own gated permission with a broken-artifact failure mode" is
  `THEME_WRITE_PERMISSION = "theme.edit"` (`src/features/theme/agent-tools.ts:100`) — "granted to
  `admin` but not `editor` in the built-in seed… a different capability with a different worst case."
  Cite that instead.
- **`src/infra/db/schema.ts` does not exist** — the real path is `src/db/schema.ts`. Line 1073
  (`assetBlobs`) checks out exactly once the prefix is corrected, so the content citation is right
  and only the path is stale.

Both were repeated verbatim in the SPEC-047 dispatch brief. See
[[feedback_verify_claims_in_code_comments]] — long evidence-shaped citations in this workspace
sometimes encode inference as observation.
