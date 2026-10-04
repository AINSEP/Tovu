// Local federation forks moved to @jini-ai/mcp/federation (+ /stdio, /approvals); see development/DELETED-CODE.md.
import { defaultFederationMessages, type FederationMessages } from "@jini-ai/mcp/federation";
import type { ResolvedFederatedConnection } from "@jini-ai/mcp/federation";

/**
 * @file The core-owned, plugin-populated registry of federated MCP presets — the seam that lets a
 * concrete vendor integration live OUTSIDE `src/assistant/` while still being part of the default
 * boot.
 *
 * Why a registry rather than `bootstrap.ts` calling each preset by name: before 2026-07-30
 * `bootstrap.ts` imported `resolveSupabaseMcpConnection` directly, which made "add a second vendor"
 * an edit to core federation code and made core federation import a specific vendor's module. Both
 * are the wrong direction. With this file the dependency points the other way — a preset imports
 * core and announces itself; core never learns any vendor's name.
 *
 * The shape is the one this codebase already uses for exactly this problem: a module-level ordered
 * list plus a typed `register*` function, a `reset*ForTests`, and a fold/resolve function —
 * `page-head.ts`'s `registerPageHeadContributor`/`foldPageHead` and `routing.ts`'s
 * `registerResolvePhase`/`registerNamedRoute`. Per ADR-006/ADR-009 §3, hooks and registries are
 * exempt from the rule-of-two, so this is deliberately NOT a port with two adapters.
 *
 * This is NOT the SPEC-005 plugin runtime. That mechanism exists to load sandboxed third-party code
 * at runtime; this one wires a first-party module that ships in the repo and is imported by a
 * composition root at boot. A preset here is ordinary reviewed code in this repository — the seam
 * buys module-boundary honesty, not isolation.
 *
 * Architectural role:
 * In-module registry. No I/O; resolution is delegated to whatever a preset registered.
 */

/**
 * A preset's resolver: read the operator's environment and either produce a connection or decline.
 *
 * `null` means "the operator has not configured this one", and is the expected, silent, overwhelming
 * majority case — federation is off unless a site owner turns it on. THROWING means "the operator
 * asked for this connection and got the settings wrong", which is an error worth surfacing; a preset
 * must never paper over a half-configured connection by returning a broader one. `bootstrap.ts`
 * isolates and logs a throw per preset so one vendor's typo cannot disable another's working
 * connection.
 */
export type FederatedMcpPresetResolver = (env: NodeJS.ProcessEnv) => ResolvedFederatedConnection | null;

export interface FederatedMcpPreset {
  /** Stable identity of the PRESET MODULE (not of the connection it resolves). Used to keep a
   * double import from registering the same vendor twice; see {@link registerFederatedMcpPreset}. */
  readonly presetId: string;
  readonly resolve: FederatedMcpPresetResolver;
}

let presets: FederatedMcpPreset[] = [];

/**
 * Registers a preset, called once at composition-root boot by the preset's own module.
 *
 * Re-registering the same `presetId` REPLACES the earlier entry rather than appending. Unlike a
 * `<head>` contributor, a duplicate here would resolve to two connections with the same
 * `connectionId`, and `trust.ts` R1's collision assertion would then drop the second one whole —
 * producing a confusing "registered, then refused for shadowing itself" log for what is really just
 * a module imported from two places. Last registration wins, and registration order is otherwise
 * preserved so a replacement does not silently reorder connections.
 */
export function registerFederatedMcpPreset(preset: FederatedMcpPreset): void {
  const existing = presets.findIndex((candidate) => candidate.presetId === preset.presetId);
  if (existing >= 0) {
    presets[existing] = preset;
    return;
  }
  presets.push(preset);
}

/** Registration order. `bootstrap.ts` resolves in this order, and that order decides which
 * connection claims a contested tool id first (R1). */
export function listFederatedMcpPresets(): readonly FederatedMcpPreset[] {
  return presets;
}

/** Test-only reset of the module-level registry (mirrors `page-head.ts`'s
 * `resetPageHeadRegistry`, though that one is no longer test-only — see its own doc). */
export function resetFederatedMcpPresetsForTests(): void {
  presets = [];
}

/** The desktop/website wire identity stays host-owned; the transport advertises no capabilities. */
export const TOVU_MCP_CLIENT_INFO = { name: "tovu-assistant", version: "0.1.0" } as const;

/** Persisted approval hash domain: keep these bytes stable across the package migration. */
export const TOVU_MCP_APPROVAL_FINGERPRINT_DOMAIN = "g3-approval-v2";

/** Tovu owns settings vocabulary and model-facing refusal copy; protocol behavior lives in Jini.
 * The two quoted field labels (Allowed tools, Allowed to make changes) are the literal labels
 * the settings screen renders. Naming them exactly is the value of this text: "authorize the
 * write" is advice nobody can act on, and the second list is the one operators do not know exists.
 * Routine default-deny is excluded from boot enumeration, but an attempted missing tool still
 * needs its specific refusal and remediation explained.
 */
