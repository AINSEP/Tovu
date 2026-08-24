# New question — live editing a compiled (framework-built) theme

This is a genuinely new, previously-undiscussed question, not a continuation of the settled folder/manifest shape from earlier rounds. Round 1 rules apply: form your own independent position; do not assume any other participant's answer; the Coordinator has NOT disclosed its own position and won't until this round is synthesized.

## Ground truth, verified directly against source

Tovu theme editing (the Explore/edit screen, and an agent tool `theme_write_file`) supports per-file edit/reset for an ordinary (authored) theme, with instant hot-reload — a write re-validates and replaces the loaded theme's content for that theme, no server restart.

A **compiled** theme (`theme.json.build.source: "compiled"`, see `src/features/theme/theme.ts:55-93`) is different:

- `build.sourceDir` (required) names the author's real, pre-build framework project root — actual React/Vue/Angular (or similar) source, npm-package-based, arbitrary internal layout. **This IS fully per-file editable, same as an ordinary theme** — confirmed via `resolveThemeFileWriteScope` (`src/features/theme/theme-files.ts:476`).
- Everything OUTSIDE `sourceDir` (the generated `render/`/`css`/`js` output a framework build produced) is READ-ONLY through every per-file editing surface. Trying to write there returns this exact, verified error message: *"this file is generated output of a built theme (theme.json build.source: 'compiled'); it is versioned and restored only as one complete release, never edited or reset file-by-file — edit the source under build.sourceDir and rebuild instead"* (`theme-files.ts:498`).
- **There is no rebuild mechanism anywhere in the codebase.** Verified by search — no function, route, or agent tool triggers a build. The error message's own instruction ("rebuild instead") points the author OUTSIDE Tovu entirely; nothing automates it.
- The shipped, already-decided principle for the MARKETPLACE INSTALL path specifically: *"the author or publisher CI builds; Tovu never runs the build"* — trust for an INSTALLED theme comes from `artifactHashes` (sha256 per generated file) verified at install time, never from Tovu re-executing anyone's build.
- Separately, Tovu already runs two other kinds of semi-trusted logic in a locked-down sandbox at request time: Liquid and Handlebars templates, each rendered inside an isolated `worker_threads` sandbox with a tag/helper allowlist, filesystem lockdown, and render/parse limits (`src/server/http/site/liquid-worker.ts`, `handlebars-worker.ts`). This is real, working precedent for "Tovu runs untrusted-ish logic, but in a cage" — though a template render is a much smaller trust surface than a full `npm install && npm run build`.

## The actual question

**A user is editing their OWN compiled theme through Tovu (they own it, they're not installing a stranger's theme from the marketplace). They edit a real `.tsx`/`.vue` file inside `sourceDir` and save. What should happen next, so their edit actually becomes visible on the site?**

Two candidate directions — evaluate both, and propose your own if you see a stronger one:

1. **Tovu runs the owner's own build, in a sandbox, right after save** — similar in spirit to how Vercel/Netlify run a project owner's own build on push, and similar in kind (though much bigger in scope) to how Tovu already sandboxes Liquid/Handlebars rendering today. The claim to evaluate: this is a DIFFERENT trust situation from the marketplace-install path (an owner building their own already-owned content, vs. Tovu trusting a stranger's arbitrary build output at install time) and doesn't need to relax the "Tovu never builds a marketplace install" rule at all — two different doors, two different policies.
2. **Tovu never builds, period, in any context** — editing a compiled theme through Tovu is really just source storage/versioning; to see a change live, the author must build locally (or in their own CI) and publish an entirely new release (fresh `artifactHashes`) themselves, exactly as `sourceDir`'s own error message already instructs today. Editing in Tovu remains useful (view, quick edits, versioning) but is NOT a live-feedback loop the way editing a static theme's HTML is.

## What to answer

1. Which direction do you favor, or is there a stronger third option? Give real reasoning, not just a preference.
2. If you favor running a sandboxed build (direction 1): what does "owner's own theme" vs "installing someone else's marketplace theme" actually need to differ on, concretely, so this doesn't quietly become a security regression on the install path? What would the sandbox need to constrain (network access, execution time, resource limits, which commands are even allowed to run) given `npm install`/a real build is a much bigger trust surface than a template render?
3. If you favor never building (direction 2): what's the best achievable editing experience given that constraint — is there a middle ground (e.g. a lightweight local-dev-to-Tovu sync/publish flow) that's faster than "build fully locally, manually re-upload a whole release," or is that genuinely the ceiling?
4. Does this interact at all with anything already decided in the earlier rounds of this debate (the `render/`/`sourceDir` folder shape, `build.artifactHashes`, `apiVersion`)? Say explicitly if yes, and how.

Keep this grounded and concrete — a real proposal, not a survey of possibilities.
