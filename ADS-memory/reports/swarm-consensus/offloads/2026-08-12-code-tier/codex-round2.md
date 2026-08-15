I’ll read the Round 2 packet in full, then inspect only the in-scope source files needed to verify claims and produce the exact required structure.
The appendix confirms the real disagreement is the build owner, not the runtime boundary. I’m checking the live implementation now—especially package copying/reset, write-time validation, manifest semantics, and the static renderer’s brittle rewrite contract.
ACK_PACKET_RECEIVED CTX-CODE-TIER-R2-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

My runtime position is unchanged: frameworks compile to the existing `static` contract; Tovu never executes framework code on a visitor request.

My build-lifecycle position changed. In Round 1 I proposed that self-hosted Tovu could rebuild source in an isolated local process. The supply-chain objection changes my vote: **authors or publisher-controlled CI must build; Tovu installs only the prebuilt artifact**. Tovu currently lacks an arbitrary-code build boundary, and even theme CSS remains explicitly unsanitized (`files/src/features/theme/theme.ts:231-233`). A worker or ordinary child process would not contain dependency installers, native modules, network access, or hostile package scripts.

There should be one runtime class—`static`—but two explicit lifecycle classes:

- **Authored themes:** mutable, immediately validated, AI-editable, and per-file resettable. The existing `basic` theme exemplifies this: plain HTML/CSS/JS, no build step, every byte editable (`files/src/themes/static/basic/theme.json:5-11`).
- **Built releases:** immutable, versioned, editor-read-only, and replaced or restored atomically as a release.

That split is the design, not a new `code` tier. It is also an honest admission that built releases do not preserve the current editing contract. If feature parity with authored themes is mandatory, framework themes should not ship under this design.

Before introducing lifecycle metadata, unknown manifest values must fail closed. Today `parseTier` silently maps every unknown value to `declarative` (`files/src/features/theme/theme.ts:248-252`).

## The Build-Lifecycle Verdict

**Author or publisher CI builds locally. Tovu does not run `npm install`, lifecycle scripts, framework compilers, or arbitrary package commands.**

A distributable built-theme package should contain:

- Framework source, lockfile, builder/adapter version, dependency and license records.
- A prebuilt artifact satisfying the static layout.
- Source, lockfile, configuration, and artifact hashes joined by publisher provenance.
- No `node_modules`, caches, or preview output.

The source does ship, but as inert provenance and exportable author material—not as live theme state. Installation retains the full immutable package in the pristine catalog and copies only its validated static artifact into the runnable theme location. This extends the existing model in which the catalog is non-runnable and protected from agent writes (`files/src/features/theme/theme.ts:685-698`), while marketplace installation already creates independent catalog and live copies (`files/src/features/theme/marketplace.ts:229-236`, `files/src/features/theme/marketplace.ts:257-274`).

Consequences:

- **Reset semantics:** a built release has no “reset this generated file.” Its reset unit is the complete installed release. Restore recopies the validated artifact from its pristine package; upgrade replaces it atomically. Source files are changed in the author’s checkout, rebuilt, and uploaded as a new release.
- **Copy-not-inherit:** preserved at release level. The active artifact is still a physical copy, never an overlay on marketplace files.
- **AI authorability:** `theme_write_file` must reject built releases as read-only. It must neither edit source without rebuilding nor edit output that a later build would overwrite. That differs deliberately from the current tool, which overwrites one file, immediately revalidates, and makes the result live—even degrading to fallback on an invalid write (`files/src/features/theme/agent-tools.ts:200-205`).
- **Escape hatch:** “Detach as authored static theme” may snapshot the artifact under a new identity. That fork regains ordinary file editing, AI writes, and per-file resets, but explicitly abandons its framework-source/upstream-release relationship.

Author-side builds move supply-chain exposure away from the Tovu server; they do not make arbitrary npm dependencies safe for authors. Official adapters should therefore use pinned dependencies and publish reproducible-build guidance, but running untrusted source remains an explicit author/CI decision.

Conformance should be a mandatory install/upload gate, not a renderer rewrite in the first release. Current loading checks for `pages/index.html` and verifies that declared templates contain the real `{"type":"content"}` marker (`files/src/features/theme/theme.ts:374-423`, `files/src/features/theme/theme.ts:457-478`), but it does not validate the renderer’s stylesheet sentinel.

