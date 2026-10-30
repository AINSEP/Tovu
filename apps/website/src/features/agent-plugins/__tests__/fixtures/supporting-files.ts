import { withExtensionApprovalPolicy } from "../../../../assistant/assistant-tool-approval-policy.js";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createToolRegistry } from "@jini-ai/core";
import { resolveAgentPluginLayout } from "../../layout.js";
import { installAgentPlugin, type AgentPluginArchiveReaderPort } from "../../lifecycle.js";
import { registerInstalledAgentPluginTools } from "../../tool-registrations.js";
import { forceRemove } from "./force-remove.js";

export const SKILL_MARKDOWN = "---\nname: ui-ux-design\ndescription: Use when defining visual foundations.\n---\n# UI/UX Design\nLoad references/foundations.md before designing screens.\n";
export const FOUNDATIONS = "# Foundations\n\nDefine a stable visual foundation before designing individual screens.\n";

/** Real install, fixed site ports and real registrations; no env changes or module replacement. */
export async function installSupportingFilesFixture(
  _input: Record<string, never>,
  options: { readonly files?: Readonly<Record<string, string | Uint8Array>> } = {},
) {
  const root = await mkdtemp(path.join(tmpdir(), "tovu-skill-supporting-files-"));
  const agentPluginLayout = resolveAgentPluginLayout({ siteDir: root, env: {} });
  const workspaceId = "supporting-files";
  const files = {
    "plugin.json": JSON.stringify({ $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json", name: "ui-ux-design", version: "1.0.0" }),
    "skills/ui-ux-design/SKILL.md": SKILL_MARKDOWN,
    "skills/frontend-accessibility/SKILL.md": "---\nname: frontend-accessibility\ndescription: Use when checking accessible controls.\n---\n# Accessibility\n",
    "skills/ui-ux-design/references/foundations.md": FOUNDATIONS,
    ...options.files,
  };
  const archive = Buffer.from("supporting-files-real-install");
  const archiveReader: AgentPluginArchiveReaderPort = { async *entries() {
    for (const [entryPath, content] of Object.entries(files)) {
      const bytes = typeof content === "string" ? Buffer.from(content) : content;
      yield { kind: "file", entryPath, declaredSize: bytes.byteLength, executable: false, async *openReadStream() { yield bytes; } };
    }
  } };
  try {
    const installed = await installAgentPlugin({ archive, archiveReader, expectedSha256: createHash("sha256").update(archive).digest("hex"), layout: agentPluginLayout, workspaceId });
    const registry = createToolRegistry({});
    await registerInstalledAgentPluginTools(registry, { withExtensionApprovalPolicy, workspaceId, agentPluginLayout });
    return { root, registry, installed, workspaceId, agentPluginLayout, skillRoot: path.join(installed.packageRoot, "skills/ui-ux-design"), cleanup: () => forceRemove(root) };
  } catch (error) { await forceRemove(root); throw error; }
}
