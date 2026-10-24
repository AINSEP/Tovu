import { AgentPluginActivationsBusyError, AgentPluginActivationsUnreadableError, AgentPluginHostIncompatibleError, AgentPluginUpdateError, type AgentPluginSearchCandidate } from "@jini-ai/agent-plugins/lifecycle";
import { AgentPluginInstallError, type AgentPluginInstallErrorCode } from "../../../../../features/agent-plugins/lifecycle.js";
import { AgentPluginUploadError, type AgentPluginUploadErrorCode } from "#src/features/agent-plugins/install-upload";
import type { PluginMaturity } from "#src/features/agent-plugins/identity";

/**
 * @file Pure response builders for `install.ts` (`AGENT_PLUGIN_INSTALL_ZIP`): which status and body
 * each install refusal answers, and the row a successful install reports. Error bodies carry a code
 * and a plain message; no host path ever reaches them.
 */

/** One refusal: the HTTP status and the `{ code, error }` body sent with it. */
export interface InstallRefusal {
  readonly status: number;
  readonly body: { readonly code: string; readonly error: string };
  /** Operator-side log line; only for refusals whose real cause must not reach the client. */
  readonly warning?: string;
}

const TOO_LARGE_MESSAGE = "The .zip is larger than the 32 MiB limit.";
const UNPACKED_TOO_LARGE_MESSAGE = "The .zip is too big once unpacked: at most 4096 files, 16 MiB per file, 64 MiB in all.";

/** Plain-language text for each refusal the operator can fix by choosing a different file. */
const INSTALL_ERROR_MESSAGES: Readonly<Partial<Record<AgentPluginInstallErrorCode, string>>> = {
  ARCHIVE_TOO_LARGE: TOO_LARGE_MESSAGE,
  DIGEST_MISMATCH: "The upload arrived damaged. Try again.",
  MANIFEST_MISSING: "No plugin.json found. Put plugin.json at the top of the .zip, or inside one folder.",
  MANIFEST_INVALID: "plugin.json is not a valid Agent Plugin manifest.",
  TOO_MANY_ENTRIES: UNPACKED_TOO_LARGE_MESSAGE,
  FILE_TOO_LARGE: UNPACKED_TOO_LARGE_MESSAGE,
  DECOMPRESSION_BOMB: UNPACKED_TOO_LARGE_MESSAGE,
  TOTAL_SIZE_EXCEEDED: UNPACKED_TOO_LARGE_MESSAGE,
};
const INSTALL_ERROR_FALLBACK_MESSAGE = "This .zip contains files or links that plugins may not include.";
/** Every other install refusal is the file's fault (400). */
const INSTALL_ERROR_STATUSES: Readonly<Partial<Record<AgentPluginInstallErrorCode, number>>> = { ARCHIVE_TOO_LARGE: 413, PUBLISH_FAILED: 500 };

/** Upload refusals with their own text; any other upload code answers with its own message. */
const UPLOAD_ERROR_MESSAGES: Readonly<Partial<Record<AgentPluginUploadErrorCode, string>>> = {
  PLUGIN_ID_TAKEN: "This plugin ID is already installed. Choose Replace existing version to upgrade it.",
  ARCHIVE_UNREADABLE: "This file is not a readable .zip.",
};

const ARCHIVE_TOO_LARGE_REFUSAL: InstallRefusal = { status: 413, body: { code: "AGENT_PLUGIN_ARCHIVE_TOO_LARGE", error: TOO_LARGE_MESSAGE } };
const ARCHIVE_UNREADABLE_REFUSAL: InstallRefusal = { status: 400, body: { code: "AGENT_PLUGIN_ARCHIVE_UNREADABLE", error: "The upload could not be read." } };

/**
 * Maps the raw body parser's error to its refusal: over the size cap is 413, anything else (a
 * compressed or truncated body) is unreadable.
 * @complexity O(1).
 */
export function bodyParseRefusal(parseError: unknown): InstallRefusal {
  return (parseError as { type?: string }).type === "entity.too.large" ? ARCHIVE_TOO_LARGE_REFUSAL : ARCHIVE_UNREADABLE_REFUSAL;
}

/** @complexity O(1). */
function uploadErrorRefusal(error: AgentPluginUploadError): InstallRefusal {
  return {
    status: error.code === "ARCHIVE_UNREADABLE" ? 400 : 409,
    body: { code: `AGENT_PLUGIN_${error.code}`, error: UPLOAD_ERROR_MESSAGES[error.code] ?? error.message },
  };
}

