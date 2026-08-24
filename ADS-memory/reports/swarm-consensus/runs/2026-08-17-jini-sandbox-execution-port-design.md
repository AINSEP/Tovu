# Design: porting bolt.diy/open-lovable's execution engine into Jini/Tovu

Research + design task via Sonnet subagent, no code written. Verified directly against source in bolt.diy, open-lovable, Jini, and Tovu — not inferred from READMEs alone.

## Headline finding

**WebContainers is 100% browser-orchestrated. It cannot be "a package Jini's server imports."** `bolt.diy`'s `app/lib/webcontainer/index.ts` explicitly no-ops on SSR and only boots `if (!import.meta.env.SSR)`; every downstream call uses browser-only APIs (`fs.writeFile`, `spawn`, `BroadcastChannel`, `window`). The ENTIRE server-side footprint of the WebContainers path is two response headers (`Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Opener-Policy: same-origin`) on whatever page hosts it — not an execution endpoint.

**open-lovable's E2B path is the opposite**: fully server-orchestrated. The browser never talks to E2B directly — only your own server does, via Next.js route handlers. `SandboxProvider` (E2B/Vercel) is already a clean, proven-swappable interface in that codebase.

## vibecoding — confirmed untouched by this

`packages/vibecoding/`'s `./node` and `./react` exports are NOT stubbed — no folder, no placeholder, genuinely not started. Its `EditTarget` interface deliberately excludes run/install/build verbs by design — a sandbox package is a **sibling** the admin UI composes next to vibecoding's edit loop, never something that goes inside vibecoding itself. Vibecoding needs zero changes for this.

## Where a server route fits — depends entirely on which backend

- **WebContainers path: no execution route needed.** Just the 2 headers above.
- **E2B path: yes, a new route is needed** — the browser can't safely hold E2B credentials or reach its control plane directly.

## Real, unrelated danger found and flagged: don't reuse the existing terminal API

Tovu already depends on `@jini-ai/http-kit` and `@jini-ai/daemon` (used for the chat/agent-CLI surface today). Jini's `http-kit` has a real, live terminal API (`registerTerminalRoutes` → `TerminalSessionManager` → real `node-pty`) — but it spawns **directly on the daemon's own host process, no container, no VM, no isolation**. Reusing this for running AI-generated `npm install`/dev servers would mean running untrusted code straight on Tovu's own production server — a real security regression, not a shortcut. Explicitly do not reuse it for this.

## Recommended concrete shape

1. **New package `@jini-ai/sandbox`** (sibling to vibecoding, not inside it):
   - `@jini-ai/sandbox/core` — shared interface only (boot/mount files/installDeps/runCommand/getPreviewUrl/onFileChange/teardown), zero runtime deps.
   - `@jini-ai/sandbox/e2b` (`runtime: "node"`) — ported from open-lovable's `E2BProvider`/`setupViteApp`.
   - `@jini-ai/sandbox/webcontainer` (`runtime: "browser"` — a NEW tag, no other Jini package is browser-only today) — ported from bolt.diy's boot/mount/spawn wiring + its `preview-message` error protocol.
2. **`src/server/routes/sandbox/`** in Tovu (matching the existing `site/`/`members/`/`workspaces/` domain convention) — thin routes calling `@jini-ai/sandbox/e2b`. E2B path only.
3. **`apps/admin`** — a new client module importing `@jini-ai/sandbox/webcontainer` directly (WebContainers path), or fetching the new server routes (E2B path).
4. **`@jini-ai/vibecoding`: untouched.** The admin UI is already the "host" its docs describe — composes the edit loop + the new sandbox package side by side, re-syncing the sandbox after every `restore()` per vibecoding's existing contract.

## The real decision: build order matters more than it looks

Owner's stated preference is bolt.diy/WebContainers first. The subagent's flag, worth weighing seriously: switching WebContainers → E2B later isn't a simple backend swap the way E2B → Vercel Sandbox is inside open-lovable (both server-side already). It also means **moving the call site** — from the browser calling the sandbox directly, to a server route that didn't need to exist yet. That's a bigger seam than the interface itself.

Two real options:
- **WebContainers first** (matches stated preference, nicer instant in-browser polish sooner) — treat it explicitly as a throwaway prototype/spike, not something the production shape inherits directly. Still needs the WebContainers commercial-licensing conversation (from the earlier scoping doc) resolved before shipping for real.
- **E2B first** (free/self-hostable now, interface already proven swappable in open-lovable) — costs the instant-in-browser feel initially, but the server-orchestrated shape is what a production version needs anyway, so nothing gets rebuilt later. WebContainers could still be added afterward as a nicer front-end for the same backend contract.

**Status: designed, not started.** This and the earlier scoping doc together are enough to make a real go/no-go + build-order call whenever this gets prioritized.
