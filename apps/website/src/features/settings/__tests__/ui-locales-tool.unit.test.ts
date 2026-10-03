/** n05: supported admin language discovery, rather than public-content translation. */
import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { ForbiddenError } from "#src/contracts/core/commands/index";
import { contributeUiLocalesTools } from "../ui-locales-tool.js";

const context = (input?: unknown): ToolExecutionContext => ({
  executionId: "exec", principal: { id: "operator" }, run: { id: "run" }, input,
  signal: new AbortController().signal,
});

function fixture(allow = true) {
  // Full-catalog boot and manifest wiring are covered by the search/contract suites.
  const contributor = contributeUiLocalesTools();
  assert.equal(contributor.domain, "settings-ui-locales");
  const calls: unknown[] = [];
  const deps = { workspaceId: "ws", authorize: async (input: unknown) => {
    calls.push(input);
    return { allowed: allow, reason: allow ? "matched" : "insufficient_permission" };
  } };
  const registrations = contributor.build(deps as any, {} as any);
  assert.deepEqual(registrations.map((r) => r.descriptor.id), ["settings_list_ui_locales"]);
  return { tool: registrations[0]!, calls, risk: contributor.risk };
}

test("lists exact language codes and existing setter coordinates after checking permission", async () => {
  const { tool, calls } = fixture();
  const result = await tool.handler(context());
  const locales = [
    ["en", "English"], ["es", "Español"], ["id", "Bahasa Indonesia"], ["de", "Deutsch"],
    ["zh-CN", "简体中文"], ["zh-TW", "繁體中文"], ["pt-BR", "Português (Brasil)"],
    ["ru", "Русский"], ["fa", "فارسی"], ["ar", "العربية"], ["ja", "日本語"],
    ["ko", "한국어"], ["pl", "Polski"], ["hu", "Magyar"], ["fr", "Français"],
    ["uk", "Українська"], ["tr", "Türkçe"], ["th", "ภาษาไทย"], ["it", "Italiano"],
    ["hi", "हिन्दी"], ["ur", "اردو"], ["bn", "বাংলা"],
  ].map(([code, label]) => ({ code, label }));
  assert.deepEqual(result, { locales, setting: "core.language.locale", scope: "user", writeTool: "settings_set_ui_preference" });
  assert.deepEqual(calls, [{ principalId: "operator", workspaceId: "ws", permission: "settings.read", entityType: "setting-value" }]);
});

test("denied permission returns no locale data", async () => {
  const { tool, calls } = fixture(false);
  await assert.rejects(tool.handler(context()), (error: unknown) => {
    assert.ok(error instanceof ForbiddenError);
    assert.equal(error.message, "principal 'operator' is not authorized for 'settings.read' (insufficient_permission)");
    assert.equal(error.permission, "settings.read");
    return true;
  });
  assert.equal(calls.length, 1);
});

test("rejects arguments and malformed input before authorization", async () => {
  const { tool, calls } = fixture();
  for (const input of [{ locale: "pt" }, { principalId: "other" }, [], "es", null, 1, false]) {
    await assert.rejects(tool.handler(context(input)), { name: "ToolInputError", message: "this tool accepts no input — omit 'input' or pass {}" });
  }
  assert.deepEqual(calls, []);
  assert.deepEqual(await tool.handler(context(undefined)), await tool.handler(context({})));
});

test("returned options cannot mutate the catalog used by later calls", async () => {
  const { tool } = fixture();
  const first = await tool.handler(context()) as { locales: { code: string; label: string }[] };
  first.locales[0]!.code = "unsupported";
  first.locales[0]!.label = "Changed";
  first.locales.pop();
  const second = await tool.handler(context()) as { locales: { code: string; label: string }[] };
  assert.equal(second.locales.length, 22);
  assert.deepEqual(second.locales[0], { code: "en", label: "English" });
});

test("registration is read-only with derived risk none and an empty closed schema", () => {
  const { tool, risk } = fixture();
  assert.equal(tool.descriptor.readOnly, true);
  assert.equal(risk.get("settings_list_ui_locales"), "none");
  assert.deepEqual(tool.descriptor.inputSchema, { type: "object", properties: {}, additionalProperties: false });
  assert.match(tool.descriptor.description, /public.*content/i);
  assert.match(tool.descriptor.description, /coverage/i);
});
