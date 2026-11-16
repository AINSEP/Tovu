/**
 * check-admin-api-routes.ts — does every URL the admin client calls resolve to a registered route?
 *
 * Boots the hermetic `createApp()` (in-memory repos, nothing persisted), walks Express's router
 * stack, and matches every `request(...)` call in the admin's feature API clients
 * (`apps/admin/src/features/<feature>/api/*-api.ts`) and `lib/admin-http/urls.ts` against it, method
 * included. A miss means the admin calls a route no module registers — the "correct client,
 * unwired server" shape. `${...}` placeholders become a dummy segment (`${WORKSPACE_ID}` becomes
 * `workspace-local`); a placeholder that holds a whole query string or path suffix is dropped.
 *
 * Limits: only those files' `request(...)` calls whose URL is a literal (a variable URL is skipped) (the admin's raw `fetch` callers are few and hand-
 * checked); only routes the in-memory composition registers; relies on Express 4's `app._router`.
 *
 * Usage: env -u TOVU_ADMIN_PASSWORD TOVU_DB=memory node --import tsx development/scripts/check-admin-api-routes.ts
 * Exit: 0 when every call resolves, 1 otherwise.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp, createRouteDeps } from "../../apps/website/src/server/runtime/composition/app.js";
import { resolveRoute, type RouterLayer } from "./lib/admin-route-walk.js";

/** Reads a template/string literal starting at `start`, returning its raw body and end index. */
function readLiteral(src: string, start: number): { body: string; end: number } {
  const quote = src[start]!;
  let i = start + 1;
  let depth = 0;
  const consumeExpression = ({ c }: { c: string }, _options = {}): void => {
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === "\\") { i += 2; continue; }
    if (quote === "`" && depth === 0 && c === "$" && src[i + 1] === "{") { depth = 1; i += 2; continue; }
    if (depth > 0) {
      consumeExpression({ c });
      continue;
    }
    if (c === quote) return { body: src.slice(start + 1, i), end: i + 1 };
    i++;
  }
  return { body: src.slice(start + 1), end: src.length };
}

/** Placeholders that name a route VERB rather than an id, with one real value each. */
const SAMPLE_SEGMENTS: ReadonlyMap<string, string> = new Map([["action", "approve"]]);

function interpolationEnd({ body, start }: { body: string; start: number }, _options = {}): number {
  let depth = 1;
  let j = start;
  while (j < body.length && depth > 0) {
    if (body[j] === "{") depth++;
    else if (body[j] === "}") depth--;
    j++;
  }
  return j;
}

function concreteExpression(
  { expr, helpers }: { expr: string; helpers: ReadonlyMap<string, string> },
  _options = {},
): string {
  const helper = /^([A-Za-z_]\w*)\(/.exec(expr)?.[1];
  if (expr === "WORKSPACE_ID") return "workspace-local";
  else if (SAMPLE_SEGMENTS.has(expr)) return SAMPLE_SEGMENTS.get(expr)!;
  else if (helper && helpers.has(helper)) return concretise(helpers.get(helper)!, helpers);
  else if (/[?:]/.test(expr) && /["'`][?/]/.test(expr)) return "";
  else return "x1";
}

/** Replaces each balanced `${...}` with a concrete segment; one that starts with `?` or `/` content
 *  inside a conditional (a query string or optional suffix) is dropped. */
function concretise(body: string, helpers: ReadonlyMap<string, string>): string {
  let out = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "$" && body[i + 1] === "{") {
      const j = interpolationEnd({ body, start: i + 2 });
      const expr = body.slice(i + 2, j - 1).trim();
      out += concreteExpression({ expr, helpers });
      i = j;
    } else {
      out += body[i];
      i++;
    }
  }
  return out;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const adminSrc = path.join(repoRoot, "apps/admin/src");

/** Every file that holds admin API calls: one client per feature, plus the transport's URL builders. */
function clientFiles(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): string[] {
  const features = path.join(adminSrc, "features");
  const clients = readdirSync(features).flatMap((feature) => {
    const dir = path.join(features, feature, "api");
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((name) => name.endsWith("-api.ts")).map((name) => path.join(dir, name));
  });
  return [...clients, path.join(adminSrc, "lib/admin-http/urls.ts")].sort();
}

const app = createApp(createRouteDeps()) as unknown as { _router: { stack: RouterLayer[] } };
const misses: string[] = [];
let checked = 0;

/** Checks one file's `request(...)` calls; its path helpers are read from the same file. */
function checkFile({ file }: { file: string }, _optional: Record<string, never> = {}): void {
  const src = readFileSync(file, "utf8");
  const label = path.relative(repoRoot, file);
  // Path helpers of the form `function name(...): string { return `...`; }`.
  const helpers = new Map<string, string>();
  for (const m of src.matchAll(/function (\w+)\([^)]*\): string \{\s*return `([^`]*)`;/g)) helpers.set(m[1]!, m[2]!);
  for (const m of src.matchAll(/\brequest(?:<[^;]*?>)?\(\s*(?=[`"])/g)) {
    const start = m.index! + m[0].length;
    const { body, end } = readLiteral(src, start);
    const scope = src.slice(end, end + 600);
    const nextCall = scope.search(/\brequest(?:<|\()/);
    const method = /method:\s*"([A-Z]+)"/.exec(nextCall > 0 ? scope.slice(0, nextCall) : scope)?.[1] ?? "GET";
    const url = `/api/admin/v1${concretise(body, helpers).split("?")[0]}`;
    checked++;
    const result = resolveRoute(app._router.stack, method, url);
    if (result !== "ok") misses.push(`${result}\t${method} ${url}\t${label}:${src.slice(0, m.index).split("\n").length}`);
  }
}

const files = clientFiles();
if (files.length < 2) {
  console.log(`found no admin API client files under ${path.relative(repoRoot, adminSrc)}/features/*/api — the check has nothing to read`);
  process.exit(1);
}
for (const file of files) checkFile({ file });

console.log(`checked ${checked} admin request() calls`);
if (misses.length > 0) {
  console.log(misses.join("\n"));
  process.exit(1);
}
console.log("every admin request() call resolves to a registered route");
process.exit(0);
