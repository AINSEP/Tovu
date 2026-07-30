# Red-Team Findings: plugin-system

- Feature: FEAT-005-plugin-system
- Spec version: 1.0.0
- Spec hash: sha256:4b8a8ce77579383517c544de3de577a33ce9afedb4cf7d321d74a3c4ce0d94ea
- Red-Team completed: 2026-07-07T04:45:00Z
- Red-Team agent: Claude Opus 4.8 (persona `AI-Dev-Shop/agents/red-team/skills.md` loaded this session) — **adversarial pass on a spec authored in this same session; probed for author bias deliberately.**
- Finding count: 1 BLOCKING · 4 ADVISORY · 1 CONSTITUTION_FLAG

---

## BLOCKING Findings

Spec must be revised before Software Architect dispatch. 1 BLOCKING (< 3, so no systemic route-back — a targeted fix by the Spec Agent clears it).

### RT-001
- Severity: BLOCKING
- Category: contradiction
- Location: REQ-05 hook signature vs REQ-04 capability model / INV-01 (SPEC-002 slug uniqueness) / INV-02
- Description: `content.entry.beforeSave` is typed `(entry: ContentEntryDraft, ctx) => ContentEntryDraft` — the filter returns a **whole entry draft**, so a plugin can mutate ANY field: `title`, `slug`, `status`, `bodyJson`, not just its `ext` namespace. But the only content-write capability in the v1 vocabulary is `content.extend` ("declare + write **ext** fields"). Nothing constrains a `beforeSave` filter to `ext`-only. Consequences: (a) a plugin holding only `content.extend` can rewrite `slug` or `status`, **bypassing SPEC-002's validation and the gateway's semantics** and threatening INV-01 (cross-kind slug uniqueness) and the draft/published boundary (SPEC-002 INV-04); (b) it directly contradicts INV-02 ("never reach a surface it did not declare a capability for") — full-entry mutation is a surface no capability grants. The capability model is the security promise of the whole spec, and this hole drives a truck through it.
- Suggested resolution: For the v1 thin slice, tighten the hook contract to match the capability vocabulary: `content.entry.beforeSave` returns an **`ext` delta only** (signature `(entry: Readonly<ContentEntryDraft>, ctx) => ExtPatch`), not a full mutable draft. Core merges the returned `ext` patch (validated per BR-06) and ignores any attempt to touch core fields. Full-entry mutation (title/slug/status transforms) becomes a *separate, later* capability + hook with its own re-validation-through-SPEC-002 rule (add as an OQ). This keeps v1 honest: `content.extend` ⇒ ext only, exactly what `word-count` needs.

---

## ADVISORY Findings

### RT-002
- Severity: ADVISORY
- Category: contradiction
- Location: feature.spec.md REQ-01 (required manifest fields) vs state.spec.md §2 (`PluginManifest.engine`) and behavior.spec.md §10 ("manifest.engine absent ⇒ reject")
- Description: REQ-01's required-field list is `id, name, version, sdkRange, capabilities, hooks, fields, integrity` — it omits `engine`. But state.spec.md §2 includes `engine: integer` and behavior.spec.md §10 rejects its absence with `MANIFEST_MALFORMED`. The three files disagree on whether `engine` is required.
- Suggested resolution: Add `engine` to REQ-01's required list (it's the forward-compat gate, analogous to the theme `engine` in SPEC-004 — it should be required). Spec-Agent cleanup.

### RT-003
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: AC-09 (multi-version flip) vs api.spec.md §4 (`PLUGIN_SET_ENABLED` body `{enabled: boolean}`)
- Description: AC-09 requires that with two installed versions, enabling the other version "flips the active pointer and swaps which module loads." But `PLUGIN_SET_ENABLED` takes only `{enabled: boolean}` on `/plugins/:pluginId` — there is **no `version` selector**. The API cannot express "enable version X of this plugin," so AC-09 is unachievable through the specified surface.
- Suggested resolution: Either (a) add optional `version` to the PATCH body (defaults to the latest installed) and store it in `plugin_activations.version`; or (b) scope v1 to one-installed-version-per-id, move AC-09/EC-08 to an OQ, and defer side-by-side version switching. Given the thin-slice intent, (b) is cleaner — side-by-side install (REQ-02) can stay a filesystem capability while the *switch UX* defers.

### RT-004
- Severity: ADVISORY
- Category: missing-failure-mode
- Location: BR-07 / EC-10 (fail-closed) + OQ-02 (no admin UI) + OQ-06 (no quarantine)
- Description: Fail-closed means a single enabled plugin whose `beforeSave` filter throws **breaks all content saves site-wide** until it is disabled. With no admin UI (OQ-02) and no automatic quarantine/safe-mode (OQ-06), the only recovery is a raw `PATCH …/plugins/:id {enabled:false}` API call. This is a real availability cliff for a walking skeleton, and the recovery path isn't documented in the spec.
- Suggested resolution: Accept the integrity-over-availability tradeoff for v1 (it's the right call for first-party plugins) but document the recovery path explicitly in EC-10, and note that `PLUGIN_SET_ENABLED` must remain independent of the content-write path (so a save-breaking plugin can always be disabled). Flag quarantine (OQ-06) as the priority follow-on.

### RT-005
- Severity: ADVISORY
- Category: untestable
- Location: REQ-09 / AC-01 (`word-count` semantics)
- Description: AC-01 asserts a "5-word `bodyJson`" ⇒ `count == 5`, but the word-counting algorithm is unspecified (tokenization: whitespace vs Unicode word boundaries; hyphenates/contractions; how text is extracted from nested TipTap nodes). AC-01 is testable with a trivial fixture ("one two three four five") but the plugin's own behavior isn't pinned.
- Suggested resolution: Specify the tokenization in REQ-09 (e.g. "concatenate all `text` node values with single spaces, trim, split on `/\s+/`, count non-empty tokens"). Low severity — it's the example plugin, but it's also the dogfood reference every future plugin author will copy.

---

## CONSTITUTION_FLAG Findings

### RT-006
- Severity: CONSTITUTION_FLAG
- Category: constitution
- Article: Article VI — Security-by-Default
- Location: REQ-03/REQ-04 (capability enforcement described as "API-surface-level, not a sandbox")
- Description: The spec is explicit and honest that capability enforcement is API-surface-level and an in-process ESM module "can still touch `fs`/`process.env`/network" (ADR-004). That's the correct v1 call for first-party + local installs, but it means the "capability" model is a *convention the plugin can bypass* by importing `node:fs` directly rather than going through the SDK. The security posture rests entirely on "we only run first-party/local plugins in v1."
- Architect note: No action required for v1, but record the Complexity Justification clearly: capabilities are an API-surface contract, NOT an isolation boundary; the marketplace/third-party era (OQ-05) is gated on real isolation (OQ-06, worker/isolate). Ensure nothing in v1 markets or documents capabilities as a security sandbox (the ADR-004 line). This also makes RT-001 more important — if capabilities aren't a hard boundary, at least the *hook contract* should be tight.

---

## Routing Decision

`1` BLOCKING finding (RT-001). **Route back to Spec Agent for a targeted revision** — tighten `content.entry.beforeSave` to an `ext`-delta contract so the hook can't mutate core fields outside the capability vocabulary. After that single fix + the RT-002 (`engine` required) and RT-003 (version selector / defer AC-09) cleanups, SPEC-005 clears for Software Architect.

ADVISORY/CONSTITUTION_FLAG findings carry into Architect context. RT-006 is the frame for the whole plugin-security story and should anchor the ADR Complexity Justification.