/** @complexity O(1). */
function installErrorRefusal(error: AgentPluginInstallError): InstallRefusal {
  return {
    status: INSTALL_ERROR_STATUSES[error.code] ?? 400,
    body: { code: `AGENT_PLUGIN_${error.code}`, error: INSTALL_ERROR_MESSAGES[error.code] ?? INSTALL_ERROR_FALLBACK_MESSAGE },
  };
}

/**
 * Maps a thrown install error to its HTTP refusal. Anything unrecognised is a redacted 500.
 * Every update refusal (changed since the operator looked, bundled, downgrade, a pending recovery,
 * another plugin's package) and an incompatible host are conflicts with the installed state: 409
 * with the lifecycle owner's own code and plain message, which never carries a host path.
 * @complexity O(1).
 */
export function installErrorResponse(error: unknown): InstallRefusal {
  if (error instanceof AgentPluginUpdateError || error instanceof AgentPluginHostIncompatibleError) return { status: 409, body: { code: error.code, error: error.message } };
  if (error instanceof AgentPluginUploadError) return uploadErrorRefusal(error);
  if (error instanceof AgentPluginInstallError) return installErrorRefusal(error);
  if (error instanceof AgentPluginActivationsUnreadableError || error instanceof AgentPluginActivationsBusyError) {
    return {
      status: 409,
      body: { code: "AGENT_PLUGIN_ACTIVATIONS_BUSY", error: "Could not install the plugin. Try again." },
      warning: `[agent-plugins] upload refused — ${error.message}`,
    };
  }
  return { status: 500, body: { code: "INTERNAL_ERROR", error: "internal error" } };
}

/**
 * The lifecycle fields every Agent Plugin row carries (`list.ts`, install/update, `set-enabled.ts`):
 * `origin` (bundled rows are managed by Tovu: no Update, no Uninstall), `hostOk` (false: this host
 * refuses to enable it), `missingRequires` (advisory capabilities no other enabled plugin provides),
 * `requiredBy` (enabled plugins that would lose a capability if this one were switched off) and
 * `archiveDigest` (the installed revision an update must name). One projection, so the three
 * responses cannot drift.
 * @complexity O(1).
 */
export function agentPluginLifecycleFields({ candidate }: { candidate: AgentPluginSearchCandidate & { maturity?: PluginMaturity } }, _optional: Record<string, never> = {}) {
  return {
    ...(candidate.maturity ? { maturity: candidate.maturity } : {}),
    origin: candidate.origin,
    hostOk: candidate.hostOk,
    missingRequires: candidate.missingRequires ?? [],
    requiredBy: candidate.requiredBy ?? [],
    archiveDigest: candidate.archiveDigest,
  };
}

/** The installed plugin's row, as `list.ts` reports it, or null when the read model does not list it. */
export interface InstalledAgentPluginRow {
  readonly maturity?: PluginMaturity;
  readonly origin?: AgentPluginSearchCandidate["origin"];
  readonly hostOk?: boolean;
  readonly missingRequires?: readonly string[];
  readonly requiredBy?: readonly string[];
  readonly archiveDigest?: string;
  readonly pluginId: string;
  readonly displayName: string | null;
  readonly summary: string | null;
  readonly version: string | null;
  readonly description: string | null;
  readonly keywords: AgentPluginSearchCandidate["keywords"];
  readonly enabled: boolean;
  readonly skills: AgentPluginSearchCandidate["skills"];
  readonly mcpServerIds: AgentPluginSearchCandidate["mcpServerIds"];
}

/**
 * Builds the response row for a just-installed plugin; omitted display metadata becomes explicit nulls.
 * @complexity O(1).
 */
export function installedAgentPluginRow(candidate: AgentPluginSearchCandidate | undefined): InstalledAgentPluginRow | null {
  if (!candidate) return null;
  return {
    pluginId: candidate.pluginId,
    displayName: candidate.displayName ?? null,
    summary: candidate.summary ?? null,
    version: candidate.version ?? null,
    description: candidate.description ?? null,
    keywords: candidate.keywords,
    enabled: candidate.enabled,
    ...agentPluginLifecycleFields({ candidate }),
    skills: candidate.skills,
    mcpServerIds: candidate.mcpServerIds,
  };
}
