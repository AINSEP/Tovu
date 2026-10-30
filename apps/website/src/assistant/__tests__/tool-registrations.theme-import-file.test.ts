import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolHandler } from "@jini-ai/core";

import { EgressRefusedError, type HttpClientPort, type HttpRequest, type HttpResponse } from "#src/platform/http/index";
import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { nativeToolMetadata } from "#src/contracts/core/tool-metadata/index";
import {
  buildImportThemeFileRegistrations,
  contributeImportThemeFileTools,
  importThemeFileAgentToolCatalog,
  importThemeFileDerivedRisk,
  type ImportThemeFileToolDeps,
} from "#src/features/theme/import-theme-file-tool";

/**
 * @file `theme_import_file_from_url` (2026-10-08) — the agent-tool seam over
 * `importThemeFileFromUrl`. The fetch/sniff/write rules are certified by
 * `features/theme/__tests__/theme-file-import.test.ts`; this suite proves what only the tool adds:
 * registration under its own domain, `theme.edit` checked before any fetch, the shared theme write
 * gate (`assertThemeFileWritable`), the live-theme reload, and caller-safe egress refusals.
 */

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

const WOFF2 = Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff, 0xfe, 0x80, 0x81, 0xc3, 0x28]);

class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly outcome: HttpResponse | Error) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    if (this.outcome instanceof Error) throw this.outcome;
    return this.outcome;
  }
}

const FONT_RESPONSE: HttpResponse = { status: 200, headers: {}, bodyText: "", bodyBytes: WOFF2, bodyTruncated: false };

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-import-file-tool-"));
  const dir = path.join(root, "match");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "match", name: "match", version: "1.0.0", tier: "declarative", engine: 1 }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), '{"type":"doc","content":[]}', "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), '{"type":"doc","content":[]}', "utf8");
  return root;
}

function fakeDeps(
  options: { deny?: readonly string[]; outcome?: HttpResponse | Error } = {},
): ImportThemeFileToolDeps & { asked: string[]; client: FakeHttpClient; logged: string[] } {
  const themesDir = makeThemesRoot();
  const asked: string[] = [];
  const logged: string[] = [];
  const client = new FakeHttpClient(options.outcome ?? FONT_RESPONSE);
  return {
    asked,
    client,
    logged,
    workspaceId: "ws-theme-import-file",
    themesDir,
    resolveActiveThemeId: async () => "match",
    siteBinding: { dir: themesDir },
    resolveRoots: () => ({ repo: themesDir, site: themesDir, custom: themesDir }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    mediaImportHttpClient: client,
    mediaImportEgressRefusalLog: (line) => logged.push(line),
    authorize: async (request) => {
      const permission = (request as { permission: string }).permission;
      asked.push(permission);
      return options.deny?.includes(permission) ? { allowed: false, reason: "insufficient_permission" } : { allowed: true, reason: "matched" };
    },
  };
}

function ctxFor(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-theme-import-file",
    principal: { id: "principal-under-test" } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

function handlerFor(routeDeps: ImportThemeFileToolDeps, toolId = "theme_import_file_from_url"): ToolHandler {
  const registration = buildImportThemeFileRegistrations(routeDeps).find((r) => r.descriptor.id === toolId);
  assert.ok(registration, "expected a registration for " + toolId);
  return registration.handler;
}

const FONT_INPUT = { themeId: "match", path: "assets/fonts/display.woff2", url: "https://fonts.example.com/display.woff2" };

test("theme_import_file_from_url: wires with its catalog schema, a mutating risk class, and search metadata", () => {
  const registrations = buildImportThemeFileRegistrations(fakeDeps());

  assert.deepEqual(registrations.map((r) => r.descriptor.id), ["theme_import_file_from_url", "theme_import_local_file"]);
  assert.deepEqual(registrations[0]?.descriptor.inputSchema, importThemeFileAgentToolCatalog[0]?.inputSchema);
  assert.equal(importThemeFileDerivedRisk.get("theme_import_file_from_url"), "mutates-durable-state");
  assert.equal(registrations[0]?.descriptor.readOnly, false);
  assert.match(String(nativeToolMetadata.byId.theme_import_file_from_url?.search?.keywords), /font/);
});

test("theme_import_file_from_url: the contributor registers under its own 'theme-import-file' domain key", () => {
  contributions.contributors.clear({});
  contributions.contributors.register({ contribution: contributeImportThemeFileTools() });
  assert.deepEqual(contributions.contributors.list({}).map((c) => c.domain), ["theme-import-file"]);
  contributions.contributors.clear({});
});

test("theme_import_file_from_url: writes the font into the theme and reports the reloaded theme's status", async () => {
  const routeDeps = fakeDeps();

  const result = await handlerFor(routeDeps)(ctxFor(FONT_INPUT));

  assert.deepEqual(result, {
    themeId: "match",
    path: "assets/fonts/display.woff2",
    contentType: "font/woff2",
    bytes: WOFF2.byteLength,
    sourceUrl: "https://fonts.example.com/display.woff2",
    status: "valid",
    errors: [],
  });
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(routeDeps.themesDir, "match", "assets/fonts/display.woff2"))), WOFF2);
  assert.deepEqual(routeDeps.asked, ["theme.edit"]);
});