The verifier must:

- Require the exact stylesheet sentinel exactly once in every rendered page contract.
- Reject unsupported quoting, paths, or hashed-entry conventions unless the adapter normalizes them.
- Verify content and partial markers survive compilation.
- Black-box render fixtures with synthetic tokens, assets, slots, menus, content, and page links and assert the resulting HTML.
- Enforce bundle/file-count/size budgets and forbid full-root hydration over server-owned marker subtrees.

This is necessary because token injection is one literal `.replace()`, asset rewriting only recognizes double-quoted `../css/` and `../js/`, and page links use another narrow regex (`files/src/features/theme/static-render.ts:31-46`, `files/src/features/theme/static-render.ts:389-412`).

The framework initiative pays for the verifier, canonical emitter, and fixtures. A parser-based renderer migration belongs to the core platform as a later, separately tested hardening project because `renderStaticPage` is already the real request-time path (`files/src/features/theme/static-render.ts:4-11`). It should proceed through corpus goldens and dual-render comparisons, not be hidden inside framework support.

## Remaining Disagreements

**Web Components are an islands-only seam for now.** They are useful as a framework-neutral ABI for galleries, calculators, and other isolated behavior. They should enhance meaningful static HTML and must not own or hydrate descendants that contain server-resolved CMS markers. They are weaker as the whole-page authoring contract because they make no-JavaScript output, global styling, routing ownership, and server-mutated DOM boundaries harder without eliminating the build lifecycle.

**Ship React first.** This is sequencing, not runtime coupling: React remains absent from Tovu’s server dependencies, as do Vue and Angular (`files/package.json:45-67`). Supporting one adapter first forces the neutral artifact contract to prove itself before Tovu promises three maintenance matrices.

Vue and Angular qualify only when each:

- Builds from a locked clean checkout into the identical static package contract.
- Passes the same end-to-end conformance corpus without renderer exceptions.
- Requires no framework/compiler dependency in the Tovu server.
- Produces useful HTML without JavaScript and confines hydration to declared islands.
- Meets the same artifact-size and browser-performance budgets.
- Has at least one production-shaped reference theme covering tokens, assets, menus, partials, and current-content markers.

No framework-specific server branch is acceptable as a qualification shortcut.

## Strongest Counter-Argument

The leading opposing position is Tovu-run builds. Its strongest case is compelling: without them, framework themes lose the in-product edit–validate–preview loop and current AI co-authoring model. Users must understand that source shown in one place and deployed output shown in another have different lifecycles.

That cost is real, but Tovu-run builds do not merely add a compiler. They create an arbitrary-code execution service whose inputs can invoke lifecycle scripts, compromised transitive dependencies, native binaries, network clients, and resource-exhaustion attacks. The current direct-write model is justified specifically by load-time validators (`files/src/features/theme/agent-tools.ts:21-41`); no equivalent validator exists for a JavaScript dependency graph.

Calling a worker or ordinary container “isolated” would preserve the UX by asserting a security property the repository does not have. The correct response is to expose the lifecycle difference, not silently place a package manager inside the CMS trust boundary.

## What Would Change My Mind

I would switch to Tovu-run builds if in-product framework-source editing became a non-negotiable product requirement and Tovu funded a real build plane with all of these properties:

- A disposable VM or equivalently audited OS-security boundary per build, running under a separate security principal.
- No server secrets, host mounts, Docker socket, credentials, or ambient cloud identity.
- Read-only staged input, bounded scratch/output storage, and strict CPU, memory, process, disk, and wall-clock limits.
- Dependency prefetch through an integrity-checking registry proxy, followed by an offline build; arbitrary install scripts remain confined inside the disposable boundary.
- Output restricted to regular files, then scanned, size-limited, conformance-tested, and signed outside the builder.
- Atomic activation only after validation, retaining the last-known-good artifact on every failure.
- A self-hosted mode that either supplies the equivalent boundary or disables server builds rather than weakening containment.

I would also reconsider whole-page Web Components if production evidence showed they preserve useful no-JavaScript documents, global token behavior, and CMS-owned marker boundaries better than the static-output approach.

Absent that evidence and infrastructure, the honest product is: authored themes remain live-editable; built framework releases are immutable static deployments with shipped source provenance.

<<SWARM_END>>