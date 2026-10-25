ACK_PACKET_RECEIVED CTX-plugins-gaps-2026-10-21 -- I received the packet and will work on it.

(I loaded the Software Architect skills file at `AI-Dev-Shop/agents/software-architect/skills.md`.)

**1. Build A, ranked by which would hurt first**

1. **J3 as written breaks about 17 readers. v1, J3, L (the brief says S).** Today every successful publish deletes the old revision straight away (`jini-int/.../lifecycle/install.ts:210-238,333`), and the brief itself says "There is no previous-revision rollback slot." No current-digest pin exists for operator plugins. Only bundled plugins have one, in the `bundled-digests` ledger.
   - MCP federation picks whichever copy it finds first: `installed.find(...)` at `tovu-int/.../agent-plugins/federate-mcp.ts:308`.
   - Pinned plugin refs (`resolve-agent-plugin-refs.ts:10-40`) refuse outright when two copies exist.
   - So the "keep old digest until the new one activates" window gives either ambiguous runs or wrong MCP servers, across every caller of `listInstalledPlugins`.
   - **Fix:** never have two live digests. Move the old package into a frozen rollback area outside `packages/sha256/` (reuse `stageForRemoval`), publish the new one, re-activate, then delete the rollback copy. Do all of it inside the existing file lock (`persistent-state.ts:14-24`). That keeps the change inside `install.ts`/`uninstall.ts`, as the brief wants.
2. **No recovery after a crash mid-update. v1, J3, M.** We need a small per-plugin update journal: pending, then published, then committed. At boot, if the journal says pending and the rollback copy exists, restore it. Test each crash point with fakes.
3. **MCP is not re-provisioned. v1, J3/T1, S.** MCP is keyed by plugin id, but its config is read from the old `packageRoot` (`federate-mcp.ts:310`). The update must call `provisionAgentPluginMcp` and `notifyRosterChanged` (`mcp-provisioning.ts:5-12`). An MCP call already in flight may fail, and that is acceptable. Skill text is captured when a run starts, so running chats keep the old guidance. Write that down; don't block on it.
4. **`updateAvailable` has no source in Phase A. v1, T1, S.** Without a catalog nothing can know a newer version exists. Drop the field. "Update" means uploading a newer zip or folder; the preview already shows `upgradeFrom` (`install-upload.ts:245`). `version` is optional (`install.ts:204`), so a plugin with no version updates only by explicit replace.
5. **What `hostRange` is checked against. v1, J1, S.** Use a declared agent-plugin contract version, not Tovu's app version (desktop and server versions differ). Copy the site-plugin precedent `sdkRange` + `semver.satisfies` (`plugins/src/host/node/loader.ts:214`) and add `semver` as a dependency rather than hand-writing a subset.
6. **Downgrade policy. v1, J3, S.** Refuse downgrades the way site plugins do (`plugins/src/host/node/install.ts:308`). The one exception is the automatic restore in the rollback path.
7. **Updating a plugin others `require`, and disabling it. v1, T1, S.** Compute `missingRequires` live, at list time and on every enable. Warn when disabling a plugin that others need ("X needs this"), and when a v2 drops something from `provides`.
8. **Audit trail. v1, T1, S.** The update needs an audit entry with actor, id, from/to digest and version, and the result, the same way set-enabled does (`set-enabled.ts:47`).
9. **Two updates at once. v1, J3, S.** The file lock already covers this. The brief must keep the whole publish → activate → commit sequence inside one lock.
10. **Plugin data migrations. Later.** Operator plugins can't run code: executable contributions are bundled-only, so there are no plugin-owned tables. An MCP server migrates its own `pluginDataDir`. Memory directories are keyed by plugin id and survive. Bundled plugins stay seed-managed.

**2. Build B: what's missing or wrong**

- **The no-JS form lands on raw JSON. v1, B1, S.** The submit handler only answers with JSON 201 or 422 (`cms/src/comments/express/submit-handler.ts:101-105`). It needs to look at the request's Accept header and reply 303 back to the page with `#comment-pending`. It also needs a urlencoded body parser on that route.
- **One shared rate-limit bucket. v1, B1, S.** Rate limiting is keyed on `authorIpHash ?? "unknown"` (`ingress.ts:137`). Behind Fly's proxy every visitor can land in the same bucket. Check the trust-proxy and IP-hash path before the form goes public.
- **The pending queue disappears. v1, B1, S.** The queue mounts only while built-in is the active provider. Switching to a vendor would hide pending items, and spam would never be purged. Keep the queue readable while stored rows exist, and make the switch confirmation show the pending count.
- **Where the built-in adapter lives. v1, B1, S.** Put the code that connects the cms comments engine to the new ports in Tovu's comments plugin module, not in `cms`. `cms` doesn't depend on `capability-providers` today (`cms/package.json:423-445`), so this avoids a new package link and keeps away from the cms coverage waves. The new subpath itself is fine; `cms/comments` stays an engine.
- **CSP. v1, metadata only.** The public CSP is report-only (`public-page-security-headers.ts:7-16`). Store per-provider CSP now; enforcing it comes later.
- **Consent. v1 metadata; the gate comes from the cookie-consent work.** `data-consent-category` only appears in `site-chat-markup.ts` today. Vendor embeds depend on that work landing; until then, ship built-in only.
- **SEO and caching. v1.** Render the built-in thread on the server per request (I found no page cache), capped at about 200 comments with paging. Static exports bake comments in at export time, so for v1 say "embedded providers only" there. Vendor threads stay client-side and don't help SEO; state that.
- **Giscus thread mapping. Vendor lot, S.** Map threads to the entry id, not the canonical URL, or renaming a slug orphans the thread.
- **Escaping. v1, S.** `renderThread` must never output the email or IP hash. Escaping tests are required.
- **Agent tools. v1.** The 8 tools plus get/set provider are enough. **Later:** export to the Disqus WXR format, Akismet.

**3. Order and conflicts**

- Both builds edit `features/agent-plugins/*`: `bundled-catalog.ts`, and the loader/registry next to `mail-adapter-registry.ts`.
- B seeds a new bundled plugin ON, but A's acceptance test says no bundled plugin may change state. Write the exemption into both briefs, or land A's T1 first.
- B moves code out of `composition/app.ts`, which has uncommitted changes in the live tree right now. Build from a clean base.
- J1/J3 touch `agent-plugins/lifecycle/{manifest,install}.ts`. Hold any `agent-plugins` coverage wave until A merges.
- B's new Jini subpath doesn't conflict with anything.

**4. Summary**

| Item | v1 / later | Lot | Size |
|---|---|---|---|
| Rollback area | v1 | J3 | L |
| Update journal | v1 | J3 | M |
| MCP re-provision | v1 | J3/T1 | S |
| Drop `updateAvailable` | v1 | T1 | S |
| `hostRange` via `sdkRange` precedent | v1 | J1 | S |
| Downgrade refusal | v1 | J3 | S |
| Dependents warning | v1 | T1 | S |
| Audit entry | v1 | T1 | S |
| Data migrations | later | – | – |
| B: 303 redirect + body parser | v1 | B1 | S |
| B: rate-limit key | v1 | B1 | S |
| B: keep queue visible | v1 | B1 | S |
| B: adapter in Tovu | v1 | B1 | S |
| B: vendor embeds after consent gate | later | B2 | M |
| B: WXR export, Akismet | later | – | – |

<<SWARM_END>>