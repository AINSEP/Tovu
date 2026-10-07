import assert from "node:assert/strict";
import type { Page } from "@playwright/test";

const WS_API = "/api/admin/v1/workspaces/workspace-local";
const SETTINGS = `${WS_API}/settings/value`;
export const CODEX_JOURNEY = process.env.TOVU_E2E_ASSISTANT_AGENT === "codex-cli";
export const LIVE_ANSWER_TIMEOUT_MS = 240_000;

export interface JourneyResponse { status: number; body: string }
export type AssistantJourneyApi = (required: { url: string; method?: string; data?: unknown }, optional?: {}) => Promise<JourneyResponse>;

/** In-page fetch carries the packaged server's Secure cookie over loopback HTTP, whereas
 * page.request omits it. Use the same authenticated settings/content routes in both targets. */
export function assistantJourneyApi({ page }: { page: Page }, _optional = {}): AssistantJourneyApi {
  return (required) => page.evaluate(async ({ url, method = "GET", data }) => {
    const response = await fetch(url, { method, credentials: "same-origin",
      ...(data === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }) });
    return { status: response.status, body: await response.text() };
  }, required);
}

export async function journeyJson<T>(
  { api, url, method = "GET", data, status = 200 }: { api: AssistantJourneyApi; url: string; method?: string; data?: unknown; status?: number }, _optional = {},
): Promise<T> {
  const response = await api({ url, method, data });
  assert.equal(response.status, status, `${method} ${url}: ${response.body}`);
  return response.body ? JSON.parse(response.body) as T : undefined as T;
}

export async function putExecutionSetting(
  { api, key, valueJson }: { api: AssistantJourneyApi; key: string; valueJson: unknown }, _optional = {},
): Promise<void> {
  await journeyJson({ api, url: SETTINGS, method: "PUT", data: { namespace: "core.execution", key, scope: "workspace", valueJson } });
}

/** These are exactly saveExecutionConfig's Local CLI ledger keys. Keep the default model and
 * reasoning empty so the installed Codex CLI chooses its own supported defaults. Restore every
 * workspace override, including absence, rather than leaking the live selection into later tests. */
export async function configureCodexJourney({ api }: { api: AssistantJourneyApi }, _optional = {}): Promise<() => Promise<void>> {
  const values = [["localCli.agentId", "codex"], ["localCli.model", ""], ["localCli.reasoning", ""], ["mode", "local-cli"]] as const;
  const prior = new Map<string, unknown>();
  const rawUrl = (key: string) => `${WS_API}/settings/raw?namespace=core.execution&key=${encodeURIComponent(key)}`;
  async function restore() {
    for (const [key, valueJson] of prior) {
      if (valueJson === null) {
        await journeyJson({ api, url: SETTINGS, method: "DELETE", data: { namespace: "core.execution", key, scope: "workspace" } });
      } else await putExecutionSetting({ api, key, valueJson });
      const raw = await journeyJson<{ workspace: unknown }>({ api, url: rawUrl(key) });
      assert.deepEqual(raw.workspace, valueJson, `Restored core.execution.${key}`);
    }
  }
  try {
    for (const [key, valueJson] of values) {
      const raw = await journeyJson<{ workspace: unknown }>({ api, url: rawUrl(key) });
      prior.set(key, raw.workspace);
      await putExecutionSetting({ api, key, valueJson });
      const saved = await journeyJson<{ workspace: unknown }>({ api, url: rawUrl(key) });
      assert.deepEqual(saved.workspace, valueJson, `Selected core.execution.${key}`);
    }
  } catch (error) {
    await restore();
    throw error;
  }
  return restore;
}

export interface JourneyPost { id: string; title: string; status: string }
export async function journeyPosts({ api }: { api: AssistantJourneyApi }, _optional = {}): Promise<JourneyPost[]> {
  const result = await journeyJson<{ posts: Array<{ post: JourneyPost }> }>({ api, url: `${WS_API}/posts` });
  return result.posts.map(({ post }) => post);
}

