/**
 * @file `installUploadedAgentPlugin()` — the admin "Add a plugin" upload: one operator-supplied
 * `.zip` of an agent-plugins.org package, installed for one workspace and left switched OFF.
 *
 * No second install path. Extraction, containment, size caps, the digest check and publication are
 * all `installAgentPlugin()`'s (`install.ts`), exactly as the bundled seed uses it; this module only
 * adds what an upload needs that a bundled source never does:
 *
 * - A real ZIP reader: Jini's published yauzl adapter, the same one `plugin-runtime/install-archive.ts`
 *   uses for site-plugin uploads, adapted to `install.ts`'s own reader port.
 * - One wrapping folder is accepted. Zipping a folder (macOS "Compress", a GitHub download) puts
 *   every file under `<folder>/`, plus `__MACOSX/` noise; `install.ts` wants `plugin.json` at the
 *   root. When the root has no `plugin.json` but exactly one top-level folder does, that folder is
 *   the package and everything outside it is dropped. Every path is still re-checked by `install.ts`.
 * - An id clash is refused. The package store is content-addressed per plugin id, so a second,
 *   different package under an installed id would sit beside the first and both consumers refuse an
 *   ambiguous id (`resolve-agent-plugin-refs.ts`). Identical bytes are a harmless no-op instead.
 * - It stays off. An absent activation record reads as ACTIVE (operator installs predate the
 *   record), so the disabled `operator-installed` record is written BEFORE the package is
 *   published, the same order the bundled seed uses. A failed install leaves only that inert record.
 *
 * Nothing in an uploaded package runs: skills are markdown, and code seams only trust bundled
 * digests (`trusted-plugin-files.ts`).
 */
import { createHash } from "node:crypto";

import * as yauzl from "yauzl";
import { parseAgentPluginManifest } from "@jini-ai/agent-plugins/lifecycle";
import { createYauzlAgentPluginArchiveReader, type YauzlPort } from "@jini-ai/agent-plugins/lifecycle/yauzl";

import { agentPluginActivations } from "./activation-effects.js";
import {
  AgentPluginInstallError,
  installAgentPlugin,
  maxAgentPluginInstallArchiveBytes,
  type AgentPluginArchiveEntry,
  type AgentPluginArchiveReaderPort,
  type InstalledAgentPlugin,
} from "./install.js";
import { resolveAgentPluginLayout, type AgentPluginLayout } from "./layout.js";
import { listInstalledPlugins } from "./resolve-agent-plugin-refs.js";

const { setAgentPluginActivation } = agentPluginActivations;

const MANIFEST = "plugin.json";
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_PREPASS_ENTRIES = 4096;
/** Archiver metadata a wrapping-folder zip may carry beside the folder. Never part of a package. */
const IGNORED_TOP_LEVEL = new Set(["__MACOSX"]);

export type AgentPluginUploadErrorCode = "ARCHIVE_UNREADABLE" | "PLUGIN_ID_TAKEN";

/** Upload-only refusals; every other refusal is `install.ts`'s own `AgentPluginInstallError`. */
export class AgentPluginUploadError extends Error {
  readonly code: AgentPluginUploadErrorCode;

  constructor(code: AgentPluginUploadErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AgentPluginUploadError";
    this.code = code;
  }
}

/** Jini's yauzl adapter speaks `entries({ archive })` / `openReadStream({})`; `install.ts` speaks the
 *  positional form. Shape conversion only.
 *  @complexity O(1) per entry. */
function createUploadArchiveReader(): AgentPluginArchiveReaderPort {
  const jini = createYauzlAgentPluginArchiveReader({ yauzl: yauzl as unknown as YauzlPort });
  return {
    async *entries(archive) {
      for await (const entry of jini.entries({ archive })) {
        yield entry.kind === "file" ? { ...entry, openReadStream: () => entry.openReadStream({}) } : entry;
      }
    },
  };
}

/** `reader`, minus every entry outside `prefix` and with `prefix` stripped from the rest.
 *  @complexity O(1) per entry. */
function withinPrefix(reader: AgentPluginArchiveReaderPort, prefix: string): AgentPluginArchiveReaderPort {
  if (!prefix) return reader;
  return {
    async *entries(archive) {
      for await (const entry of reader.entries(archive)) {
        const name = entry.entryPath.replaceAll("\\", "/");
        if (!name.startsWith(prefix)) continue;
        const inner = name.slice(prefix.length);
        if (!inner) continue;
        yield { ...entry, entryPath: inner } as AgentPluginArchiveEntry;
      }
    },
  };
}

async function readBounded(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.byteLength;
    if (length > MAX_MANIFEST_BYTES) throw new AgentPluginInstallError("MANIFEST_INVALID", "plugin.json is larger than 1 MiB");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, length);
}

/**
 * Finds the package root (`""` or one wrapping `<folder>/`) and its plugin id, by reading only
 * entry names and the candidate `plugin.json` files.
 * @complexity O(e) in entry count, capped at {@link MAX_PREPASS_ENTRIES}.
 */
