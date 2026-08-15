I’ll read the packet first, then each staged source file it names, and I’ll ground the debate response in exact path-and-line evidence.
The packet’s format and debate constraints are clear. I’m now reading the authoring guide in full, followed by the implementation files; I’ll keep the final answer solution-neutral in structure but take a definite position, as Round 1 requires.
The source has moved beyond parts of the packet summary: for example, static themes now use one `templates` array and unified `content` markers. I’ll cite the staged source itself, not stale packet line references, and account for that current shape in the argument.
I’ve finished all staged files. The central finding is that the strongest boundary is already the static artifact contract—not a framework runtime—and the answer must explicitly solve build-state, hydration, marketplace trust, and source-versus-generated reset semantics rather than treating compilation as someone else’s problem.
ACK_PACKET_RECEIVED CTX-CODE-TIER-2026-08-12 -- I received the packet and will work on it.

## Position

The best design is an unlisted Option E: **framework-authored, build-time source packages whose deployable artifact is the existing `static` tier**. It takes Option B’s runtime boundary but fixes B’s missing lifecycle story.

Tovu should not implement `code` as a React/Vue/Angular runtime tier. `code` is only a declared placeholder, is absent from discovery, and would currently fall through the declarative render branch (`files/src/features/theme/theme.ts:24-36`, `files/src/features/theme/theme.ts:668-682`, `files/src/server/http/site/render.ts:1680-1711`). Framework choice should be authoring metadata, not a server capability tier.

A framework theme package should contain:

- Human- and AI-editable framework source, a lockfile, build metadata, and dependency/license information.
- A versioned, hashed, prebuilt artifact conforming to `static`: complete `pages/*.html`, canonical CSS/JS assets, partials, and Tovu embed markers.
- At most one framework runtime per theme. React, Vue, and Angular are compiler adapters targeting one neutral artifact contract, not three render backends.

The current static renderer remains the integration seam. Generated HTML retains server-owned markers; Tovu still injects tokens, rewrites asset paths and links, resolves partials, and substitutes CMS content in the established order (`files/src/features/theme/static-render.ts:389-412`). Dynamic posts and pages continue through the current `content`-marker pipeline, where the route layer resolves data before `renderStaticPage()` receives the resulting HTML (`files/src/server/routes/site/pages.ts:465-501`). This preserves “route resolves, render renders.”

Client interactivity may use framework islands, but an island must not hydrate a DOM subtree Tovu rewrites. Full-document hydration would compare framework output with server-mutated menu, content, and partial markup and produce mismatches or overwrite CMS content. Server-owned marker subtrees therefore have to be opaque boundaries.

Compilation must happen before a visitor request:

- Marketplace/publisher CI should normally produce the artifact.
- A self-hosted installation must be able to rebuild locally, out of process, for source edits. It cannot require a proprietary build service.
- The server should be able to serve the prebuilt artifact without installing React, Vue, Angular, or an arbitrary theme’s npm graph. None of those frameworks is in the current server dependency set (`files/package.json:45-83`).
- A failed rebuild must preserve the last-known-good artifact. The working source may be invalid, but it must not atomically replace the live artifact until build and theme validation both succeed.

That last requirement changes the existing edit contract. `theme_write_file` currently promises immediate whole-theme revalidation and says the revalidated result becomes what the live site serves (`files/src/features/theme/agent-tools.ts:200-205`). Framework themes instead need separate working-source/build status and active-artifact status, with structured compiler diagnostics returned to both agents and humans.

Copy-not-inherit still works at the package level. Marketplace installation already creates independent pristine-catalog and editable copies (`files/src/features/theme/marketplace.ts:229-236`, `files/src/features/theme/marketplace.ts:257-276`). Both source and artifact should be copied. Authored source files retain per-file reset; generated output is not meaningfully reset file-by-file and should instead be rebuilt or restored atomically from the pristine artifact. That is an explicit narrowing of C5 for generated files, not inheritance.

The mechanical contract also needs hardening. Today token injection depends on an exact stylesheet-link string, asset rewriting recognizes particular double-quoted relative paths, and page-link rewriting recognizes a narrow filename pattern (`files/src/features/theme/static-render.ts:31-46`, `files/src/features/theme/static-render.ts:402-411`). A compiler target needs load-time conformance validation—or eventually structural HTML rewriting—so minification, hashed assets, or a formatter cannot silently disable those behaviors.

