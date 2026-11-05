import { dispatchJsonRequest } from "#src/server/__tests__/helpers/in-process-http";
import { createTempSiteLayoutFixture } from "#src/__tests__/fixtures/site-layout-context";
import { registerSkillsListRoute } from "../../routes/skills/list.js";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import express from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { registerAdminSiteImportRoutes } from "../../routes/system/site-imports.js";
import { registerAdminRecoveryRestoreRoutes, sendRecoveryError } from "../../routes/recovery/restore.js";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";
import { newsletterErrorToResponse } from "../newsletter.js";
import { widgetErrorToResponse } from "../widgets.js";
import { importErrorResponse } from "../../routes/publish-content/import-errors.js";
import { mappedErrorResponse } from "../../routes/publish-content/route-helpers.js";
import { installErrorResponse } from "../../routes/agent-plugins/install-response.js";
import { sendAdminFailure } from "../../routes/system/site-share-errors.js";

function fixture(error: unknown, tracked: unknown[]) {
  const app = express();
  const tracker = { error: (...args: unknown[]) => tracked.push(args) };
  app.use((req, res, next) => {
    res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session";
    res.locals.adminFailureTracker = tracker;
    req.body = req.path.includes("site-imports") ? { uploadId: "00000000-0000-0000-0000-000000000000" } : { restorePointId: "rp" };
    next();
  });
  const fail = async () => { throw error; };
  const deps = { workspaceId: "ws", tracker, authorize: async () => ({ allowed: true }),
    siteImportBackend: { importBackup: fail, list: fail, upload: fail, get: () => { throw error; }, completeOwner: fail },
    dbOps: { getCapabilities: fail }, gatedMutations: { gatewayDeps: { authorizeInstance: fail } },
  } as unknown as RouteDeps;
  registerAdminSiteImportRoutes({ app, deps });
  registerAdminRecoveryRestoreRoutes(app, deps);
  return app;
}

for (const url of ["/api/admin/v1/workspaces/ws/site-imports", "/api/admin/v1/recovery/restore/plan"]) {
  test(`${url}: unexpected exceptions are private, redacted and correlated`, async t => {
    const secret = "ghp_" + "x".repeat(36), tracked: unknown[] = [], logs: unknown[][] = [];
    t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
    const response = await dispatchJsonRequest(fixture(new Error(`disk /private/site.db unavailable ${secret}`), tracked), "POST", url);
    const body = response.body as Record<string, string>;
    assert.equal(response.status, 500);
    assert.equal(typeof body.errorId, "string");
    assert.match(body.message ?? body.error, new RegExp(body.errorId));
    assert.equal(JSON.stringify(body).includes("/private/site.db"), false);
    assert.equal(logs.length, 1);
    assert.match(JSON.stringify(logs), /disk \/private\/site.db unavailable/);
    assert.equal(JSON.stringify(logs).includes(secret), false);
    assert.equal(tracked.length, 1);
    assert.match(String((tracked[0] as any[])[0].error.message), /disk/);
    assert.equal(String((tracked[0] as any[])[0].error.message).includes(secret), false);
    assert.ok(JSON.stringify(logs).includes(body.errorId));
    assert.ok(JSON.stringify(tracked).includes(body.errorId));
  });
}

test("import expected refusals keep their diagnosis without reporting an incident", async t => {
  const logs: unknown[][] = [], tracked: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const response = await dispatchJsonRequest(fixture(new SiteShareRefusal({ code: "NOT_FOUND", message: "Upload expired." }), tracked), "POST", "/api/admin/v1/workspaces/ws/site-imports");
  const body = response.body as Record<string, string>;
  assert.equal(response.status, 404);
  assert.deepEqual(body, { code: "NOT_FOUND", message: "Upload expired." });
  assert.deepEqual(logs, []); assert.deepEqual(tracked, []);
});

test("restore gateway Result errors have the same private diagnostic envelope as thrown exceptions", t => {
  const secret = "ghp_" + "x".repeat(36), logs: unknown[][] = [], tracked: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  let status = 0, body: any;
  const res = { locals: { adminFailureTracker: { error: (value: unknown) => tracked.push(value) } },
    status: (value: number) => { status = value; return { json: (value: unknown) => { body = value; } }; } };
  sendRecoveryError(res as any, { code: "INTERNAL_ERROR", message: `database failed ${secret}` });
  assert.equal(status, 500);
  assert.equal(typeof body.errorId, "string");
  assert.ok(body.error.includes(body.errorId));
  assert.equal(body.error.includes(secret), false);
  assert.equal(logs.length, 1); assert.equal(tracked.length, 1);
  assert.equal(JSON.stringify(logs).includes(secret), false);
});

test("the recorded duplicate-skill-name refusal remains actionable while unexpected discovery errors stay private", async t => {
  const site = createTempSiteLayoutFixture({});
  t.after(site.cleanup);
  const root = site.deps.skillLayout.forWorkspace("workspace-local").root;
  for (const name of ["first", "second"]) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: duplicate\ndescription: A test skill.\n---\nGuidance.\n");
  }
  const logs: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerSkillsListRoute(app, { ...site.deps, workspaceId: "workspace-local", authorize: async () => ({ allowed: true, reason: "test" }) });
  const response = await dispatchJsonRequest(app, "GET", "/api/admin/v1/workspaces/workspace-local/skills");
  const body = response.body as Record<string, string>;
  assert.equal(response.status, 500);
  assert.equal(body.code, "INTERNAL_ERROR");
  const prefix = "skills: 'duplicate' is declared by more than one installed skill folder ";
  const suffix = " — both would register the same tool id 'skill_duplicate'; rename one skill's frontmatter 'name' to disambiguate";
  assert.ok(["('first' and 'second')", "('second' and 'first')"].some(order => body.error === prefix + order + suffix));
  assert.deepEqual(logs, []);
});

