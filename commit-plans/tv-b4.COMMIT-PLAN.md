# codex/tv-b4 — combine handoff

Base: `776ce6d0f0cd88072f38d352ff99bef7c342d25d` (Tovu merge-6).
Applied B1 → B2 → B3 → B4 → B5 → B6 → B7 → RC-W2, with each cull governing.
`AP` below means `apps/website/src/features/agent-plugins`; `W` means `apps/website/src`.
Every sheet also has this handoff entry in root `COMMIT-PLAN.md`.

No tests, builds, installs, type-checks, linters, gate checks, graph tools, commits or pushes ran.
There is no green-baseline claim. Verification and mutations below are owed to combine Cloud.
The ledger, manifests and lockfiles are untouched. No component pads were removed; RC-A and RC-D are outside this job.
No incidental test importers needed repointing, so `REFRESH.md` was not created.
Targeted importer lookups used the dispatch's `git grep -n -F` scope; source and final diffs were read directly.
All surviving touched source/test files are below 500 lines. No new cast or unlisted declaration was needed.
No sheet STOPPED.

## B1 — done

- Files changed: `AP/capability-projection.ts`.
- Ledger identity to verify at zero: `apps/website/src/features/agent-plugins/capability-projection.ts` + `catch-reads-error` (row 181, baseline 2). Ledger deletion belongs to combine.
- Replaced the optional MCP declaration and plugin manifest catches with the prescribed `orFallback` calls. Containment precedes each read; the pure JSON parse catch and read-trust comment remain.
- Tests changed: none. Pads removed: 0.
- Cloud mutations: independently bypass each idiom and execute its work directly. Missing `mcp.json` must reject rather than yield no servers; missing/malformed `plugin.json` must reject rather than preserve transport discovery. Use the existing capability-projection cases without executor test edits.
- Chrome look owed: none. Deletions: replaced catch/assignment scaffolding only. Diff re-read deletions: none beyond the prescribed edit. STOP: none.

## B2 — done

- Files changed: `AP/exports/source.ts`.
- Ledger identity to verify at zero: `apps/website/src/features/agent-plugins/exports/source.ts` + `catch-reads-error` (row 183, baseline 1).
- Wrapped the existing `readPackage` try body verbatim in `orFallback`; both lifecycle catalog calls stay outside it, preserving admission and eligibility failures.
- Tests changed: none. Pads removed: 0.
- Cloud mutation: bypass the idiom and execute its work directly; an unreadable admitted manifest must reject rather than contribute no public exports. No new executor test case.
- Chrome look owed only if public-embed flows are in combine smoke: missing-manifest public embed fallback.
- Deletions: replaced catch scaffolding only. Diff re-read deletions: none beyond the prescribed edit. STOP: none.

## B3 — done

- Files changed: `AP/host-plugin-guidance.ts`.
- Ledger identity to verify at zero: `apps/website/src/features/agent-plugins/host-plugin-guidance.ts` + `catch-reads-error` (row 184, baseline 1).
- Replaced only the final YAML classification catch in `opensFrontmatter` with `orFallbackSync`, retaining placement/delimiter checks.
- Tests changed: none. Pads removed: 0.
- Cloud mutation: bypass the idiom and execute its work directly; malformed YAML must throw instead of preserving guidance bytes. No new executor assertion.
- Chrome look owed only if plugin-guidance flows are in combine smoke: malformed-guidance output.
- Deletions: replaced catch scaffolding only. Diff re-read deletions: none beyond the prescribed edit. STOP: none.

## B4 — done

- Files changed: `AP/host-signals.ts`.
- Ledger identity to verify at zero: `apps/website/src/features/agent-plugins/host-signals.ts` + `catch-reads-error` (row 185, baseline 3).
- Enumeration now falls back to `[]` and reaches `combineDeclarations`; manifest reads retain their existing work. Resolver work stays in order, with core evaluation lazy on the right of `??`. Existing preboot comment retained.
- Tests changed: none. Pads removed: 0.
- Cloud mutations: bypass each of the three idioms independently. Existing host-signals assertions must fail for throwing enumeration, unreadable manifests alongside healthy entries, and a throwing path getter/declaration reader respectively.
- Chrome look owed: none. Deletions: `let sources`, its early empty-result return, and replaced catch scaffolding. Diff re-read deletions: none beyond the prescribed edit. STOP: none.

## B5 — done