Marketplace distribution must label these themes as browser-executable. Signing establishes provenance and integrity, not safety. The compiled bundle can exfiltrate browser-visible information, render phishing UI, or consume excessive CPU. Current static themes already permit client JavaScript, and theme CSS is explicitly unsanitized (`files/src/features/theme/theme.ts:24-31`, `files/src/features/theme/theme.ts:232-233`). Framework support therefore exposes an existing policy gap rather than inheriting the declarative tier’s “safe from strangers” property. Packages also need dependency/license notices and size budgets because they redistribute framework and third-party runtime code.

I would build this authoring capability, but **not a new runtime tier and not three equal integrations upfront**. The evidence-bearing first scope is one framework adapter producing a theme that exercises home, CMS content, menus, tokens, assets, and client interaction through the unchanged static runtime. Vue and Angular should qualify through the same artifact conformance suite. Angular’s heavier, more opinionated build model is a reason to keep it behind the compiler boundary, not a reason to place Angular inside Tovu’s server.

Existing static themes require no migration: `basic`, for example, is already explicitly a no-build static artifact with pages, templates, modes, and slots (`files/src/themes/static/basic/theme.json:5-18`). Rollback remains selecting one of those existing artifacts; no content-schema migration is involved.

## Option Assessment

- **Option A — reject.** The existing worker model is safe because Liquid is a constrained language with an AST allowlist, a no-access filesystem adapter, language-level parse/render/memory limits, and a disposable worker (`files/src/features/theme/liquid-allowlist.ts:7-27`, `files/src/server/http/site/liquid-worker.ts:29-75`, `files/src/server/http/site/liquid-sandbox.ts:9-20`). Arbitrary framework code has imports, package initialization, Node APIs, and potentially native dependencies. A `worker_threads` timeout and heap limit do not turn arbitrary JavaScript into a capability sandbox. Three SSR adapters would also create three compilation/module-loading lifecycles, hydration protocols, upgrade matrices, and failure taxonomies on the request path. Angular sharpens all of those costs.

- **Option B — correct runtime boundary, incomplete product design.** Compiling to static preserves the proven CMS integration and keeps framework dependencies out of the server. But “authors build elsewhere” alone abandons live editing, AI repair, reproducible marketplace installation, and meaningful reset semantics. B becomes the best design only when expanded into the source-plus-artifact package and local isolated-build model described above.

- **Option C — useful feature, insufficient primary design.** Islands are appropriate for isolated interaction inside a compiled static theme. They do not by themselves provide framework-authored server-visible page structure, robust no-JavaScript output, or full CMS rendering. Full-root hydration conflicts with Tovu’s request-time string substitutions. Client bundles also retain the stranger-supplied-code risk, merely moving it from the server to every visitor’s browser.

- **Option D — reject as a theme design.** A signature answers “who published these bytes,” not “what will these bytes do.” In-process code can access server capabilities, block the event loop, mutate process state, or terminate the process, making degrade-never-500 unenforceable. Trusted in-process extensions may be a legitimate plugin category, but they should not be presented as React/Vue/Angular theme support and should not share the install-from-strangers promise.

The existing silent tier coercion should also be corrected regardless of the chosen design: an unknown tier currently becomes `declarative` (`files/src/features/theme/theme.ts:248-252`). A framework/build manifest typo must fail closed rather than invoke unrelated validation.

## Failure Modes And Sacrifice

The chosen design has real costs:

- **Build supply-chain compromise.** Installing dependencies or running package scripts from a stranger can execute hostile code during a local build. The build boundary therefore needs a disposable OS process or container with no server credentials, no writable host filesystem beyond staging/output, strict CPU/memory/disk/time limits, and constrained network access. The existing Liquid worker is a useful resource-control precedent but not a sufficient arbitrary-code security boundary.

- **Source/artifact drift.** A marketplace could ship source that does not produce its claimed artifact, or an old artifact could remain live after source changes. Source, lockfile, builder version, and artifact hashes need a single provenance record. Reproducibility may still be imperfect because toolchains and native packages can embed nondeterministic data.

- **Broken builds during live editing.** A saved source file can leave the working copy uncompilable for several edits. Serving the last-good artifact avoids an outage but creates a new, potentially confusing state: the editor shows new source while visitors see older output. Build status and active artifact identity must be visible rather than hidden behind the current single `valid`/`invalid` status.

- **Mechanical rewrite failure.** Framework output may omit the exact stylesheet sentinel, hash assets into unsupported paths, consume a marker during compilation, or hydrate over server-replaced children. These failures can produce a plausible but incomplete page rather than a loud crash—the most dangerous class here.