export const tovuFederationMessages: FederationMessages = {
  ...defaultFederationMessages,
  refusalExplanations: {
    "not-in-operator-allowlist": "the administrator has not allowed this tool for this connection. Fix: in Settings → External MCP, add it to \"Allowed tools\", then restart the assistant.",
    "remote-declares-not-read-only":
      "the server says this tool makes changes, and it is not in this connection's \"Allowed to make changes\" list. " +
      "Fix: in Settings → External MCP, add it to BOTH \"Allowed tools\" and \"Allowed to make changes\", then restart the assistant.",
    "remote-declares-destructive":
      "the server marks this tool as destructive. Tovu does not enable destructive external tools at all, and there is no " +
      "setting that turns this one on. Fix: there is none — the administrator would have to use this server's own interface directly.",
    "missing-or-invalid-input-schema":
      "the server published no usable input schema for it, so there is no contract to give you and the arguments would be guesswork. " +
      "Fix: this is the external server's bug, not a Tovu setting — the administrator should report it to that vendor.",
    "invalid-remote-tool-name":
      "the server advertised it under a name Tovu will not register (it must be letters, digits, '.', '-' or '_', at most 64 characters). " +
      "Fix: this is the external server's bug, not a Tovu setting.",
    "duplicate-remote-tool-name":
      "the server advertised the same tool name twice, and Tovu refuses the repeat rather than letting a second definition overwrite the first. " +
      "Fix: this is the external server's bug, not a Tovu setting.",
    "connection-tool-cap-reached":
      "this connection had already reached its maximum number of tools before reaching this one. " +
      "Fix: the administrator should shorten \"Allowed tools\" to the tools that are actually needed, then restart the assistant.",
  },
  unprintableName: "(a tool name this server sent that Tovu could not accept)",
  absentExplanation: 'the administrator allowed this tool, but the server does not offer a tool by that name — most likely a typo in "Allowed tools", or the server was started without the feature that provides it.',
  inertWriteGrantExplanation: 'the administrator put this tool in "Allowed to make changes" but not in "Allowed tools", so the grant does nothing at all. Fix: add the same name to "Allowed tools" too, then restart the assistant.',
  prefixHeading: "EXTERNAL TOOL AVAILABILITY — read this before telling anyone that a capability is missing or that you do not know why something failed.",
  prefixInstruction: "These external tools were withheld from your catalog when this assistant started. They are NOT in `search_tools`, `describe_tool` " +
    "cannot describe them, and calling them is impossible — their absence is a configuration decision that was already made, not a " +
    "missing feature and not a fault of yours. If a user asks for something one of these would do, say exactly which tool was withheld " +
    "and repeat the fix below verbatim. Never guess at, or invent, a different reason for the capability being unavailable. This list " +
    "is fixed for the lifetime of this assistant process: a setting changed now takes effect only after the assistant is restarted.",
  omittedRefusals: ({ omitted, total }) => `- …and ${omitted} more, for ${total} withheld in total. The administrator can see the complete list in Settings → External MCP.`,
  authenticationRefused: ({ method }) => `mcp-federation: the server refused '${method}' with 401 — its authorization has expired or been revoked, reconnect it in Settings → External MCP`,
  closedByHost: "closed by Tovu",
  nativeCollision: ({ toolId }) => `mcp-federation: federated tool id '${toolId}' collides with a natively-registered tool — an external server must never be able to shadow Tovu's own catalog`,
  confirmationWarning: ({ request }) => {
    const base = request.destructive
      ? `${request.connectionLabel} marks this tool as destructive: it can delete or overwrite data, and that may not be undoable.`
      : `This can change things in ${request.connectionLabel}.`;
    return request.writeShapedInputs.length
      ? `${base} Its input ${request.writeShapedInputs.join(", ")} looks like it can change data, so Tovu asks every time.` : base;
  },
  // Command basenames, including Windows suffixes, select the original installed-toolchain advice.
  launchUnavailable: ({ command, searchedDirs }) => {
    const name = command.replace(/\.(cmd|exe)$/i, "").split(/[\\/]/).pop();
    if (name === "uvx" || name === "uv") return 'This server needs "uvx" (from uv), which isn\'t installed on this computer. Tovu includes ' +
      "Node.js (node, npm, npx) but not uv. Install uv from https://docs.astral.sh/uv/ and restart Tovu.";
    if (name === "docker") return 'This server needs "docker", which isn\'t installed or isn\'t on this computer\'s standard ' +
      "paths. Install Docker Desktop, start it, then restart Tovu.";
    return `This server's command "${command}" wasn't found on this computer. Tovu searched: ${searchedDirs.join(", ")}.`;
  },
};
