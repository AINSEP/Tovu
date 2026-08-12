/**
 * @file `installAgentPlugin()` — content-addressed, adversarially-hardened extraction of one Agent
 * Plugin (agent-plugins.org) archive into one workspace's own `AgentPluginWorkspaceLayout.packages`.
 *
 * This is the highest-risk unit in the whole feature. Extraction is where containment actually
 * breaks — everything downstream (capability projection, a future MCP admission gate) trusts that a
 * "package root" is exactly the bytes the archive declared, laid out exactly where the archive said,
 * with nothing outside it touched. Two independently-cited attack classes drive the checks here:
 *
 * - **Zip-slip / archive-extraction path traversal** (Snyk's zip-slip research; JFrog's
 *   `mholt/archiver` writeup; the `node-tar` GHSA-8qq5-rm4j-mr97 advisory) has two vectors: a
 *   crafted entry NAME containing `../` (caught by {@link normalizePackageEntryPath}'s lexical
 *   check), and a crafted SYMLINK entry whose target a later, innocent-looking entry name walks
 *   through. The convergent ecosystem fix for the second vector — and the one this module takes — is
 *   to refuse symlink entries outright rather than attempt to validate where they point: a plugin
 *   has no legitimate reason to ship a symlink inside its own package, and the Agent Plugins spec's
 *   own path-safety clause only ever promises symlinks MAY resolve inside the root, never that a
 *   client must accept one.
 * - **Decompression bombs**, in both the classic "one file lies about its size" shape (caught by
 *   bounding bytes actually observed leaving `openReadStream()`, not the archive's own declared
 *   size) and the "many small files" shape (caught by a running total across the whole archive).
 *
 * Why this is a SEPARATE format from `.tovu-plugin`'s loader (`plugin-runtime/loader.ts`), not a
 * shared one: verified against that file directly. `loadPlugin()`'s BR-01 pipeline requires
 * `manifest.integrity` (a per-file SHA-256 map), `manifest.sdkRange` checked against a runtime
 * `@tovu/sdk` version, and a `server/index.mjs` ESM entry point it `import()`s. An Agent Plugin has
 * none of those — no integrity map, no SDK range, no single entry point, and (per this feature's own
 * FINAL decision) no code Tovu ever imports or executes at all in v1: Skills are markdown read for
 * context injection, and MCP servers are preview-only (`capability-projection.ts`). Adapting Agent
 * Plugins into `loadPlugin()`'s pipeline would mean inventing values for fields the open standard
 * does not define, which is precisely the "package format vs. execution/trust model" conflation this
 * feature's own owner-locked decisions (see `CTX-AGENTPLUGINS-2026-08-12.md` F2) rule out.
 *
 * Why the archive itself is a `ArchiveReaderPort`, not a concrete zip/tar library call: this
 * codebase's own port+adapter discipline (`mcp-federation/ports.ts`'s `McpSessionPort`/
 * `McpStdioChannel` split is the direct precedent) — and, concretely, no zip/tar dependency exists
 * in this repo's `package.json` today. Choosing and vetting one (license, maintenance, streaming
 * support) is a real decision outside a Programmer's scope to make silently; this module declares
 * the seam and is exercised end-to-end by a scripted double, so a real adapter is a pure addition
 * with zero change to the hardening logic here. See the handoff's REMAINING section.
 *
 * Content-addressing (`ws/<workspaceId>/packages/sha256/<archiveDigest>/`): the digest is verified
 * BEFORE extraction ever touches the archive reader, so an install with a mismatched digest never
 * even attempts to unpack — the digest is the trust boundary between "bytes a marketplace claimed"
 * and "bytes this process is willing to run a parser over". A second install of byte-identical
 * content BY THE SAME WORKSPACE is recognized from the digest alone and short-circuits without a
 * second extraction. Deliberately NOT shared across workspaces — see `layout.ts`'s header (owner
 * decision, tenant-grade isolation, 2026-08-12): this function resolves the workspace-scoped layout
 * itself, exactly once, from an instance-level `AgentPluginLayout` plus one `workspaceId` (see the
 * SECURITY note on {@link InstallAgentPluginRequired} below) — the caller is what makes two
 * different workspaces' installs land in disjoint trees, simply by supplying a different
 * `workspaceId` for each; this function's own internal `forWorkspace()` call is what turns that into
 * disjoint, internally-consistent paths.
 *
 * Architectural role:
 * The one place this feature performs filesystem writes for installed package bytes. No network I/O
 * (archive bytes and their expected digest are caller-supplied — see the module header above for why
 * "how does the archive get here" is out of this slice) and no execution of anything extracted.
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, mkdir, mkdtemp, open, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import type { AgentPluginLayout } from "./layout";
import { parseAgentPluginManifest } from "./manifest";
import { assertContainedOnDisk, normalizePackageEntryPath, PackagePathViolation } from "./package-paths";

/** One extraction/install failure reason. A caller (an admin route, a future marketplace installer)
 * branches on `code` rather than parsing `message` — this codebase's own convention
 * (`PluginLoadError.reason` in `plugin-runtime/loader.ts` is the direct precedent). */
