# Browser sandbox runtime alternatives: does anything beat WebContainers/E2B?

Research only. No code written, no source files touched.

## Direct answers

**Q1 — Is there a genuinely open-source WebContainers equivalent (real Node runtime, in-browser, no server)? No.**
Every candidate checked out one of three ways: (a) looks open but the license blocks Tovu's exact commercial use (CodeSandbox Nodebox, CheerpX — the engine WebVM is built on), (b) is genuinely open-source but isn't actually a Node/npm dev-server runtime (Wasmer/WASIX), or (c) is genuinely open and can run real Node but only inside a full emulated x86 Linux VM in WASM (container2wasm) — heavy, experimental, no evidence of production dev-tool use. Nothing here changes the earlier E2B-vs-WebContainers call.

**Q2 — How does Lovable (the real product) actually run user code? Server-side sandboxes on Modal.**
Verified directly from Modal's own case study (a vendor post, but detailed and specific, and quotes the Lovable team by name): "Modal Sandboxes are now used to serve every app generation session in Lovable." Before Modal, Lovable ran on "a distributed cloud VM platform," and separately tried building their own AWS/Kubernetes sandbox system (15,000 lines of orchestration code) before giving up on that and switching to Modal (700 lines). This is NOT WebContainers, and NOT `open-lovable` (that's Firecrawl's unrelated clone). It's the same category as E2B — a server-side, per-session cloud sandbox — just a different vendor.

**Q3 — On desktop, is a hosted sandbox needed at all? No — but "just spawn it" hides two real costs.**
Tovu already does `child_process.spawn` today for agent CLIs (`src/assistant/daemon-supervisor.ts`, `src/assistant/agent-daemon-server.ts`, `src/assistant/mcp-federation/adapter.stdio.ts`) — real OS processes, no sandbox. On desktop, a live theme editor could spawn `npm install`/`vite dev` the same way: no license question, no cloud infra, strictly more capable than any in-browser fake runtime. Confirmed no Electron/Tauri in `package.json` yet (matches what the owner already found). But two things genuinely break and need a real decision, not a shrug — see the Q3 detail section below.

---

## Comparison table (Q1 candidates)