for (const broken of ["logger", "tracker"]) {
  test(`a failing ${broken} cannot suppress the private 500 or prevent the other diagnostic sink`, t => {
    let logged = 0, tracked = 0, status = 0, body: any;
    t.mock.method(console, "error", () => { logged++; if (broken === "logger") throw new Error("logger unavailable"); });
    const tracker = { error: () => { tracked++; if (broken === "tracker") throw new Error("tracker unavailable"); } };
    const res = { status: (value: number) => { status = value; return { json: (value: unknown) => { body = value; } }; } };
    sendAdminFailure({ res, tracker, error: new Error("private path") });
    assert.equal(status, 500);
    assert.equal(typeof body.errorId, "string");
    assert.equal(body.error, `The admin request could not finish. Check whether your change was saved, then copy the error ID and report this problem. (error ${body.errorId})`);
    assert.equal(logged, 1); assert.equal(tracked, 1);
  });
}

for (const [name, map] of Object.entries({
  newsletter: newsletterErrorToResponse,
  widgets: widgetErrorToResponse,
  publishing: importErrorResponse,
  peers: (error: unknown, options: Parameters<typeof importErrorResponse>[1]) => mappedErrorResponse(error, [], options),
  installation: installErrorResponse,
})) {
  test(`${name}: the mapping fallback reports Error and non-Error exceptions without leaking details`, t => {
    const secret = "ghp_" + "x".repeat(36);
    const logs: unknown[][] = [], tracked: any[] = [];
    t.mock.method(console, "error", (...args: unknown[]) => logs.push(args));
    for (const error of [new Error(`private ${secret}`), `private ${secret}`, null]) {
      const failure = map(error, { tracker: { error: (...args: unknown[]) => { tracked.push(args); } } });
      const body = failure.body as Record<string, unknown>;
      assert.equal(failure.status, 500);
      assert.equal(body.code, "INTERNAL_ERROR");
      assert.match(String(body.errorId), /^[0-9a-f-]{36}$/);
      assert.equal(body.error, name === "publishing"
        ? `The content import could not finish. Check import history for content already applied before trying again. Copy details and report this problem. (error ${body.errorId})`
        : `The admin request could not finish. Check whether your change was saved, then copy the error ID and report this problem. (error ${body.errorId})`);
      assert.ok(JSON.stringify(logs.at(-1)).includes(String(body.errorId)));
      assert.ok(JSON.stringify(tracked.at(-1)).includes(String(body.errorId)));
      assert.equal(JSON.stringify(logs).includes(secret), false);
      assert.equal(String(tracked.at(-1)[0].error.message).includes(secret), false);
    }
    assert.equal(logs.length, 3); assert.equal(tracked.length, 3);
  });
}

function isDirect500(node: ts.Node, source: ts.SourceFile): boolean {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false;
  return node.expression.name.text === "status" && node.arguments[0]?.getText(source) === "500";
}

function isExpectedRefusal(node: ts.Node, source: ts.SourceFile): boolean {
  let ancestor = node.parent;
  while (ancestor && !ts.isIfStatement(ancestor) && !ts.isFunctionLike(ancestor)) ancestor = ancestor.parent;
  return !!ancestor && ts.isIfStatement(ancestor) && /^(?:err|error) instanceof (PluginLoadError|PublishTrustConnectError|ToolInputError)$/.test(ancestor.expression.getText(source));
}

/** Returned bodies catch mapping owners whose callers compute their HTTP status indirectly. */
function isUnreported500Body(node: ts.Node, source: ts.SourceFile): boolean {
  if (!ts.isObjectLiteralExpression(node)) return false;
  const properties = new Map(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(source), p.initializer]));
  return properties.get("status")?.getText(source) === "500" && properties.has("body") && !properties.get("body")!.getText(source).includes("pluginHookFailedBody");
}

/** Pre-existing blanket Error-to-4xx catches whose producers still throw plain Error for refusals the
 * admin UI shows verbatim. Changing their status needs typed producer refusals first (open bug), so
 * they are listed here rather than turned into 500s right before a release. Do not add to this list. */
const KNOWN_BLANKET_REFUSAL_CATCHES = new Set(["routes/publish-content/backstop.ts", "routes/sites/sites-home.ts"]);

/** A blanket Error check cannot establish that an exception is safe to disclose as 4xx. */
function isUnclassifiedCatch(node: ts.Node, source: ts.SourceFile): boolean {
  if (!ts.isCatchClause(node)) return false;
  if (KNOWN_BLANKET_REFUSAL_CATCHES.has(path.relative(path.resolve("apps/website/src/server/inbound/admin-http"), source.fileName))) return false;
  const text = node.block.getText(source);
  return /instanceof Error\s*\?\s*\w+\.message/.test(text) && !text.includes("sendAdminFailure") && !text.includes("adminFailureResponse");
}

test("class guard: admin route error mappings send unexpected 500s through the shared diagnostic handler", () => {
  const root = path.resolve("apps/website/src/server/inbound/admin-http");
  const violations: string[] = [];
  for (const entry of fs.readdirSync(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name.includes(".test.") || entry.parentPath.includes("__tests__")) continue;
    const file = path.join(entry.parentPath, entry.name);
    if (!/\/(routes|http)\//.test(file) || file.endsWith("site-share-errors.ts") || file.endsWith("plugin-hook-error.ts")) continue;
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if ((isDirect500(node, source) && !isExpectedRefusal(node, source)) || isUnreported500Body(node, source) || isUnclassifiedCatch(node, source)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        violations.push(`${path.relative(root, file)}:${line}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.deepEqual(violations, [], "Unexpected failures must use the shared handler (typed refusals remain local).\n" + violations.join("\n"));
});
