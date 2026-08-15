I’ll read the full packet and inventory the supplied source first, then verify the implementation claims against current primary sources online. I’ll follow the packet’s exact output contract and produce the leading option as real code.
The packet is 2,029 lines and the first read was truncated by the tool, so I’m continuing in bounded line ranges to ensure the entire Round 2 appendix is actually reviewed. The packet’s key correction already changes the design materially: host pinning must live in the stdio adapter, and filesystem containment alone cannot authorize downloaded MCP code.
The Round 2 implementations share a concrete flaw beyond the now-rejected extension: several turn “pending authorization” into an executable binding. I’m checking the real federation contracts and stdio lifecycle now, because admission must gate process startup itself—not merely tool invocation after a subprocess is already running. I’m also separating install ownership from activation ownership: package bytes are naturally per-instance/digest, while enablement and writable state are per-workspace.
ACK_PACKET_RECEIVED CTX-AGENTPLUGINS-R3-2026-08-12 -- I received the packet and will work on it.

## Position And Movement

The Coordinator’s root is directionally right but scopes the wrong thing per workspace.

Use this layout:

```text
infra/agent-plugins/                         # dev default
├── packages/sha256/<archiveDigest>/         # immutable, per-instance package bytes
├── data/ws/<workspaceId>/<pluginId>/        # writable, per-workspace PLUGIN_DATA
└── staging/                                 # private atomic-extraction directories
```

Production should normally set an absolute `TOVU_AGENT_PLUGINS_DIR`, such as `/var/lib/tovu/agent-plugins`. This still belongs to the Tovu installation’s instance data, but survives immutable-container replacement and cannot accidentally enter a frontend build context.

The attack on `infra/agent-plugins/ws/<workspaceId>/<pluginId>/` is:

- Package bytes are not workspace state. Copying identical executable content once per workspace wastes storage, complicates atomic updates, and can make two workspaces run different bytes under the same plugin/version identity.
- Activation, MCP admission, secrets, and writable state are workspace-specific. Those belong under `data/ws/...` or in workspace-keyed persistence.
- “Outside `src/`” does not prove that middleware will never serve it; the supplied files do not contain the static-server configuration. Preview must therefore be an indexed server operation, never a static mount.
- `chmod` is only defense in depth. The current adapter directly calls `spawn()` and passes the child `HOME`, `PATH`, and `TMPDIR` (files/tovu/mcp-federation/adapter.stdio.ts:307-312,372-395). A same-user subprocess is not contained by directory layout or read-only mode bits.

The most important correction to Round 2 is louder: **a tool allowlist does not authorize starting a process**. Current federation spawns and handshakes at files/tovu/mcp-federation/bootstrap.ts:110-119; only afterward does `federateSession()` list and filter tools. Therefore an empty `allowedToolNames` blocks tool registration but does not stop arbitrary marketplace code from executing. Agent Plugin MCP needs two independent gates:

1. Server-level approval to start it for inspection, inside an enforced sandbox.
2. Per-tool operator admission, pinned to package, server configuration, and inspected tool-surface digests.

Without a sandbox adapter, Skills remain usable but downloaded stdio MCP stays visibly blocked.

## Sources

