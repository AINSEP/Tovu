ACK_PACKET_RECEIVED CTX-AGENTPLUGINS-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

**Held from Round 2:** the descriptor-projection framework (`CapabilityDescriptor`, one contract for every source) and the conclusion that a plugin's own `mcp.json` can never be its own allowlist — `mcpServerToDescriptor`'s `execute: { kind: "unavailable", ... }` stays the rule, not a placeholder. Nothing this round moves that.

**What Round 3 forces into scope that Round 2 explicitly deferred:** in Round 2 I ranked "operator hand-authors a connection config for an installed plugin" (my own Option 2) *second*, below shipping now, specifically because `files/` gave "no persistence or admin UI for... an arbitrary installed plugin" — it was future work. The owner's new definition of "installed" — a real download into a real `agent-plugins/` folder — makes that future work the actual subject of this round. I can no longer treat "where do the bytes live" as someone else's problem; it's item 1, and I'm told to attack it.

**My attack, stated up front:** the Coordinator's `infra/agent-plugins/ws/<workspaceId>/<pluginId>/` proposal rests on four factual claims about Tovu's own conventions — `infra/*` is gitignored, `infra/content.db` and `infra/uploads` already exist, a `ws/<workspaceId>/` shape already exists for uploads, and a `TOVU_AGENT_PLUGINS_DIR` override would match "its siblings." **I grepped every file in `files/` for `infra`, `uploads`, and any `TOVU_*_DIR` pattern. Zero hits beyond two unrelated occurrences of the English word "infrastructure" in doc comments** (`plugin-runtime/loader.ts:106`, `plugin-runtime/discovery.ts:79`). Per this packet's own rule ("ground every claim... in path:line," "do not read files outside your working directory"), I have no file to cite for any of the four claims, and neither did any Round 2 participant — nobody who proposed or accepted this path pointed at a line. That doesn't make the claims false; self-hosted single-tenant-per-install apps commonly do keep runtime state in a gitignored sibling tree, and it's a plausible convention. But "plausible and unverified" is a different epistemic state than "verified," and Round 3's own instructions are explicit that an unverified load-bearing claim is exactly what to report loudly, not silently build on. I build my Solution Slate to work whether or not the specific path turns out to be `infra/agent-plugins/...` — the location is an injected root, not a hardcoded string — and I attack the one part of the proposal that isn't a missing-citation problem but an actual design choice: **the `ws/<workspaceId>/` segment wrapping the *package bytes themselves*, not just the plugin's per-workspace state.**

