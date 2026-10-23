import { vi } from "vitest";
import type { EmailTabHooks } from "../Email";
import type { EmailTemplateEditorController } from "../hooks/use-email-template-editor.hooks";
import { DNS, PREVIEW, TEMPLATE } from "./email.test-helpers";

/** @file Static controller fakes for markup tests. Hook behavior is tested against fake API ports. */
export function createTabHooks(_required = {}, _optional = {}): EmailTabHooks {
  return {
    overview: vi.fn<EmailTabHooks["overview"]>(() => ({
      uses: { kind: "loaded", data: { checkedAt: "", uses: [] } }, reloadUses: vi.fn(),
      to: "", setTo: vi.fn(), test: { kind: "idle" }, sendTest: vi.fn(async () => {}),
    })),
    provider: vi.fn<EmailTabHooks["provider"]>(() => ({
      view: { kind: "loaded", data: { setting: { transactional: null, bulk: null }, providers: [], refusals: [] } },
      reload: vi.fn(), drafts: {}, setDraftField: vi.fn(), revealed: {}, toggleReveal: vi.fn(),
      busyId: null, notice: null, saveKey: vi.fn(async () => {}),
      pendingSwitch: null, askSwitch: vi.fn(), confirmSwitch: vi.fn(async () => {}),
    })),
    sender: vi.fn<EmailTabHooks["sender"]>(() => ({
      sender: { kind: "loaded", data: { name: "Example", email: "hello@example.com" } },
      draft: { name: "Example", email: "hello@example.com" }, setDraft: vi.fn(), dirty: false,
      save: vi.fn(async () => {}), saveState: "idle", dns: { kind: "loaded", data: DNS },
      checking: false, checkError: null, checkAgain: vi.fn(async () => {}),
    })),
    templates: vi.fn<EmailTabHooks["templates"]>(() => ({
      view: { kind: "loaded", data: { templates: [] } }, error: null, creating: false,
      create: vi.fn(async () => {}), renaming: null, startRename: vi.fn(), setRenameName: vi.fn(),
      confirmRename: vi.fn(async () => {}), pendingTrash: null, setPendingTrash: vi.fn(),
      trashing: false, confirmTrash: vi.fn(async () => {}),
    })),
    activity: vi.fn<EmailTabHooks["activity"]>(() => ({
      filter: {}, setFilter: vi.fn(),
      activity: {
        view: { kind: "loaded", data: { items: [], nextCursor: null, empty: "none_recorded" } },
        loadingMore: false, moreError: null, loadMore: vi.fn(async () => {}), reload: vi.fn(),
      },
      openId: null, detail: null, toggleDetail: vi.fn(), search: "", setSearch: vi.fn(),
      suppressions: {
        view: { kind: "loaded", data: { items: [], nextCursor: null, empty: "none_recorded" } },
        loadingMore: false, moreError: null, loadMore: vi.fn(async () => {}), reload: vi.fn(),
      },
      removal: null, startRemoval: vi.fn(), setRemovalReason: vi.fn(), continueRemoval: vi.fn(async () => {}),
      cancelRemoval: vi.fn(), removedNotice: null, feedback: { kind: "loaded", data: { available: false, providers: [] } },
    })),
  };
}

/** A loaded editor whose actions can be inspected without starting locale or template reads. */
export function createEditorController(required: { overrides?: Partial<EmailTemplateEditorController> } = {}, _optional = {}): EmailTemplateEditorController {
  return {
    view: { kind: "loaded", data: TEMPLATE }, html: TEMPLATE.html, setHtml: vi.fn(), dirty: false,
    values: { name: "Ada" }, setValue: vi.fn(), fieldNames: ["name"], mode: "admin", setMode: vi.fn(),
    preview: { data: PREVIEW, error: null, pending: false }, saving: false, saveError: null, savedAt: null, save: vi.fn(async () => {}),
    name: TEMPLATE.name, setName: vi.fn(), commitName: vi.fn(async () => {}), renameError: null,
    ...required.overrides,
  };
}