- [Agent Plugins Specification 1.0.0](https://agent-plugins.org/specification) confirms that installation and distribution remain client-controlled; the portable unit is a directory, not an archive format. It requires resolved package paths to remain inside `PLUGIN_ROOT` but explicitly says this does not sandbox subprocesses. It also assigns writable persistent `PLUGIN_DATA` while reserving `PLUGIN_ROOT` for shipped files.
- The same specification **contradicts Gemini 3.6 Flash’s Round 2 implementation**: `mcp.json` server entries define transports (`type`, `command`, `args`, `env`, `cwd`, or HTTP fields), not a `tools` array. Tools must come from the live MCP `tools/list` surface.
- [Claude Code’s plugin reference](https://code.claude.com/docs/en/plugins-reference) confirms a comparable client copies marketplace plugins into a per-user, per-version cache, prevents installed plugins from referring outside their directory, and keeps persistent plugin data separate. This supports per-instance immutable bytes plus separately scoped activation/data.
- [VS Code’s extension marketplace documentation](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace) confirms extensions normally live in one per-user extensions directory, while [Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust) separately controls whether workspace-sensitive execution is enabled. This likewise separates installation from workspace authorization.
- [GitHub’s node-tar advisory GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) documents extraction-root bypasses through attacker-controlled hardlink and symlink targets even with nominal secure defaults. The robust marketplace policy is to reject links and special entries entirely, reject duplicates, and extract once into a fresh private directory.
- [Node’s filesystem documentation](https://nodejs.org/api/fs.html#file-open-constants) confirms `O_EXCL` rejects an already-existing destination and `O_NOFOLLOW` rejects a final-component symlink. It also warns against check-then-open access patterns because they introduce races.

## Solution Slate

Ranking criteria, in order: process containment; archive integrity and path safety; independent operator authorship; tenant isolation; compatibility with the existing federation contracts; operational simplicity.

1. **Per-instance content-addressed packages, per-workspace data/admission, sandbox-gated MCP — recommended.**

   Archives are host-pinned, digest-checked, extracted into a new private staging directory, and published atomically. Links, duplicate names, traversal, devices, FIFOs, and decompression excess are rejected. Skills project immediately. MCP is inspected and executed only through a required sandbox port; tool admission is pinned to the exact inspected surface.

   Trade-offs: requires an OS/container sandbox implementation and an operator review flow. Package updates that change any tool descriptor require readmission. Genuine sacrifice: downloaded MCP is not one-click executable and remains blocked on installations without sandbox support.

2. **Coordinator layout: complete package copies per workspace.**

   This makes workspace uninstall and quota accounting simple and naturally gives each activation a distinct `PLUGIN_ROOT`.

   Trade-offs: duplicates code, expands the number of executable copies to patch and audit, and makes cross-workspace update consistency harder. It still provides no subprocess isolation because every copy is readable by the same daemon user. Genuine sacrifice: storage efficiency and one authoritative package digest per installed release.

3. **Per-instance packages, Skills only; permanently ignore downloaded MCP.**

   This is conformant incremental adoption: the specification permits a skills-only client. Installation and preview still use the secure extractor.

   Trade-offs: smallest attack surface and lowest implementation cost, but no executable MCP value from marketplace plugins. Genuine sacrifice: a major portable component type is unavailable.

The cheapest falsifying test for Option 1 is a fake archive containing `skills` as a symlink followed by `skills/a/SKILL.md` as a regular file. Installation must reject before publication and must leave no digest directory. If either file appears outside staging, the recommendation’s containment claim is false.

## Leading Option — Code

The following uses a structural wrapper around the existing HTTP client so the production call is `.send(...)`. Exact origin pinning is performed in the adapter rather than incorrectly treating `devHostAllowlist` as a host restriction.

**`files/tovu/agent-plugins/install.ts`**

```ts
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";

export interface EgressPolicy {
  readonly allowedSchemes: readonly string[];
  readonly denyPrivateAddresses: boolean;
  readonly devHostAllowlist: readonly string[];
  readonly maxRedirects: number;
  readonly connectTimeoutMs: number;
  readonly maxResponseBytes: number;
  readonly maxDecompressedBytes: number;
  readonly rateLimit?: Readonly<Record<string, number>>;
}

/** Narrow structural adapter around the existing HttpClientPort.send(). */
export interface MarketplaceHttpPort {
  send(request: {
    readonly method: "GET";
    readonly url: string;
    readonly policy: EgressPolicy;
  }): Promise<{
    readonly status: number;
    readonly finalUrl: string;
    readonly body: Uint8Array;
  }>;
}

export class PinnedMarketplaceDownloader {
  constructor(
    private readonly http: MarketplaceHttpPort,
    private readonly allowedOrigins: ReadonlySet<string>,
  ) {}

  async download(url: string, maxBytes: number): Promise<Uint8Array> {
    this.assertPinned(url);

    const response = await this.http.send({
      method: "GET",
      url,
      policy: {
        allowedSchemes: ["https"],
        denyPrivateAddresses: true,
        devHostAllowlist: [],
        maxRedirects: 0,
        connectTimeoutMs: 10_000,
        maxResponseBytes: maxBytes,
        maxDecompressedBytes: maxBytes,
      },
    });

    // Defense in depth if a client implementation reports a redirected final URL.
    this.assertPinned(response.finalUrl);

    if (response.status !== 200) {
      throw new Error(`marketplace download returned HTTP ${response.status}`);
    }
    if (response.body.byteLength > maxBytes) {
      throw new Error("marketplace archive exceeds the compressed-size limit");
    }
    return response.body;
  }

  private assertPinned(raw: string): void {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || !this.allowedOrigins.has(parsed.origin)) {
      throw new Error(`marketplace origin is not pinned: '${parsed.origin}'`);
    }
    if (parsed.username || parsed.password || parsed.hash) {
      throw new Error("marketplace URL must not contain credentials or a fragment");
    }
  }
}

export type ArchiveEntry =
  | {
      readonly kind: "file";
      readonly name: string;
      readonly declaredSize?: number;
      readonly executable: boolean;
      readonly data: AsyncIterable<Uint8Array>;
    }
  | { readonly kind: "directory"; readonly name: string }
  | { readonly kind: "symlink" | "hardlink" | "device" | "fifo"; readonly name: string };

export interface ArchiveReaderPort {
  entries(archive: Uint8Array): AsyncIterable<ArchiveEntry>;
}

export interface AgentPluginLayout {
  readonly root: string;
  readonly packages: string;
  readonly data: string;
  readonly staging: string;
}

export interface InstalledAgentPlugin {
  readonly pluginId: string;
  readonly version?: string;
  readonly archiveDigest: string;
  readonly packageRoot: string;
  readonly files: readonly string[];
  readonly skills: readonly {
    readonly name: string;
    readonly skillPath: `skills/${string}/SKILL.md`;
  }[];
}

const LIMITS = {
  archiveBytes: 32 * 1024 * 1024,
  fileBytes: 16 * 1024 * 1024,
  extractedBytes: 128 * 1024 * 1024,
  files: 4096,
} as const;

export function resolveAgentPluginLayout(
  installDir: string,
  env: NodeJS.ProcessEnv = process.env,
): AgentPluginLayout {
  const override = env.TOVU_AGENT_PLUGINS_DIR;
  if (override && !path.isAbsolute(override)) {
    throw new Error("TOVU_AGENT_PLUGINS_DIR must be absolute");
  }

  const root = path.resolve(
    override ?? path.join(installDir, "infra", "agent-plugins"),
  );

  return {
    root,
    packages: path.join(root, "packages", "sha256"),
    data: path.join(root, "data", "ws"),
    staging: path.join(root, "staging"),
  };
}

export async function installAgentPlugin(input: {
  readonly archive: Uint8Array;
  readonly expectedSha256: string;
  readonly archiveReader: ArchiveReaderPort;
  readonly layout: AgentPluginLayout;
}): Promise<InstalledAgentPlugin> {
  if (input.archive.byteLength > LIMITS.archiveBytes) {
    throw new Error("archive exceeds compressed-size limit");
  }

  const digest = sha256(input.archive);
  if (!/^[a-f0-9]{64}$/.test(input.expectedSha256) ||
      digest !== input.expectedSha256) {
    throw new Error("archive SHA-256 does not match marketplace metadata");
  }

  await mkdir(input.layout.packages, { recursive: true, mode: 0o700 });
  await mkdir(input.layout.staging, { recursive: true, mode: 0o700 });

  const finalRoot = path.join(input.layout.packages, digest);
  const existing = await optionalLstat(finalRoot);
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) {
      throw new Error(`published package path is not a directory: '${finalRoot}'`);
    }
    return indexInstalledRoot(finalRoot, digest);
  }

  const transactionRoot = await mkdtemp(
    path.join(input.layout.staging, "install-"),
  );
  const extractionRoot = path.join(transactionRoot, "root");
  await mkdir(extractionRoot, { mode: 0o700 });

  const executablePaths = new Set<string>();

  try {
    await extractEntries(
      input.archiveReader.entries(input.archive),
      extractionRoot,
      executablePaths,
    );

    const indexed = await indexInstalledRoot(extractionRoot, digest);
    await freezeTree(extractionRoot, executablePaths);

    try {
      // staging and packages share a filesystem, so publication is atomic.
      await rename(extractionRoot, finalRoot);
    } catch (error) {
      if (!hasCode(error, "EEXIST") && !hasCode(error, "ENOTEMPTY")) throw error;
      const raced = await optionalLstat(finalRoot);
      if (!raced?.isDirectory() || raced.isSymbolicLink()) throw error;
    }

    return { ...indexed, packageRoot: finalRoot };
  } finally {
    await rm(transactionRoot, { recursive: true, force: true });
  }
}

async function extractEntries(
  entries: AsyncIterable<ArchiveEntry>,
  extractionRoot: string,
  executablePaths: Set<string>,
): Promise<void> {
  const realRoot = await realpath(extractionRoot);
  const seen = new Set<string>();
  let fileCount = 0;
  let totalBytes = 0;

  for await (const entry of entries) {
    const relative = safeArchivePath(entry.name, entry.kind === "directory");

    if (seen.has(relative)) {
      throw new Error(`duplicate archive entry '${relative}'`);
    }
    seen.add(relative);

    if (entry.kind !== "file" && entry.kind !== "directory") {
      // Rejecting links also closes link-then-file and hardlink overwrite patterns.
      throw new Error(`archive entry type '${entry.kind}' is not permitted`);
    }

    if (entry.kind === "directory") {
      await ensureContainedDirectory(realRoot, relative);
      continue;
    }

    fileCount += 1;
    if (fileCount > LIMITS.files) throw new Error("archive file-count limit exceeded");
    if ((entry.declaredSize ?? 0) > LIMITS.fileBytes) {
      throw new Error(`archive file '${relative}' exceeds its size limit`);
    }

    const parent = await ensureContainedDirectory(
      realRoot,
      path.posix.dirname(relative) === "." ? "" : path.posix.dirname(relative),
    );
    const destination = path.join(parent, path.posix.basename(relative));

    if (!isContained(realRoot, destination)) {
      throw new Error(`archive traversal rejected: '${relative}'`);
    }

    let flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL;
    if (process.platform !== "win32") flags |= constants.O_NOFOLLOW;

    const handle = await open(destination, flags, 0o600);
    let fileBytes = 0;

    try {
      for await (const chunk of entry.data) {
        fileBytes += chunk.byteLength;
        totalBytes += chunk.byteLength;

        if (fileBytes > LIMITS.fileBytes ||
            totalBytes > LIMITS.extractedBytes) {
          throw new Error("archive decompressed-size limit exceeded");
        }

        let offset = 0;
        while (offset < chunk.byteLength) {
          const result = await handle.write(
            chunk,
            offset,
            chunk.byteLength - offset,
          );
          offset += result.bytesWritten;
        }
      }
    } finally {
      await handle.close();
    }

    if (entry.declaredSize !== undefined &&
        fileBytes !== entry.declaredSize) {
      throw new Error(`archive size mismatch for '${relative}'`);
    }
    if (entry.executable) executablePaths.add(relative);
  }
}

function safeArchivePath(raw: string, directory: boolean): string {
  const value = directory ? raw.replace(/\/+$/, "") : raw;

  if (
    value.length === 0 ||
    value.length > 1024 ||
    value.includes("\0") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value)
  ) {
    throw new Error(`unsafe archive path '${raw}'`);
  }

  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`archive traversal rejected: '${raw}'`);
  }

  const normalized = path.posix.normalize(value);
  if (normalized !== value) {
    throw new Error(`non-canonical archive path '${raw}'`);
  }
  return normalized;
}

async function ensureContainedDirectory(
  realRoot: string,
  relative: string,
): Promise<string> {
  let cursor = realRoot;

  for (const segment of relative === "" ? [] : relative.split("/")) {
    const next = path.join(cursor, segment);
    try {
      await mkdir(next, { mode: 0o700 });
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
    }

    const metadata = await lstat(next);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`archive parent is not a real directory: '${relative}'`);
    }

    const resolved = await realpath(next);
    if (!isContained(realRoot, resolved)) {
      throw new Error(`archive parent escaped extraction root: '${relative}'`);
    }
    cursor = resolved;
  }

  return cursor;
}

export async function readContainedFile(
  packageRoot: string,
  relativePath: string,
): Promise<Buffer> {
  const safe = safeArchivePath(relativePath, false);
  const realRoot = await realpath(packageRoot);
  const lexical = path.resolve(realRoot, safe);

  if (!isContained(realRoot, lexical)) {
    throw new Error(`package traversal rejected: '${relativePath}'`);
  }

  // Resolve symlinks before making the authoritative containment decision.
  const resolved = await realpath(lexical);
  if (!isContained(realRoot, resolved)) {
    throw new Error(`package symlink escape rejected: '${relativePath}'`);
  }

  const metadata = await stat(resolved);
  if (!metadata.isFile() || metadata.size > LIMITS.fileBytes) {
    throw new Error(`package path is not a readable regular file: '${relativePath}'`);
  }

  return readFile(resolved);
}

function isContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`));
}

