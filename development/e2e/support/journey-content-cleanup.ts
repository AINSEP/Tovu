import assert from "node:assert/strict";

type ContentType = "page" | "post" | "form" | "menu" | "widget";
type CreatedContent = { type: ContentType; id: string };
interface TrashRow { id: string; entityType: string; entityId: string }
interface CleanupResponse { status(): number; text(): Promise<string>; json(): Promise<unknown> }
interface CleanupRequest {
  get(url: string): Promise<CleanupResponse>;
  post(url: string, options?: { data?: unknown }): Promise<CleanupResponse>;
  delete(url: string): Promise<CleanupResponse>;
}
interface CreateResponse extends CleanupResponse { url(): string; request(): { method(): string } }
const CONTENT_COLLECTIONS: Readonly<Record<string, ContentType>> = {
  "/forms": "form", "/menus": "menu", "/widgets": "widget", "/pages": "page", "/posts": "post",
};

/** Tracks successful creates, including UI responses before a later assertion can fail. Cleanup
 * uses existing delete/trash/purge routes and selects only these ids; pre-existing content survives.
 * @complexity O(c + t) requests/scans for c created rows and t paginated Trash rows. */
export function createJourneyContentCleanup(
  { request, workspaceApi }: { request: CleanupRequest; workspaceApi: string },
  _optional: Record<string, never> = {},
) {
  const created = new Map<string, CreatedContent>();
  const pending: Promise<void>[] = [];
  const captureErrors: unknown[] = [];
  const track = (row: CreatedContent, _options: Record<string, never> = {}) => { created.set(`${row.type}:${row.id}`, row); };

  return {
    track,
    /** Register before the first UI action; reads only successful create responses. */
    capture({ response }: { response: CreateResponse }, _options: Record<string, never> = {}) {
      if (response.status() !== 201 || response.request().method() !== "POST") return;
      const pathname = new URL(response.url()).pathname;
      if (!pathname.startsWith(`${workspaceApi}/`)) return;
      const type = CONTENT_COLLECTIONS[pathname.slice(workspaceApi.length)];
      if (!type) return;
      pending.push(response.json().then(body => {
        const payload = body as Record<string, { id: string }>;
        const row = type === "form" ? payload.data : type === "page" ? payload.post : payload[type];
        assert.equal(typeof row?.id, "string", "create response must name the created row");
        track({ type, id: row.id });
      }).catch(error => { captureErrors.push(error); }));
    },
    /** Run in afterEach, including failed journeys. Every purge outcome must confirm removal. */
    async cleanup(_required: Record<string, never>, _options: Record<string, never> = {}) {
      await Promise.all(pending);
      const failures = [...captureErrors];
      if (!created.size) {
        if (failures.length) throw new AggregateError(failures, "journey content cleanup failed");
        return;
      }
      const mustPurge = new Set<string>();
      // Parents first: remove published embeds before their widgets, menus or forms.
      for (const type of ["page", "post", "widget", "menu", "form"] as const) {
        for (const row of created.values()) {
          if (row.type !== type) continue;
          try {
            const path = `${workspaceApi}/${type}s/${encodeURIComponent(row.id)}`;
            // Forms have no definition DELETE (SPEC-010 AC-06): the admin moves them with the generic Trash POST.
            const response = type === "form" ? await request.post(`${workspaceApi}/trash/items`, { data: { type, id: row.id } })
              : type === "widget" ? await request.post(`${path}/trash`) : await request.delete(path);
            assert.ok([200, 404].includes(response.status()), `cleanup ${type}: ${await response.text()}`);
            if (response.status() !== 404) mustPurge.add(`${type}:${row.id}`);
          } catch (error) { failures.push(error); }
        }
      }
      const selected: string[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ limit: "200", ...(cursor ? { cursor } : {}) });
        const response = await request.get(`${workspaceApi}/trash?${query}`);
        assert.equal(response.status(), 200, "cleanup Trash list");
        const body = await response.json() as { items: TrashRow[]; nextCursor: string | null };
        for (const row of body.items) {
          const type = row.entityType === "post" && created.has(`page:${row.entityId}`) ? "page" : row.entityType;
          if (created.has(`${type}:${row.entityId}`)) {
            selected.push(row.id);
            mustPurge.delete(`${type}:${row.entityId}`);
          }
        }
        cursor = body.nextCursor;
      } while (cursor);
      assert.deepEqual([...mustPurge], [], "every newly trashed row must be visible for purge");
      for (let start = 0; start < selected.length; start += 200) {
        const ids = selected.slice(start, start + 200);
        const response = await request.post(`${workspaceApi}/trash/purge`, { data: { ids } });
        assert.equal(response.status(), 200, "cleanup Trash purge");
        const report = await response.json() as { purged: number; results: Array<{ id: string; outcome: string }> };
        assert.equal(report.purged, ids.length, "every selected row must be physically removed");
        assert.deepEqual(report.results.map(row => row.outcome), ids.map(() => "purged"));
      }
      if (failures.length) throw new AggregateError(failures, "journey content cleanup failed");
    },
  };
}

export type JourneyContentCleanup = ReturnType<typeof createJourneyContentCleanup>;