async function locatePackage(reader: AgentPluginArchiveReaderPort, archive: Uint8Array): Promise<{ prefix: string; pluginId: string }> {
  const manifests = new Map<string, Buffer>();
  const topLevel = new Set<string>();
  let count = 0;
  try {
    for await (const entry of reader.entries(archive)) {
      if (++count > MAX_PREPASS_ENTRIES) throw new AgentPluginInstallError("TOO_MANY_ENTRIES", `archive exceeds the ${MAX_PREPASS_ENTRIES}-entry cap`);
      const name = entry.entryPath.replaceAll("\\", "/").replace(/^\.\//, "");
      const [head] = name.split("/");
      if (head && !IGNORED_TOP_LEVEL.has(head)) topLevel.add(name.includes("/") ? `${head}/` : head);
      if (entry.kind === "file" && /^(?:[^/]+\/)?plugin\.json$/.test(name)) manifests.set(name, await readBounded(entry.openReadStream()));
    }
  } catch (error) {
    if (error instanceof AgentPluginInstallError) throw error;
    throw new AgentPluginUploadError("ARCHIVE_UNREADABLE", "the file is not a readable .zip archive", { cause: error });
  }
  const folders = [...topLevel].filter((name) => name.endsWith("/"));
  const prefix = manifests.has(MANIFEST) ? "" : topLevel.size === 1 && folders.length === 1 ? folders[0]! : null;
  const raw = prefix === null ? undefined : manifests.get(prefix + MANIFEST);
  if (prefix === null || raw === undefined) {
    throw new AgentPluginInstallError("MANIFEST_MISSING", "the archive does not contain a plugin.json at its root or inside one top-level folder");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch (error) {
    throw new AgentPluginInstallError("MANIFEST_INVALID", "plugin.json is not valid JSON", { cause: error });
  }
  const parsed = parseAgentPluginManifest({ value });
  if (!parsed.ok) throw new AgentPluginInstallError("MANIFEST_INVALID", `plugin.json failed validation: ${parsed.errors.join("; ")}`);
  return { prefix, pluginId: parsed.manifest.name };
}

export interface InstallUploadedAgentPluginRequired {
  readonly archive: Uint8Array;
  /** Lowercase hex SHA-256 the client computed from the file it chose; catches a corrupted upload. */
  readonly expectedSha256: string;
  /** From the authenticated request context, never from the archive. */
  readonly workspaceId: string;
  /** The authenticated principal, recorded as the activation record's `updatedBy`. */
  readonly actor: string;
}

export interface InstallUploadedAgentPluginOptional {
  readonly archiveReader?: AgentPluginArchiveReaderPort;
  readonly layout?: AgentPluginLayout;
}

export interface InstalledUploadedAgentPlugin {
  readonly plugin: InstalledAgentPlugin;
  /** True when these exact bytes were already installed; nothing was written. */
  readonly alreadyInstalled: boolean;
}

/**
 * Installs one uploaded Agent Plugin `.zip`, switched off.
 * @throws {AgentPluginInstallError} Size, digest, manifest and every extraction refusal.
 * @throws {AgentPluginUploadError} An unreadable archive, or an id another package already holds.
 * @complexity O(e + b) in entry count and extracted bytes, both capped by `install.ts`.
 */
export async function installUploadedAgentPlugin(
  required: InstallUploadedAgentPluginRequired,
  optional: InstallUploadedAgentPluginOptional = {},
): Promise<InstalledUploadedAgentPlugin> {
  const { archive, expectedSha256, workspaceId, actor } = required;
  const layout = optional.layout ?? resolveAgentPluginLayout();
  const reader = optional.archiveReader ?? createUploadArchiveReader();

  // `install.ts` repeats both checks; they run here too so no parser touches unverified bytes.
  if (archive.byteLength > maxAgentPluginInstallArchiveBytes()) {
    throw new AgentPluginInstallError("ARCHIVE_TOO_LARGE", `archive is ${archive.byteLength} bytes, over the ${maxAgentPluginInstallArchiveBytes()}-byte cap`);
  }
  const digest = createHash("sha256").update(archive).digest("hex");
  if (digest !== expectedSha256.toLowerCase()) {
    throw new AgentPluginInstallError("DIGEST_MISMATCH", "the uploaded bytes do not match the file that was chosen");
  }

  const { prefix, pluginId } = await locatePackage(reader, archive);
  const workspaceRoot = layout.forWorkspace(workspaceId).root;
  const existing = (await listInstalledPlugins(workspaceRoot)).filter((plugin) => plugin.pluginId === pluginId);
  const same = existing.find((plugin) => plugin.archiveDigest === digest);
  if (same) return { plugin: same, alreadyInstalled: true };
  if (existing.length > 0) {
    throw new AgentPluginUploadError("PLUGIN_ID_TAKEN", `an agent plugin named '${pluginId}' is already installed`);
  }

  await setAgentPluginActivation({ workspaceRoot, pluginId, enabled: false, actor }, { origin: "operator-installed" });
  const plugin = await installAgentPlugin({
    archive,
    expectedSha256: digest,
    archiveReader: withinPrefix(reader, prefix),
    layout,
    workspaceId,
  });
  return { plugin, alreadyInstalled: false };
}