- Files changed: `AP/new-site-agent-plugin-tokens.ts`.
- Ledger identity to verify at zero: `apps/website/src/features/agent-plugins/new-site-agent-plugin-tokens.ts` + `catch-reads-error` (row 188, baseline 2).
- Wrapped the existing plugin-ID read body verbatim; enumeration uses the named `orFallback<Dirent[]>` with `[]`. Supplied-root handling, retired-ID filtering and token policy remain in place; the existing manifest assertion is unchanged.
- Tests changed: none. Pads removed: 0.
- Cloud mutations: independently bypass the ID-read and enumeration idioms; existing assertions for a manifest-less directory and absent root must fail respectively.
- Chrome look owed: none. Deletions: mutable entries assignment, early `return []`, and replaced catch scaffolding. Diff re-read deletions: none beyond the prescribed edit. STOP: none.

## B6 — done

- Files changed: `AP/provider-plugin-link.ts`.
- Ledger identity to verify at zero: `apps/website/src/features/agent-plugins/provider-plugin-link.ts` + `catch-reads-error` (row 189, baseline 1).
- Current selected revision's provider read uses the prescribed fallback. The ambiguity refusal remains before it; the unreadable-manifest comment follows it; link insertion and the separate activation diagnostic remain in place.
- Tests changed: none; no fake toggle or reads-assertion change. Pads removed: 0.
- Cloud mutation: bypass the idiom; `ports.links({})` must reject for an unreadable current revision instead of returning an empty map, without falling back to an older revision. Keep ambiguity rejection.
- Chrome look owed: none. Deletions: replaced catch scaffolding only. Diff re-read deletions: none beyond the prescribed edit. STOP: none.

## B7 — done

- Files changed: `AP/soon-lock.ts`, `AP/supersession.ts`.
- Ledger identities to verify at zero: `apps/website/src/features/agent-plugins/soon-lock.ts` + `catch-reads-error` (row 190, baseline 1), and `apps/website/src/features/agent-plugins/supersession.ts` + `catch-reads-error` (row 191, baseline 1).
- Optional maturity and supersession reads use the named idioms. Host maturity evaluation remains outside the callback; `parseJson` and installed-before-bundled precedence remain intact.
- Tests changed: none; no `soon-lock` fake change. Pads removed: 0.
- Cloud mutations: independently bypass the maturity and supersession idioms. An unreadable maturity manifest must reject instead of applying the existing host fallback; an installed-read rejection must reject instead of allowing bundled fallback. Verify existing switch/write expectations and ignored missing declarations.
- Chrome look owed: none. Deletions: replaced manifest assignment and catch scaffolding. Diff re-read deletions: none beyond the prescribed edit. STOP: none.

## RC-W2 — done

- Files changed: deleted `W/features/external-mcp/external-mcp-shared-oauth.ts`; updated `W/features/external-mcp/contracts.ts`, `W/features/external-mcp/__tests__/h1a/hosted-mcp-type-pins.test.ts`, and `W/features/external-mcp/__tests__/h3/moved-shims.test.ts`.
- Deleted shell provenance: EXTRACT-S5 H3, moved to `@jini-ai/integrations/api-connections/hosted-mcp` (`shared-sign-in.ts`). The two type consumers now import `SharedExternalMcpOwner` directly from that entry.
- Confirmed the named type export in `<jini>/packages/integrations/src/api-connections/hosted-mcp/index.ts`. The old-path lookup found only the listed live importers; after the edit, only preserved fixture/provenance references and the h2c fixture reader remain.
- Tests changed: h1a type import repointed; h3 lost exactly the `oldShared` import, its identity assertion, and the old-shell source assertion. No new ENOENT assertion. Historical sign-in-copy fixtures and cloud history are untouched.
- Ledger identity: none. Pads removed: 0. Incidental test repoints / `REFRESH.md`: none.
- Cloud mutation: none; the cull removes the absence assertion and its restore-shell mutation. Combine owes the normal type/test verification of the direct imports and remaining H3 checks. Chrome/Electron look owed: none.
- Deletions: two-line shell plus the three obsolete h3 lines. Diff re-read deletions: none beyond the prescribed edit. STOP: none.

For B1–B7, combine also owes checking the other error-gate rule in each touched file for new debt. B8/shared ledger shrink remains entirely with combine; this executor makes no claim that the eight identities are already measured at zero.
