import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { VoiceInputPlaceholder } from "../VoiceInputPlaceholder";

/** @file The grayed mic that holds the composer footer's voice slot while voice input is off. */

afterEach(cleanup);

it("is a disabled mic that says voice input is coming, and stays focusable", async () => {
  render(<VoiceInputPlaceholder />);
  const mic = screen.getByRole("button", { name: "Voice input (coming soon)" });
  expect(mic).toHaveAttribute("aria-disabled", "true");
  expect(mic).toHaveAttribute("title", "Voice input (coming soon)");
  expect(mic).not.toBeDisabled();
  await userEvent.setup().tab();
  expect(mic).toHaveFocus();
});