async function indexInstalledRoot(
  packageRoot: string,
  archiveDigest: string,
): Promise<InstalledAgentPlugin> {
  const manifest = JSON.parse(
    (await readContainedFile(packageRoot, "plugin.json")).toString("utf8"),
  ) as Record<string, unknown>;

  if (manifest.$schema !==
      "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") {
    throw new Error("unsupported Agent Plugins manifest schema");
  }
  if (
    typeof manifest.name !== "string" ||
    !/^[a-z0-9](?!.*(?:--|\.\.))[a-z0-9.-]{0,62}[a-z0-9]$|^[a-z0-9]$/.test(
      manifest.name,
    )
  ) {
    throw new Error("invalid Agent Plugin name");
  }

  const files: string[] = [];
  const skills: InstalledAgentPlugin["skills"][number][] = [];

  async function walk(absolute: string, prefix: string): Promise<void> {
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) {
        throw new Error(`unsupported installed package entry '${relative}'`);
      }
      if (entry.isDirectory()) await walk(path.join(absolute, entry.name), relative);
      else files.push(relative);
    }
  }

  await walk(packageRoot, "");

  for (const file of files) {
    const match = file.match(/^skills\/([^/]+)\/SKILL\.md$/);
    if (match) {
      skills.push({
        name: match[1]!,
        skillPath: file as `skills/${string}/SKILL.md`,
      });
    }
  }

  return {
    pluginId: manifest.name,
    version: typeof manifest.version === "string" ? manifest.version : undefined,
    archiveDigest,
    packageRoot,
    files: files.sort(),
    skills,
  };
}