test("theme_import_file_from_url: a principal without theme.edit is refused before any fetch", async () => {
  const routeDeps = fakeDeps({ deny: ["theme.edit"] });

  await assert.rejects(() => handlerFor(routeDeps)(ctxFor(FONT_INPUT)), /not authorized/);
  assert.equal(routeDeps.client.calls.length, 0);
});

test("theme_import_file_from_url: an unknown theme and a generated preview/ path are refused with the schema, before any fetch", async () => {
  for (const input of [{ ...FONT_INPUT, themeId: "nope" }, { ...FONT_INPUT, path: "preview/fonts/x.woff2" }, { ...FONT_INPUT, path: ".trash/x.woff2" }]) {
    const routeDeps = fakeDeps();
    await assert.rejects(() => handlerFor(routeDeps)(ctxFor(input)), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /"additionalProperties":false/, `${input.path}: schema travels with the refusal`);
      return true;
    });
    assert.equal(routeDeps.client.calls.length, 0, `${input.themeId}/${input.path}: refused before the network`);
  }
});

test("theme_import_file_from_url: an egress refusal reaches the caller without the resolved address, which is logged instead", async () => {
  const refusal = new EgressRefusedError(
    { message: "host 'meta.internal' resolved to 169.254.169.254 (link-local)" },
    { callerSafeMessage: "host 'meta.internal' resolves to a non-public address" },
  );
  const routeDeps = fakeDeps({ outcome: refusal });

  await assert.rejects(() => handlerFor(routeDeps)(ctxFor({ ...FONT_INPUT, url: "https://meta.internal/x.woff2" })), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /non-public address/);
    assert.doesNotMatch(error.message, /169\.254/);
    return true;
  });
  assert.equal(routeDeps.logged.length, 1);
  assert.match(routeDeps.logged[0]!, /theme_import_file_from_url egress refused: .*169\.254\.169\.254/);
  assert.equal(fs.existsSync(path.join(routeDeps.themesDir, "match", "assets")), false);
});

test("theme_import_file_from_url: with no refusal log wired, the egress refusal's resolved address goes to console.warn", async (t) => {
  const refusal = new EgressRefusedError(
    { message: "host 'meta.internal' resolved to 169.254.169.254 (link-local)" },
    { callerSafeMessage: "host 'meta.internal' resolves to a non-public address" },
  );
  const { mediaImportEgressRefusalLog: _wired, ...routeDeps } = fakeDeps({ outcome: refusal });
  const warned: unknown[] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warned.push(args); });

  await assert.rejects(() => handlerFor(routeDeps)(ctxFor({ ...FONT_INPUT, url: "https://meta.internal/x.woff2" })), /non-public address/);
  assert.equal(warned.length, 1);
  assert.match(String((warned[0] as unknown[])[0]), /theme_import_file_from_url egress refused: .*169\.254\.169\.254/);
});

test("theme_import_local_file: uses the same contributor, theme.edit gate, discovery and reload", async (t) => {
  const deps = fakeDeps();
  t.after(() => fs.rmSync(deps.themesDir, { recursive: true, force: true }));
  const custom = path.join(deps.themesDir, "custom"); fs.mkdirSync(custom);
  deps.resolveRoots = () => ({ site: deps.themesDir, custom, repo: deps.themesDir });
  fs.writeFileSync(path.join(custom, "font.woff2"), WOFF2);
  const result = await handlerFor(deps, "theme_import_local_file")(ctxFor({ themeId: "match", path: "assets/local.woff2", root: "custom", sourcePath: "font.woff2" }));
  assert.deepEqual(result, { themeId: "match", path: "assets/local.woff2", contentType: "font/woff2", bytes: WOFF2.length, sourcePath: "font.woff2", status: "valid", errors: [] });
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(deps.themesDir, "match/assets/local.woff2"))), WOFF2);
  assert.deepEqual(deps.asked, ["theme.edit"]);
  assert.equal(deps.client.calls.length, 0);
  assert.equal(importThemeFileDerivedRisk.get("theme_import_local_file"), "mutates-durable-state");
  assert.match(String(nativeToolMetadata.byId.theme_import_local_file?.search?.keywords), /local.*folder.*font/);
  const registration = buildImportThemeFileRegistrations(deps).find(r => r.descriptor.id === "theme_import_local_file")!;
  assert.equal(registration.descriptor.readOnly, false);
  assert.deepEqual((registration.descriptor.inputSchema as { properties: { root: { enum: string[] } } }).properties.root.enum, ["repo", "site", "custom"]);
});

