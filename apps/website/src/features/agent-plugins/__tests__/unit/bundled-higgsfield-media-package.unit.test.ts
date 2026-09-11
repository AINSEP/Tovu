import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { classifyAgentPluginMcpServerTrust } from "../../capability-projection.js";
import { parseAgentPluginManifest, parseAgentPluginMcpConfig } from "../../manifest.js";
import { packAgentPluginDirectory } from "../../bundled-source-archive.js";

/**
 * @file The `higgsfield-media` bundled Agent Plugin's package is VALID, INSTALLABLE, and still says
 * the specific things it was built to say.
 *
 * Mirrors `bundled-tovu-deploy-fly-package.unit.test.ts` and
 * `bundled-site-compliance-package.unit.test.ts` deliberately — same three kinds of assertion, for
 * the same reasons.
 *
 * The content assertions here are not decoration. Every one of them locks a fact that was
 * established by driving the LIVE integration on 2026-09-09 (media asset
 * `c881a51f-5b41-4aec-b806-e5624e1e1208`), and every one is a fact a reader would otherwise get
 * wrong from generic MCP knowledge:
 *
 * - `generate_image` is ASYNCHRONOUS. It returns a job id, never an image. An edit that softened
 *   this would produce an assistant that reports a generation nobody can find.
 * - `job_status` with `sync: true` CANNOT complete over the hosted federated transport: Higgsfield
 *   polls server-side for ~25s, Tovu aborts the request at 15,000ms. The numbers are the argument,
 *   so the numbers are asserted.
 * - A federated write tool needs BOTH allowlists. The refusal is invisible from inside a run, which
 *   is exactly why the file must forbid guessing at it — that guess is the original defect.
 * - The plan gate rejects models at SUBMIT time with a fixed string. Losing the string loses the
 *   ability to recognise it.
 *
 * Plus one assertion the other two packages do not need: the package must carry NO credential
 * material. This plugin documents an OAuth-authenticated third-party server, so it is the bundled
 * package most likely to acquire a pasted token during a well-meaning edit.
 */

const PACKAGE_ROOT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins/higgsfield-media");
const SKILL_DIR = path.join(PACKAGE_ROOT, "skills", "higgsfield-media");

async function readPackageFile(relativePath: string): Promise<string> {
  return readFile(path.join(PACKAGE_ROOT, relativePath), "utf8");
}

async function readSkill(): Promise<string> {
  return readFile(path.join(SKILL_DIR, "SKILL.md"), "utf8");
}

async function readReference(name: string): Promise<string> {
  return readFile(path.join(SKILL_DIR, "references", name), "utf8");
}

test("plugin.json parses under the Agent Plugins v1.0.0 validator", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok && parsed.manifest.name, "higgsfield-media");
  assert.deepEqual(parsed.ok ? parsed.warnings : ["unreachable"], []);
});

test("plugin.json's keywords carry the vocabulary an operator would actually search for", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  const keywords = new Set(parsed.ok ? (parsed.manifest.keywords ?? []) : []);
  for (const expected of ["higgsfield", "image", "image-generation", "media", "media-library", "external-mcp"]) {
    assert.ok(keywords.has(expected), `plugin.json keywords must include '${expected}' — it is a primary discovery term`);
  }
});

/**
 * 2026-09-10: OWNER-OVERRULED. This test used to assert mcp.json declared ZERO servers, on the
 * premise that a plugin's own mcp.json was structurally inert (`capability-projection.ts`'s old
 * unconditional `execute: { kind: "unavailable" }`) and that only an operator-typed Settings row
 * could express the real connection. That premise is gone — see
 * `capability-projection.ts`'s header for the full argument. This package now DECLARES the
 * connection Higgsfield's own verified discovery metadata establishes (streamable-http,
 * `https://mcp.higgsfield.ai/mcp`, OAuth-only, no API key, a public client per its own
 * `token_endpoint_auth_methods_supported: [..., "none"]` — see
 * `ADS-memory/reports/2026-09-10-higgsfield-mcp-research.md`), and `federate-mcp.ts` auto-creates
 * the external-MCP row when an operator enables this plugin — no more hand-typing the URL.
 */