async function freezeTree(
  root: string,
  executables: ReadonlySet<string>,
  prefix = "",
): Promise<void> {
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

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function optionalLstat(target: string) {
  try {
    return await lstat(target);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null;
    throw error;
  }
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code;
}
```

**`files/tovu/agent-plugins/mcp-runtime.ts`**

This adds process admission above the existing per-tool federation admission.

```ts
import { createHash } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { connectMcpStdioSession } from "../mcp-federation/adapter.stdio";
import { FEDERATED_CONNECTION_DEFAULTS, type ResolvedFederatedConnection } from "../mcp-federation/config";
import type {
  McpSessionPort,
  McpStdioChannel,
  McpStdioLaunchSpec,
  RemoteToolDescriptor,
} from "../mcp-federation/ports";
import type { InstalledAgentPlugin, AgentPluginLayout } from "./install";

export interface AgentPluginStdioServer {
  readonly serverId: string;
  readonly configDigest: string;
  readonly config: {
    readonly type: "stdio";
    readonly command: string;
    readonly args?: readonly string[];
    readonly env?: Readonly<Record<string, string>>;
    readonly cwd?: string;
  };
}

export interface AgentPluginMcpAdmission {
  readonly workspaceId: string;
  readonly pluginId: string;
  readonly pluginDigest: string;
  readonly serverId: string;
  readonly serverConfigDigest: string;

  /** Selected by an operator from a sandboxed, live tools/list response. */
  readonly allowedToolNames: readonly string[];
  readonly reviewedToolSurfaceDigest: string;

  readonly sandboxProfileId: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
}

export interface AgentPluginSandboxPort {
  /**
   * Implementations must reject unknown profiles. PLUGIN_ROOT is mounted/readable
   * but not writable; PLUGIN_DATA is the sole writable mount.
   */
  openMcpChannel(input: {
    readonly profileId: string;
    readonly launch: McpStdioLaunchSpec;
    readonly readOnlyRoot: string;
    readonly writableDataRoot: string;
    readonly denyOtherFilesystem: true;
  }): Promise<McpStdioChannel>;
}

export interface AdmittedAgentPluginRuntime {
  readonly plugin: InstalledAgentPlugin;
  readonly server: AgentPluginStdioServer;
  readonly admission: AgentPluginMcpAdmission;
  readonly packageRoot: string;
  readonly dataRoot: string;
  readonly connection: ResolvedFederatedConnection;
}

export async function selectAdmittedAgentPluginRuntimes(input: {
  readonly workspaceId: string;
  readonly plugin: InstalledAgentPlugin;
  readonly servers: readonly AgentPluginStdioServer[];
  readonly admissions: readonly AgentPluginMcpAdmission[];
  readonly layout: AgentPluginLayout;
}): Promise<readonly AdmittedAgentPluginRuntime[]> {
  const selected: AdmittedAgentPluginRuntime[] = [];

  for (const server of input.servers) {
    const admission = input.admissions.find((candidate) =>
      candidate.workspaceId === input.workspaceId &&
      candidate.pluginId === input.plugin.pluginId &&
      candidate.pluginDigest === input.plugin.archiveDigest &&
      candidate.serverId === server.serverId &&
      candidate.serverConfigDigest === server.configDigest,
    );

    // No exact, independently-authored record means no process startup.
    if (!admission || admission.allowedToolNames.length === 0) continue;

    const dataRoot = path.join(
      input.layout.data,
      safeSegment(input.workspaceId),
      safeSegment(input.plugin.pluginId),
    );
    await mkdir(dataRoot, { recursive: true, mode: 0o700 });

    const launch = await resolveLaunch(
      input.plugin.packageRoot,
      await realpath(dataRoot),
      server.config,
    );

    selected.push({
      plugin: input.plugin,
      server,
      admission,
      packageRoot: await realpath(input.plugin.packageRoot),
      dataRoot: await realpath(dataRoot),
      connection: {
        config: {
          connectionId: connectionId(
            input.workspaceId,
            input.plugin.pluginId,
            server.serverId,
          ),
          label: `${input.plugin.pluginId}/${server.serverId}`,
          allowedToolNames: admission.allowedToolNames,
          ...FEDERATED_CONNECTION_DEFAULTS,
        },
        launch,
      },
    });
  }

  return selected;
}

export async function inspectAgentPluginServer(
  runtime: Omit<AdmittedAgentPluginRuntime, "admission" | "connection"> & {
    readonly profileId: string;
    readonly launch: McpStdioLaunchSpec;
  },
  sandbox: AgentPluginSandboxPort,
): Promise<{
  readonly tools: readonly RemoteToolDescriptor[];
  readonly toolSurfaceDigest: string;
}> {
  const channel = await sandbox.openMcpChannel({
    profileId: runtime.profileId,
    launch: runtime.launch,
    readOnlyRoot: runtime.packageRoot,
    writableDataRoot: runtime.dataRoot,
    denyOtherFilesystem: true,
  });
  const session = await connectMcpStdioSession({
    channel,
    requestTimeoutMs: FEDERATED_CONNECTION_DEFAULTS.callTimeoutMs,
  });

  try {
    const tools = await session.listTools();
    return { tools, toolSurfaceDigest: digestToolSurface(tools) };
  } finally {
    await session.close();
  }
}

export async function connectAdmittedAgentPlugin(
  runtime: AdmittedAgentPluginRuntime,
  sandbox: AgentPluginSandboxPort,
): Promise<McpSessionPort> {
  const channel = await sandbox.openMcpChannel({
    profileId: runtime.admission.sandboxProfileId,
    launch: runtime.connection.launch,
    readOnlyRoot: runtime.packageRoot,
    writableDataRoot: runtime.dataRoot,
    denyOtherFilesystem: true,
  });

  const session = await connectMcpStdioSession({
    channel,
    requestTimeoutMs: runtime.connection.config.callTimeoutMs,
  });

  return new ToolSurfacePinnedSession(
    session,
    runtime.admission.reviewedToolSurfaceDigest,
  );
}

class ToolSurfacePinnedSession implements McpSessionPort {
  private frozen: readonly RemoteToolDescriptor[] | null = null;

  constructor(
    private readonly inner: McpSessionPort,
    private readonly expectedDigest: string,
  ) {}

  async listTools(): Promise<RemoteToolDescriptor[]> {
    if (this.frozen) return [...this.frozen];

    const tools = await this.inner.listTools();
    const actual = digestToolSurface(tools);
    if (actual !== this.expectedDigest) {
      await this.inner.close();
      throw new Error(
        "Agent Plugin MCP tool surface changed since operator review",
      );
    }

    this.frozen = [...tools];
    return [...tools];
  }

  async callTool(request: {
    name: string;
    arguments: Record<string, unknown>;
    signal?: AbortSignal;
  }) {
    if (!this.frozen) throw new Error("tool surface has not passed admission");
    return this.inner.callTool(request);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

async function resolveLaunch(
  packageRoot: string,
  dataRoot: string,
  config: AgentPluginStdioServer["config"],
): Promise<McpStdioLaunchSpec> {
  const root = await realpath(packageRoot);
  const data = await realpath(dataRoot);

  let command = config.command;
  if (command.startsWith("./")) {
    command = await resolveExistingContained(root, command.slice(2));
    const metadata = await stat(command);
    if (!metadata.isFile() || (metadata.mode & 0o111) === 0) {
      throw new Error("plugin-relative MCP command is not executable");
    }
  } else if (
    command.length === 0 ||
    command.includes("/") ||
    command.includes("\\") ||
    command.includes("\0")
  ) {
    throw new Error("MCP command must be one bare token or begin with './'");
  }

  const env = config.env ?? {};
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string") throw new Error(`MCP env '${name}' is not a string`);
    if (reservedEnvironmentName(name)) {
      throw new Error(`plugin may not set reserved environment '${name}'`);
    }
  }

  return {
    command,
    args: (config.args ?? []).map((value) => expand(value, root, data)),
    cwd: await resolveCwd(config.cwd, root, data),
    env: {
      ...Object.fromEntries(
        Object.entries(env).map(([name, value]) => [
          name,
          expand(value, root, data),
        ]),
      ),
      // Set after package env so package data cannot override these.
      PLUGIN_ROOT: root,
      PLUGIN_DATA: data,
    },
  };
}

async function resolveCwd(
  configured: string | undefined,
  root: string,
  data: string,
): Promise<string> {
  if (configured === undefined || configured === "${PLUGIN_ROOT}") return root;
  if (configured === "${PLUGIN_DATA}") return data;

  if (configured.startsWith("./")) {
    return resolveExistingContained(root, configured.slice(2));
  }
  if (configured.startsWith("${PLUGIN_ROOT}/")) {
    return resolveExistingContained(root, configured.slice("${PLUGIN_ROOT}/".length));
  }
  if (configured.startsWith("${PLUGIN_DATA}/")) {
    return resolveExistingContained(data, configured.slice("${PLUGIN_DATA}/".length));
  }

  throw new Error(`invalid Agent Plugin MCP cwd '${configured}'`);
}

async function resolveExistingContained(
  base: string,
  portableRelative: string,
): Promise<string> {
  if (
    portableRelative.includes("\\") ||
    portableRelative.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`unsafe plugin-relative path '${portableRelative}'`);
  }

  const realBase = await realpath(base);
  const resolved = await realpath(path.resolve(realBase, portableRelative));
  const relative = path.relative(realBase, resolved);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`resolved path escapes '${base}'`);
  }
  return resolved;
}

