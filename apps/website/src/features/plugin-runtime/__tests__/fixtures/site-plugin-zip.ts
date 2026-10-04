import { createHash } from "node:crypto";
import { buildZipFixture } from "../../../agent-plugins/__tests__/fixtures/build-zip.js";

export async function sitePluginZip(required: { name?: string } = {}, _optional = {}) {
  const code = "throw new Error('ZIP MUST NOT EXECUTE');";
  const manifest = { id: "zip-test", name: required.name ?? "ZIP test", version: "1.0.0", engine: 1, sdkRange: "*", tier: "tier-3", capabilities: [], hooks: [], fields: [], integrity: { "server/index.mjs": `sha256-${createHash("sha256").update(code).digest("hex")}` } };
  return buildZipFixture([{ path: "tovu.plugin.json", content: JSON.stringify(manifest) }, { path: "server/index.mjs", content: code }]);
}