export type AgentPluginInstallErrorCode =
  | "ARCHIVE_TOO_LARGE"
  | "DIGEST_MISMATCH"
  | "TOO_MANY_ENTRIES"
  | "UNSAFE_ENTRY_PATH"
  | "SYMLINK_ENTRY_REJECTED"
  | "UNSUPPORTED_ENTRY_KIND"
  | "DUPLICATE_ENTRY"
  | "FILE_TOO_LARGE"
  | "DECOMPRESSION_BOMB"
  | "TOTAL_SIZE_EXCEEDED"
  | "MANIFEST_MISSING"
  | "MANIFEST_INVALID"
  | "PUBLISH_FAILED";

export class AgentPluginInstallError extends Error {
  readonly code: AgentPluginInstallErrorCode;

  constructor(code: AgentPluginInstallErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AgentPluginInstallError";
    this.code = code;
  }
}

/** One archive entry. A symlink is modeled as its OWN kind rather than folded into "file" — the
 * zip-slip research this module's header cites is explicit that the symlink-entry vector is
 * distinct from the lexical-traversal one, and the two need independent tests and independent
 * handling (see the "symlink entries are rejected outright" rule below). */
export type AgentPluginArchiveEntry =
  | {
      readonly kind: "file";
      readonly entryPath: string;
      /** The archive format's own claimed size. Never trusted alone — see `DECOMPRESSION_BOMB`. */
      readonly declaredSize?: number;
      readonly executable?: boolean;
      readonly openReadStream: () => AsyncIterable<Uint8Array>;
    }
  | { readonly kind: "directory"; readonly entryPath: string }
  | { readonly kind: "symlink" | "hardlink" | "device" | "fifo"; readonly entryPath: string; readonly linkTarget?: string };

export interface AgentPluginArchiveReaderPort {
  entries(archive: Uint8Array): AsyncIterable<AgentPluginArchiveEntry>;
}

const LIMITS = {
  maxArchiveBytes: 32 * 1024 * 1024,
  maxEntries: 4096,
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalExtractedBytes: 64 * 1024 * 1024,
} as const;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export interface InstalledAgentPluginSkill {
  readonly name: string;
  readonly skillPath: string;
}

export interface InstalledAgentPlugin {
  readonly pluginId: string;
  readonly version?: string;
  /** SHA-256 of the raw archive bytes — the content-addressing key and the descriptor `revision`
   * a future capability projection pins invocation to (`capability-projection.ts`). */
  readonly archiveDigest: string;
  /** Absolute, read-only (frozen) path to the extracted package root. */
  readonly packageRoot: string;
  readonly files: readonly string[];
  readonly skills: readonly InstalledAgentPluginSkill[];
}