function expand(value: string, root: string, data: string): string {
  // Callback replacement is single-pass; replacement text is not re-expanded.
  return value.replace(
    /\$\{PLUGIN_(ROOT|DATA)\}/g,
    (_match, name: "ROOT" | "DATA") => name === "ROOT" ? root : data,
  );
}

function reservedEnvironmentName(name: string): boolean {
  const normalized = process.platform === "win32" ? name.toUpperCase() : name;
  return normalized === "PLUGIN_ROOT" || normalized === "PLUGIN_DATA";
}

export function digestToolSurface(
  tools: readonly RemoteToolDescriptor[],
): string {
  const ordered = [...tools].sort((a, b) => a.name.localeCompare(b.name));
  return sha256(stableJson(ordered));
}

export function digestServerConfig(
  config: AgentPluginStdioServer["config"],
): string {
  return sha256(stableJson(config));
}

function connectionId(
  workspaceId: string,
  pluginId: string,
  serverId: string,
): string {
  // 35 characters and compatible with trust.ts's 40-character pattern.
  return `ap-${sha256(`${workspaceId}\0${pluginId}\0${serverId}`).slice(0, 32)}`;
}

function safeSegment(value: string): string {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) ||
    value === "." ||
    value === ".."
  ) {
    throw new Error(`unsafe filesystem identity '${value}'`);
  }
  return value;
}

