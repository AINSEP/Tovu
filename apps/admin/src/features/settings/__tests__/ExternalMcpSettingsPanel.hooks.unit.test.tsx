import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";

import { useExternalMcpAddForm } from "../ExternalMcpSettingsPanel.hooks";

/**
 * @file Direct coverage for `useExternalMcpAddForm` — the "Add server" form's open state, draft
 * defaults and lagged transport/auth-mode field-spec sync, moved out of
 * `ExternalMcpSettingsPanel.tsx`'s component body. `ExternalMcpSettingsPanel.unit.test.tsx` still
 * proves the same behavior through the rendered form; this suite pins the hook's own contract
 * (what it returns, and when) against `@jini-ai/ui`'s in-memory fake port.
 */

function setup() {
  const dependencies = createFakeSourceConfigDependencies<SourceConfigItem>({
    sources: [],
    createSource: (input) => ({ id: input.fields.id?.trim() || "new-server", fields: input.fields }),
  });
  const list = { addSourceToList: vi.fn() };
  const hook = renderHook(() => useExternalMcpAddForm({ dependencies, list }));
  return { ...hook, list };
}

function specKeys(current: ReturnType<typeof useExternalMcpAddForm>): string[] {
  return current.fieldSpecs.map((spec) => spec.key);
}

describe("useExternalMcpAddForm", () => {
  it("starts closed, on the stdio + static_env field specs, without pre-filling the blank draft", () => {
    const { result } = setup();

    expect(result.current.formOpen).toBe(false);
    expect(specKeys(result.current)).toContain("command");
    expect(specKeys(result.current)).not.toContain("url");
    expect(specKeys(result.current)).not.toContain("oauthClientId");
    expect(result.current.addForm.values.transport).toBe("");
    expect(result.current.addForm.values.authMode).toBe("");
  });

  it("opening the form pre-selects stdio and static_env on a blank draft", async () => {
    const { result } = setup();

    act(() => result.current.toggleForm());

    expect(result.current.formOpen).toBe(true);
    await waitFor(() => expect(result.current.addForm.values.transport).toBe("stdio"));
    expect(result.current.addForm.values.authMode).toBe("static_env");
  });

  it("opening the form does not overwrite a transport the draft already carries", async () => {
    const { result } = setup();
    act(() => result.current.addForm.setField("transport", "streamable_http"));

    act(() => result.current.toggleForm());

    await waitFor(() => expect(result.current.addForm.values.authMode).toBe("static_env"));
    expect(result.current.addForm.values.transport).toBe("streamable_http");
  });

  it("switching the transport to a hosted server re-derives the field specs: URL in, Command out", async () => {
    const { result } = setup();
    act(() => result.current.toggleForm());

    act(() => result.current.addForm.setField("transport", "streamable_http"));

    await waitFor(() => expect(specKeys(result.current)).toContain("url"));
    expect(specKeys(result.current)).not.toContain("command");
  });

  it("switching credentials to oauth reveals the OAuth fields, and switching back hides them", async () => {
    const { result } = setup();
    act(() => result.current.toggleForm());

    act(() => result.current.addForm.setField("authMode", "oauth"));
    await waitFor(() => expect(specKeys(result.current)).toContain("oauthClientId"));

    act(() => result.current.addForm.setField("authMode", "static_env"));
    await waitFor(() => expect(specKeys(result.current)).not.toContain("oauthClientId"));
  });

  it("toggleForm closes an open form without discarding the draft", async () => {
    const { result } = setup();
    act(() => result.current.toggleForm());
    act(() => result.current.addForm.setField("id", "draft-server"));

    act(() => result.current.toggleForm());

    expect(result.current.formOpen).toBe(false);
    expect(result.current.addForm.values.id).toBe("draft-server");
  });

  it("cancelForm discards the draft, closes the form, and returns the field specs to the stdio default", async () => {
    const { result } = setup();
    act(() => result.current.toggleForm());
    act(() => result.current.addForm.setField("id", "draft-server"));
    act(() => result.current.addForm.setField("transport", "streamable_http"));
    await waitFor(() => expect(specKeys(result.current)).toContain("url"));

    act(() => result.current.cancelForm());

    expect(result.current.formOpen).toBe(false);
    expect(result.current.addForm.values.id).toBe("");
    await waitFor(() => expect(specKeys(result.current)).toContain("command"));
    expect(specKeys(result.current)).not.toContain("url");
  });

  it("a successful submit hands the new server to the list and closes the form", async () => {
    const { result, list } = setup();
    act(() => result.current.toggleForm());
    await waitFor(() => expect(result.current.addForm.values.transport).toBe("stdio"));
    act(() => result.current.addForm.setField("id", "github"));
    act(() => result.current.addForm.setField("command", "npx"));
    await waitFor(() => expect(result.current.addForm.validation.ok).toBe(true));

    await act(async () => {
      await result.current.addForm.submit();
    });

    expect(list.addSourceToList).toHaveBeenCalledTimes(1);
    expect(list.addSourceToList).toHaveBeenCalledWith(expect.objectContaining({ id: "github" }));
    expect(result.current.formOpen).toBe(false);
  });
});