export interface InstallAgentPluginRequired {
  readonly archive: Uint8Array;
  /** Lowercase hex SHA-256 the caller expects `archive` to hash to — a real marketplace flow would
   * supply this from the server's own metadata; verified here, never trusted from the archive
   * itself. */
  readonly expectedSha256: string;
  readonly archiveReader: AgentPluginArchiveReaderPort;
  /**
   * SECURITY (2026-08-13, security pass Finding 2 — tenant isolation, `ADS-memory/reports/security/
   * 2026-08-13-post-session-security-pass.md`): this field used to be an already-resolved
   * `AgentPluginWorkspaceLayout` (`{ root, packages, staging, pluginDataDir }`) — a plain interface
   * of four independently-typed string/function fields with no tag identifying which workspace it
   * came from. Nothing stopped a caller from hand-assembling one from two DIFFERENT real
   * `forWorkspace()` results (wrong variable capture, a stale cached layout, a future code path that
   * builds one by hand instead of calling `forWorkspace`) — such a value type-checked identically to
   * a correctly-resolved one, and `installAgentPlugin` published into whatever `packages`/`staging`
   * it was handed with no consistency check. Proven at the unit level in `install.unit.test.ts`
   * (a layout stitching workspace A's `root`/`pluginDataDir` onto workspace B's real `packages`/
   * `staging` published into workspace B's real, on-disk store with no error).
   *
   * The fix: `installAgentPlugin` no longer accepts a pre-resolved workspace layout as input AT ALL.
   * It takes the RAW MATERIALS instead — the INSTANCE-level layout (`resolveAgentPluginLayout()`,
   * carries no workspace-scoped path of its own) plus one `workspaceId` — and calls
   * `layout.forWorkspace(workspaceId)` itself, exactly once, internally. There is no longer any
   * `AgentPluginWorkspaceLayout`-shaped parameter here for a caller to stitch fields into: the one
   * and only path from these two inputs to `packages`/`staging`/`pluginDataDir` is the real
   * `forWorkspace()` closure, called atomically, so the four resulting paths can never disagree with
   * each other about which workspace they belong to. Passing a hand-built `{ packages, staging, ... }`
   * literal where this field is expected is now a compile-time type error, not a runtime hazard.
   *
   * `workspaceId` must still come from the authenticated principal's own request context, never
   * derived from `layout` itself (a hand-built or malicious `AgentPluginLayout` could fake a
   * `forWorkspace` implementation identically) — that half of the guarantee is a caller obligation
   * this type cannot enforce, the same way `archiveReader` above is a fully caller-trusted port. What
   * IS closed is the specific, demonstrated bug class: stitching or hand-assembling an
   * already-resolved workspace layout from parts.
   */
  readonly layout: AgentPluginLayout;
  /** The workspace this install is for. Combined with {@link layout} via `layout.forWorkspace(workspaceId)`
   * — see the SECURITY note on {@link layout} above. */
  readonly workspaceId: string;
}

export type InstallAgentPluginOptional = {};

/**
 * Verifies, extracts, and publishes one Agent Plugin archive.
 *
 * @throws {AgentPluginInstallError} For every expected failure — a hostile or malformed archive, a
 * digest mismatch, an invalid manifest. Never partially publishes: any failure after extraction has
 * begun removes the whole staging directory before rethrowing.
 * @complexity O(e) in archive entry count, O(b) in total extracted bytes — both explicitly bounded
 * by {@link LIMITS}, so this function's cost cannot be driven unbounded by a hostile archive.
 */
