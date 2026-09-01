# ADR-062: Runner's Shared Media Library — Content-Addressed Store, and Ingress by Operator Pull Rather Than Site Push

- Status: PROPOSED — requires owner sign-off. No implementation exists; nothing here has been built.
- Date: 2026-08-29
- Author: Claude Opus 5 / Leon Aburime
- Supersedes: nothing.
- Relates: ADR-061 (the site-assistant allowlist — D6 deferred exactly this design and this ADR is
  the answer), ADR-060 (D2 Tier 1 already names a media-import fan-out verb; this completes it),
  ADR-027 (media/assets subsystem — the source of the identity, safety, and GC discipline reused
  here), ADR-052 (Runner is its own desktop product), ADR-012 (a site is an install-dir).

## Context

The operator's ask: "any Tovu instance can add its media to the general Tovu Runner library."

**There is no library.** Runner has no media storage of any kind. `runner.generate_video` and
`runner.generate_image` are declared (`Tovu-Runner/src/contracts/sections.ts:127`) under a section
whose operator-facing label is already "Media", and both are unimplemented — `runner-tools.ts`'s
`IMPLEMENTATIONS` has no entry for either. So this is a design decision ahead of code, not a
refactor of something.

That absence also reframes the request. A shared blob store is a **precondition for the generation
verbs**, not just for site contributions: a generated image needs somewhere to land, and that
somewhere is the same store. Building the store is justified on its own; the open question is only
who is allowed to put bytes into it.

**Each site already has its own `uploads/`** inside its install dir (`config.json`, `content.db`,
`uploads/`, `themes/`, `plugins/` — ADR-012's shape). That is where a site's own media lives today,
governed by ADR-027 on Tovu's side. The library is a second, fleet-level thing, and the relationship
between the two is what most of this ADR decides.

## Decision — the store

**D1 — The library lives in Runner's own state directory, never inside a project.**
Blobs at `<userData>/media/blobs/<ab>/<cd>/<sha256>` alongside the existing `instances/`, `logs/`,
`runner-db/`; the index in Runner's existing sqlite registry.

Not in any project's `uploads/`, and this is not a preference. `deleteProject` recursively removes
the install dir when it sits under `instancesRoot`
(`Tovu-Runner/src/main/project-provisioner.ts:550-551`) — a shared library living there is erased by
the deletion of whichever site happened to contribute first. Two-level hex fan-out because a flat
directory of tens of thousands of entries is slow to enumerate on some filesystems and unpleasant to
inspect by hand when something has gone wrong.

**D2 — Copy the bytes. Do not reference them.**
Referencing a site's `uploads/` file would be cheaper and is wrong twice over. It dangles on exactly
the operation Runner exists to perform (project deletion). And ADR-027 makes a source binding
write-once — replacing a site's asset mints a *new* entry rather than mutating the old one — so a
reference would silently keep pointing at a superseded asset with no event Runner could observe.
The cost is duplicated disk, and D3 bounds it.

**When a contributing site is deleted, the blob survives and its contribution row is removed.** The
library's integrity does not depend on the continued existence of whoever contributed to it; that is
the entire point of copying.

**D3 — Dedup on sha256, claimed by the caller and verified by Runner.**
ADR-027 already computes and stores a write-once `bodyJson.$.source.sha256` per asset, so the caller
can supply it and Runner should accept it as a *claim* — then re-hash the bytes after ingest and
reject on mismatch. The claim arrives through a prompt-influenced path; treating it as an assertion
to check rather than a fact costs one pass over bytes already in memory.

Keyed on the hash **alone**, not on `(workspaceId, sha256)` the way Tovu's per-site dedup is. Tovu
scopes by workspace because its stores are per-site; a *shared* library is one namespace by
definition, and cross-site dedup is the property that makes it worth having.

**D4 — Attribution comes from the credential, never from the arguments, and it is a ledger.**
Runner's MCP bridge already established this rule for run ids and, per ADR-061 D3, for the
audience: a site-assistant credential binds to a `projectId`, so the calling site is known without
being asked. The tool therefore takes no project argument at all.

Two tables, not one column:

```
media_assets        (sha256 PK, byte_size, mime, width, height, first_seen_at)
media_contributions (sha256, project_id, source_asset_id, title, alt, contributed_at,
                     PRIMARY KEY (sha256, project_id))
```

Many-to-many, because D3 means two sites can legitimately contribute identical bytes and a single
`contributed_by` column would have to pick a winner and lose the other. `source_asset_id` is the
contributing site's own ADR-027 entry id, kept so a library asset can be traced back to the site
record it came from.

**D5 — Two sites contributing the same asset is a normal outcome, reported as such.**
The blob is stored once; both contribution rows exist. The second call returns
`{ assetId, deduped: true }` — not an error, and explicitly not a silent success. `runner-tools.ts`'s
header already argues the general case: "a silent no-op (returning 'ok' for work that never
happened) is worse than either", because a model told "ok" reports something false to the user. Here
the true statement is "that image is already in the library, and your site is now also credited."