**Strongest counter-argument against my attack, and why I still hold it:** Tovu is genuinely multi-workspace (multi-tenant `content.db`, per this project's own established architecture), and a plugin's `PLUGIN_DATA` is explicitly meant to hold "installed dependencies... generated code, caches... state that should persist" (spec text, see Sources) — real per-tenant state that must not leak across a workspace boundary. If workspace isolation in Tovu is meant to be as strong as inter-tenant isolation on a SaaS host, then even read-only bytes might warrant duplication for defense in depth. I take this seriously — see "What Would Change My Mind" — but the evidence available to me (the plugin-runtime's own `plugins/<id>/<version>/` layout has no workspace segment at all — `discovery.ts:41-44`; `FederatedMcpConnectionConfig` in `mcp-federation/ports.ts:121-137` has no `workspaceId` field either — connections are resolved once at daemon boot in `bootstrap.ts:78-152`, not per-workspace) points the other way: nothing else in this codebase scopes *installed third-party bytes* by workspace, only *activation/admission decisions* are workspace-scoped (`activation.ts:30`, `FederationDeps.workspaceId` at `registrations.ts:52`). Splitting the package root from the state/admission layer follows Tovu's own existing pattern; wrapping both in one `ws/<workspaceId>/` tree does not.

## Sources

- **Agent Plugins spec v1.0.0** — [github.com/agentplugins/agent-plugins-spec, spec/1.0.0.md](https://github.com/agentplugins/agent-plugins-spec/blob/main/spec/1.0.0.md), cross-checked against [agent-plugins.org/specification](https://agent-plugins.org/specification) (the same URL `AgentPlugins.tsx:15,78` links to). **Confirmed:** the spec defines **no install/download protocol at all** — this settles, with a primary source now behind it, what Round 1's Opus and Round 2's every participant inferred from `AgentPlugins.tsx`'s own copy. **Confirmed, and load-bearing for item 2:** `PLUGIN_ROOT`/`PLUGIN_DATA` are both required subprocess env vars; `PLUGIN_DATA` is explicitly for "installed dependencies (node_modules, virtual environments), generated code, caches" — i.e., writable, evolving state — while `PLUGIN_ROOT` is implicitly the fixed, unpacked package. **Confirmed, and load-bearing for my critique below:** path containment is stated as a filesystem-resolution requirement, not a string check — *"the filesystem-resolved path MUST remain within the filesystem-resolved plugin root. Symlinks, junctions, reparse points, and equivalent filesystem mechanisms MAY resolve to targets within the plugin root, but clients MUST reject package paths that resolve outside it."* **Confirmed, and load-bearing for item 4:** *"When `mcp.json` is present, the version in its `$schema` value MUST match the version declared by `plugin.json`. A mismatch makes the MCP configuration invalid."* — this is not a nice-to-have the Round 2 participants who implemented it (Sonnet, Codex, Gemini 3.6) invented; it's spec text.
- **Zip-slip / archive-extraction traversal** — [Snyk's zip-slip research](https://security.snyk.io/research/zip-slip-vulnerability), [JFrog's writeup of the `mholt/archiver` instance](https://research.jfrog.com/vulnerabilities/archiver-zip-slip/), [HackTricks' archive-extraction-path-traversal reference](https://hacktricks.wiki/en/generic-hacking/archive-extraction-path-traversal.html). **Confirmed:** the vulnerability class has two independent vectors — a crafted entry *name* containing `../`, and a crafted *symlink entry* whose target is later dereferenced by a subsequent, individually-clean-looking entry name. The standard mitigation named across all three sources is canonicalize-then-verify-containment (realpath, not string comparison); for tar specifically, the convergent ecosystem fix cited is refusing symlink entries outright rather than trying to validate their targets. My extraction code (item 2, below) implements exactly this, and refuses symlink entries wholesale rather than attempting to validate `linkTarget` — the cheaper, spec-consistent choice, since the spec text above already tells clients to reject any *resolved* path outside the root, and a plugin has no legitimate reason to ship a symlink inside its own package.
- **VS Code's Agent Plugins** — [code.visualstudio.com/docs/agent-customization/agent-plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins). This is a **comparable client of the same open standard** (the search results place it alongside agent-plugins.org itself, and it uses the identical vocabulary). Two findings, one supporting my position and one **contradicting the Round 2 consensus, reported loudly per the packet's instruction #3:**
  - *Supports item 1:* install location is `agentPlugins/github.com/{org}/{repo}` under the OS's per-user app-data directory — **keyed by source, not by workspace or project.** VS Code has "workspaces" (a project folder) as a first-class concept and still does not scope the downloaded package by one. This is independent, real-world evidence for "per-instance, not per-workspace" that isn't just my own architectural inference from `files/`.
  - *Contradicts the Round 2 Trust Gap consensus:* **"plugin MCP servers are implicitly trusted when you install the plugin. Unlike workspace MCP servers, they do not show a separate trust prompt at startup."** Every Round 2 participant — Codex, both Gemini instances, and I — independently converged on "never auto-admit an installed plugin's `mcp.json`; an operator must independently author the allowlist." VS Code, implementing the *same spec*, ships the opposite default. I address this directly in the Solution Slate rather than pretending it doesn't exist.
- **Claude Code's plugin marketplace** — [code.claude.com/docs/en/plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces.md). **Caveat stated plainly:** this is *not* an implementation of the agent-plugins.org spec — it has its own `plugin.json`/`marketplace.json` shape and its own `${CLAUDE_PLUGIN_ROOT}` variable, not `PLUGIN_ROOT`. I'm using it only as the packet's second research ask directs — "how comparable clients isolate downloaded plugin directories" — a second real-world data point on the narrower question of layout, not spec conformance. **Confirmed:** the on-disk cache layout is `cache/<marketplace>/<plugin>/<version>/...` — keyed by marketplace, plugin id, and version, **once per machine-level install, not once per project/workspace.** That's a second independent precedent for content-addressed-by-identity-and-version rather than duplicated-per-tenant.

## Solution Slate

### Primary question (item 1): where do the downloaded bytes live?

**Ranking criteria, stated first:** (a) minimizes the number of times untrusted third-party bytes are independently extracted, hashed, and integrity-checked — every extra extraction of the *same* archive is an extra chance for the item-2 pipeline to have a bug, not just extra disk; (b) consistent with what Tovu's own codebase already does for the closest analogous case (`plugin-runtime`'s `plugins/<id>/<version>/`, no workspace segment) and with what the two real external implementations of "download a portable agent package" do (VS Code, Claude Code — neither scopes the package by project); (c) still gives the owner's actual goal — per-tenant control over *what's admitted and what state a plugin accumulates* — since that's the part that's genuinely sensitive; (d) buildable without asserting a repo convention I can't cite.

1. **RECOMMENDED — split the scope: package root shared and content-addressed; admission + `PLUGIN_DATA` workspace-scoped.** `<root>/packages/<pluginId>/<version>/<digest>/` holds the read-only extracted bytes, written once, keyed by a hash of the archive so two workspaces "installing" the identical plugin@version never re-extract or re-verify it a second time. `<root>/ws/<workspaceId>/<pluginId>/data/` holds `PLUGIN_DATA` (per-workspace by construction, matching the spec's own "state that should persist" language) plus the workspace's *own* MCP admission record (item 3). **Genuine sacrifice:** this needs a refcount (or equivalent) on the shared package root — deleting a plugin from one workspace must not delete bytes another workspace still points at, and a refcounting bug is a real, non-hypothetical class of new bug this design invites that a dumb per-workspace copy doesn't have.
2. **The Coordinator's proposal as stated — `ws/<workspaceId>/<pluginId>/` holding code and data together.** Simpler: no refcounting, uninstall is `rm -rf` the tuple, and there's no shared-state coordination between workspaces to get wrong. **Sacrifice:** N workspaces installing the same popular plugin means N independent runs of the extraction/verification pipeline against the same untrusted bytes — not merely wasted disk, but N chances for the item-2 pipeline (which is genuinely the highest-risk code in this whole feature) to diverge or misbehave, and — separately — every one of its four supporting factual claims about Tovu's own directory conventions is currently unverified against `files/` (see Position And Movement).
3. **An OS-level, outside-the-repo-tree location (VS Code's and Claude Code's own choice) — ranked last for Tovu specifically, sacrifice named:** both real precedents I found put plugin state in a per-user app-data directory outside the project/workspace entirely. I don't recommend copying that *placement* for Tovu even though I use both precedents to support "not per-workspace": VS Code and Claude Code are personal developer tools where "outside the project, in the user's own machine" is the natural trust and backup boundary. Tovu is a self-hosted **server** app, and its own apparent convention (per the Coordinator's — unverified but plausible — claim that `infra/content.db` already lives in-tree) is "one directory holds everything this instance needs, so an operator can back it up or move it as a unit." Moving plugin state outside that tree would be the one part of the Coordinator's proposal I'd keep, not attack — I only push back on the `ws/<workspaceId>/` segment nested inside it.

**Cheapest falsifying test:** two workspace fixtures both "install" the same `pluginId@version` whose archive hashes to the same digest; spy on the extraction/integrity-hash function and assert it is invoked exactly once, not twice; then delete the plugin from workspace A only, and assert workspace B's descriptors still resolve (package root untouched) while workspace A's own admission rows are gone. If Option 1 can't be made to pass without a real refcount implementation, its "buildable" ranking claim is wrong and Option 2 should be promoted.

### Secondary question (item 3): the admission model itself

Not re-litigating *whether* to auto-admit — Round 2 settled that four ways independently and the spec gives no reason to revisit it. Ranking the *mechanism*, briefly: (1) **operator hand-authors an allowlist per (workspace, plugin, digest)** after reviewing the real `mcp.json` this round's on-disk adapter now makes visible — recommended, matches `mcp-federation/ports.ts:114-119`'s own stated reason a default "belongs to a vendor preset... authored from that server's real, inspected tool surface"; sacrifice: no zero-click experience, exactly as every Round 2 participant already named. (2) **A future signed, Tovu-curated review index** (my own Round 2 "What Would Change My Mind" item) — better UX once it exists, sacrifice: doesn't exist, and building a review pipeline is a bigger commitment than this round's scope. (3) **VS Code's implicit-trust-on-install** — rejected for Tovu, not because it's an unreasonable design in general (it clearly works well enough to ship in a mainstream editor) but because the trust boundary it relies on doesn't transfer: a VS Code install is one person clicking "install" into their own single-user process, and that click *is* the independent human review the spec's ecosystem assumes somewhere exists. A Tovu install is a marketplace fetch into an always-on, potentially multi-operator server process — the person who clicks "install" in the marketplace tab and the person whose `admin.integrations.manage` permission is supposed to gate `mcp-federation` access (`trust.ts:120-131`) are not guaranteed to be the same principal or exercising the same judgment, so collapsing "install" and "admit" into one click reintroduces exactly the allowlist-authorship problem `trust.ts` R2 exists to prevent.

## Leading Option — Code

### Shared path-safety primitive (used by both extraction and preview — one containment check, not two)

```ts
// tovu/agent-plugins/package-paths.ts
//
// The containment rule below is not invented — it is the spec's own MUST: "the filesystem-resolved
// path MUST remain within the filesystem-resolved plugin root... clients MUST reject package paths
// that resolve outside it" (agent-plugins.org spec v1.0.0, "Path containment" — see Sources). The
// word "filesystem-resolved" is exactly what a lexical '..'-string check alone does not satisfy —
// see the Critique section for two Round 2 implementations that only ever did the lexical half.

import { realpath } from "node:fs/promises";
import path from "node:path";

export class PackagePathViolation extends Error {}

/** Rejects an absolute path, a NUL byte, or a lexical '..' segment — BEFORE any filesystem call.
 * Catches the cheap majority of attempts; the realpath check below catches the rest (an entry that
 * is lexically clean but is, or passes through, a symlink). */
export function normalizePackageEntryPath(rawEntryPath: string): string {
  if (rawEntryPath.includes("\0")) {
    throw new PackagePathViolation(`package entry path contains a NUL byte: '${rawEntryPath}'`);
  }
  const portable = rawEntryPath.replaceAll("\\", "/");
  if (path.posix.isAbsolute(portable) || /^[a-zA-Z]:/.test(portable)) {
    throw new PackagePathViolation(`package entry path must be relative: '${rawEntryPath}'`);
  }
  const normalized = path.posix.normalize(portable);
  if (normalized === ".." || normalized.startsWith("../") || normalized === ".") {
    throw new PackagePathViolation(`package entry path escapes the package root: '${rawEntryPath}'`);
  }
  return normalized;
}

/**
 * Resolves `entryPath` (already lexically normalized) against `packageRoot` and asserts the REAL,
 * symlink-resolved result is still inside the REAL, symlink-resolved root — the spec's
 * "filesystem-resolved" requirement, not a string comparison. `packageRoot` is realpath'd fresh on
 * every call rather than cached by the caller, so a root later replaced by a symlink (a TOCTOU swap
 * between two calls) cannot smuggle a stale trusted root in.
 *
 * Handles both cases extraction needs and preview doesn't: the target may not exist yet (mid-
 * extraction, before this entry's own write), in which case the deepest EXISTING ancestor is
 * realpath'd instead — so a symlinked PARENT directory planted by an earlier archive entry is still
 * caught even though the leaf hasn't been created yet.
 */
export async function assertContainedOnDisk(packageRoot: string, entryPath: string): Promise<string> {
  const normalized = normalizePackageEntryPath(entryPath);
  const realRoot = await realpath(packageRoot);
  const lexicalCandidate = path.resolve(realRoot, normalized);

  const lexicalRelative = path.relative(realRoot, lexicalCandidate);
  if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) {
    throw new PackagePathViolation(`package entry resolves outside the package root: '${entryPath}'`);
  }

  let realCandidate: string;
  try {
    realCandidate = await realpath(lexicalCandidate);
  } catch {
    realCandidate = await realpathDeepestExistingAncestor(lexicalCandidate);
  }
  const realRelative = path.relative(realRoot, realCandidate);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new PackagePathViolation(`package entry resolves outside the package root via a symlink: '${entryPath}'`);
  }

  return lexicalCandidate;
}

async function realpathDeepestExistingAncestor(candidate: string): Promise<string> {
  let current = path.dirname(candidate);
  const tail: string[] = [path.basename(candidate)];
  for (;;) {
    try {
      const real = await realpath(current);
      return path.join(real, ...tail);
    } catch {
      tail.unshift(path.basename(current));
      const parent = path.dirname(current);
      if (parent === current) return path.join(current, ...tail); // reached filesystem root
      current = parent;
    }
  }
}
```

### Item 2 — the download/extract path

```ts
// tovu/agent-plugins/agent-plugin-install.ts
//
// Follows this codebase's own port+adapter discipline (mcp-federation/ports.ts's
// McpSessionPort/McpStdioChannel split; plugin-runtime/activation.ts's PluginActivationRepoPort)
// rather than importing a specific zip/tar library: this file declares the seam, a real adapter
// wraps whatever archive reader is chosen, and a scripted double drives every attack below in tests
// with no real archive on disk — the same reason adapter.stdio.ts takes a channel instead of
// embedding child_process.spawn logic inline.

import { chmod, mkdir, open, readdir, rm } from "node:fs/promises";
import path from "node:path";

import { assertContainedOnDisk, normalizePackageEntryPath, PackagePathViolation } from "./package-paths";

/** A symlink entry is its own case: the zip-slip vector JFrog's `archiver` writeup and Snyk's own
 * research both name is a symlink ENTRY whose target is dereferenced later, not just a `../` file
 * NAME — so it's modeled as a distinct entry kind rather than folded into "file". */
export type ArchiveEntry =
  | { readonly kind: "file"; readonly entryPath: string; readonly declaredSize: number; readonly openReadStream: () => NodeJS.ReadableStream }
  | { readonly kind: "directory"; readonly entryPath: string }
  | { readonly kind: "symlink"; readonly entryPath: string; readonly linkTarget: string };

export interface PackageArchiveReaderPort {
  entries(): AsyncIterable<ArchiveEntry>;
}

const MAX_ENTRIES = 4096;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_SINGLE_FILE_BYTES = 16 * 1024 * 1024;

export interface ExtractAgentPluginPackageResult {
  readonly packageRoot: string;
  readonly fileCount: number;
  readonly totalBytes: number;
}

/**
 * Extracts one Agent Plugin archive into a fresh, empty `destinationRoot`, refusing zip-slip /
 * tarball-traversal, symlink-entry escape, and decompression-bomb attempts. Which physical
 * directory `destinationRoot` is is item 1's question, not this function's — this function only
 * guarantees that whatever root it is given, nothing written during extraction lands outside it,
 * and the result is (best-effort) read-only on return.
 *
 * Symlink ENTRIES are refused outright rather than validated, matching the convergent tar-ecosystem
 * fix Snyk's zip-slip research documents ("ignoring any symlinks in packages to be installed") — a
 * plugin has no legitimate reason to ship a symlink inside its own package, and refusing the entry
 * type is simpler and strictly safer than trying to prove where a permitted one may point.
 *
 * Entries are checked and written ONE AT A TIME, in archive order — not name-checked-then-bulk-
 * written — so an early entry (e.g. a directory that later becomes part of a symlink chain) can
 * never be laid down before something inspects the next one that depends on it.
 */
export async function extractAgentPluginPackage(params: {
  archive: PackageArchiveReaderPort;
  destinationRoot: string;
}): Promise<ExtractAgentPluginPackageResult> {
  const { archive, destinationRoot } = params;
  await mkdir(destinationRoot, { recursive: true });

  const seenPaths = new Set<string>();
  let fileCount = 0;
  let totalBytes = 0;

  try {
    for await (const entry of archive.entries()) {
      if (fileCount + 1 > MAX_ENTRIES) {
        throw new Error(`agent plugin package exceeds ${MAX_ENTRIES} entries — refusing to extract further`);
      }

      const normalized = normalizePackageEntryPath(entry.entryPath);
      if (seenPaths.has(normalized)) {
        // Same hazard trust.ts's duplicate-remote-tool-name refusal guards against, applied to
        // archive entries: a second write must never silently overwrite an already-vetted first one.
        throw new PackagePathViolation(`duplicate archive entry '${normalized}' — refusing a second write over a vetted first one`);
      }
      seenPaths.add(normalized);

      if (entry.kind === "symlink") {
        throw new PackagePathViolation(`agent plugin package contains a symlink entry, which is refused: '${normalized}' -> '${entry.linkTarget}'`);
      }

      const destinationPath = await assertContainedOnDisk(destinationRoot, normalized);

      if (entry.kind === "directory") {
        await mkdir(destinationPath, { recursive: true });
        continue;
      }

      if (entry.declaredSize > MAX_SINGLE_FILE_BYTES) {
        throw new Error(`archive entry '${normalized}' declares ${entry.declaredSize} bytes, over the ${MAX_SINGLE_FILE_BYTES}-byte cap`);
      }

      await mkdir(path.dirname(destinationPath), { recursive: true });

      // A decompression bomb lies in its own declared size, so the only trustworthy count is bytes
      // actually observed leaving the decompressor — checked while streaming, not after the fact.
      const bytesWritten = await writeStreamCapped(entry.openReadStream(), destinationPath, MAX_SINGLE_FILE_BYTES);
      totalBytes += bytesWritten;
      if (totalBytes > MAX_TOTAL_UNCOMPRESSED_BYTES) {
        throw new Error(`agent plugin package exceeds the ${MAX_TOTAL_UNCOMPRESSED_BYTES}-byte total size cap`);
      }
      fileCount += 1;
    }
  } catch (error) {
    // A partially-extracted package must never be mistaken for an installed one — the same
    // discipline mcp-federation/bootstrap.ts applies to a connection that fails mid-admission: drop
    // it whole, never partially register it.
    await rm(destinationRoot, { recursive: true, force: true });
    throw error;
  }

  // Best-effort, not a security boundary: chmod protects against an ACCIDENTAL same-process write
  // (a bug elsewhere in this app writing into what it was told is read-only PLUGIN_ROOT) — it does
  // NOT protect against a determined attacker who already runs code as this same OS user, since
  // that user can chmod again. Stated plainly rather than implied, matching trust.ts's own "what
  // this tier deliberately does NOT claim" discipline.
  await chmodRecursive(destinationRoot, 0o555);

  return { packageRoot: destinationRoot, fileCount, totalBytes };
}

async function chmodRecursive(root: string, mode: number): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await chmodRecursive(full, mode);
    await chmod(full, mode);
  }
  await chmod(root, mode);
}

async function writeStreamCapped(stream: NodeJS.ReadableStream, destinationPath: string, maxBytes: number): Promise<number> {
  const handle = await open(destinationPath, "w");
  let written = 0;
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) {
      written += chunk.length;
      if (written > maxBytes) {
        throw new Error(`archive entry exceeded its declared size while decompressing (bomb guard) — wrote ${written} bytes, cap ${maxBytes}`);
      }
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  return written;
}
```

### Item 4 — the capability descriptor adapter (disk-backed)

My own Round 2 adapter (`agentPluginToDescriptors`) read from `LoadedAgentPluginPackage` objects backed by Vite `?raw` imports, because Round 2's `files/` showed no install path at all for anything but the one source-tree-bundled plugin. The owner's "installed means downloaded to disk" makes that assumption wrong for everything except `ui-ux-design`. This is the successor: same descriptor shape, same "MCP never gets `tool-call`" rule, reading from an already-extracted, containment-verified `PLUGIN_ROOT`.

```ts
// tovu/agent-plugins/agent-plugin-capability-source.ts
import { readdir, readFile, stat } from "node:fs/promises";

import { assertContainedOnDisk } from "./package-paths";
import type { CapabilityDescriptor, CapabilityPreviewFile } from "../capability-projection/capability-descriptor";

export interface InstalledAgentPluginPackage {
  readonly pluginId: string;
  readonly displayName: string;
  /** Digest of the verified, extracted package (Solution Slate Option 1's dedup key) — used only
   * as the descriptor `revision`, per Codex-R2's invoke-time revision check, unchanged this round. */
  readonly digest: string;
  /** The read-only PLUGIN_ROOT this package was extracted into. Every read below goes through
   * `assertContainedOnDisk(packageRoot, ...)` — the SAME function extraction used, not a second,
   * independently-maintained implementation of the same rule. */
  readonly packageRoot: string;
  readonly pluginJsonSchema: string | undefined;
  readonly mcpJsonSchema: string | undefined;
  readonly mcpServerIds: readonly string[];
}

const MAX_PREVIEW_FILE_BYTES = 256 * 1024;

async function readContainedText(packageRoot: string, relativePath: string): Promise<string> {
  const absolute = await assertContainedOnDisk(packageRoot, relativePath);
  const info = await stat(absolute);
  if (!info.isFile() || info.size > MAX_PREVIEW_FILE_BYTES) {
    throw new Error(`not previewable: '${relativePath}'`);
  }
  return readFile(absolute, "utf8");
}

async function listSkillNames(packageRoot: string): Promise<readonly string[]> {
  let entries: string[];
  try {
    const skillsDir = await assertContainedOnDisk(packageRoot, "skills");
    entries = (await readdir(skillsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const withSkillMd: string[] = [];
  for (const name of entries) {
    try {
      await assertContainedOnDisk(packageRoot, `skills/${name}/SKILL.md`);
      withSkillMd.push(name);
    } catch {
      // A folder under skills/ with no SKILL.md, or a name containment rejects, is not a skill.
    }
  }
  return withSkillMd.sort();
}

/**
 * Skills -> real preview + real `insert-text` execute, same as Round 2. MCP servers -> preview only
 * (item 3's admission gap is unresolved by construction; see The Trust Gap in Position And
 * Movement) — `execute` is always `unavailable`, and the reason string distinguishes a genuine
 * spec-invalid `$schema` mismatch from "simply not yet admitted", never collapsing the two.
 */
export async function installedAgentPluginToDescriptors(pkg: InstalledAgentPluginPackage): Promise<readonly CapabilityDescriptor[]> {
  const skillNames = await listSkillNames(pkg.packageRoot);
  const descriptors: CapabilityDescriptor[] = [];

  for (const skillName of skillNames) {
    const skillPath = `skills/${skillName}/SKILL.md`;
    const markdown = await readContainedText(pkg.packageRoot, skillPath);
    const referenceDir = `skills/${skillName}/references`;
    const referenceFiles: CapabilityPreviewFile[] = [];
    try {
      const refDirAbsolute = await assertContainedOnDisk(pkg.packageRoot, referenceDir);
      const refNames = (await readdir(refDirAbsolute, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => e.name);
      for (const refName of refNames.sort()) {
        const relativePath = `${referenceDir}/${refName}`;
        referenceFiles.push({ relativePath, content: await readContainedText(pkg.packageRoot, relativePath) });
      }
    } catch {
      // No references/ directory — a skill needs only its own SKILL.md.
    }

    descriptors.push({
      id: `agent-plugin:${pkg.pluginId}:skill:${skillName}`,
      label: skillName,
      description: `Portable skill from the ${pkg.displayName} Agent Plugin`,
      keywords: ["skill", pkg.pluginId, skillName],
      preview: { kind: "files", files: [{ relativePath: skillPath, content: markdown }, ...referenceFiles] },
      execute: { kind: "insert-text", text: markdown },
      requiresConfirmation: false,
      provenance: { sourceKind: "agent-plugin-skill", sourceLabel: pkg.displayName, trustTier: "unreviewed-third-party" },
    } satisfies CapabilityDescriptor);
  }

  if (pkg.mcpServerIds.length > 0) {
    const mcpConfigText = await readContainedText(pkg.packageRoot, "mcp.json");
    // Spec-verified rule (see Sources): the two $schema versions MUST match, or the MCP config is
    // invalid — this is spec text now, not a house convention Round 2 participants each invented.
    const mismatch =
      pkg.mcpJsonSchema === undefined || pkg.pluginJsonSchema === undefined || pkg.mcpJsonSchema !== pkg.pluginJsonSchema;

    for (const serverId of pkg.mcpServerIds) {
      descriptors.push({
        id: `agent-plugin:${pkg.pluginId}:mcp:${serverId}`,
        label: serverId,
        description: `MCP server declared by the ${pkg.displayName} Agent Plugin`,
        preview: { kind: "json", value: JSON.parse(mcpConfigText) },
        execute: {
          kind: "unavailable",
          reason: mismatch
            ? `mcp.json's $schema does not match plugin.json's — invalid per the Agent Plugins spec, shown for inspection only`
            : `not admitted — an operator has not independently reviewed and allowlisted '${serverId}' (mcp-federation/trust.ts R2)`,
        },
        requiresConfirmation: false,
        provenance: { sourceKind: "agent-plugin-mcp-tool", sourceLabel: pkg.displayName, trustTier: "unreviewed-third-party" },
      } satisfies CapabilityDescriptor);
    }
  }

  return descriptors;
}
```

### Item 3 — operationalizing admission, workspace-scoped, distinct from the package root

```ts
// tovu/agent-plugins/agent-plugin-mcp-admission.ts
import type { FederatedMcpConnectionConfig, McpStdioLaunchSpec } from "../mcp-federation/ports";
import { FEDERATED_CONNECTION_DEFAULTS } from "../mcp-federation/config";

export interface AgentPluginMcpAdmissionRecord {
  readonly workspaceId: string;
  readonly pluginId: string;
  /** Pins admission to the EXACT bytes reviewed — an in-place upgrade must re-trigger review, not
   * silently inherit the old grant (the same "loud, never silent" discipline item 4's $schema
   * mismatch handling uses, extended from "schema changed" to "package changed"). */
  readonly packageDigest: string;
  readonly serverId: string;
  /** Hand-authored by the operator after reading the SAME preview `installedAgentPluginToDescriptors`
   * produces — never copied from the plugin's own mcp.json. This is the independent author
   * trust.ts R2 requires; nothing on this path reads the plugin's own declared tool list as a grant. */
  readonly allowedToolNames: readonly string[];
  readonly reviewedByPrincipalId: string;
  readonly reviewedAt: string;
}

/**
 * Turns one admission record into a real federated connection. ONLY ever called with a record an
 * operator actually created — there is no path from a plugin's own mcp.json to this function's
 * input. `packageRoot` is the shared, read-only package (Solution Slate Option 1); `pluginDataRoot`
 * is workspace-scoped and writable, so two workspaces admitting the same plugin never share state.
 */
export function resolveAgentPluginMcpConnection(params: {
  admission: AgentPluginMcpAdmissionRecord;
  packageRoot: string;
  pluginDataRoot: string;
  serverCommand: { readonly command: string; readonly args: readonly string[] };
}): { readonly config: FederatedMcpConnectionConfig; readonly launch: McpStdioLaunchSpec } {
  const { admission, packageRoot, pluginDataRoot, serverCommand } = params;

  return {
    config: {
      connectionId: `agentplugin-${admission.pluginId}-${admission.serverId}`.slice(0, 40),
      label: `Agent Plugin: ${admission.pluginId} (${admission.serverId})`,
      allowedToolNames: admission.allowedToolNames,
      ...FEDERATED_CONNECTION_DEFAULTS,
    },
    launch: {
      command: serverCommand.command,
      args: serverCommand.args,
      cwd: packageRoot,
      env: { PLUGIN_ROOT: packageRoot, PLUGIN_DATA: pluginDataRoot },
    },
  };
}
```

One risk worth naming rather than leaving implicit: the spec's own text says `PLUGIN_DATA` is for "installed dependencies (node_modules, virtual environments)" — meaning an admitted MCP server may run its own `npm install`/equivalent on first launch, inside `pluginDataRoot`. That is a *second*, independent supply-chain surface beyond the archive itself (a typosquatted or compromised transitive dependency fetched at runtime, not at extraction time) that this round's extraction hardening does nothing to address, because it happens after `extractAgentPluginPackage` returns. Out of scope for this round's code, but it belongs in "What Would Change My Mind" territory the moment a real admitted server needs it.

## Critique Of Another Participant's Round 2 Code

**gemini-3.6-flash-high-round2**, two independent, concrete problems in the same file (`capability-projection.ts` / `agent-plugin-adapter.ts` in that answer's Leading Option — Code).

**1. Won't compile — wrong import, on two independent grounds.** The top of `capability-projection.ts` reads:

```ts
import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from "../jini/composer-discovery.js";
```

I read the real `files/jini/composer-discovery.ts` this round (it wasn't fetched in earlier rounds' appendix beyond line citations). Its own first line is:

```ts
import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from '../slots.js';
```

That file **imports** those two types for its own internal use (`filterComposerDiscovery`'s signature) — it never `export`s them. A TypeScript consumer doing `import type { ComposerDiscoveryGroup, ComposerDiscoveryItem } from ".../composer-discovery.js"` gets "Module has no exported member." Second, independent problem: even if it did re-export them, `files/tovu/agent-plugin-catalog.ts:1` shows the real, confirmed way Tovu code reaches these types — a **package specifier**, `@jini-ai/chat/react` — not a relative path across a package boundary. `jini/` and `tovu/` are two different npm packages in the real repo; a relative `"../jini/composer-discovery.js"` from a file living under `tovu/` cannot resolve to a different package's internal source file at all, missing export or not. Both problems are independently fatal to this code compiling, and either one alone would be enough.

**2. The `$schema` mismatch check doesn't implement the rule it claims to, in both directions.** From that same answer's `AgentPluginCapabilityAdapter.getDescriptors()`:

```ts
if (mcpConfig.$schema && typeof mcpConfig.$schema === "string") {
  if (!mcpConfig.$schema.includes("modelcontextprotocol")) {
    console.warn(`[AgentPlugin] $schema mismatch in mcp.json for ${pluginId}. Skipping MCP tools.`);
  } else {
    this.parseMcpServers(pluginId, version, mcpConfig, commandMetaMap, descriptors);
  }
}
```

This never compares `mcpConfig.$schema` to `plugin.json`'s own `$schema` at all — it checks whether the string contains the substring `"modelcontextprotocol"`. But the spec's real schema URLs are under `agent-plugins.org` (confirmed by the actual bundled manifest, `files/tovu/plugin.json:2`: `"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"` — no occurrence of "modelcontextprotocol" anywhere in it), and the spec text I fetched this round (Sources) confirms the actual rule is a **version match between the two files' own `$schema` values**, not a substring of either one. That makes this check wrong in both directions at once: it would **warn-and-skip every legitimately-formed Agent Plugin `mcp.json`** (since a real one's `$schema` doesn't contain that substring), while it would **admit a crafted `mcp.json` whose author simply includes the word "modelcontextprotocol" anywhere in an arbitrary `$schema` string**, version match or not — which is precisely the "the untrusted party gets to declare its own compliance" failure `mcp-federation/trust.ts` R3 was written to refuse, now recreated one layer up, in the code that's supposed to be *deciding whether to trust the file at all*.

## What Would Change My Mind

- **A real citation for any of the Coordinator's four `infra/` claims** (a file showing `infra/content.db`, `infra/uploads`, an existing `ws/<workspaceId>/` shape, or a `TOVU_*_DIR` override pattern). This wouldn't change my objection to wrapping the *package root* in a workspace segment, but it would resolve the evidentiary gap and let the location question be argued on its merits alone rather than partly on "nobody has shown me this yet."
- **Evidence that Tovu's workspace isolation is meant to be tenant-grade** (mutually distrusting workspaces on one instance, not just organizational sections one admin manages) rather than the activation-only isolation `plugin-runtime` and `mcp-federation` currently show. That would flip my Solution Slate ranking toward the Coordinator's original all-in-one `ws/<workspaceId>/<pluginId>/` shape, because at that point even read-only, content-identical bytes are a cross-tenant surface worth duplicating, and my "share the package root" recommendation's whole premise (the bytes are identical and read-only, so sharing them costs nothing security-relevant) would no longer hold.
- **A concrete refcount-correctness failure mode for Solution Slate Option 1** that's worse than the duplication it avoids — e.g., a race between one workspace deleting its last reference to a package while another workspace's request is mid-flight against it. I named this as Option 1's sacrifice rather than hand-waving it; if someone shows the mitigation for it is itself security-relevant-complex (not just annoying), that's grounds to prefer Option 2's dumb-but-safe duplication instead.
- **Confirmation Tovu intends the VS Code model** — implicit trust of an installed plugin's MCP servers, no separate admission step — as a deliberate product choice rather than an oversight. I don't think the two products' trust boundaries are equivalent (see Solution Slate, item 3, option 3), but that's a product judgment call about who Tovu's "operator" is and how much they're assumed to have already vetted by clicking install, not something the architecture alone settles, and I'd want that stated as an explicit decision rather than discovered later as an implicit one.

<<SWARM_END>>
