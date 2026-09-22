import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { executePageCapability } from "@jini-ai/agentic/core";
import { createDomPageDriver } from "@jini-ai/agentic/dom";

import { Media } from "../Media";
import type { MediaController } from "../hooks/use-media.hooks";
import type { AdminMedia } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";

/**
 * @file Regression test for this batch's agent-control tagging on `Media.tsx` — same shape as
 * `forms/__tests__/forms-agent-drive.unit.test.tsx`, driving the real `executePageCapability` and
 * the real `createDomPageDriver`, not `userEvent`.
 *
 * Uses `Media`'s own `useMediaHook` injection seam (the same real, supported prop `Users.tsx`'s
 * test in this same batch uses) so these tests need no `fetch` mock and no `FetchQueryProvider`.
 *
 * Properties covered:
 *
 * 1. Two grid cards get distinct, id-derived expand-button handles.
 * 2. `page.fill` on the upload toolbar's alt-text field calls the injected setter.
 * 3. `EditMediaPanel`'s title field is fillable and its Save button is discoverable — reached here
 *    by setting `editingId`/`editingItem` directly on the injected controller, since opening it for
 *    real routes through `RowMenu`'s "Edit metadata" item, and `RowMenu` (`@jini-ai/admin/react`)
 *    publishes no agent handle of its own (this batch's known gap, same as Forms/Collections/
 *    Taxonomy/Users). The panel's own fields are still worth tagging: a human opens it, then the
 *    agent can fill it in — the same human/agent split `ExternalMcpSettingsPanel`'s OAuth client
 *    secret field documents for a different reason.
 */

function item(overrides: Partial<AdminMedia> = {}): AdminMedia {
  return {
    id: "media-1",
    workspaceId: "workspace-local",
    title: "Sunset Photo",
    alt: "A sunset over the ocean",
    caption: "",
    credit: "",
    sha256: "abc123",
    contentType: "image/png",
    status: "active",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    ...overrides,
  } as AdminMedia;
}

function mediaController(overrides: Partial<MediaController> = {}): MediaController {
  return {
    media: [],
    error: null,
    uploading: false,
    altDraft: "",
    setAltDraft: vi.fn(),
    fileInputRef: { current: null },
    selectedFileName: "",
    onFileChange: vi.fn(),
    upload: vi.fn(async () => {}),
    editingId: null,
    setEditingId: vi.fn(),
    editingItem: null,
    toggleEditing: vi.fn(),
    onMetadataSaved: vi.fn(),
    trash: vi.fn(async () => {}),
    pendingPurge: null,
    setPendingPurge: vi.fn(),
    rowSavingId: null,
    purge: vi.fn(async () => {}),
    lightboxIndex: null,
    setLightboxIndex: vi.fn(),
    orderBy: "created",
    setOrderBy: vi.fn(),
    t: (key: string) => key,
    locale: "en",
    ...overrides,
  };
}

function renderMedia(overrides: Partial<MediaController> = {}) {
  const controller = mediaController(overrides);
  // `EditMediaPanel` composes its own real `useWiredEditMediaPanel` (not part of `Media`'s own
  // injected controller), which throws without a `QueryClientProvider` ancestor — see
  // `Taxonomy.tsx`'s `NewTermForm` for the identical situation. Wrapping every render, not just the
  // edit-panel tests, keeps this helper one shape for the whole file.
  const { container } = render(
    <FetchQueryProvider>
      <Media useMediaHook={() => controller} />
    </FetchQueryProvider>,
  );
  return { controller, container };
}

interface FoundElement {
  handle: string;
  role?: string;
  label: string;
}

async function findElements(
  driver: ReturnType<typeof createDomPageDriver>,
  filter: { role?: string } = {},
): Promise<FoundElement[]> {
  const result = (await executePageCapability(driver, "page.find_elements", filter)) as { elements: FoundElement[] };
  return result.elements;
}

async function handlesOf(driver: ReturnType<typeof createDomPageDriver>, filter: { role?: string } = {}) {
  return (await findElements(driver, filter)).map((element) => element.handle);
}

describe("addressing the media grid", () => {
  it("gives two cards distinct, id-derived expand-button handles", async () => {
    const items = [item({ id: "media-1", title: "Sunset" }), item({ id: "media-2", title: "Beach" })];
    const { container } = renderMedia({ media: items });
    await screen.findByText("Sunset");
    const driver = createDomPageDriver({ root: container, pages: {} });

    const handles = await handlesOf(driver, { role: "button" });
    expect(handles).toContain("media-item-media-1-expand");
    expect(handles).toContain("media-item-media-2-expand");
    // Every button-role handle on the page is unique — not just the two asserted above.
    expect(new Set(handles).size).toBe(handles.length);
  });
});

describe("driving the upload toolbar through page.* verbs", () => {
  it("page.fill on the alt-text field calls the injected setter", async () => {
    const { controller, container } = renderMedia();
    await screen.findByRole("button", { name: /^Upload$/ });
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.fill", { handle: "media-upload-alt", text: "A rocky coastline" });
    expect(controller.setAltDraft).toHaveBeenCalledWith("A rocky coastline");

    expect(await handlesOf(driver)).toContain("media-upload-submit");
  });
});

describe("driving the edit-metadata panel through page.* verbs", () => {
  it("page.fill on the title field reaches React state, once a human has opened the panel", async () => {
    const editing = item({ id: "media-1", title: "Sunset Photo" });
    const { container } = renderMedia({ media: [editing], editingId: "media-1", editingItem: editing });
    await screen.findByLabelText("Title");
    const driver = createDomPageDriver({ root: container, pages: {} });

    await executePageCapability(driver, "page.fill", { handle: "media-edit-title", text: "Golden Hour" });
    expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("Golden Hour");

    expect(await handlesOf(driver)).toContain("media-edit-save");
  });
});
