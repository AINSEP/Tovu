/**
 * @file Tool-call fix S5: "Reads…" wording must match the tool's real class.
 *
 * The registration kit (`@jini-ai/core` `registration-kit.ts`) derives `descriptor.readOnly` in one
 * place from the corroborated declared risk, so a tool built there can never be mislabelled. What
 * can still go wrong is the sentence a model reads first: `external_mcp_get_admissions` is a write
 * (starting federation may store a refreshed OAuth grant, so the read-only gateway refuses it) yet
 * its description began "Reads…". This test keeps wording, approval metadata and the hand-built
 * registrations aligned over the full production registry. It never relabels a tool read-only.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { realToolCatalog } from "./real-tool-catalog.fixture.js";

type Descriptor = { id: string; description?: string; readOnly?: boolean; metadata?: { approval?: { class?: string } } };

const READ_LIKE_OPENING = /^(Reads|Lists|Gets|Tests|Checks|Reports)\b/;
/** The fixed clause a write-class tool adds to its first sentence when it opens like a pure read. */
const FULL_GATEWAY_CLAUSE = "(needs the full gateway: it can store data)";
const WEBSITE_SRC = fileURLToPath(new URL("../../", import.meta.url));

const firstSentence = (text: string): string => text.split(/(?<=\.)\s/)[0] ?? "";

async function listedDescriptors(): Promise<readonly Descriptor[]> {
  const { registry } = await realToolCatalog();
  return registry.list({}) as readonly Descriptor[];
}

test("a write-class tool never opens like a pure read unless its first sentence names the full gateway", async () => {
  const offenders = (await listedDescriptors())
    .filter(d => d.readOnly !== true && READ_LIKE_OPENING.test(d.description ?? "") && !firstSentence(d.description ?? "").includes(FULL_GATEWAY_CLAUSE))
    .map(d => `${d.id}: ${(d.description ?? "").slice(0, 70)}`);
  assert.deepEqual(offenders, []);
});

test("the three external MCP tools that store a refreshed grant carry the clause and stay writes", async () => {
  const listed = await listedDescriptors();
  for (const id of ["external_mcp_get_admissions", "external_mcp_probe_connection", "external_mcp_test_connection"]) {
    const descriptor = listed.find(d => d.id === id);
    assert.ok(descriptor, `${id} is registered`);
    assert.equal(descriptor.readOnly, false, `${id} stays a write: the read-only gateway must keep refusing it`);
    assert.equal(descriptor.metadata?.approval?.class, "edit", id);
    assert.ok(firstSentence(descriptor.description ?? "").includes(FULL_GATEWAY_CLAUSE), `${id} first sentence names the full gateway`);
  }
});

test("approval class and the read-only flag agree for every registered tool", async () => {
  const mismatches: string[] = [];
  for (const d of await listedDescriptors()) {
    const approvalClass = d.metadata?.approval?.class;
    if (approvalClass === "read" && d.readOnly !== true) mismatches.push(`${d.id}: approval.class is read but readOnly is ${String(d.readOnly)}`);
    if (d.readOnly === true && approvalClass !== undefined && approvalClass !== "read") mismatches.push(`${d.id}: readOnly is true but approval.class is ${approvalClass}`);
  }
  assert.deepEqual(mismatches, []);
});

/**
 * Every place in source that sets or reads a tool's `readOnly` flag outside the registration kit,
 * with the evidence for the value. A new site must be listed here with its own evidence.
 */
const HAND_BUILT_FLAG_SITES: Readonly<Record<string, string>> = {
  "assistant/frontend-control-capabilities.ts": "forces readOnly: true on page.find_elements (queries the DOM), admin.capture_screenshot (rasterizes a copy) and chat.get_state (reads pane fields); doc comment above READ_ONLY_FRONTEND_CAPABILITY_IDS",
  "assistant/mcp-federation/registrations.ts": "only ever forces readOnly: false when the host policy needs approval; a remote declaration never grants read-only",
  "assistant/site/visitor-executor.ts": "defaults a visitor capability to readOnly: true; the visitor catalog is search_published_entries, get_published_entry, list_categories and site_guide, all reads of published content, and page tools set it from their own risk",
  "assistant/site/visitor-page-tools.ts": "readOnly: capability.risk === 'read' from the reviewed page-capability contract",
  "features/media/list-pending-chat-attachments.ts": "listPendingForOwner only filters the store's in-memory records; it claims, prunes and deletes nothing (comment beside the flag)",
  "server/inbound/assistant/agent-daemon-site-tools.ts": "parses the flag a site's own tool RPC reports; the site's registry already derived it through the kit",
  "server/inbound/assistant/durable-run-routes.ts": "local variable asking the registry whether a tool id is read-only; sets nothing",
};

/** Sites that match the scan but are not tool flags: SQLite open options and the open function itself. */
const NOT_A_TOOL_FLAG_SITES: readonly string[] = [
  "features/site-backup/share-database/repo.sqlite.ts",
  "platform/site-dir/read-applied-schema-identity.ts",
  "platform/site-dir/duplicate-content-db.ts",
  "platform/db/key-dependent-data.ts",
  "platform/db/kernel/drivers/sqlite.ts",
  "server/runtime/composition/other-site-keys.ts",
  "server/runtime/composition/peer-site-reads.ts",
  "server/runtime/composition/database-transfer-adapters.ts",
];

const FLAG_ASSIGNMENT = /\breadOnly\??(:| =)/;
const isSource = (path: string): boolean => path.endsWith(".ts") && !/(__tests__|__mocks__|fixtures|\.test\.|\.d\.ts)/.test(path);

function filesAssigningReadOnly(): string[] {
  return readdirSync(WEBSITE_SRC, { recursive: true, encoding: "utf8" })
    .filter(isSource)
    .filter(path => FLAG_ASSIGNMENT.test(readFileSync(`${WEBSITE_SRC}${path}`, "utf8")))
    .map(path => path.split("\\").join("/"))
    .sort();
}

test("every hand-built readOnly flag site is listed here with its handler evidence", () => {
  const known = [...Object.keys(HAND_BUILT_FLAG_SITES), ...NOT_A_TOOL_FLAG_SITES].sort();
  assert.deepEqual(filesAssigningReadOnly(), known);
  for (const [file, evidence] of Object.entries(HAND_BUILT_FLAG_SITES)) assert.ok(evidence.length > 20, `${file} needs real evidence`);
});
