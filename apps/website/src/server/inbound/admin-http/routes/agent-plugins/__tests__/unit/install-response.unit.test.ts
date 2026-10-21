import assert from "node:assert/strict";
import test from "node:test";

import { AgentPluginActivationsBusyError, AgentPluginActivationsUnreadableError, AgentPluginHostIncompatibleError, AgentPluginUpdateError, type AgentPluginSearchCandidate } from "@jini-ai/agent-plugins/lifecycle";
import { AgentPluginInstallError, type AgentPluginInstallErrorCode } from "../../../../../../../features/agent-plugins/lifecycle.js";
import { AgentPluginUploadError } from "#src/features/agent-plugins/install-upload";
import { agentPluginLifecycleFields, bodyParseRefusal, installErrorResponse, installedAgentPluginRow } from "../../install-response.js";

/**
 * @file Pure refusal and row builders behind `AGENT_PLUGIN_INSTALL_ZIP` (`install.ts`). Real error
 * classes, no fakes: each case pins the exact status, `{ code, error }` body, and operator warning.
 */

const UNPACKED = "The .zip is too big once unpacked: at most 4096 files, 16 MiB per file, 64 MiB in all.";
const FALLBACK = "This .zip contains files or links that plugins may not include.";
const installError = (code: AgentPluginInstallErrorCode) => new AgentPluginInstallError({ code, message: `private /host/path ${code}` });

test("bodyParseRefusal: an over-limit body is the actionable 413", () => {
  assert.deepEqual(bodyParseRefusal({ type: "entity.too.large" }), {
    status: 413, body: { code: "AGENT_PLUGIN_ARCHIVE_TOO_LARGE", error: "The .zip is larger than the 32 MiB limit." },
  });
});

test("bodyParseRefusal: any other parse failure is an unreadable upload", () => {
  assert.deepEqual(bodyParseRefusal(new Error("content encoding unsupported")), {
    status: 400, body: { code: "AGENT_PLUGIN_ARCHIVE_UNREADABLE", error: "The upload could not be read." },
  });
});

test("installErrorResponse: an unreadable archive upload is 400 with plain text", () => {
  assert.deepEqual(installErrorResponse(new AgentPluginUploadError("ARCHIVE_UNREADABLE", "yauzl: bad central directory")), {
    status: 400, body: { code: "AGENT_PLUGIN_ARCHIVE_UNREADABLE", error: "This file is not a readable .zip." },
  });
});

test("installErrorResponse: a taken plugin id is 409 pointing at Replace", () => {
  assert.deepEqual(installErrorResponse(new AgentPluginUploadError("PLUGIN_ID_TAKEN", "taken")), {
    status: 409, body: { code: "AGENT_PLUGIN_PLUGIN_ID_TAKEN", error: "This plugin ID is already installed. Choose Replace existing version to upgrade it." },
  });
});

test("installErrorResponse: other upload refusals are 409 with the upload error's own message", () => {
  assert.deepEqual(installErrorResponse(new AgentPluginUploadError("PLUGIN_BUNDLED", "A bundled plugin owns this ID.")), {
    status: 409, body: { code: "AGENT_PLUGIN_PLUGIN_BUNDLED", error: "A bundled plugin owns this ID." },
  });
});

test("installErrorResponse: an installer size refusal is 413", () => {
  assert.deepEqual(installErrorResponse(installError("ARCHIVE_TOO_LARGE")), {
    status: 413, body: { code: "AGENT_PLUGIN_ARCHIVE_TOO_LARGE", error: "The .zip is larger than the 32 MiB limit." },
  });
});

test("installErrorResponse: a publish failure is 500 with the fallback text and no host path", () => {
  assert.deepEqual(installErrorResponse(installError("PUBLISH_FAILED")), {
    status: 500, body: { code: "AGENT_PLUGIN_PUBLISH_FAILED", error: FALLBACK },
  });
});

test("installErrorResponse: a digest mismatch is 400 asking to retry", () => {
  assert.deepEqual(installErrorResponse(installError("DIGEST_MISMATCH")), {
    status: 400, body: { code: "AGENT_PLUGIN_DIGEST_MISMATCH", error: "The upload arrived damaged. Try again." },
  });
});

test("installErrorResponse: manifest refusals are 400 with their own text", () => {
  assert.deepEqual(
    [installErrorResponse(installError("MANIFEST_MISSING")).body.error, installErrorResponse(installError("MANIFEST_INVALID")).body.error],
    ["No plugin.json found. Put plugin.json at the top of the .zip, or inside one folder.", "plugin.json is not a valid Agent Plugin manifest."],
  );
});

test("installErrorResponse: every unpacked-size refusal shares one 400 message", () => {
  const codes: AgentPluginInstallErrorCode[] = ["TOO_MANY_ENTRIES", "FILE_TOO_LARGE", "DECOMPRESSION_BOMB", "TOTAL_SIZE_EXCEEDED"];
  assert.deepEqual(codes.map((code) => installErrorResponse(installError(code))), codes.map((code) => ({ status: 400, body: { code: `AGENT_PLUGIN_${code}`, error: UNPACKED } })));
});

