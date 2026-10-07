import assert from "node:assert/strict";
import test from "node:test";
import { captureAssistantArtifacts, cleanupAssistantArtifacts, configureCodexJourney, type AssistantJourneyApi } from "../support/assistant-journey-state.js";

const WS_API = "/api/admin/v1/workspaces/workspace-local";
const json = (value: unknown, status = 200) => ({ status, body: JSON.stringify(value) });

function settingsApi() {
  const values = new Map<string, unknown>([["mode", "byok"], ["localCli.agentId", "claude"]]);
  const writes: Array<{ method: string; data: unknown }> = [];
  let refusedKey: string | undefined;
  const api: AssistantJourneyApi = async ({ url, method = "GET", data }) => {
    const address = new URL(url, "http://journey.test");
    if (address.pathname === `${WS_API}/settings/raw`) return json({ workspace: values.get(address.searchParams.get("key")!) ?? null });
    assert.equal(address.pathname, `${WS_API}/settings/value`);
    const setting = data as { namespace: string; key: string; scope: string; valueJson?: unknown };
    assert.equal(setting.namespace, "core.execution");
    assert.equal(setting.scope, "workspace");
    writes.push({ method, data });
    if (setting.key === refusedKey && method === "PUT") {
      refusedKey = undefined;
      return json({ error: "write refused" }, 500);
    }
    if (method === "DELETE") values.delete(setting.key);
    else values.set(setting.key, setting.valueJson);
    return json({});
  };
  return { api, values, writes, refuseNext: (key: string) => { refusedKey = key; } };
}

test("Codex uses the user's four Local CLI settings and restores values and absent overrides", async () => {
  const fake = settingsApi();
  const prior = new Map(fake.values);
  const restore = await configureCodexJourney({ api: fake.api });
  assert.deepEqual(fake.writes, [
    { method: "PUT", data: { namespace: "core.execution", key: "localCli.agentId", scope: "workspace", valueJson: "codex" } },
    { method: "PUT", data: { namespace: "core.execution", key: "localCli.model", scope: "workspace", valueJson: "" } },
    { method: "PUT", data: { namespace: "core.execution", key: "localCli.reasoning", scope: "workspace", valueJson: "" } },
    { method: "PUT", data: { namespace: "core.execution", key: "mode", scope: "workspace", valueJson: "local-cli" } },
  ]);
  await restore();
  assert.deepEqual(fake.values, prior);
});

test("a failed settings write restores earlier overrides before rejecting", async () => {
  const fake = settingsApi();
  const prior = new Map(fake.values);
  fake.refuseNext("localCli.reasoning");
  await assert.rejects(configureCodexJourney({ api: fake.api }), { message: `PUT ${WS_API}/settings/value: {"error":"write refused"}\n\n500 !== 200\n` });
  assert.deepEqual(fake.values, prior);
});

function contentApi({ failPurge = false } = {}) {
  const posts = new Map([["seed-post", { id: "seed-post", title: "Seed", status: "draft" }]]);
  const media = new Set(["seed-media"]);
  const chats = new Set(["seed-chat"]);
  const trash = new Map<string, { id: string; entityType: string; entityId: string }>();
  const calls: string[] = [];
  const api: AssistantJourneyApi = async ({ url, method = "GET", data }) => {
    const path = new URL(url, "http://journey.test").pathname;
    calls.push(`${method} ${path}`);
    if (path === "/api/assistant/chats") return json({ conversations: [...chats].map((id) => ({ id })) });
    if (path.startsWith("/api/assistant/chats/") && method === "DELETE") {
      chats.delete(path.split("/").at(-1)!);
      return { status: 204, body: "" };
    }
    if (path === `${WS_API}/posts`) return json({ posts: [...posts.values()].filter((post) => post.status !== "trashed").map((post) => ({ post })) });
    if (path.startsWith(`${WS_API}/posts/`)) {
      const id = path.split("/").at(-1)!;
      const row = posts.get(id);
      if (!row) return json({ error: "not found" }, 404);
      if (method === "DELETE") {
        row.status = "trashed";
        trash.set(`trash-${id}`, { id: `trash-${id}`, entityType: "post", entityId: id });
      }
      return json({ post: row });
    }
    if (path === `${WS_API}/trash`) return json({ items: [...trash.values()] });
    if (path === `${WS_API}/trash/purge`) {
      const ids = (data as { ids: string[] }).ids;
      if (!failPurge) for (const id of ids) {
        const item = trash.get(id)!;
        posts.delete(item.entityId);
        trash.delete(id);
      }
      // Even a successful-looking purge response must be followed by independent read-back.
      return json({ purged: ids.length });
    }
    if (path === `${WS_API}/media`) return json({ media: [...media].map((id) => ({ id })) });
    if (path.startsWith(`${WS_API}/media/`) && method === "DELETE") {
      return json({ purged: media.delete(path.split("/").at(-1)!) });
    }
    throw new Error(`Unexpected API request: ${method} ${path}`);
  };
  return { api, posts, media, chats, trash, calls };
}

test("failure-path teardown cancels new chats, purges all new posts and media, and preserves seeded rows", async () => {
  const fake = contentApi();
  const before = await captureAssistantArtifacts({ api: fake.api });
  fake.chats.add("unfinished-chat");
  fake.posts.set("agent-post", { id: "agent-post", title: "Created before failure", status: "draft" });
  fake.posts.set("duplicate-post", { id: "duplicate-post", title: "Created before failure", status: "draft" });
  fake.media.add("agent-media");
  await cleanupAssistantArtifacts({ api: fake.api, before });
  assert.deepEqual([...fake.posts.keys()], ["seed-post"]);
  assert.deepEqual([...fake.media], ["seed-media"]);
  assert.deepEqual([...fake.chats], ["seed-chat"]);
  assert.equal(fake.trash.size, 0);
  const mutations = fake.calls.filter((call) => !call.startsWith("GET"));
  assert.deepEqual(mutations, [
    "DELETE /api/assistant/chats/unfinished-chat",
    `DELETE ${WS_API}/posts/agent-post`, `DELETE ${WS_API}/posts/duplicate-post`,
    `POST ${WS_API}/trash/purge`, `DELETE ${WS_API}/media/agent-media`,
  ]);
});

test("teardown refuses to claim deletion if a purge leaves the post readable", async () => {
  const fake = contentApi({ failPurge: true });
  const before = await captureAssistantArtifacts({ api: fake.api });
  fake.posts.set("agent-post", { id: "agent-post", title: "Leaked row", status: "draft" });
  await assert.rejects(cleanupAssistantArtifacts({ api: fake.api, before }), {
    message: 'Deleted post agent-post: {"post":{"id":"agent-post","title":"Leaked row","status":"trashed"}}\n\n200 !== 404\n',
  });
});

test("a stubbed test with no created content performs no deletion", async () => {
  const fake = contentApi();
  const before = await captureAssistantArtifacts({ api: fake.api });
  await cleanupAssistantArtifacts({ api: fake.api, before });
  assert.deepEqual(fake.calls.filter((call) => !call.startsWith("GET")), []);
});

test("teardown also permanently deletes a created post already hidden in Trash", async () => {
  const fake = contentApi();
  const before = await captureAssistantArtifacts({ api: fake.api });
  fake.posts.set("already-trashed", { id: "already-trashed", title: "Created then trashed", status: "draft" });
  await fake.api({ url: `${WS_API}/posts/already-trashed`, method: "DELETE" });
  await cleanupAssistantArtifacts({ api: fake.api, before });
  assert.equal(fake.posts.has("already-trashed"), false);
  assert.equal(fake.trash.size, 0);
});
