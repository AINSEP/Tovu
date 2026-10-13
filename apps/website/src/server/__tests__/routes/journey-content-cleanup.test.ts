import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated, loginAsBarePrincipal } from "../helpers/http-test-server.js";

const W = "/api/admin/v1/workspaces/workspace-local";

test("memory admin cleanup purges only selected forms, menus and widgets, including dependents", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const send = async (method: string, path: string, data?: unknown) => fetch(`${baseUrl}${W}${path}`, {
    method, headers: { cookie, "content-type": "application/json" },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const formBody = { name: "Cleanup form", slug: "cleanup-form", fields: [{ id: "message", label: "Message", type: "text", required: false }] };
  const formResponse = await send("POST", "/forms", formBody);
  assert.equal(formResponse.status, 201);
  const { data: form } = await formResponse.json() as { data: { id: string } };
  const untouchedResponse = await send("POST", "/forms", { ...formBody, slug: "untouched-form" });
  assert.equal(untouchedResponse.status, 201);
  const { data: untouched } = await untouchedResponse.json() as { data: { id: string } };
  await deps.formSubmissionRepo.create({ id: "cleanup-answer", workspaceId: deps.workspaceId, formDefinitionId: form.id,
    data: { message: "synthetic answer" }, submittedAt: deps.clock.nowIso(), sourceIp: null });

  const menuResponse = await send("POST", "/menus", { title: "Cleanup menu", slug: "cleanup-menu", items: [] });
  assert.equal(menuResponse.status, 201);
  const { menu } = await menuResponse.json() as { menu: { id: string } };
  await deps.navLocationBindingRepo.upsert({ workspaceId: deps.workspaceId, menuId: menu.id, locationKey: "primary", boundAt: deps.clock.nowIso() });
  const widgetResponse = await send("POST", "/widgets", { widgetType: "text", title: "Cleanup widget", slug: "cleanup-widget", config: { body: "test" } });
  assert.equal(widgetResponse.status, 201);
  const { widget } = await widgetResponse.json() as { widget: { id: string } };
  const outgoing = { workspaceId: deps.workspaceId, sourceEntryId: widget.id, sourceKind: "config-field" as const,
    fieldPath: "fields.config.menuRef", targetKind: "entry" as const, targetId: menu.id };
  const incoming = { ...outgoing, sourceEntryId: "unrelated-source", targetId: widget.id };
  await deps.entryRefsRepo.replaceForSource({ workspaceId: deps.workspaceId, sourceEntryId: widget.id, refs: [outgoing] });
  await deps.entryRefsRepo.replaceForSource({ workspaceId: deps.workspaceId, sourceEntryId: incoming.sourceEntryId, refs: [incoming] });

  // Independently trashed answers must not leave phantom Trash rows after their form is purged.
  assert.equal((await send("DELETE", `/forms/${form.id}/submissions/cleanup-answer`)).status, 204);
  assert.equal((await send("POST", "/trash/items", { type: "form", id: form.id })).status, 200);
  assert.equal((await send("DELETE", `/menus/${menu.id}`)).status, 200);
  assert.equal((await send("POST", `/widgets/${widget.id}/trash`)).status, 200);
  const listed = await send("GET", "/trash?limit=200");
  assert.equal(listed.status, 200);
  const { items } = await listed.json() as { items: Array<{ id: string; entityType: string; entityId: string }> };
  const selected = items.filter(row => [form.id, menu.id, widget.id].includes(row.entityId));
  assert.deepEqual(selected.map(row => row.entityType).sort(), ["form", "menu", "widget"]);
  const purged = await send("POST", "/trash/purge", { ids: selected.map(row => row.id) });
  assert.equal(purged.status, 200);
  const report = await purged.json() as { purged: number; results: Array<{ outcome: string }> };
  assert.equal(report.purged, 3);
  assert.deepEqual(report.results.map(row => row.outcome), ["purged", "purged", "purged"]);
  assert.equal(await deps.formSubmissionRepo.findById({ workspaceId: deps.workspaceId, id: "cleanup-answer" }), null);
  assert.deepEqual(await deps.navLocationBindingRepo.listByMenu({ workspaceId: deps.workspaceId, menuId: menu.id }), []);
  assert.deepEqual(await deps.entryRefsRepo.findBySource({ workspaceId: deps.workspaceId, sourceEntryId: widget.id }), []);
  assert.deepEqual(await deps.entryRefsRepo.findBySource({ workspaceId: deps.workspaceId, sourceEntryId: incoming.sourceEntryId }), [incoming]);
  const remaining = await send("GET", "/trash?limit=200");
  assert.deepEqual((await remaining.json() as { items: unknown[] }).items, []);
  assert.equal((await send("GET", `/forms/${untouched.id}`)).status, 200);
  // Reusing the same slugs proves physical removal rather than only hiding the original records.
  assert.equal((await send("POST", "/forms", formBody)).status, 201);
  assert.equal((await send("POST", "/menus", { title: "Again", slug: "cleanup-menu", items: [] })).status, 201);
  assert.equal((await send("POST", "/widgets", { widgetType: "text", title: "Again", slug: "cleanup-widget", config: { body: "test" } })).status, 201);
});

test("generic Trash POST moves a memory form only for an authorized principal in this workspace", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const created = await fetch(`${baseUrl}${W}/forms`, { method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Protected", slug: "protected", fields: [{ id: "message", label: "Message", type: "text", required: false }] }) });
  assert.equal(created.status, 201);
  const { data: form } = await created.json() as { data: { id: string } };
  const url = `${baseUrl}${W}/trash/items`;
  const move = (headers: Record<string, string>, target = url) => fetch(target, { method: "POST",
    headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ type: "form", id: form.id }) });
  assert.equal((await move({})).status, 401);
  assert.equal((await move({ cookie }, url.replace("workspace-local", "other-workspace"))).status, 404);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);
  const forbidden = await move({ cookie: bareCookie });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json() as { code: string }).code, "FORBIDDEN");
  assert.ok(await deps.formDefinitionRepo.findBySlug({ workspaceId: deps.workspaceId, slug: "protected" }));
  assert.equal((await move({ cookie })).status, 200);
  assert.equal(await deps.formDefinitionRepo.findBySlug({ workspaceId: deps.workspaceId, slug: "protected" }), null);
  const again = await move({ cookie });
  assert.equal(again.status, 404);
  assert.equal((await again.json() as { code: string }).code, "NOT_FOUND");
});
