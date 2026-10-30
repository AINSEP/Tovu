import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import sharp from "sharp";
import type { SurfaceEmission, ToolRegistration } from "@jini-ai/core";
import { createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore, type AssistantSurfaceDeps } from "@jini-ai/daemon/surface-exchanges";
import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { InMemoryAssetBlobRepo, InMemoryAssetRenditionRepo, InMemoryBlobStore, InMemoryMediaRepo, InMemoryMediaContentTypeStore, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import type { HttpRequest } from "#src/platform/http/index";
import type { AssetToolDeps } from "../../asset-transfer/asset-destinations.js";

/** Bounded async wait for the real approval surface in tool tests. */
export const until = async (check: () => boolean) => { for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 5)); };

/** Real files, actual media upload stores, fake guarded HTTP port and the existing exchange store. */
export async function assetToolHarness(t: TestContext, { build, toolId, custom = "picked", allowed = () => true }: {
  build: (deps: AssetToolDeps, surfaces: AssistantSurfaceDeps) => ToolRegistration[]; toolId: string;
  custom?: string; allowed?: (permission: string) => boolean;
}) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-asset-tool-")));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const site = path.join(base, "site"); const picked = path.join(base, "picked");
  const themesDir = path.join(site, "themes"); const theme = path.join(themesDir, "match");
  fs.mkdirSync(path.join(theme, "templates"), { recursive: true }); fs.mkdirSync(picked);
  fs.writeFileSync(path.join(theme, "theme.json"), JSON.stringify({ id: "match", name: "match", version: "1.0.0", tier: "declarative", engine: 1 }));
  fs.writeFileSync(path.join(theme, "tokens.json"), '{"--ink":"#000"}');
  fs.writeFileSync(path.join(theme, "styles.css"), "body{margin:0}");
  for (const name of ["home", "entry"]) fs.writeFileSync(path.join(theme, "templates", `${name}.json`), '{"type":"doc","content":[]}');
  const png = await sharp({ create: { width: 200, height: 100, channels: 4, background: "#c33" } }).png().toBuffer();
  for (const dir of [site, picked, base]) fs.writeFileSync(path.join(dir, "logo.png"), png);
  // A real image outside the site too, so only root containment (not a decode failure) can refuse it.
  fs.writeFileSync(path.join(base, "outside.png"), png);
  const clock = createSystemClock(); let ids = 0;
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock, idGenerator: { newId: () => "card-1" }, defaultChannel: "mcp-ui" });
  const controller = new AbortController(); t.after(() => controller.abort());
  const permissions: string[] = []; const requests: HttpRequest[] = [];
  const deps: AssetToolDeps = {
    workspaceId: "ws", siteBinding: { dir: site }, themesDir, resolveActiveThemeId: async () => "match",
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }), clock, idGen: { newId: () => `asset-${++ids}` },
    mediaRepo: new InMemoryMediaRepo({}), assetBlobRepo: new InMemoryAssetBlobRepo({}), assetRenditionRepo: new InMemoryAssetRenditionRepo({}),
    blobStore: new InMemoryBlobStore(), mediaContentTypeStore: new InMemoryMediaContentTypeStore(), transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}),
    mediaImportHttpClient: { send: async (request) => { requests.push(request); return { status: 200, headers: { "content-type": "image/png" }, bodyText: "", bodyBytes: png, bodyTruncated: false }; } },
    // custom "" = nothing picked (an undefined option would take the "picked" default).
    resolveRoots: () => ({ repo: base, site, custom: custom === "picked" ? picked : custom || undefined }),
    authorize: async ({ permission }) => { permissions.push(permission); return { allowed: allowed(permission), reason: "matched" }; },
  };
  const handler = build(deps, { surfaceExchanges: store }).find((r) => r.descriptor.id === toolId)!.handler;
  const emitted: SurfaceEmission[] = [];
  const call = (input: unknown, withSurface = true) => handler(
    { executionId: "e1", principal: { id: "owner-1" }, run: { id: "run-1" }, tool: { id: toolId }, input, signal: controller.signal } as never,
    withSurface ? { emitSurface: async (surface: SurfaceEmission) => { emitted.push(surface); } } : {},
  );
  const answer = (decision: "confirm" | "cancel") => store.deliver({ exchangeId: "card-1", principalId: "owner-1", params: { decision } }, { toolId });
  return { base, site, picked, themesDir, theme, deps, png, call, answer, emitted, permissions, requests };
}