Deleting a project removes its contribution rows. A blob with zero remaining contributions becomes a
**GC candidate with a grace period**, never an immediate unlink — ADR-027 reached the same
conclusion for the same reason (something may be mid-write, and bytes are cheaper than a race).

**D6 — Input schema.**

```
{ sourceUrl: string,   // the contributing site's own media URL
  sha256:    string,   // ADR-027's source hash; a claim, verified after fetch (D3)
  filename?: string,
  title?:    string,
  alt?:      string }
```

No `projectId` — D4. And no raw bytes: Runner's bridge caps a callback body at 256 KiB
(`MAX_REQUEST_BYTES` in `runner-mcp-bridge.ts`), and base64 through a stdio JSON-RPC pipe is the
wrong transport for a multi-megabyte image regardless of the cap.

**SSRF is closed structurally rather than filtered.** Runner resolves the caller's own port from the
credential's `projectId` via the registry, and accepts only `http://127.0.0.1:<that port>`. There is
no allowlist to get wrong and no parser to bypass, because the only origin the caller can reach is
its own. ADR-027's `MediaIngressPolicy` does resolve-then-connect precisely because a filter over an
arbitrary URL is hard; not accepting an arbitrary URL is easier.

## Threat model — and why the ingress decision goes the other way

ADR-061 put `runner.create_site` on the site-assistant allowlist on a specific argument: it is
**purely additive**, touches no existing project's files or process, and its worst hostile outcome
is a junk site the operator deletes. Noise, not loss.

**A media contribution does not inherit that argument, and the difference is not a matter of
degree.** It writes attacker-influenceable bytes into a store that *other sites read from*. Six
concrete failure modes, none of which `create_site` has:

1. **Content-type confusion.** Bytes declared `image/png` that are HTML, or SVG, or a polyglot. If
   the library ever serves them into an admin origin, that is stored XSS with cross-site reach.
2. **Decompression bombs.** A small file that expands to gigabytes. Runner must re-encode anyway to
   strip EXIF (ADR-027), and re-encoding is exactly where the bomb detonates — in Runner's process.
3. **Malicious SVG.** SVG is XML with scripting and external-entity reach. ADR-027 admits it only
   behind an explicit `media.upload_svg` capability; **Runner has no equivalent operator-consent
   mechanism at all**, so it has no way to express that gate today.
4. **Storage exhaustion.** `create_site` is self-limiting and visible — each call makes one install
   dir on one port, and the operator sees the fleet grow. Media has no such bound: a loop can commit
   the operator's disk in a way that is neither visible nor cheap to undo.
5. **Cross-site content injection — the genuinely novel one.** Site A's assistant is injected and
   contributes an asset. Site B's operator later browses the shared library and places it on site B.
   Attacker-controlled content has now crossed between sites, carried by a human who trusted the
   library *because it is the operator's own library*. Nothing in `create_site` produces an artifact
   that another site's operator is invited to trust.
6. **Second-order injection into the LEFT chat.** `title` and `alt` are attacker-supplied strings
   that Runner stores and later renders — and, once Runner's fleet chat can list media, *reads*.
   That is a path from one site's attacker-supplied content into the operator agent's context. It is
   precisely the boundary ADR-061 was written to protect, re-opened from a direction ADR-061 did not
   consider.

### D7 — The recommendation: make ingress a pull, not a push

**`runner.media.add_to_library` should not go on the site-assistant allowlist. It should not be
built as a site-facing verb at all.** Build the mirror instead:

> **`runner.media.import_from_site { project, assetIds }` — a LEFT-chat verb, operator-invoked.**

Same capability, same store, same D1–D6 design underneath, and the entire threat surface above
collapses because the operator initiates. An attacker who fully controls a site can still place
whatever they like in *their own* `uploads/`; what they cannot do is cause it to enter the shared
library, because a human chose which assets to import. Failure mode 5 reduces to the ordinary trust
decision an operator makes when saving an image from the internet — a decision they know they are
making.

This is not a new invention to sidestep the problem. **ADR-060 D2's Tier 1 already names it:** "A
media-import verb and a settings/credential-propagation verb cover the two motivating cases," owned
by Runner because "the fan-out and its reporting are fleet semantics no single site's API
expresses." Pull ingress completes a verb that was already planned, rather than competing with it.

The operator's stated want — "any Tovu instance can add its media to the general library" — is
satisfied: every site's media is importable into the shared library. What changes is who presses the
button, and only the push framing required trusting a prompt-injectable caller to press it.