| Project | What it does | License (verified) | True Node? | Maturity | Viable for us? |
|---|---|---|---|---|---|
| **StackBlitz WebContainers** *(baseline, already scoped)* | Real Node reimplementation, runs entirely in-tab | Proprietary; commercial production use needs an Enterprise deal ([webcontainers.io/enterprise](https://webcontainers.io/enterprise)) | Yes | Production-grade (bolt.diy uses it) | Only with a paid license |
| **CodeSandbox Sandpack** | UI/bundling toolkit for live code editors; own default in-browser bundler is NOT a real Node runtime (no npm install, client-only bundling) | Apache 2.0, verified from repo's own LICENSE file ([github.com/codesandbox/sandpack/blob/main/LICENSE](https://github.com/codesandbox/sandpack/blob/main/LICENSE)) | No (by itself) | Mature, widely used | Genuinely open, but doesn't solve "run real Node" alone — needs a backend like Nodebox (see below) or a server sandbox |
| **CodeSandbox Nodebox** | Real Node-module runtime in-browser (what Sandpack pairs with for full npm-install experience) | **Not open source.** FAQ states plainly: "we are not open-sourcing Nodebox." The npm package itself ships under a **Sustainable Use License v1.0** (verified from the actual LICENSE file at [github.com/codesandbox/nodebox-runtime/blob/main/packages/nodebox/LICENSE](https://github.com/codesandbox/nodebox-runtime/blob/main/packages/nodebox/LICENSE)): "You may use or modify the software only for your own internal business purposes or for non-commercial or personal use," redistribution only "free of charge for non-commercial purposes." | Yes (real Node modules, no full OS) | Production-grade at CodeSandbox itself | **No** — same trap as WebContainers, arguably worse: this license text bars exactly Tovu's use case (a commercial product built on it), and unlike WebContainers there's no documented Enterprise-license escape hatch in what we found |
| **container2wasm** | Converts a full Linux container image to a WASM blob; runs a real Linux kernel + real Node (unmodified) via full CPU emulation (Bochs for x86_64, TinyEMU for RISC-V), runnable in-browser | container2wasm's own code: Apache 2.0. But the generated WASM image bundles Bochs, which is **LGPL v2.1** — a different, copyleft-adjacent license riding along ([search-verified, see sources](https://github.com/container2wasm/container2wasm)) | Yes (genuinely real, unmodified Node, inside a real emulated Linux) | Experimental/demo-grade — single-maintainer NTT Labs research project (`ktock`), no evidence of production dev-tool use, x86 emulation is known-slow (non-x86_64/riscv64 source images explicitly called out as slow) | Not realistically — too heavy/immature for a snappy Lovable-style live-preview UX; the LGPL bundling also needs legal review before any commercial use |
| **WebVM** (wrapper) | Full Linux desktop-in-browser project built on CheerpX | Apache 2.0, genuinely open ([github.com/leaningtech/webvm](https://github.com/leaningtech/webvm)) | N/A (see CheerpX below) | Active project, real demos | The wrapper alone doesn't help — see CheerpX |
| **CheerpX** (the engine WebVM is actually built on) | x86 virtualization engine in WebAssembly — what actually executes code inside WebVM | Free only for individuals / evaluation. Confirmed: "Any other use by organizations... requires a license" ([cheerpx.io/licensing](https://cheerpx.io/licensing), search-verified since direct fetch of the marketing page didn't surface the terms) | Yes, in principle (full x86 VM) | Production-grade per Leaning Technologies' own case studies (CheerpX for Flash) | **No** — the open Apache-2.0 wrapper (WebVM) sits on top of a proprietary, org-license-gated engine. Same trap as WebContainers, one layer deeper |
| **Wasmer / WASIX** | General-purpose WASM runtime; compiles arbitrary POSIX-ish programs (ffmpeg, clang, Python) to WASIX and runs them via the Wasmer JS SDK, in-browser or in Node | MIT, genuinely open ([github.com/wasmerio/wasmer-js](https://github.com/wasmerio/wasmer-js)) | **Unclear/unverified.** We found no evidence of an actual npm-install-capable Node.js build on WASIX running in-browser. Wasmer's own "Edge.js" project runs Node apps inside a WASM sandbox, but that appears aimed at *server-side* isolated execution of Node code, not an in-browser dev-server UX — flagged unverified, not claimed either way | Real runtime, but this specific use case unconfirmed | Unknown — would need a POC to find out if it can actually replace WebContainers' npm-install-and-serve loop in-browser |

## Q3 detail — what genuinely breaks on desktop

Local `npm install`/`vite dev` spawn is architecturally sound (matches the existing agent-CLI spawn pattern), but two things need a real answer, not an assumption:

1. **Untrusted-code privilege, not port/OS friction, is the real risk.** A desktop app runs with the user's own OS privileges — including whatever Tovu's desktop build can already reach (its local multi-tenant `content.db`, agent-CLI credentials, filesystem). AI-generated code (or a prompt-injected generation) spawned as a normal child process inherits that same privilege level by default. Electron's own security docs treat "untrusted code with the app's privileges" as the core vulnerability class RCE bugs come from — this generalizes to any desktop app, Electron or not. Real mitigations exist (run the dev-server child process as a separate low-privilege OS user; OS-level sandboxing — macOS App Sandbox/seatbelt, Windows AppContainer, Linux bubblewrap; or a bundled lightweight local VM) but each is real engineering work, not "it's the user's own machine so it's fine by default."
2. **Node/toolchain availability is the actual biggest practical gap** — bigger than ports or OS quirks. Today's agent-CLI PATH detection just checks whether a CLI binary exists and degrades gracefully if not. A live theme editor needs Node + npm reliably present at a compatible version on every user's machine — and Tovu's target audience (non-developer website builders) will often not have Node installed at all. Two real options: require users to install Node themselves (bad UX for this audience), or bundle a private Node runtime inside the desktop app (larger install size, its own patch/update burden, but removes the dependency — this is what tools like VS Code do).

Port conflicts (bind to port 0, read back the OS-assigned port) and OS differences (native module compilation needing Xcode CLT / MSVC Build Tools, path/signal handling quirks) are real but well-trodden dev-tooling problems, not blockers.

**Net effect on planning:** this splits what was framed as one sandbox-backend decision into two, gated by target platform. Web needs a server-side sandbox (E2B or, per the verified Lovable precedent, Modal). Desktop needs none — but "just spawn locally" should not ship without an explicit decision on child-process privilege isolation and a Node-bundling strategy; treating the user's own machine as automatically safe is the one part of this that would be hand-waving.

## Does this change the E2B recommendation?

**For web: no.** No open-source browser runtime survived verification as a real WebContainers replacement — see table above. E2B remains the credible free/self-hostable path already scoped.

**One new data point worth weighing, not a reversal:** Lovable itself — the actual product Tovu is trying to emulate — runs on **Modal**, not E2B, and Modal's case study gives real production numbers at scale (250K apps in a weekend, 20K concurrent sandboxes, described as serving "every app generation session in Lovable" today). E2B and Modal are peer categories (both server-side, per-session sandboxes); this doesn't invalidate E2B, but it's a legitimate second option now backed by a real large-scale production reference, where the earlier E2B pick was reasoned from open-lovable's code (a clone) rather than Lovable's actual infrastructure.

**For desktop: yes, in the sense that it removes the question entirely** — no hosted sandbox is architecturally required there.

## Explicitly flagged unknowns

- Whether CodeSandbox Nodebox has any documented commercial-license purchase path beyond the Sustainable Use License default — not found in this search, unverified.
- Whether a real, npm-install-capable Node.js build exists on Wasmer/WASIX for in-browser use — unverified; Edge.js appears server-focused, not confirmed either way for an in-browser dev-server UX.
- container2wasm concrete performance numbers (startup time, npm install time) versus WebContainers — no benchmark found, only general "x86 emulation in WASM has overhead" statements.
- The Modal/Lovable case study is Modal's own published post; it quotes the Lovable team directly and is detailed enough (before/after infra, LOC counts) to be treated as credible, but it is vendor-published, not an independent audit.

## Sources
- [webcontainers.io/enterprise](https://webcontainers.io/enterprise)
- [github.com/codesandbox/sandpack/blob/main/LICENSE](https://github.com/codesandbox/sandpack/blob/main/LICENSE)
- [sandpack.codesandbox.io/docs/resources/faq](https://sandpack.codesandbox.io/docs/resources/faq)
- [github.com/codesandbox/nodebox-runtime/blob/main/packages/nodebox/LICENSE](https://github.com/codesandbox/nodebox-runtime/blob/main/packages/nodebox/LICENSE)
- [github.com/container2wasm/container2wasm](https://github.com/container2wasm/container2wasm)
- [github.com/leaningtech/webvm](https://github.com/leaningtech/webvm)
- [cheerpx.io/licensing](https://cheerpx.io/licensing)
- [github.com/wasmerio/wasmer-js](https://github.com/wasmerio/wasmer-js)
- [modal.com/blog/lovable-case-study](https://modal.com/blog/lovable-case-study)
- [modal.com/blog/what-is-ai-code-sandbox](https://modal.com/blog/what-is-ai-code-sandbox)
- [electronjs.org/docs/latest/tutorial/security](https://www.electronjs.org/docs/latest/tutorial/security)

## Status
Research complete, 2026-08-17. Feeds the same in-flight scoping as `ADS-memory/reports/swarm-consensus/runs/2026-08-17-lovable-style-theme-editor-scoping.md` and `.../2026-08-17-jini-sandbox-execution-port-design.md` — no go/no-go decision made here, this only answers the three open questions the owner asked.