test("mcp.json declares the real higgsfield connection, auto-admitted per classifyAgentPluginMcpServerTrust", async () => {
  const parsed = parseAgentPluginMcpConfig(JSON.parse(await readPackageFile("mcp.json")));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  assert.deepEqual(parsed.config.serverIds, ["higgsfield"]);
  const server = parsed.config.servers.higgsfield;
  assert.deepEqual(server, { type: "streamable-http", url: "https://mcp.higgsfield.ai/mcp", tovuAuthMode: "oauth" });

  // Remote + oauth carries no secret and no local execution, so it auto-admits — never requires the
  // stdio confirmation gate. This is the one classification `federate-mcp.ts`'s wiring depends on.
  assert.ok(server, "expected the server to have parsed");
  if (server) assert.equal(classifyAgentPluginMcpServerTrust(server), "auto-admit");
});

test("the eponymous skill folder exists — run-start injection resolves skills/<pluginId>/SKILL.md by that exact name", async () => {
  assert.ok((await readSkill()).length > 0);
});

test("the package packs through the real installer's own packer, references included", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);

  assert.ok(packed.files.includes("plugin.json"));
  assert.ok(packed.files.includes("mcp.json"));
  assert.ok(packed.files.includes("skills/higgsfield-media/SKILL.md"));

  for (const reference of [
    "skills/higgsfield-media/references/models-and-plan-gates.md",
    "skills/higgsfield-media/references/failure-modes.md",
  ]) {
    assert.ok(packed.files.includes(reference), `${reference} must survive packing — SKILL.md sends the agent to it to diagnose`);
  }

  assert.match(packed.sha256, /^[a-f0-9]{64}$/);
});

test("SKILL.md points at every reference file that exists — an unreferenced reference is never read", async () => {
  const references = (await readdir(path.join(SKILL_DIR, "references"))).sort();
  assert.deepEqual(references, ["failure-modes.md", "models-and-plan-gates.md"]);

  const skill = await readSkill();
  for (const reference of references) {
    assert.ok(skill.includes(`references/${reference}`), `SKILL.md must point at references/${reference}`);
  }
});

test("SKILL.md says EARLY and plainly that generate_image returns a job id, not an image", async () => {
  const skill = await readSkill();
  assert.match(skill, /does not return an image/i);
  assert.match(skill, /job id/i);

  // "Early" is part of the rule: an assistant that reads the pipeline before the warning will have
  // already decided the call succeeded. Same discipline as tovu-deploy-fly's code-not-content rule.
  const position = skill.search(/does not return an image/i);
  assert.ok(position >= 0 && position < skill.length / 4, "the async warning must appear in the first quarter of SKILL.md");
});

