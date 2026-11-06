import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { formatUserFacingError } from "@jini-ai/core";
import { AdminFailureNotice } from "../AdminFailureNotice/AdminFailureNotice";
import { adminFailureChannel } from "@/lib/admin-failure-channel";

afterEach(() => { adminFailureChannel.reset(); vi.restoreAllMocks(); document.documentElement.lang = ""; });

it("dismisses an incident through the translated German action", () => {
  document.documentElement.lang = "de";
  const failure = formatUserFacingError({ message: "Pages could not be loaded.", action: "Try loading them again.", step: "Loading pages", cause: "offline" }, { errorId: "translated-incident" });
  adminFailureChannel.publish({ failure });
  render(<AdminFailureNotice />);
  fireEvent.click(screen.getByRole("button", { name: "Fehlermeldung schließen" }));
  expect(screen.queryByText(failure.message)).toBeNull();
  expect(adminFailureChannel.getSnapshot()).toBeNull();
});

it("retains a polite failure with copyable details until dismissed", async () => {
  const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
  render(<AdminFailureNotice clipboard={{ writeText }} />);
  expect(screen.queryByRole("status")).toBeNull();
  const failure = formatUserFacingError({ message: "Pages could not be loaded.", action: "Try loading them again.", step: "Loading pages", cause: "The error ID identifies the server report." }, { errorId: "incident-ui" });
  act(() => adminFailureChannel.publish({ failure }));
  expect(screen.getByRole("status")).toHaveTextContent(failure.message);
  fireEvent.click(screen.getByText("Show details"));
  fireEvent.click(screen.getByRole("button", { name: "Copy details" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith({ text: failure.copyText }));
  expect(await screen.findByText("Copy failed. Select the details and copy them manually.")).toBeVisible();
  expect(screen.getByText((_content, element) => element?.tagName === "PRE" && element.textContent === failure.copyText)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
  expect(screen.queryByText(failure.message)).toBeNull();
  expect(adminFailureChannel.getSnapshot()).toBeNull();
});