export async function installAgentPlugin(
  required: InstallAgentPluginRequired,
  _optional: InstallAgentPluginOptional = {}
): Promise<InstalledAgentPlugin> {
  const { archive, expectedSha256, archiveReader, layout, workspaceId } = required;

  // The ONE call that turns (instance layout, workspaceId) into real, internally-consistent
  // packages/staging/pluginDataDir paths — see the SECURITY note on `InstallAgentPluginRequired.layout`
  // above for why this replaces accepting an already-resolved `AgentPluginWorkspaceLayout` directly.
  // `forWorkspace` itself still throws for a syntactically invalid `workspaceId`, unchanged.
  const workspaceLayout = layout.forWorkspace(workspaceId);

  if (archive.byteLength > LIMITS.maxArchiveBytes) {
    throw new AgentPluginInstallError("ARCHIVE_TOO_LARGE", `archive is ${archive.byteLength} bytes, over the ${LIMITS.maxArchiveBytes}-byte cap`);
  }

  const digest = sha256(archive);
  if (!SHA256_HEX_PATTERN.test(expectedSha256) || digest !== expectedSha256.toLowerCase()) {
    throw new AgentPluginInstallError(
      "DIGEST_MISMATCH",
      `archive SHA-256 '${digest}' does not match the expected '${expectedSha256}' — refusing to extract unverified bytes`,
    );
  }

  await mkdir(workspaceLayout.packages, { recursive: true, mode: 0o700 });

  const finalRoot = path.join(workspaceLayout.packages, digest);
  const alreadyPublished = await isRealDirectory(finalRoot);
  if (alreadyPublished) {
    // Content-addressed dedup, scoped to THIS workspace's own tree (`workspaceLayout` was just
    // resolved above, atomically, from this same `workspaceId`): identical bytes were already
    // extracted, verified, and frozen by a prior install of this same workspace's — never
    // re-extracted for a different workspace, by construction, since a different workspace's
    // `workspaceLayout.packages` is a different path entirely. `archiveReader.entries()` is never
    // called on this path.
    return indexInstalledRoot(finalRoot, digest);
  }

  await mkdir(workspaceLayout.staging, { recursive: true, mode: 0o700 });
  const transactionRoot = await mkdtemp(path.join(workspaceLayout.staging, "install-"));
  const extractionRoot = path.join(transactionRoot, "root");
  await mkdir(extractionRoot, { mode: 0o700 });

  try {
    const executablePaths = await extractEntries(archiveReader.entries(archive), extractionRoot);
    const indexed = await indexInstalledRoot(extractionRoot, digest);
    // Publish BEFORE freezing permissions, not after: `rename()` moves `extractionRoot` as a single
    // directory-entry operation, and on this filesystem renaming an already-read-only (0o555)
    // directory itself fails EACCES (observed, not merely theoretical — see the regression test this
    // ordering fixed). Freezing after publish also closes a smaller race for free: nothing outside
    // this function can observe the package at its live path while it is still writable, because the
    // live path does not exist until `publish` returns.
    await publish(extractionRoot, finalRoot);
    await freezeTree(finalRoot, executablePaths);
    return { ...indexed, packageRoot: finalRoot };
  } finally {
    // Whether this install succeeded (bytes now live at `finalRoot`) or failed, the staging
    // transaction directory itself must never be left behind — on success `rename` already moved
    // `extractionRoot` out of it, so this only ever removes the (now-empty, or failure-abandoned)
    // temp directory, never the published package.
    await rm(transactionRoot, { recursive: true, force: true });
  }
}

/** Extracts every entry into `extractionRoot`, enforcing every hardening rule in this module's
 * header. Returns the set of archive-relative paths the archive marked executable, for
 * {@link freezeTree} to preserve the `+x` bit on. */
