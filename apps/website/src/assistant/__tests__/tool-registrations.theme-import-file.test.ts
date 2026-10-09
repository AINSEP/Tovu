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

function handlerFor(routeDeps: ImportThemeFileToolDeps): ToolHandler {
  const registration = buildImportThemeFileRegistrations(routeDeps).find((r) => r.descriptor.id === "theme_import_file_from_url");
  assert.ok(registration, "expected a 'theme_import_file_from_url' registration");
  return registration.handler;
}

const FONT_INPUT = { themeId: "match", path: "assets/fonts/display.woff2", url: "https://fonts.example.com/display.woff2" };

test("theme_import_file_from_url: wires with its catalog schema, a mutating risk class, and search metadata", () => {
  const registrations = buildImportThemeFileRegistrations(fakeDeps());

  assert.deepEqual(registrations.map((r) => r.descriptor.id), ["theme_import_file_from_url"]);
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