test("SKILL.md forbids sync:true AND carries the two numbers that make it unarguable", async () => {
  const skill = await readSkill();
  assert.match(skill, /sync/);
  assert.match(skill, /15,?000\s*ms|15\s*s\b/i, "the 15s Tovu-side abort must be stated");
  assert.match(skill, /~?25\s*second|~?25\s*s\b/i, "the ~25s Higgsfield-side internal poll must be stated");

  // The remedy has to be named, not merely the hazard — a prohibition with no alternative gets
  // ignored the moment the agent needs the result.
  assert.match(skill, /without\s+\*?\*?`?sync/i);
});

test("SKILL.md documents the TWO-list write grant and quotes the exact refusal line", async () => {
  const skill = await readSkill();
  assert.match(skill, /remote-declares-not-read-only/);
  assert.match(skill, /writeAllowedToolNames/);
  assert.match(skill, /may write/i);

  // The two-ticks-not-one framing is the part operators get wrong; keep it explicit.
  assert.match(skill, /both/i);
});

test("SKILL.md states that federation config is read at daemon start, so a saved grant needs a restart", async () => {
  const skill = await readSkill();
  assert.match(skill, /daemon start/i);
  assert.match(skill, /Restart the assistant/);
});

test("SKILL.md forbids inventing a cause for an absent or refused federated tool", async () => {
  const skill = await readSkill();

  // This is the original defect the whole integration lost two sessions to: asked why it could not
  // generate, the assistant produced a plausible, wrong sentence. The prohibition is the point of
  // the plugin, so it is asserted rather than trusted to survive editing.
  assert.match(skill, /never explain an absent .* by guessing|Do not invent a reason/i);
  assert.match(skill, /invented/i, "the file must say this actually happened, not merely that it would be bad");
});

test("SKILL.md records the plan gate's exact string and the model that works", async () => {
  const skill = await readSkill();
  assert.match(skill, /Requires basic plan or higher/);
  assert.match(skill, /z_image/);
  assert.match(skill, /gpt_image_2/);

  const models = await readReference("models-and-plan-gates.md");
  assert.match(models, /Requires basic plan or higher/);
  // The free-trial allowance reads like an escape hatch and is not one.
  assert.match(models, /available:\s*false|available.{0,8}false/i);
  assert.match(models, /use_unlim/);
});

/**
 * The cold-start facts, established 2026-09-09 by reading the live connection row and fetching
 * Higgsfield's own published metadata (both well-known documents returned 200). They are asserted
 * for the same reason every other content assertion in this file is: an assistant that gets these
 * wrong does active harm. Asking an operator for a "Higgsfield API key" sends them hunting for a
 * credential that does not exist, and promising an in-chat connect that this deployment cannot
 * finish strands them mid-journey.
 */
test("SKILL.md says the auth is OAuth — never an API key — and that Tovu mints its own client", async () => {
  const skill = await readSkill();

  // The grant, verified against the live row's own `oauth_grant`.
  assert.match(skill, /authorization_code/);
  // The correction that matters most: there is no key to paste. An edit that drops this reopens the
  // exact wrong question ("what's your API key?").
  assert.match(skill, /no API key to paste/i);
  // Discovery + dynamic registration is WHY the operator supplies only a URL. Losing it turns a
  // one-field form into an interrogation for a client id and two endpoints nobody can produce.
  assert.match(skill, /8414|9728|7591/);
  assert.match(skill, /registration_endpoint|dynamic client registration/i);
  assert.match(skill, /only thing a human supplies is the URL/i);
});

test("SKILL.md is honest that the cold start leaves chat — the enable step, and TOVU_PUBLIC_URL", async () => {
  const skill = await readSkill();

  // No assistant tool wraps AGENT_PLUGIN_SET_ENABLED, so a disabled bundled plugin can only be
  // turned on from the admin screen — and its own `agent_plugin_*` tool does not exist until the
  // next daemon boot. Both halves have to survive an edit.
  assert.match(skill, /AGENT_PLUGIN_SET_ENABLED/);
  assert.match(skill, /Agent Plugins/);
  assert.match(skill, /restart/i);

  // `external_mcp_oauth_connect` refuses outright when TOVU_PUBLIC_URL is unset, because a tool call
  // has no live request to derive a callback origin from. Naming the variable is what makes the
  // refusal recognisable instead of looking like Higgsfield being down.
  assert.match(skill, /TOVU_PUBLIC_URL/);
  assert.match(skill, /Settings → External MCP/);
});

test("plugin.json's keywords also reach an operator who says 'photo' or 'illustration'", async () => {
  const parsed = parseAgentPluginManifest(JSON.parse(await readPackageFile("plugin.json")));
  assert.equal(parsed.ok, true);
  const keywords = (parsed.ok ? (parsed.manifest.keywords ?? []) : []).map((keyword) => keyword.toLowerCase());

  // Measured, not guessed: against the real installed catalog on 2026-09-09, "photo" and
  // "illustration" scored ZERO — `rankInstalledAgentPlugins` drops a zero-scoring candidate, so this
  // plugin was unreachable by either word. `search_agent_plugin_local` matches by substring, so the
  // synonyms have to be present as keywords; nothing else in the package contains them.
  for (const term of ["photo", "illustration", "picture", "art"]) {
    assert.ok(
      keywords.some((keyword) => keyword.includes(term)),
      `plugin.json keywords must reach an operator who searches "${term}" — got ${JSON.stringify(keywords)}`,
    );
  }

  // The connect vocabulary matters for the same reason: the cold start begins with someone asking to
  // "connect" or "sign in" to something, before they know the plugin's name.
  for (const term of ["connect", "login", "authorize"]) {
    assert.ok(
      keywords.some((keyword) => keyword.includes(term)),
      `plugin.json keywords must reach an operator who searches "${term}" — got ${JSON.stringify(keywords)}`,
    );
  }
});

test("SKILL.md forbids the two wrong recoveries — silent media_generate_asset, and re-attaching by hand", async () => {
  const skill = await readSkill();

  // media_generate_asset is a DIFFERENT vendor on a DIFFERENT credential and costs real money;
  // substituting it silently answers a question the operator did not ask.
  assert.match(skill, /media_generate_asset/);
  assert.match(skill, /costs real money|spends money/i);

  // The download-and-re-upload dance was the pre-media_import_from_url workaround. It is obsolete,
  // and an assistant that offers it has regressed the integration to its 2026-09-06 state. The
  // phrase may appear ONLY inside the prohibition — never in the procedure above it.
  assert.match(skill, /obsolete/i);

  const [procedure, prohibitions] = skill.split("## Do not");
  assert.ok(prohibitions !== undefined, "SKILL.md must have a '## Do not' section");
  assert.match(prohibitions, /download it and re-?upload it|attach the image to the chat/i);
  assert.ok(
    !/download|base64/i.test(procedure.replace(/You do not download[^.]*\./i, "")),
    "the procedure above '## Do not' must never tell the agent to download or base64 the image — the server fetches it",
  );
});

test("failure-modes.md maps every observed failure string to a real cause", async () => {
  const failures = await readReference("failure-modes.md");
  for (const observed of [
    "remote-declares-not-read-only",
    "not-in-operator-allowlist",
    "Requires basic plan or higher",
    "the request timed out after 15000ms",
    "INTERNAL_ERROR: an internal error occurred",
  ]) {
    assert.ok(failures.includes(observed), `failure-modes.md must carry the observed string '${observed}'`);
  }

  // The bare 500 is the one most likely to be misreported as a catastrophe; it must be named as a
  // LOST error message rather than a diagnosis.
  assert.match(failures, /reason was lost|lost error message/i);
});

test("failure-modes.md routes an expired OAuth token to the one tool that can surface it", async () => {
  const failures = await readReference("failure-modes.md");
  assert.match(failures, /external_mcp_reauth_prompt/);
  assert.match(failures, /Settings\s*(->|→)\s*External MCP/);
  // The agent cannot complete an OAuth sign-in, and must not try.
  assert.match(failures, /cannot run inside the chat|cannot happen inside this chat|sandboxed dialog/i);
});

test("no file in the package carries credential material", async () => {
  const packed = await packAgentPluginDirectory(PACKAGE_ROOT);

  // This plugin documents an OAuth-authenticated third-party server, which makes it the bundled
  // package most likely to acquire a pasted token during a well-meaning edit. Credentials belong in
  // the sealed credential store, never in a tracked package that ships to every install.
  const credentialShapes: readonly RegExp[] = [
    /\bBearer\s+[A-Za-z0-9._-]{16,}/,
    /\bsk-[A-Za-z0-9]{16,}/,
    /\bhf_[A-Za-z0-9]{24,}/,
    /(api[_-]?key|access[_-]?token|client[_-]?secret|refresh[_-]?token)\s*[:=]\s*["'][^"']{12,}["']/i,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];

  for (const file of packed.files) {
    const body = await readFile(path.join(PACKAGE_ROOT, file), "utf8");
    for (const shape of credentialShapes) {
      assert.ok(!shape.test(body), `${file} matches a credential shape (${shape}) — secrets must never be committed here`);
    }
  }
});