async function extractEntries(
  entries: AsyncIterable<AgentPluginArchiveEntry>,
  extractionRoot: string,
): Promise<ReadonlySet<string>> {
  const seen = new Set<string>();
  const executablePaths = new Set<string>();
  let entryCount = 0;
  let totalBytes = 0;

  for await (const entry of entries) {
    entryCount += 1;
    if (entryCount > LIMITS.maxEntries) {
      throw new AgentPluginInstallError("TOO_MANY_ENTRIES", `archive exceeds the ${LIMITS.maxEntries}-entry cap`);
    }

    // Refused BEFORE path normalization: a symlink entry is never acceptable regardless of how
    // "safe" its own name looks, matching the ecosystem fix this module's header cites — validating
    // where a permitted symlink might point is more attack surface than refusing the entry kind.
    if (entry.kind !== "file" && entry.kind !== "directory") {
      throw new AgentPluginInstallError(
        "SYMLINK_ENTRY_REJECTED",
        `archive entry '${entry.entryPath}' has kind '${entry.kind}', which Agent Plugin packages are not permitted to contain` +
          ("linkTarget" in entry && entry.linkTarget ? ` (target '${entry.linkTarget}')` : ""),
      );
    }

    let normalized: string;
    try {
      normalized = normalizePackageEntryPath(entry.entryPath);
    } catch (error) {
      throw new AgentPluginInstallError("UNSAFE_ENTRY_PATH", `archive entry path is unsafe: '${entry.entryPath}'`, { cause: error });
    }

    if (seen.has(normalized)) {
      throw new AgentPluginInstallError(
        "DUPLICATE_ENTRY",
        `duplicate archive entry '${normalized}' — refusing a second write over an already-vetted first one`,
      );
    }
    seen.add(normalized);

    let destination: string;
    try {
      destination = await assertContainedOnDisk(extractionRoot, normalized);
    } catch (error) {
      throw new AgentPluginInstallError("UNSAFE_ENTRY_PATH", `archive entry resolves outside the package root: '${normalized}'`, { cause: error instanceof PackagePathViolation ? error : undefined });
    }

    if (entry.kind === "directory") {
      await mkdir(destination, { recursive: true, mode: 0o700 });
      continue;
    }

    if ((entry.declaredSize ?? 0) > LIMITS.maxFileBytes) {
      throw new AgentPluginInstallError("FILE_TOO_LARGE", `archive file '${normalized}' declares ${entry.declaredSize} bytes, over the ${LIMITS.maxFileBytes}-byte cap`);
    }

    await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    totalBytes = await writeContainedFile({
      destination,
      normalized,
      stream: entry.openReadStream(),
      totalBytesSoFar: totalBytes,
    });

    if (entry.executable) executablePaths.add(normalized);
  }

  return executablePaths;
}

/** Streams one file entry to disk, bounding both its own size and the running archive total against
 * bytes ACTUALLY observed — never the archive format's declared size, which a decompression bomb
 * lies about by construction. `O_EXCL` refuses to write over anything already at `destination`
 * (there cannot legitimately be one — `extractEntries`'s duplicate check already refused a second
 * entry for the same path); `O_NOFOLLOW` refuses to follow a final-component symlink if the
 * filesystem somehow already had one (defense in depth — this module never creates one itself). */
