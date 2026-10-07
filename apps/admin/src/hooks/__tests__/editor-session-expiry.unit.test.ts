import type { JSONContent } from "@tiptap/core";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { AdminPost } from "../../lib/api";
import { usePostEditor } from "../../features/posts/hooks/use-post-editor.hooks";
import { createFakePostEditorPort } from "../../features/posts/hooks/post-editor-dependencies.hooks";
import { usePageEditor } from "../../features/pages/hooks/use-page-editor.hooks";
import { createFakePageEditorPort } from "../../features/pages/hooks/page-editor-dependencies.hooks";
import { createFakeThemeCanvasPort } from "../../features/pages/hooks/theme-canvas-dependencies.hooks";
import { readStandingDraftLocalBackup } from "../../lib/standing-draft-local-backup";
import { standingDraftRecoveryMessage } from "../../lib/standing-draft-recovery-message";
import { withTitleNode } from "../../features/posts/rules";
import { COMMON_I18N } from "../../lib/i18n-common";

const row: AdminPost = {
  id: "expiry-entry", workspaceId: "workspace-local", kind: "post", title: "Saved title", slug: "saved-title",
  bodyFormat: "doc", bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Saved body" }] }] },
  status: "draft", templateChoice: null, overridesThemePage: false, updatedAt: "2026-10-01T00:00:00.000Z", version: 2,
};
const expired = async () => { throw { status: 401, code: "UNAUTHENTICATED" }; };
const scope = { principalId: "operator-1" };
afterEach(() => localStorage.clear());

it("a failed post Save preserves the exact working document before re-login", async () => {
  const fake = createFakePostEditorPort({ post: row });
  const port = { ...fake, getBackupPrincipalId: () => scope.principalId, updatePost: expired, putAutosave: expired };
  const first = renderHook(() => usePostEditor(row.id, { port, navigate: () => {}, t: key => key }));
  await waitFor(() => expect(first.result.current.post).not.toBeNull());
  await waitFor(() => expect(first.result.current.editor).not.toBeNull());
  act(() => {
    first.result.current.setTitle("Unsaved post title");
    first.result.current.setSlug("unsaved-post-slug");
    first.result.current.editor!.commands.setContent(withTitleNode({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Exact typed body" }] }] }, "Unsaved post title") as JSONContent);
  });
  const document = first.result.current.editor!.getJSON();
  await act(async () => first.result.current.save());
  expect(readStandingDraftLocalBackup(row.id, scope)).toMatchObject({ title: "Unsaved post title", slug: "unsaved-post-slug", bodyJson: document });
  first.unmount();
  const restoredPort = { ...fake, getBackupPrincipalId: () => scope.principalId };
  const second = renderHook(() => usePostEditor(row.id, { port: restoredPort, navigate: () => {}, t: key => key }));
  await waitFor(() => expect(second.result.current.recoverableDraft?.title).toBe("Unsaved post title"));
  expect(second.result.current.title).toBe("Saved title");
  act(() => second.result.current.restoreRecoveredDraft());
  await act(async () => second.result.current.save());
  expect(readStandingDraftLocalBackup(row.id, scope)).toBeNull();
});

it("a failed HTML page Save preserves the exact working HTML, title and slug", async () => {
  const page: AdminPost = { ...row, kind: "page", bodyFormat: "html", bodyHtml: "<p>Saved HTML</p>", bodyJson: {} };
  const fake = createFakePageEditorPort({ page });
  const port = { ...fake, getBackupPrincipalId: () => scope.principalId, updatePost: expired, putAutosave: expired };
  const deps = { port, themeCanvasPort: createFakeThemeCanvasPort(), navigate: () => {}, t: (_locale: string, key: string) => key, locale: "en" };
  const first = renderHook(() => usePageEditor(page.slug, deps));
  await waitFor(() => expect(first.result.current.page).not.toBeNull());
  act(() => { first.result.current.setTitle("Unsaved page title"); first.result.current.setSlug("unsaved-page-slug"); first.result.current.setHtml("<p>Exact typed HTML</p>"); });
  await act(async () => first.result.current.save());
  expect(readStandingDraftLocalBackup(page.id, scope)).toMatchObject({ title: "Unsaved page title", slug: "unsaved-page-slug", bodyHtml: "<p>Exact typed HTML</p>" });
  first.unmount();
  const restoredDeps = { ...deps, port: { ...fake, getBackupPrincipalId: () => scope.principalId } };
  const second = renderHook(() => usePageEditor(page.slug, restoredDeps));
  await waitFor(() => expect(second.result.current.recoverableDraft?.title).toBe("Unsaved page title"));
  expect(second.result.current.title).toBe("Saved title");
  await act(async () => second.result.current.discardRecoveredDraft());
  expect(readStandingDraftLocalBackup(page.id, scope)).toBeNull();
});

it("recovery says which timestamp is newer and translates every phrase in every locale", () => {
  const draft = { bodyFormat: "doc" as const, title: "Typed", slug: "typed", baseVersion: 2, savedAt: "2026-10-07T10:00:00.000Z", savedByPrincipalId: "operator-1", serverUpdatedAt: "2026-10-07T11:00:00.000Z" };
  expect(standingDraftRecoveryMessage({ draft, t: key => key })).toBe("Restore unsaved changes from 2026-10-07T10:00:00.000Z · Server content is newer.");
  expect(standingDraftRecoveryMessage({ draft: { ...draft, serverUpdatedAt: "2026-10-07T09:00:00.000Z" }, t: key => key })).toBe("Restore unsaved changes from 2026-10-07T10:00:00.000Z · Local changes are newer.");
  for (const values of Object.values(COMMON_I18N)) {
    for (const key of ["Restore unsaved changes from", "Server content is newer.", "Local changes are newer.", "Both copies have the same timestamp."]) expect(values[key]).toBeTruthy();
  }
});