- **AI-authorability cost.** Agents can edit JSX/SFC/Angular templates, but generated bundles are opaque and should not be edited. A source write now incurs build latency and may return compiler errors involving dependencies or generated types. The existing agent path also caps an edited file at 1 MB (`files/src/features/theme/theme-files.ts:63-68`, `files/src/features/theme/agent-tools.ts:151-162`), while generated bundles and source maps can exceed that, reinforcing the need to exclude artifacts from ordinary file editing.

- **Marketplace and licensing cost.** Packages become larger, dependency vulnerabilities become relevant, and compiled bundles carry third-party redistribution obligations. Maintaining three reference adapters means continuously qualifying framework/compiler upgrades, even though the server runtime is framework-neutral.

- **Performance variability.** A theme may ship a large browser runtime for trivial interaction. Angular, React, and Vue themes can have radically different JavaScript costs while all technically satisfy the same static contract. Artifact budgets and disclosure are product requirements, not optional polish.

- **Security-policy inconsistency.** Framework bundles make it impossible to pretend all marketplace themes are review-free. The existing missing CSS sanitizer already weakens that claim; generated CSS can also be harder to sanitize without breaking framework output.

The genuine sacrifice is **full application semantics**. Authors may use framework components and ecosystems to produce a Tovu theme, but they do not receive arbitrary request-time framework SSR, framework-owned routing, or safe full-page hydration. Tovu keeps ownership of routing, CMS resolution, and server-mutated marker subtrees. That restriction is exactly what preserves self-hostability, fault isolation, and the existing rendering contract.

## What Would Change My Mind

I would reconsider a server-executed tier if evidence showed all of the following:

- Theme authors need request-time behavior that cannot be represented by resolved `SiteRenderContext` data, static HTML, content markers, or isolated client islands—not merely a preference for JSX/SFC syntax.
- Real themes require full-root hydration or framework server components, and an opaque server-owned marker boundary makes them materially unusable.
- Tovu has an audited process-level capability sandbox for arbitrary package code, with filesystem, network, process, native-addon, secret, CPU, memory, and termination controls—not just `worker_threads`.
- Benchmarks show acceptable cold-start, throughput, and memory behavior for the supported framework runtime, including failures and upgrades.
- Product evidence supports one specific server framework strongly enough to justify its permanent runtime and maintenance cost. Evidence for “all three equally” would be substantially harder to establish.

A repository fact that would directly change my conclusion is discovering that the static artifact contract cannot express a required live route or CMS-data interaction without unsafe client fetching. Conversely, the current code shows that static templates already receive resolved dynamic content through markers while the route owns I/O (`files/src/server/routes/site/pages.ts:424-501`), so that case has not yet been made.

## Unlisted Option

The missing decomposition is **authoring format versus deployed capability**.

A framework source package is not itself a `ThemeTier`. React, Vue, and Angular are interchangeable front ends to a compiler contract; the resulting artifact remains a static theme with a declared amount of client execution. This yields one runtime, one marketplace validation vocabulary, one content-marker seam, and one fallback model.

That is stronger than the presented B because it does not outsource reproducibility, AI editing, reset behavior, or self-hosted builds to an unspecified author machine. It is stronger than A because framework code never enters the visitor request’s trust boundary. It is stronger than C because the build may prerender the complete page structure while reserving islands only for behavior.

## Blind Spots

**(a) A viable option the packet failed to list:** a framework-neutral Custom Elements ABI. React, Vue, or Angular tooling could compile interactive components into custom elements mounted inside static pages. Tovu would understand only element names, attributes, and server-owned marker boundaries. This is viable for widgets and isolated interaction, though weaker than the chosen design for whole-page authoring.

**(b) The missing question:** what does “build a theme using React/Vue/Angular” mean to the authors asking for it? It could mean component syntax and ecosystem packages, full SPA routing, request-time SSR, visual editing compatibility, or simply hiring-market familiarity. Those are different needs with different architectures. The decision should be framed around required authoring and runtime capabilities, not framework brand names.

**(c) The assumption most likely to be wrong:** that framework choice belongs in Tovu’s runtime tier model. The architecture already separates resolved CMS data from rendering and already has a successful framework-neutral deployable artifact. The likely need is authoring-tool compatibility, while the framing assumes it implies server ownership of three framework runtimes.

<<SWARM_END>>