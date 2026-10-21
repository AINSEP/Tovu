ACK_PACKET_RECEIVED CTX-plugins-gaps-2026-10-21 -- I received the packet and will work on it. (skills.md loaded.)

Evidence is partial. I read both briefs plus `resolve-agent-plugin-refs.ts`, the `install.ts` digest notes, the `capability-providers` layout and the Tovu comments feature listing.

## 1. Build A (Phase A)

Ranked by what hurts first:

1. **Version ordering has no source of truth (J3, v1, S).**
   - `planAgentPluginUpdate` needs "newer", but nothing says which comparison to use. Manifest `version` is a free string (`manifest.ts:138` only whitelists keys).
   - With no catalog there is no "available" version either. Phase A can only compare against a candidate the operator supplies (zip or folder).
   - So `updateAvailable` in T1 has no data source. Either drop it from T1 (later, with the catalog) or define it as "a staged candidate exists".
   - Require semver in the manifest. Treat a non-semver value as "unknown, update allowed only on explicit action". Downgrade is refused unless the operator forces it (later).
2. **Crash points in the digest switch (J3, v1, M).**
   - The brief says "restore old on failure" but names no durable record of intent. Four steps (install new, switch pin, activate, remove old) need a journal, or a pin written last.
   - Make "pin" the single atomic commit point. Boot reconciliation has to resolve any state with two digests: if the pin names the new digest and it is not active, roll back to the old one.
   - `lifecycle-reconciliation.unit.test.ts` already exists, so extend it rather than invent a second mechanism.
3. **The "one current digest" pin changes the refs resolver (v1, M).**
   - `resolve-agent-plugin-refs.ts:10-20` deliberately refuses ambiguity and scans all digests by name. It needs a pin-aware branch, or the refusal path stays hit during the update window.
   - The same scan logic is probably duplicated in activation, MCP provisioning and the skill reader. Grep every digest-scan caller before building.
4. **Plugin data and memory migration (later, but state the rule in v1, S).**
   - v1 should say plugin-owned state (`persistent-state.ts`, settings ledger) is carried over unchanged and that plugins must read old shapes.
   - The brief should forbid manifest-declared migrations for now. Running plugin-supplied migrations is executable code, which is out of scope for non-bundled plugins.
   - Rollback after the new version has written new-shape state is not safe. Say so: a failed activation restores the old digest, but state written by the new version is not reverted. Snapshot the settings slice before the switch (S).
5. **Update while a run or chat is using the plugin (v1, S).**
   - Skill prefixes are injected at run start from `resolve-agent-plugin-refs`, so in-flight runs are fine.
   - MCP servers are the exposure: the old process may hold files that get removed. Keeping the old digest until the new one activates does not help if "remove old" follows immediately.
   - Do not delete the old digest while any run pins it. At minimum, defer removal to the next boot or an idle check.
   - Restart the MCP server through `mcp-provisioning` on activation. Check that activation already reprovisions.
6. **Concurrency of two updates (v1, S).** Serialize per plugin id, per workspace, with a lock or compare-and-swap on the pin. Two operators updating at once is otherwise a silent last-writer-wins.
7. **Updating a plugin that others `require` (v1, S).** Warn-only holds. Re-run the `missingRequires` check after the update, because `provides` can change. Surface "this update removes capability X that Y requires" as a warning.
8. **Caches (v1, S).** Skill prompt indexes and `search.ts` ranking need invalidation on the digest switch. Add a test.
9. **Audit trail (v1, S).** Record old and new digest, actor and result in the existing activation record or log.
10. **Operator notification without a Marketplace (later).** "Update available" cannot exist without a catalog. The honest Phase A UX is an "Update" button on the installed row that takes a zip or folder.

## 2. Build B

1. **Existing data (v1, S).** The "no migration" claim holds only if the built-in provider is seeded ON for existing sites. Add a boot guard so a site with stored comments never loses its queue to a missing plugin or an unset `core.comments.provider`.
2. **Public thread plus form is net-new attack surface (v1, L).**
   - It needs a CSRF-style token or Origin check, and the existing honeypot and rate limit confirmed on the new no-JS form path.
   - Add an output-escaping test corpus, and a deliberately bounded depth.
   - Spam against a public form never exercised before is the biggest risk. Ship it with comments defaulting to moderated (held for approval).
3. **Caching and performance (v1, M).** Thread HTML cannot be baked into a static render. Decide between a server-rendered fragment with a short cache invalidated on approve, and a client fetch. Pick the fragment for SEO.
4. **SEO and consent (v1 decision, M).**
   - Vendor embeds are client-only with no indexable text. State that.
   - Embeds must default to paused until consent. The brief admits this surprises owners, so the placeholder needs a "load comments" control. Tie it to the cookie-consent brief and do not build a second gate.
5. **Vendor moderation (v1, S).** Show a link and status only. Do not build any sync.
6. **Agent tools (v1, S).** `comments_set_provider` needs the confirmation card. Make sure tools answer clearly when no provider is active, and that switching is reversible.
7. **Home for the contract (v1 decision).**
   - The first real consumer would be comments, and the pattern is unproven in Tovu.
   - The `cms/comments` engine already exists and already has the ports. Prefer a `cms/comments` contract subpath, and extract to `capability-providers` when a second host appears.
   - If the owner wants the pattern in `capability-providers`, accept the extra package-build and link cost (`npm install` unlinks Jini).
8. **Third-party code in a trusted loader (v1, S).** Provider modules must be bundled-digest-only, as the brief says. Add a test that a non-bundled provider manifest is ignored.

## 3. Order and conflicts

- **A and B conflict in Tovu's plugin plumbing.** B's `tovu-comment-providers.json` loader and A's digest pin both touch `features/agent-plugins` and `resolve-agent-plugin-refs`. Build A's J1/J3 first, or serialize the shared files.
- **Same-package contention.** A edits Jini `agent-plugins` (`install.ts`, `manifest.ts`), while B edits Jini `cms` and `capability-providers`. B's `deps.ts` and `app.ts` composition moves collide with any coverage wave touching those files.
- **Plugin install seam.** Seeding a new bundled `comments` plugin goes through `seed-bundled.ts` and the bundled digest ledger, which A's pin change affects. Run B's seeding lot after A's J3 lands.
- **Coverage waves.** The 100% per-file rule means moved code needs its tests moved in the same lot, or the wave will flag it. Do not run a coverage wave on `cms/comments` or `agent-plugins` while the builds run.

## Lot summary

| Item | Verdict | Lot | Size |
|---|---|---|---|
| Version ordering, drop `updateAvailable` | v1 | J3/T1 | S |
| Crash-safe pin plus reconcile | v1 | J3 | M |
| Pin-aware refs resolver | v1 | J3 | M |
| Per-plugin lock, audit | v1 | J3 | S |
| Data and memory migrations | later | none | - |
| Marketplace notifications | out | J2/T2 | - |
| Moderated-by-default form, CSRF | v1 | B1 | L |
| Consent placeholder | v1 | B2 | M |
| Comments contract home | v1 decision | B0 | S |

<<SWARM_END>>