test("installErrorResponse: an unsafe entry is 400 with the fallback text", () => {
  assert.deepEqual(installErrorResponse(installError("UNSAFE_ENTRY_PATH")), {
    status: 400, body: { code: "AGENT_PLUGIN_UNSAFE_ENTRY_PATH", error: FALLBACK },
  });
});

test("installErrorResponse: an unreadable activation record is 409 busy and logs the real cause", () => {
  const error = new AgentPluginActivationsUnreadableError({ filePath: "/ws/activations.json", reason: "invalid JSON" });
  assert.deepEqual(installErrorResponse(error), {
    status: 409,
    body: { code: "AGENT_PLUGIN_ACTIVATIONS_BUSY", error: "Could not install the plugin. Try again." },
    warning: `[agent-plugins] upload refused — ${error.message}`,
  });
});

test("installErrorResponse: a held activation lock is 409 busy and logs the real cause", () => {
  const error = new AgentPluginActivationsBusyError({ lockPath: "/ws/activations.lock", holder: undefined, lost: false });
  assert.deepEqual(installErrorResponse(error), {
    status: 409,
    body: { code: "AGENT_PLUGIN_ACTIVATIONS_BUSY", error: "Could not install the plugin. Try again." },
    warning: `[agent-plugins] upload refused — ${error.message}`,
  });
});

test("installErrorResponse: an unrecognised error is a redacted 500 with no warning", () => {
  assert.deepEqual(installErrorResponse(new Error("private /secret/layout")), { status: 500, body: { code: "INTERNAL_ERROR", error: "internal error" } });
});

const candidate: AgentPluginSearchCandidate = {
  pluginId: "note-taker",
  displayName: "Note Taker",
  summary: "Takes notes.",
  version: "1.0.0",
  description: "Longer text.",
  id: "acme/note-taker",
  provides: ["skills"],
  keywords: ["notes"],
  enabled: false,
  skills: [{ name: "note-taker", summary: "Takes notes." }],
  mcpServerIds: ["notes-mcp"],
};

test("installedAgentPluginRow: reports the list row fields and leaves out id and provides", () => {
  assert.deepEqual(installedAgentPluginRow(candidate), {
    pluginId: "note-taker", displayName: "Note Taker", summary: "Takes notes.", version: "1.0.0", description: "Longer text.",
    keywords: ["notes"], enabled: false, skills: [{ name: "note-taker", summary: "Takes notes." }], mcpServerIds: ["notes-mcp"],
    // A candidate without lifecycle metadata reports none: no origin, digest or host verdict, empty lists.
    origin: undefined, hostOk: undefined, missingRequires: [], requiredBy: [], archiveDigest: undefined,
  });
});

test("installedAgentPluginRow: omitted display metadata becomes explicit nulls", () => {
  const row = installedAgentPluginRow({ pluginId: "bare", keywords: [], enabled: true, skills: [], mcpServerIds: [] });
  assert.deepEqual(row, { pluginId: "bare", displayName: null, summary: null, version: null, description: null, keywords: [], enabled: true, skills: [], mcpServerIds: [],
    origin: undefined, hostOk: undefined, missingRequires: [], requiredBy: [], archiveDigest: undefined });
});

test("installedAgentPluginRow: a plugin the read model does not list is null", () => {
  assert.equal(installedAgentPluginRow(undefined), null);
});

test("agentPluginLifecycleFields: passes origin, host verdict, requirements, dependents and digest through", () => {
  const digest = "d".repeat(64);
  assert.deepEqual(agentPluginLifecycleFields({ candidate: { ...candidate, origin: "bundled", hostOk: false, missingRequires: ["x:y"], requiredBy: ["consumer needs mail:send"], archiveDigest: digest } }), {
    origin: "bundled", hostOk: false, missingRequires: ["x:y"], requiredBy: ["consumer needs mail:send"], archiveDigest: digest,
  });
});

test("installErrorResponse: every update refusal is 409 with the lifecycle owner's code and message", () => {
  for (const code of ["PLUGIN_CHANGED", "PLUGIN_DOWNGRADE_REFUSED", "PLUGIN_BUNDLED", "PLUGIN_UPDATE_PENDING", "PLUGIN_ID_MISMATCH", "PLUGIN_UPDATE_PATH_UNSAFE", "PLUGIN_MCP_PROVISION_FAILED"]) {
    assert.deepEqual(installErrorResponse(new AgentPluginUpdateError({ code, message: `Refused: ${code}.` })), { status: 409, body: { code, error: `Refused: ${code}.` } });
  }
});

test("installErrorResponse: an incompatible host is 409 PLUGIN_HOST_INCOMPATIBLE", () => {
  const response = installErrorResponse(new AgentPluginHostIncompatibleError({ pluginId: "future-only" }));
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "PLUGIN_HOST_INCOMPATIBLE");
  assert.match(response.body.error, /future-only/);
});