test("theme_import_local_file: permission refusal precedes root resolution and any write", async (t) => {
  const deps = fakeDeps({ deny: ["theme.edit"] });
  t.after(() => fs.rmSync(deps.themesDir, { recursive: true, force: true }));
  deps.resolveRoots = () => { throw new Error("must not resolve roots before permission"); };
  await assert.rejects(() => handlerFor(deps, "theme_import_local_file")(ctxFor({ themeId: "match", path: "assets/local.woff2", root: "custom", sourcePath: "font.woff2" })), /not authorized/);
  assert.equal(fs.existsSync(path.join(deps.themesDir, "match/assets")), false);
});

test("theme_import_local_file: unknown/unset roots and unknown themes return actionable schema errors", async (t) => {
  const deps = fakeDeps();
  t.after(() => fs.rmSync(deps.themesDir, { recursive: true, force: true }));
  deps.resolveRoots = () => ({ repo: deps.themesDir, site: deps.themesDir, custom: undefined });
  const input = { themeId: "match", path: "assets/local.woff2", root: "custom", sourcePath: "font.woff2" };
  for (const override of [{ root: "other" }, { root: "custom" }, { themeId: "missing" }]) {
    await assert.rejects(() => handlerFor(deps, "theme_import_local_file")(ctxFor({ ...input, ...override })), /Schema for 'theme_import_local_file'/);
  }
  assert.equal(fs.existsSync(path.join(deps.themesDir, "match/assets")), false);
});

test("theme_import_local_file: preview, trash and compiled destinations refuse valid local fonts without writing", async (t) => {
  for (const [destination, compiled, refusal] of [
    ["preview/local.woff2", false, /read-only: this file is generated output \(build-preview/],
    [".trash/local.woff2", false, /is inside the trash and cannot be written to directly/],
    ["assets/local.woff2", true, /read-only: this file is generated output of a built theme/],
    ["src/local.woff2", true, /read-only: only framework source extensions can be written inside a compiled theme's build.sourceDir/],
  ] as const) {
    const deps = fakeDeps();
    t.after(() => fs.rmSync(deps.themesDir, { recursive: true, force: true }));
    // A valid source/root leaves the destination write gate as the only reason to refuse.
    fs.writeFileSync(path.join(deps.themesDir, "font.woff2"), WOFF2);
    if (compiled) deps.themes[0]!.manifest.build = { source: "compiled", sourceDir: "src" };
    await assert.rejects(() => handlerFor(deps, "theme_import_local_file")(ctxFor({
      themeId: "match", path: destination, root: "custom", sourcePath: "font.woff2",
    })), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Schema for 'theme_import_local_file'/);
      assert.match(error.message, refusal);
      return true;
    });
    assert.equal(fs.existsSync(path.join(deps.themesDir, "match", destination)), false, destination);
  }
});

// Owner s5 supersedes e0d811ab0 for picked-folder reads; unpicked paths remain denied.
test("site theme import refuses repo and unpicked paths before reading or creating output", async t => {
  const deps = fakeDeps();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-import-outside-'));
  t.after(() => { fs.rmSync(outside, { recursive: true, force: true }); fs.rmSync(deps.themesDir, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(outside, 'payload.woff2'), Buffer.concat([WOFF2, Buffer.from('OUTSIDE_CANARY_CONTENT')]));
  fs.writeFileSync(path.join(outside, 'OUTSIDE_CANARY_NAME.woff2'), WOFF2);
  deps.resolveRoots = () => ({ repo: outside, custom: deps.themesDir, site: deps.themesDir });
  const readSpy = t.mock.method(fs, 'createReadStream');
  for (const input of [{ root: 'repo', sourcePath: 'payload.woff2' }, { root: 'custom', sourcePath: path.relative(deps.themesDir, path.join(outside, 'payload.woff2')) }]) {
    await assert.rejects(() => handlerFor(deps, 'theme_import_local_file')(ctxFor({
      themeId: 'match', path: 'assets/private.woff2', ...input,
    })), error => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /OUTSIDE_CANARY_CONTENT|OUTSIDE_CANARY_NAME/);
      return true;
    });
  }
  assert.equal(readSpy.mock.callCount(), 0);
  assert.equal(fs.existsSync(path.join(deps.themesDir, 'match/assets/private.woff2')), false);
});