interface TrashList { items: Array<{ id: string; entityType: string; entityId: string }> }
interface Inventory { posts: Set<string>; media: Set<string>; chats: Set<string>; trash: Set<string> }
async function mediaRows(api: AssistantJourneyApi) {
  return (await journeyJson<{ media: Array<{ id: string }> }>({ api, url: `${WS_API}/media` })).media;
}
async function chats(api: AssistantJourneyApi) {
  return (await journeyJson<{ conversations: Array<{ id: string }> }>({ api, url: "/api/assistant/chats" })).conversations;
}
export async function captureAssistantArtifacts({ api }: { api: AssistantJourneyApi }, _optional = {}): Promise<Inventory> {
  return { posts: new Set((await journeyPosts({ api })).map((row) => row.id)),
    media: new Set((await mediaRows(api)).map((row) => row.id)), chats: new Set((await chats(api)).map((row) => row.id)),
    trash: new Set((await journeyJson<TrashList>({ api, url: `${WS_API}/trash?limit=200` })).items.map((item) => item.id)) };
}

/** The isolated journeys run serially. Compare IDs with the pre-test inventory so teardown also
 * finds a row created just before an assertion fails, and never deletes an earlier test's rows.
 * Delete chats first: the real delete route cancels any in-flight durable attempt before cascading
 * its messages away, so a failed live test cannot keep creating content during cleanup. */
export async function cleanupAssistantArtifacts(
  { api, before }: { api: AssistantJourneyApi; before: Inventory }, _optional = {},
): Promise<void> {
  for (const row of await chats(api)) {
    if (before.chats.has(row.id)) continue;
    await journeyJson({ api, url: `/api/assistant/chats/${encodeURIComponent(row.id)}`, method: "DELETE", status: 204 });
  }
  assert.deepEqual((await chats(api)).filter((row) => !before.chats.has(row.id)), [], "Created conversations were deleted");

  const createdPosts = (await journeyPosts({ api })).filter((row) => !before.posts.has(row.id));
  for (const row of createdPosts) {
    // DELETE only moves a post to Trash. Permanent deletion must use the human admin purge route.
    await journeyJson({ api, url: `${WS_API}/posts/${encodeURIComponent(row.id)}`, method: "DELETE" });
  }
  const trash = await journeyJson<TrashList>({ api, url: `${WS_API}/trash?limit=200` });
  // Admin lists hide trashed posts. Include new Trash entries as well, while protecting rows
  // that existed before the test, so a create followed by a soft delete cannot leak a hidden row.
  const items = trash.items.filter((item) => item.entityType === "post" && !before.posts.has(item.entityId) && !before.trash.has(item.id));
  const createdIds = new Set(items.map((item) => item.entityId));
  for (const row of createdPosts) assert.ok(createdIds.has(row.id), `Created post ${row.id} is in Trash before purge`);
  if (items.length) {
    const purged = await journeyJson<{ purged: number }>({ api, url: `${WS_API}/trash/purge`, method: "POST", data: { ids: items.map((item) => item.id) } });
    assert.equal(purged.purged, items.length, "Every created post was permanently deleted");
  }
  for (const id of createdIds) {
    const response = await api({ url: `${WS_API}/posts/${encodeURIComponent(id)}` });
    assert.equal(response.status, 404, `Deleted post ${id}: ${response.body}`);
  }
  assert.deepEqual((await journeyPosts({ api })).filter((row) => !before.posts.has(row.id)), [], "No created posts remain");
  const remainingTrash = await journeyJson<typeof trash>({ api, url: `${WS_API}/trash?limit=200` });
  assert.deepEqual(remainingTrash.items.filter((item) => item.entityType === "post" && createdIds.has(item.entityId)), [], "No created posts remain in Trash");

  for (const row of await mediaRows(api)) {
    if (before.media.has(row.id)) continue;
    const purged = await journeyJson<{ purged: boolean }>({ api, url: `${WS_API}/media/${encodeURIComponent(row.id)}`, method: "DELETE" });
    assert.equal(purged.purged, true, `Created media ${row.id} was permanently deleted`);
  }
  assert.deepEqual((await mediaRows(api)).filter((row) => !before.media.has(row.id)), [], "No created media remain");
}
