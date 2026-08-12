import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFormEditor } from "../hooks/use-form-editor.hooks";
import { createFakeFormsPort } from "../hooks/forms-dependencies.hooks";
import type { AdminFormDefinition } from "../../../lib/api";

/**
 * @file `useFormEditor` — the FormEditor screen's load/save/status-toggle state.
 * `FormEditor.unit.test.tsx` already exercises the full UI flow through a stubbed `fetch`; this
 * file is the hook's own injected-port + injected-navigate coverage — see `forms-port.hooks.ts`
 * for why the injection exists.
 */

function formFixture(overrides: Partial<AdminFormDefinition> = {}): AdminFormDefinition {
  return {
    id: "f1",
    workspaceId: "fake-ws",
    name: "Contact",
    slug: "contact",
    fields: [{ id: "email", label: "Email", type: "email", required: true }],
    notify: { enabled: false, recipients: [] },
    status: "active",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useFormEditor — injected port + navigate", () => {
  it("loads an existing form from the fake port's seed, with no fetch involved", async () => {
    const networkMock = vi.fn();
    vi.stubGlobal("fetch", networkMock);
    const port = createFakeFormsPort({ forms: [formFixture()] });
    const navigate = vi.fn();

    const { result } = renderHook(() => useFormEditor({ formId: "f1" }, { port, navigate }));

    await waitFor(() => expect(result.current.form).not.toBeNull());
    expect(result.current.name).toBe("Contact");
    expect(networkMock).not.toHaveBeenCalled();
  });

  it("does not load for a new form (isNew), and creating one calls the injected navigate", async () => {
    const port = createFakeFormsPort();
    const navigate = vi.fn();
    const { result } = renderHook(() => useFormEditor({ formId: "new" }, { port, navigate }));

    expect(result.current.isNew).toBe(true);
    expect(result.current.form).toBeNull();

    act(() => {
      result.current.setName("Newsletter");
      result.current.setSlug("newsletter");
    });
    await act(async () => {
      await result.current.handleSave();
    });

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/forms\/fake-1$/));
  });

  it("handleStatusToggle flips status through the port for an existing form", async () => {
    const port = createFakeFormsPort({ forms: [formFixture({ status: "active" })] });
    const navigate = vi.fn();
    const { result } = renderHook(() => useFormEditor({ formId: "f1" }, { port, navigate }));
    await waitFor(() => expect(result.current.form).not.toBeNull());

    await act(async () => {
      await result.current.handleStatusToggle();
    });

    expect(result.current.form?.status).toBe("disabled");
    expect(navigate).not.toHaveBeenCalled();
  });
});