async function writeContainedFile(params: {
  destination: string;
  normalized: string;
  stream: AsyncIterable<Uint8Array>;
  totalBytesSoFar: number;
}): Promise<number> {
  let flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL;
  if (process.platform !== "win32") flags |= constants.O_NOFOLLOW;

  const handle = await open(params.destination, flags, 0o600);
  let fileBytes = 0;
  let totalBytes = params.totalBytesSoFar;

  try {
    for await (const chunk of params.stream) {
      fileBytes += chunk.byteLength;
      totalBytes += chunk.byteLength;

      if (fileBytes > LIMITS.maxFileBytes) {
        throw new AgentPluginInstallError(
          "DECOMPRESSION_BOMB",
          `archive file '${params.normalized}' exceeded the ${LIMITS.maxFileBytes}-byte cap while decompressing — its declared size was a lie`,
        );
      }
      if (totalBytes > LIMITS.maxTotalExtractedBytes) {
        throw new AgentPluginInstallError("TOTAL_SIZE_EXCEEDED", `archive exceeds the ${LIMITS.maxTotalExtractedBytes}-byte total extracted-size cap`);
      }

      await handle.write(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }
  } finally {
    await handle.close();
  }

  return totalBytes;
}

/** Reads the (already-extracted-and-trusted, or already-published) `plugin.json` at `packageRoot`
 * and walks the tree to build the `files`/`skills` index. Shared between a fresh install and the
 * content-addressed dedup fast path so both return an identically-shaped result. */
async function indexInstalledRoot(packageRoot: string, archiveDigest: string): Promise<InstalledAgentPlugin> {
  let manifestRaw: string;
  try {
    manifestRaw = await readFile(path.join(packageRoot, "plugin.json"), "utf8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      throw new AgentPluginInstallError("MANIFEST_MISSING", "the archive does not contain a plugin.json at its root");
    }
    throw error;
  }

  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(manifestRaw);
  } catch (error) {
    throw new AgentPluginInstallError("MANIFEST_INVALID", "plugin.json is not valid JSON", { cause: error });
  }

  const parsed = parseAgentPluginManifest(manifestValue);
  if (!parsed.ok) {
    throw new AgentPluginInstallError("MANIFEST_INVALID", `plugin.json failed validation: ${parsed.errors.join("; ")}`);
  }

  const files: string[] = [];
  const skills: InstalledAgentPluginSkill[] = [];

  async function walk(absolute: string, prefix: string): Promise<void> {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(absolute, entry.name), relative);
      } else if (entry.isFile()) {
        files.push(relative);
        const match = relative.match(/^skills\/([^/]+)\/SKILL\.md$/);
        if (match) skills.push({ name: match[1] as string, skillPath: relative });
      }
      // Anything that is neither a directory nor a regular file (a symlink somehow already present,
      // a device node) is skipped rather than indexed — extraction itself never creates one, so
      // encountering one here would mean the filesystem changed out from under an already-published,
      // supposedly-frozen package, which this function has no business acting on either way.
    }
  }

  await walk(packageRoot, "");

  return {
    pluginId: parsed.manifest.name,
    version: parsed.manifest.version,
    archiveDigest,
    packageRoot,
    files: files.sort(),
    skills: skills.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Makes every file/directory under `root` read-only (executables keep `+x`, per the Agent Plugins
 * spec's own MCP `command` needing to launch a `./`-relative script — not exercised by anything in
 * this slice, since MCP execution is out of scope for v1, but the bit is preserved now rather than
 * silently dropped for whenever it is).
 *
 * Stated plainly rather than implied (`mcp-federation/trust.ts`'s own "what this tier deliberately
 * does NOT claim" discipline): this is best-effort defense against an ACCIDENTAL same-process write
 * into what is supposed to be a read-only `PLUGIN_ROOT`, not a security boundary against a
 * determined attacker already running code as this same OS user — that user can `chmod` again. */
async function freezeTree(root: string, executables: ReadonlySet<string>, prefix = ""): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(root, entry.name);

    if (entry.isDirectory()) {
      await freezeTree(absolute, executables, relative);
      await chmod(absolute, 0o555);
    } else {
      await chmod(absolute, executables.has(relative) ? 0o555 : 0o444);
    }
  }
  await chmod(root, 0o555);
}

/** Publishes `extractionRoot` to `finalRoot` by rename — atomic on the same filesystem, so a reader
 * can never observe a partially-extracted package at the live path. Tolerates losing a race against
 * a concurrent install of the byte-identical digest (the same content, published a moment earlier by
 * another process) rather than treating that as a failure. */
async function publish(extractionRoot: string, finalRoot: string): Promise<void> {
  try {
    await rename(extractionRoot, finalRoot);
  } catch (error) {
    if (!isErrnoException(error) || (error.code !== "EEXIST" && error.code !== "ENOTEMPTY")) {
      throw new AgentPluginInstallError("PUBLISH_FAILED", `failed to publish the extracted package to '${finalRoot}'`, { cause: error });
    }
    if (!(await isRealDirectory(finalRoot))) {
      throw new AgentPluginInstallError("PUBLISH_FAILED", `'${finalRoot}' exists but is not a real, published package directory`, { cause: error });
    }
    // Lost the race to a concurrent install of identical bytes — the bytes at `finalRoot` are the
    // ones this install itself would have written, so this is not a failure.
  }
}

async function isRealDirectory(target: string): Promise<boolean> {
  try {
    const info = await stat(target);
    return info.isDirectory();
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