### What would have to be true to revisit a site-initiated push

Recorded so a future reader does not have to re-derive it, and stated as a conjunction. All six:

- **(a)** Ingest re-encodes through an out-of-process worker with byte and pixel bounds — ADR-027's
  `ImageTransformPort` shape — so a decompression bomb kills a worker, not Runner's main process.
- **(b)** A MIME allowlist keyed by pipeline, with **SVG excluded outright** rather than
  capability-gated, until Runner has an operator-consent mechanism to gate it with.
- **(c)** Library originals are never served into any site's admin origin — ADR-027's cookie-less
  media origin generalized to Runner, or the library stays strictly local-only.
- **(d)** A per-project quota (count, bytes, and rate) enforced at the bridge, because
  `create_site`'s "worst case is noise" stops being true when noise is measured in gigabytes.
- **(e)** Contributed `title`/`alt` are treated as untrusted wherever they reach Runner's own
  operator chat — the way Tovu already wraps federated results in an untrusted-data boundary
  (observed in ADR-061's Evidence), not as ordinary strings.
- **(f)** Contributions land quarantined and unlisted until an operator promotes them.

Even with all six satisfied, D7's pull design delivers the same capability with none of the ingress
risk. So these are the conditions for *reconsidering*, not a roadmap toward an outcome that is
currently believed to be better. If they are ever all met, the honest question is still "what does
push buy that pull does not."

## Consequences

Build order follows from the store being a shared precondition: **the blob store and its index
first** (unblocking the two declared-but-unimplemented generation verbs, which need somewhere to put
output), **`runner.media.import_from_site` second**, and **no site-facing push verb**.

`SITE_ASSISTANT_TOOL_NAMES` stays at one entry. ADR-061's D2 compile-time guard means that is not a
convention anyone has to remember — a media verb added to that list is a `satisfies` failure at
`npm run typecheck` only if it is one of the enumerated `FleetOnlyVerb`s, so **a future
`runner.media.*` verb would be *eligible* and would compile.** That is worth saying plainly: the
type system does not enforce this ADR's conclusion. Adding the media verb to `FLEET_ONLY_VERBS`
would make it enforce it, and is the cheap way to make D7 structural rather than advisory.

Runner gains persistent state it has never had. Today everything under `<userData>` is either
reconstructible (`logs/`, `mcp-bridge/`) or owned by a project that can be deleted. A media library
is the first thing Runner holds that is durable, shared, and not derivable from anything else —
which means it is also the first thing Runner will need a backup story for, and there is none.

`Tovu-Runner/development/scripts/verify-site-assistant-mcp.mjs` asserts that the site-assistant
surface advertises exactly one tool. Under D7 that assertion stays correct as the library ships,
which is the intended relationship: the harness fails if a media verb ever reaches that surface.

## Rejected alternatives

- **Reference the site's `uploads/` file instead of copying.** Rejected per D2: dangles on project
  deletion, and silently follows a superseded asset after an ADR-027 source-replace.
- **A single `contributed_by` column instead of a contribution ledger.** Rejected: dedup makes
  multiple genuine contributors the normal case, and a single column must discard all but one.
- **Accept bytes inline (base64) on the tool call.** Rejected: the bridge caps bodies at 256 KiB,
  and stdio JSON-RPC is the wrong transport for image payloads at any cap.
- **Site push with quarantine-until-promoted.** This was the near-miss, and it is a real design —
  (f) alone blunts failure modes 1, 3, and 5. Rejected because it still requires (a)–(e) to be safe,
  still consumes disk before any human sees it (failure mode 4 survives quarantine), and still puts
  attacker-supplied metadata in front of the operator. Pull obtains the same capability without
  needing any of it.
- **Dedup keyed `(projectId, sha256)`, mirroring Tovu.** Rejected: that is per-site dedup, and it
  would defeat the one property that makes a *shared* library worth building.

## Open, assumed, or deferred

- **Renditions and transforms are out of scope.** ADR-027 has a whole named-transform registry and
  an immutable URL scheme; whether Runner needs any of that, or only originals, is undecided and
  depends on what consumes the library. Nothing here should be read as committing Runner to
  reimplementing ADR-027.
- **How an imported asset gets back into a site** — the reverse direction, "put this library image
  on site B" — is not designed here. It is ADR-060 Tier 1 fan-out territory and needs its own pass.
- **No backup or export story**, per Consequences. Named, not solved.
- **Whether `first_seen_at` attribution is meaningful across a fleet the operator fully controls**
  is assumed yes (it answers "where did this come from" during an incident), but nothing currently
  reads it.
- **The generation verbs' relationship to the library** — whether `runner.generate_image` writes
  directly into it, and under what attribution when there is no contributing site — is unaddressed.
