# Vibecoding as a Jini capability — what already exists, and what the port actually is

**Date:** 2026-08-03
**Stage:** pre-spec. This is evidence + two corrections, not a design.
**Owner:** Coordinator (Review Mode), Claude Opus 5
**Relationship to prior work:** `pages-vibecoding-decisions.md` is a **product-level** design for
Tovu Pages. This document asks the **engine-level** question: what would a reusable vibecoding
capability in Jini contain, given more than one consumer.

---

## Verdict

Jini already contains five of the seven parts of a vibecoding stack. They were built for other
reasons and are sitting unused for this purpose. **The port is not "build vibecoding" — it is
building the apply/undo tier and half of the describe tier, and binding the existing parts to it.**

The reason this was not obvious: the pieces are spread across five packages under names that don't
say "vibecoding" (`agentic`, `renderers-react`, `chat-core`, `platform`, `deploy`).

---

## The seven parts, and where Jini stands

| # | Part | What it does | Jini today | Evidence |
|---|---|---|---|---|
| 1 | Ask | Conversation surface, transcript, tool events | **has** | `chat-core/src/{transcript,messages,tool-events}.ts` |
| 2 | Describe | Tell the model what exists, in addressable parts | **half** | naming exists (row 2 below); describing does not |
| 3 | Stream | Read a partial answer as it arrives | **has** | `chat-core/src/partial-json.ts`, `agentic/src/gen-ui/{encoder,events}.ts` |
| 4 | **Apply** | Turn the answer into a real change | **MISSING** | see "the gap" below |
| 5 | **Undo** | Snapshot per turn, rewind to any point | **MISSING** | see "the gap" below |
| 6 | Show | Render the result without letting it attack you | **has** | `renderers-react/src/{sandboxed-document,srcdoc/*}.ts`, `react/components/SrcDocSandbox.tsx` |
| 7 | Fix | Feed an error back in as a new turn | **small gap** | nothing found; it is a thin layer over 1 |
| — | Ship | Publish the result | **has** | `deploy` (Vercel, Cloudflare Pages, Netlify, GitHub Pages) |
| — | Run | Execute a multi-file app (Zana-shaped consumers only) | **has** | `platform` (process exec, filesystem containment, readiness polling), `agent-runtime` |

### The gap, verified

Searched Jini's `packages/` for `applyEdit|EditAction|FileEdit|applyPatch|diffApply|fastApply`
(excluding `dist/`). **Two hits, both in `ui/src/react/chat/components/ToolCard.tsx` and its test** —
i.e. a component that *renders* a tool call, not anything that applies one. Searched for
`snapshot|rewind|checkpoint`: every hit is unrelated (DOM driver state, a todos reducer, sqlite table
definitions, an annotation-canvas hook). There is no edit-application tier and no document-snapshot
tier anywhere in Jini.

---

## Two corrections to decisions locked in `pages-vibecoding-decisions.md`

Both are cases where the decision log specifies building something Jini already has. Neither
reverses the decision's *intent*.

### D-5 — `data-tovu-id` should be `data-agent-element` (reuse, don't invent)

D-5 locks "stable per-region identifiers (working name `data-tovu-id`)" as the keystone decision.
Jini already ships exactly this mechanism: `agentic/src/element-handles.ts`, the `data-agent-*`
convention.

What it already provides, that a fresh `data-tovu-id` would have to re-earn:

- It is an **allowlist, not a query language** — the module's own header says so. A caller names a
  handle the page published; it never supplies a selector. `resolveHandleSelector` can only ever
  build `[data-agent-element="<validated-handle>"]`, so there is no path from caller input to an
  arbitrary `querySelector`.
- Handle syntax is deliberately narrower than CSS allows (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, max 128
  chars) precisely so a handle "cannot contain a quote, bracket, backslash or whitespace" and cannot
  break out of the attribute selector it is interpolated into.
- `region` is **already** one of the defined roles (`AgentElementRole`), alongside
  button/checkbox/field/form/list/status/link.

Two independent reasons to switch:

1. It is hardened against an injection class that a new attribute would have to be hardened against
   again, by someone who may not notice the requirement.
2. **A product-named attribute cannot live in Jini at all.** Product neutrality is enforced by
   `npm run guard` rule R5. `data-tovu-id` in engine code — or in markup the engine generates —
   fails that rule on its face.

*Caveat, stated honestly:* the existing convention was built for agent **interaction** with a live
page (click this, fill that), not for **authoring** addressability. The purposes differ. The claim
here is that the *mechanism* is the same and already correct, not that the vocabulary transfers
unchanged — `AgentElementRole` may need an authoring-oriented member. That is an extension of a
hardened primitive, which is a much smaller and safer job than a parallel invention.

### D-4 — separate-origin preview is largely pre-solved; the requirement shrinks

