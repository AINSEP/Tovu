/**
 * @file Structural guard for `MCP_UI_REDEEMABLE_TOOL_IDS` (2026-09-24 unwired-sink sweep).
 *
 * A tool that opens a `SurfaceExchangeStore` exchange parks until the human's click arrives at
 * `POST /api/admin/v1/mcp-ui/tool-calls`, and that endpoint refuses every tool id not on the
 * allowlist. Five tools shipped with a working dialog whose every click 403'd, the latest at the time
 * being `publish_content_publish` (43b80a2ed) — since deleted along with the tool itself
 * (`ADS-memory/.local-artifacts/publish-criteria-tool-webmcp-plan-2026-09-24.md` §4 S4) — because the
 * allowlist is maintained by hand in a different file from the tool. The per-id tests in
 * `mcp-ui-tool-calls.test.ts` only cover ids someone remembered to add. This test scans the source
 * for every `surfaceExchanges.open(...)` call instead, resolves its `toolId` constant, and requires
 * the id on the allowlist — and, conversely, requires every allowlisted id to be either an exchange
 * opener or a named carve-out.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { MCP_UI_REDEEMABLE_TOOL_IDS } from "../mcp-ui-tool-calls.js";

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Exchanges whose answer arrives on the A2UI action route (`a2ui-actions-route.ts`), not the
 *  MCP-UI tool-calls endpoint, so they need no allowlist entry. */
const A2UI_EXCHANGE_TOOL_IDS = new Set(["assistant_render_ui", "assistant_demo_a2ui"]);

/** `supabase-connect/tool-registrations.ts` opens its exchanges through one shared helper that takes
 *  `toolId` as a parameter; these are the ids its two tools pass. */
const PARAMETERISED_EXCHANGE_TOOL_IDS = new Set(["supabase_set_access_token", "supabase_set_project_scope"]);

/** Allowlisted without opening an exchange — see `mcp-ui-tool-calls.ts` for each justification. */
const NON_EXCHANGE_CARVE_OUTS = new Set(["content_post_search"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

interface ExchangeScan {
  /** Resolved tool ids, one per `surfaceExchanges.open(...)` call with a named constant. */
  readonly toolIds: ReadonlySet<string>;
  /** `file: CONSTANT` for every call whose `toolId` could not be resolved to a string literal. */
  readonly unresolved: readonly string[];
}

function scanExchangeOpeners(files: readonly string[]): ExchangeScan {
  const texts = files.map((file) => ({ file, text: readFileSync(file, "utf8") }));
  const constants = new Map<string, string>();
  for (const { text } of texts) {
    for (const m of text.matchAll(/\bconst ([A-Z][A-Z0-9_]*)(?:\s*:\s*[A-Za-z]+)?\s*=\s*"([a-z][a-z0-9_]*)"/g)) {
      if (!constants.has(m[1]!)) constants.set(m[1]!, m[2]!);
    }
  }
  const toolIds = new Set<string>();
  const unresolved: string[] = [];
  for (const { file, text } of texts) {
    // `requireHumanConfirm(ctx, surfaces, { toolId: X, ... })` (`contracts/core/human-confirm.ts`)
    // opens the exchange on its caller's behalf, so its calls count as openers too.
    for (const m of text.matchAll(/(?:surfaceExchanges\.open|requireHumanConfirm)\([^{)]*\{\s*toolId(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?/g)) {
      const name = m[1];
      if (name === undefined) continue; // shorthand `{ toolId, ... }` — see PARAMETERISED_EXCHANGE_TOOL_IDS
      const id = constants.get(name);
      if (id === undefined) unresolved.push(`${path.relative(SRC_ROOT, file)}: ${name}`);
      else toolIds.add(id);
    }
    // `humanConfirmedToolHandler(surfaces, { ..., dialog: (...) => ({ toolId: X, ... }) })` passes its
    // dialog spec to `requireHumanConfirm`, so each `dialog:` naming a `toolId` counts as an opener.
    for (const m of text.matchAll(/\bdialog:\s*\([^)]*\)\s*=>\s*\(\{\s*toolId\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/g)) {
      const id = constants.get(m[1]!);
      if (id === undefined) unresolved.push(`${path.relative(SRC_ROOT, file)}: ${m[1]}`);
      else toolIds.add(id);
    }
  }
  return { toolIds, unresolved };
}

function missingFromAllowlist(openers: ReadonlySet<string>, allowlist: ReadonlySet<string>): string[] {
  return [...openers, ...PARAMETERISED_EXCHANGE_TOOL_IDS]
    .filter((id) => !A2UI_EXCHANGE_TOOL_IDS.has(id) && !allowlist.has(id))
    .sort();
}

const scan = scanExchangeOpeners(sourceFiles(SRC_ROOT));

test("every surfaceExchanges.open(...) call names a toolId constant this scan can resolve", () => {
  assert.deepEqual(scan.unresolved, []);
});

test("the scan finds the known exchange openers (guards against a scan that silently matches nothing)", () => {
  for (const id of [
    "content_post_delete",
    "media_trash_asset",
    "trash_item",
    "assistant_render_ui",
    // Through `humanConfirmedToolHandler`'s `dialog:` spec, not a direct call.
    "taxonomy_execute_merge_term",
    "database_execute_migrate_forward",
    "backup_execute_restore",
  ]) {
    assert.ok(scan.toolIds.has(id), `expected the scan to find '${id}'`);
  }
});

test("every tool that opens an MCP-UI exchange is on MCP_UI_REDEEMABLE_TOOL_IDS", () => {
  assert.deepEqual(missingFromAllowlist(scan.toolIds, MCP_UI_REDEEMABLE_TOOL_IDS), []);
});

test("the completeness check reports a tool whose allowlist entry is missing", () => {
  const withoutTrash = new Set([...MCP_UI_REDEEMABLE_TOOL_IDS].filter((id) => id !== "media_trash_asset"));
  assert.deepEqual(missingFromAllowlist(scan.toolIds, withoutTrash), ["media_trash_asset"]);
});

test("every allowlisted id opens an exchange or is a named carve-out", () => {
  const unexplained = [...MCP_UI_REDEEMABLE_TOOL_IDS]
    .filter((id) => !scan.toolIds.has(id) && !PARAMETERISED_EXCHANGE_TOOL_IDS.has(id) && !NON_EXCHANGE_CARVE_OUTS.has(id))
    .sort();
  assert.deepEqual(unexplained, []);
});