function stableJson(value: unknown): string {
  function normalize(input: unknown): unknown {
    if (Array.isArray(input)) return input.map(normalize);
    if (typeof input !== "object" || input === null) return input;

    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, normalize(child)]),
    );
  }
  return JSON.stringify(normalize(value));
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
```

The existing federation connector must be exported so the composition root can choose it for ordinary presets and the sandbox connector for Agent Plugins.

**Changed call site in `files/tovu/mcp-federation/bootstrap.ts`:**

```ts
// Existing line 98:
const connect = params.connect ?? connectResolvedFederatedMcpConnection;

// Rename/export the existing private defaultConnect implementation:
export async function connectResolvedFederatedMcpConnection(
  connection: ResolvedFederatedConnection,
): Promise<McpSessionPort> {
  const channel = spawnMcpStdioChannel(connection.launch);
  const timeoutMs = connection.config.connectTimeoutMs;

  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      connectMcpStdioSession({
        channel,
        requestTimeoutMs: connection.config.callTimeoutMs,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`connect timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } catch (error) {
    channel.close();
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
```

**Composition-root call site:**

```ts
import type { ToolRegistry } from "@jini-ai/core";

import {
  attachFederatedMcpTools,
  connectResolvedFederatedMcpConnection,
} from "../mcp-federation/bootstrap";
import type { FederationDeps } from "../mcp-federation/registrations";
import {
  connectAdmittedAgentPlugin,
  type AdmittedAgentPluginRuntime,
  type AgentPluginSandboxPort,
} from "./mcp-runtime";

export async function attachAgentPluginMcp(input: {
  readonly registry: ToolRegistry;
  readonly federationDeps: FederationDeps;
  readonly runtimes: readonly AdmittedAgentPluginRuntime[];
  readonly sandbox: AgentPluginSandboxPort;
}) {
  const runtimeByConnection = new Map(
    input.runtimes.map((runtime) => [
      runtime.connection.config.connectionId,
      runtime,
    ]),
  );

  return attachFederatedMcpTools({
    registry: input.registry,
    deps: input.federationDeps,
    extraConnections: input.runtimes.map((runtime) => runtime.connection),
    connect: (connection) => {
      const runtime = runtimeByConnection.get(connection.config.connectionId);
      return runtime
        ? connectAdmittedAgentPlugin(runtime, input.sandbox)
        : connectResolvedFederatedMcpConnection(connection);
    },
  });
}
```

The capability adapter reads Skills from the installed directory, but derives MCP arguments and bindings only from tools that the existing federation layer actually registered.

**`files/tovu/agent-plugins/capabilities.ts`**

```ts
import type { InstalledAgentPlugin } from "./install";
import { readContainedFile } from "./install";
import type { AdmittedAgentPluginRuntime } from "./mcp-runtime";
import { federatedToolId } from "../mcp-federation/trust";

export interface CapabilityDescriptor {
  readonly contractVersion: 1;
  readonly id: string;
  readonly revision: string;
  readonly kind: string;
  readonly label: string;
  readonly description: string;
  readonly argumentsSchema: Readonly<Record<string, unknown>>;
  readonly previewBindingId?: string;
  readonly executeBindingId?: string;
  readonly availability:
    | { readonly state: "ready" }
    | { readonly state: "blocked"; readonly message: string };
  readonly provenance: {
    readonly pluginId: string;
    readonly packageDigest: string;
    readonly trustDecision: "context-only" | "operator-admitted-mcp" | "not-admitted";
  };
}

export interface CapabilityRegistration {
  readonly descriptor: CapabilityDescriptor;
  readonly preview?: () => Promise<{
    readonly path: string;
    readonly mediaType: string;
    readonly content: string;
  }>;
  readonly execute?: (
    args: Record<string, unknown>,
    context: { workspaceId: string; principalId: string; signal?: AbortSignal },
  ) => Promise<unknown>;
}

export interface ContextActivationPort {
  activate(input: {
    readonly workspaceId: string;
    readonly markdown: string;
    readonly sourceId: string;
    readonly sourceDigest: string;
  }): Promise<unknown>;
}

export interface ToolExecutionPort {
  execute(
    toolId: string,
    args: Record<string, unknown>,
    context: { workspaceId: string; principalId: string; signal?: AbortSignal },
  ): Promise<unknown>;
}

export interface LiveToolRegistryPort {
  list(): readonly {
    readonly id: string;
    readonly description: string;
    readonly inputSchema?: unknown;
  }[];
}

const EMPTY_SCHEMA = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
} as const;

export async function adaptInstalledAgentPlugin(input: {
  readonly plugin: InstalledAgentPlugin;
  readonly runtimes: readonly AdmittedAgentPluginRuntime[];
  readonly liveTools: LiveToolRegistryPort;
  readonly context: ContextActivationPort;
  readonly toolExecutor: ToolExecutionPort;
}): Promise<readonly CapabilityRegistration[]> {
  const registrations: CapabilityRegistration[] = [];
  const provenanceBase = {
    pluginId: input.plugin.pluginId,
    packageDigest: input.plugin.archiveDigest,
  } as const;

  for (const skill of input.plugin.skills) {
    const id =
      `agent-plugin:${input.plugin.pluginId}:skill:${skill.name}`;
    const previewBindingId = `preview:${id}:${input.plugin.archiveDigest}`;
    const executeBindingId = `context:${id}:${input.plugin.archiveDigest}`;

    registrations.push({
      descriptor: {
        contractVersion: 1,
        id,
        revision: input.plugin.archiveDigest,
        kind: "skill",
        label: humanize(skill.name),
        description: `Context-only Skill from ${input.plugin.pluginId}`,
        argumentsSchema: EMPTY_SCHEMA,
        previewBindingId,
        executeBindingId,
        availability: { state: "ready" },
        provenance: {
          ...provenanceBase,
          trustDecision: "context-only",
        },
      },
      preview: async () => ({
        path: skill.skillPath,
        mediaType: "text/markdown",
        content: (
          await readContainedFile(input.plugin.packageRoot, skill.skillPath)
        ).toString("utf8"),
      }),
      execute: async (_args, context) => {
        const markdown = (
          await readContainedFile(input.plugin.packageRoot, skill.skillPath)
        ).toString("utf8");

        return input.context.activate({
          workspaceId: context.workspaceId,
          markdown,
          sourceId: id,
          sourceDigest: input.plugin.archiveDigest,
        });
      },
    });
  }

  const liveById = new Map(
    input.liveTools.list().map((tool) => [tool.id, tool]),
  );

  for (const runtime of input.runtimes) {
    for (const remoteName of runtime.admission.allowedToolNames) {
      const toolId = federatedToolId(
        runtime.connection.config.connectionId,
        remoteName,
      );
      const live = liveById.get(toolId);
      const id =
        `agent-plugin:${input.plugin.pluginId}:mcp:${runtime.server.serverId}:${remoteName}`;

      if (!live || !isSchema(live.inputSchema)) {
        registrations.push({
          descriptor: {
            contractVersion: 1,
            id,
            revision: input.plugin.archiveDigest,
            kind: "mcp-tool",
            label: remoteName,
            description: "Not registered by the federation trust layer.",
            argumentsSchema: EMPTY_SCHEMA,
            availability: {
              state: "blocked",
              message:
                "The reviewed tool was absent or failed federation admission.",
            },
            provenance: {
              ...provenanceBase,
              trustDecision: "not-admitted",
            },
          },
        });
        continue;
      }

      const bindingId = `tool:${toolId}:${input.plugin.archiveDigest}`;
      registrations.push({
        descriptor: {
          contractVersion: 1,
          id,
          revision: input.plugin.archiveDigest,
          kind: "mcp-tool",
          label: remoteName,
          description: live.description,
          argumentsSchema: live.inputSchema,
          executeBindingId: bindingId,
          availability: { state: "ready" },
          provenance: {
            ...provenanceBase,
            trustDecision: "operator-admitted-mcp",
          },
        },
        execute: (args, context) =>
          input.toolExecutor.execute(toolId, args, context),
      });
    }
  }

  return registrations;
}

function isSchema(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}

function humanize(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}
```

**Tests**

```ts
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  installAgentPlugin,
  type ArchiveEntry,
  type ArchiveReaderPort,
} from "../install";
import { selectAdmittedAgentPluginRuntimes } from "../mcp-runtime";

function reader(entries: readonly ArchiveEntry[]): ArchiveReaderPort {
  return {
    async *entries() {
      yield* entries;
    },
  };
}

test("rejects link-then-file extraction before publication", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-test-"));
  const archive = new Uint8Array([1, 2, 3]);
  const digest = createHash("sha256").update(archive).digest("hex");

  try {
    await assert.rejects(
      installAgentPlugin({
        archive,
        expectedSha256: digest,
        archiveReader: reader([
          { kind: "symlink", name: "skills" },
          {
            kind: "file",
            name: "skills/a/SKILL.md",
            declaredSize: 1,
            executable: false,
            data: (async function* () {
              yield new Uint8Array([65]);
            })(),
          },
        ]),
        layout: {
          root,
          packages: path.join(root, "packages"),
          data: path.join(root, "data"),
          staging: path.join(root, "staging"),
        },
      }),
      /symlink.*not permitted/,
    );

    assert.deepEqual(
      await readdir(path.join(root, "packages")),
      [],
      "no digest directory may be published",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects lexical zip-slip paths", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-agent-plugin-test-"));
  const archive = new Uint8Array([4, 5, 6]);
  const digest = createHash("sha256").update(archive).digest("hex");

  try {
    await assert.rejects(
      installAgentPlugin({
        archive,
        expectedSha256: digest,
        archiveReader: reader([{
          kind: "file",
          name: "../../outside",
          executable: false,
          data: (async function* () {
            yield new Uint8Array([65]);
          })(),
        }]),
        layout: {
          root,
          packages: path.join(root, "packages"),
          data: path.join(root, "data"),
          staging: path.join(root, "staging"),
        },
      }),
      /traversal rejected/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a stale package digest cannot authorize process startup", async () => {
  const selected = await selectAdmittedAgentPluginRuntimes({
    workspaceId: "11111111-1111-1111-1111-111111111111",
    plugin: {
      pluginId: "review",
      archiveDigest: "a".repeat(64),
      packageRoot: "/unused",
      files: [],
      skills: [],
    },
    servers: [{
      serverId: "main",
      configDigest: "b".repeat(64),
      config: { type: "stdio", command: "review-server" },
    }],
    admissions: [{
      workspaceId: "11111111-1111-1111-1111-111111111111",
      pluginId: "review",
      pluginDigest: "c".repeat(64), // stale bytes
      serverId: "main",
      serverConfigDigest: "b".repeat(64),
      allowedToolNames: ["review"],
      reviewedToolSurfaceDigest: "d".repeat(64),
      sandboxProfileId: "agent-plugin-default",
      reviewedBy: "operator-1",
      reviewedAt: "2026-08-12T00:00:00.000Z",
    }],
    layout: {
      root: "/unused",
      packages: "/unused/packages",
      data: "/unused/data",
      staging: "/unused/staging",
    },
  });

  assert.deepEqual(selected, []);
});
```

## Critique Of Another Participant's Round 2 Code

Gemini 3.6 Flash’s `AgentPluginCapabilityAdapter.parseMcpServers()` contains:

```ts
const declaredTools = (serverSpec.tools as readonly string[]) || [];
```

That construct is incompatible with the actual Agent Plugins contract. Standard `mcp.json` entries describe how to connect to a server; they do not declare its tool inventory. The real Tovu port likewise obtains tools by calling `McpSessionPort.listTools()` (files/tovu/mcp-federation/ports.ts:86-90), and federation freezes that live response in `federateSession()` (files/tovu/mcp-federation/registrations.ts:137-155). Gemini’s adapter therefore produces zero MCP descriptors for conforming packages while trusting a non-standard field if an attacker supplies one.

Its admission gate is also unsafe:

```ts
execute: { type: "tool-dispatch", toolId: qualifiedToolId },
trustStatus: isAdmitted ? "admitted-mcp" : "unadmitted-mcp",
confirmationRequired: !isAdmitted,
```

An unadmitted tool still receives an executable dispatch binding; only presentation metadata changes. Confirmation is not admission. Worse, the existing federation path starts the subprocess before evaluating the tool allowlist, so even a corrected dispatch gate would not prevent marketplace code from running.

Gemini 3.1 Pro’s preview resolver is not an implementation at all: it returns the literal placeholder `"(Resolved content for ...)"`. It also interpolates an unsanitized `pluginId` into the URI and never calls `realpath`, so it cannot provide the containment property its comment claims.

Codex’s Round 2 `readContainedText()` correctly performs lexical and resolved-path checks for preview, but it assumes an already-safe package inventory. It does not address extraction-time link creation, duplicate paths, or atomic publication; applying that function only after a vulnerable extractor has overwritten an external file is too late.

## What Would Change My Mind

I would prefer complete per-workspace package copies if Tovu formally became one-workspace-per-process and measurements showed package deduplication or digest retention added more operational cost than it saved.

I would promote Skills-only to rank one if no enforceable sandbox can be shipped. Operator consent and `chmod` do not substitute for a filesystem/process boundary.

I would relax digest-pinned tool-surface readmission if the existing federation layer gained a signed, independently reviewed tool-surface registry with trustworthy update semantics.

Finally, an upstream archive/install protocol, signature system, or portable execution-permission model would supersede Tovu-specific marketplace policy. The current specification deliberately leaves those decisions to clients.

<<SWARM_END>>