D-4 requires previewing generated pages from an origin distinct from the admin, because bolt.diy
combines `allow-scripts` with `allow-same-origin` (`Preview.tsx:992`) and copying that inside the
admin origin would let AI-authored `<script>` read the admin session.

Jini's sandbox already refuses that combination, deliberately and with a regression test:

- `renderers-react/src/react/components/SrcDocSandbox.tsx:49` —
  `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"`, and the file header says it
  "treats `html` as hostile by construction… so the document gets a unique opaque origin."
- `react/components/__tests__/SrcDocSandbox.test.tsx:11-12` asserts the exact attribute string **and**
  separately asserts it does not contain `allow-same-origin`. The absence is pinned, not incidental.
- `srcdoc/build.ts:54,260-261` and `url-load-decision.ts:92` both reason explicitly about the
  consequences of having no `allow-same-origin` (e.g. storage APIs throw), and
  `sandboxed-document.ts` ships a storage shim for exactly that.

An opaque origin defeats the admin-session-theft threat D-4 was written against. **What a separate
origin still buys, and srcdoc does not:** a preview reachable at a real, navigable URL — for testing
links and navigation, for sharing a preview, and for anything that must survive a page load rather
than living inside one React tree.

So D-4 is not retired. It narrows from "build origin separation before anything else" to a scoping
question: **does the preview need to be a real URL, or is an in-page sandbox enough for v1?** If the
latter, D-4 stops being a prerequisite and the sequencing in the decision log changes.

---

## The design proposition — pressure-tested 2026-08-03, survived with one addition

Every one of these products differs at exactly one place: **what is being edited.** bolt.diy edits a
file tree. Tovu Pages edits one HTML document. Zana edits a file tree. The conversation, the
streaming, the undo, and the preview are the same in all three.

Proposal: the package owns the loop and knows nothing about the target, behind a small contract —
*list editable parts / read one part / replace one part / snapshot all*. Tovu implements it as "the
parts are the tagged regions of this document"; a multi-file builder implements it as "the parts are
files."

**Adversarial review result** (full detail: `2026-08-03-vibecoding-apply-tier.md`): the four verbs
are structurally sound and **no missing verb was found.** The predicted leaks — create/delete,
ordering, moves, binary parts — did not materialize as contract breaks. Three corrections landed
instead.

### 1. A required `validate` hook — the one real gap

Neither reference implementation performs **any** write-time validation. Verified directly:
bolt.diy's `#runFileAction` (`app/lib/runtime/action-runner.ts:311-339`) calls
`webcontainer.fs.writeFile(relativePath, action.content)` and writes the model's bytes verbatim —
no parse, no check.

They get away with it because **a whole file is parse-isolated**: a malformed file cannot corrupt
another file's parse-ability. A `data-agent-element`-tagged HTML region has no such property — it
lives inside one shared document, so one unbalanced tag corrupts everything after it. **Neither
codebase has ever needed to solve this, so there is nothing to port for it.**

Correct shape: not a fifth CRUD verb, but a host-supplied `validate(wholeAfter) → ok | reject`
that the engine calls **before committing** a `replace`. A no-op for file-tree hosts; load-bearing
for Tovu. Host-supplied because only the host knows the artifact's grammar (HTML vs TSX vs JSON).

Validating the *whole after splice* rather than the *part in isolation* is the right call: a
well-formed fragment can still break the document it lands in (a `<td>` outside a table, a region
that closes a parent's tag).

**Coordinator addition:** `reject` must carry a **reason string**, and that reason should feed
station 7 (Fix) as the next turn's prompt. That closes the loop — the model that broke the document
is told how, in the same grammar it emits. Neither reference implementation can do this because
neither validates. This is also the general answer to D-2's trap in the decision log (silent lossy
HTML→Tiptap conversion): **never let a corrupting write land silently.** Same species, one mechanism.

### 2. `snapshot`/`restore` is doing two jobs — the contract owns only one

bolt.diy's `Snapshot` is `{ chatIndex: string; files: FileMap; summary?: string }`
(`app/lib/persistence/types.ts:3-7`) — verified. The data half is already contract-shaped: a flat
id→content map with nothing filesystem-specific in the type, and it ports for free.

But rewind does not stop there. It also synthesizes a fake "setup commands" turn and replays it
through the ordinary apply pipeline to restart npm/Vite — **execution-environment resync, not data
restore.** bolt.diy already keeps this as a separate step glued on afterward.

The contract owns **only the data half**. Any host with downstream execution state (a dev server, a
build) re-syncs itself after calling `restore`. Otherwise the contract implicitly promises "and now
everything depending on these parts works again," which it cannot deliver. Tovu Pages has no
execution state, so restore is pure there — a reason not to let Zana's needs leak into Tovu's path.

### 3. Two smaller specification points

- **`replace` is an upsert.** Both codebases create-on-write; no case requires a pre-existing id.
  Spec it that way rather than discovering it later.
- **Process/build/install commands have no home in a parts contract, deliberately.** They are real
  needs for a file-tree consumer and belong to the *Run* tier (`platform`, `agent-runtime`), not
  here. Stated explicitly so it is not later misread as a gap.

### What not to inherit, from the apply/undo tier specifically

New findings, not in the two prior reports:

- **bolt.diy silently swallows every file-write failure.** In `#runFileAction`, both the `mkdir`
  (`:325-330`) and the `writeFile` (`:333-338`) sit in try/catch blocks that only `logger.error` —
  no rethrow, no status update. The method returns normally, so the action is marked `'complete'`
  whether or not anything reached disk. Shell/start/build failures *do* surface via the outer
  catch's status/alert path. The asymmetry looks accidental, not designed.
- **open-lovable rewrites the model's own output without telling it.** Its apply route silently
  forces paths under `src/` and renames Tailwind classes, so the model's belief about a file no
  longer matches disk and it is never informed. This is directly a *Describe*-tier problem (part 2
  of the table above) — a silent divergence between what the model thinks exists and what does.
- **Two independent parsers in open-lovable's apply route** can emit duplicate write entries for one
  path, with no dedup between them.
- **Unverified but concrete:** open-lovable builds a raw shell string ``` `mkdir -p ${dirPath}` ```
  from a model-controlled path with no traversal or metacharacter check. Whether this is exploitable
  depends on the sandbox provider's exec semantics (shell vs argv-array), which was not read. Noted
  as a do-not-inherit pattern, not as a vulnerability this project owns.
- **One thing open-lovable does better than bolt.diy:** per-file write errors are caught, collected,
  and streamed back to the client rather than silently dropped.

---

## Open scope question for the user — genuinely blocking the shape

`pages-vibecoding-decisions.md` deliberately does not port "the entire sandbox/VM tier."

That is **correct for Tovu Pages** (one document, no build step, no npm) and **wrong for Zana**,
which is a multi-file app builder and a named Jini consumer.

- If Zana is in scope, the engine must not assume a single document, and the contract above (or
  something like it) is load-bearing.
- If Zana is not in scope, this collapses to a much simpler single-document capability and the
  target abstraction is over-engineering.

Not resolvable from the code. Needs the user.

---

## Other open-source references worth recon

Neither of the two studied so far does visual editing or vision self-check, which are two of the
open questions in the decision log (D-REV-4, OQ-2, OQ-6).

| product | why it matters here | status |
|---|---|---|
| **Onlook** | Visual editing directly on real React source, local. A live answer to D-REV-4's re-admitted "visual editing tab", and a different model from GrapesJS: GrapesJS parses-and-reserializes (so it cannot preserve AI output byte-for-byte, per D-REV-4's own caveat) whereas Onlook edits the source. | not cloned |
| **Dyad** | Local desktop app builder, open source, BYOK. Doubly relevant — a vibecoding reference **and** a shape reference for Tovu-Runner. | not cloned |
| **Srcbook** | TypeScript app builder + notebook, local. | not cloned |
| **OpenBolt.dev** | Another self-hostable bolt-alike; worth a skim for where it diverges from bolt.diy. | not cloned |
| **screenshot-to-code** | Narrow, but directly serves OQ-6 (import an existing design) and OQ-2 (show the model a picture of what it built) — neither reference implementation does either. | not cloned |

Per `AI-Dev-Shop/AGENTS.md` ("never silently clone… third-party tools"), none were cloned. Onlook
and Dyad are the two worth the disk.

Sources: <https://github.com/onlook-dev/onlook>, <https://www.dyad.sh/blog/free-ai-app-builders-compared>,
<https://blog.logrocket.com/onlook-react-visual-editor/>,
<https://www.totalum.app/blog/open-source-ai-app-builder-self-hosted-alternatives>,
<https://selfhostedworld.com/alternative/v0>

---

## Handoff contract

- **Inputs used:** direct reads of `Jini/packages/{agentic,renderers-react,chat-core,platform,deploy,desktop-host}`
  source and `package.json` descriptions; targeted `rg` sweeps for edit/snapshot primitives across
  `Jini/packages` excluding `dist/`; `pages-vibecoding-decisions.md`; web search for current
  open-source builders.
- **Output summary:** reframes "port vibecoding to Jini" as a two-tier build (apply + undo) on top of
  five existing tiers; corrects two locked decisions that specify rebuilding what exists.
- **Risks:** the target-agnostic contract is unreviewed at time of writing; the `data-agent-*`
  reuse claim rests on mechanism-sameness across two different purposes and should be confirmed by
  whoever implements it.
- **Suggested next assignee:** Coordinator, after the apply-tier pressure-test returns.
